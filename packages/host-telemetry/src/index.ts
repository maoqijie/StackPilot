import { execFile } from "node:child_process";
import {
  cpus,
  freemem,
  hostname,
  loadavg,
  networkInterfaces,
  platform,
  totalmem,
  uptime,
  type CpuInfo,
  type NetworkInterfaceInfo,
} from "node:os";
import { promisify } from "node:util";
import {
  AGENT_TELEMETRY_MAX_CPU_CORES,
  AGENT_TELEMETRY_MAX_DISK_VOLUMES,
  AgentTelemetrySnapshotSchema,
  type AgentPlatform,
  type AgentTelemetryDiskVolume,
  type AgentTelemetrySnapshot,
} from "@stackpilot/contracts";
import {
  collectWindowsLoadAverage,
  type WindowsLoadAverage,
} from "./windowsLoad.js";
export { DatabaseSnapshotCache, DATABASE_UNIT_PATTERNS, SystemdDatabaseCollector, parseSystemdDatabaseUnits } from "./databases.js";
export type { DatabaseCollectorOptions, DatabaseUnitRunner } from "./databases.js";

export {
  collectProcessorQueueLength,
  parseProcessorQueueLength,
  WindowsLoadSampler,
  type ProcessorQueueCommandRunner,
  type WindowsLoadAverage,
  type WindowsLoadSamplerSources,
} from "./windowsLoad.js";

const KIB = 1024;
const execFileAsync = promisify(execFile);
type CpuSample = Pick<CpuInfo, "times">;
type NetworkMap = NodeJS.Dict<NetworkInterfaceInfo[]>;

export type HostTelemetrySources = {
  now: () => Date;
  sleep: (milliseconds: number) => Promise<void>;
  cpus: () => CpuSample[];
  hostname: () => string;
  networkInterfaces: () => NetworkMap;
  totalmem: () => number;
  freemem: () => number;
  loadavg: () => number[];
  uptime: () => number;
  collectDisks: (target: AgentPlatform) => Promise<AgentTelemetryDiskVolume[]>;
  collectWindowsLoad: (coreUsagePercents: readonly number[]) => Promise<WindowsLoadAverage | null>;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value * 10) / 10));
const cpuTotal = (cpu: CpuSample) => Object.values(cpu.times).reduce((sum, value) => sum + value, 0);

export function calculateCpuUsage(before: CpuSample[], after: CpuSample[]) {
  if (!before.length || before.length !== after.length) return null;
  const values = after.slice(0, AGENT_TELEMETRY_MAX_CPU_CORES).map((cpu, index) => {
    const previous = before[index];
    if (!previous) return null;
    const elapsed = cpuTotal(cpu) - cpuTotal(previous);
    return elapsed > 0 ? clamp((1 - (cpu.times.idle - previous.times.idle) / elapsed) * 100) : null;
  });
  if (values.some((value) => value === null)) return null;
  const coreUsagePercents = values as number[];
  return {
    usagePercent: clamp(coreUsagePercents.reduce((sum, value) => sum + value, 0) / coreUsagePercents.length),
    coreUsagePercents,
  };
}

export function selectPrimaryIp(interfaces: NetworkMap) {
  const external = Object.values(interfaces).flatMap((items) => items ?? []).filter((item) => !item.internal);
  const ipv4 = external.find((item) => item.family === "IPv4")?.address;
  const ipv6 = external.find((item) => item.family === "IPv6")?.address.split("%")[0];
  return ipv4 ?? ipv6 ?? null;
}

function diskVolume(label: string, mount: string, totalBytes: number, usedBytes: number): AgentTelemetryDiskVolume | null {
  if (!label || !mount || !Number.isSafeInteger(totalBytes) || totalBytes <= 0 || !Number.isSafeInteger(usedBytes)) return null;
  return {
    label: label.slice(0, 120),
    mount: mount.slice(0, 512),
    totalBytes,
    usedBytes: Math.max(0, Math.min(totalBytes, usedBytes)),
  };
}

export function parsePosixDiskUsage(output: string) {
  const seen = new Set<string>();
  const disks: AgentTelemetryDiskVolume[] = [];
  for (const line of output.split(/\r?\n/).slice(1)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 6) continue;
    const disk = diskVolume(columns[0] ?? "", columns.slice(5).join(" "), Number(columns[1]) * KIB, Number(columns[2]) * KIB);
    if (disk && !seen.has(disk.mount)) {
      seen.add(disk.mount);
      disks.push(disk);
    }
  }
  return disks;
}

export function parseWindowsDiskUsage(output: string) {
  let rows: unknown;
  try { rows = JSON.parse(output); } catch { return []; }
  return (Array.isArray(rows) ? rows : [rows]).flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const value = row as Record<string, unknown>;
    const label = typeof value.Name === "string" ? value.Name : "";
    const totalBytes = Number(value.Size);
    const disk = diskVolume(label, `${label}\\`, totalBytes, totalBytes - Number(value.FreeSpace));
    return disk ? [disk] : [];
  });
}

export async function collectDiskVolumes(target: AgentPlatform) {
  try {
    if (target === "win32") {
      const command = 'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object Name,Size,FreeSpace | ConvertTo-Json -Compress';
      const { stdout } = await execFileAsync(
        "powershell.exe",
        ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command],
        { timeout: 4_000, maxBuffer: KIB * KIB, windowsHide: true },
      );
      return parseWindowsDiskUsage(stdout);
    }
    const { stdout } = await execFileAsync("df", ["-Pkl"], { timeout: 4_000, maxBuffer: 2 * KIB * KIB, windowsHide: true });
    return parsePosixDiskUsage(stdout);
  } catch {
    return [];
  }
}

const defaultSources: HostTelemetrySources = {
  now: () => new Date(),
  sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  cpus,
  hostname,
  networkInterfaces,
  totalmem,
  freemem,
  loadavg,
  uptime,
  collectDisks: collectDiskVolumes,
  collectWindowsLoad: collectWindowsLoadAverage,
};

function optionalValue<T>(read: () => T, fallback: T): T {
  try { return read(); } catch { return fallback; }
}

export async function collectHostTelemetry(
  target = platform() as AgentPlatform,
  sources: Partial<HostTelemetrySources> = {},
): Promise<AgentTelemetrySnapshot> {
  const source = { ...defaultSources, ...sources };
  const before = optionalValue(source.cpus, []);
  await Promise.resolve().then(() => source.sleep(100)).catch(() => undefined);
  const cpu = calculateCpuUsage(before, optionalValue(source.cpus, []));
  const totalBytes = optionalValue(source.totalmem, 0);
  const availableBytes = optionalValue(source.freemem, 0);
  const memory = Number.isSafeInteger(totalBytes) && totalBytes > 0 && Number.isSafeInteger(availableBytes) && availableBytes >= 0
    ? { totalBytes, availableBytes: Math.min(totalBytes, availableBytes) }
    : null;
  const disksPromise = Promise.resolve().then(() => source.collectDisks(target)).catch(() => []);
  const windowsLoadPromise = target === "win32" && cpu
    ? Promise.resolve().then(() => source.collectWindowsLoad(cpu.coreUsagePercents)).catch(() => null)
    : Promise.resolve(null);
  const [collectedDisks, windowsLoad] = await Promise.all([disksPromise, windowsLoadPromise]);
  const load = target === "win32" ? [] : optionalValue(source.loadavg, []);
  const loadAverage = target === "win32"
    ? windowsLoad
    : load.length >= 3 && load.slice(0, 3).every((value) => Number.isFinite(value) && value >= 0)
      ? [load[0] ?? 0, load[1] ?? 0, load[2] ?? 0] as [number, number, number]
      : null;
  const disks = collectedDisks.slice(0, AGENT_TELEMETRY_MAX_DISK_VOLUMES);
  return AgentTelemetrySnapshotSchema.parse({
    collectedAt: optionalValue(() => source.now().toISOString(), new Date().toISOString()),
    hostname: optionalValue(source.hostname, "unknown-host").trim().slice(0, 120) || "unknown-host",
    primaryIp: selectPrimaryIp(optionalValue(source.networkInterfaces, {})),
    cpu,
    memory,
    loadAverage,
    disks,
    uptimeSeconds: Math.max(0, Math.floor(optionalValue(source.uptime, 0))),
  });
}
