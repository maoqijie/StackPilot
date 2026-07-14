import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { platform } from "node:os";
import { promisify } from "node:util";
import {
  PHYSICAL_HOST_ID_PREFIX,
  PhysicalHostIdSchema,
  type AgentPlatform,
  type PhysicalHostId,
} from "@stackpilot/contracts";

const execFileAsync = promisify(execFile);
const IDENTITY_DOMAIN = "stackpilot:physical-host:v1";
const LINUX_MACHINE_ID_PATHS = ["/etc/machine-id", "/var/lib/dbus/machine-id"] as const;
const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

export type PhysicalIdentityCommandRunner = (
  executable: string,
  args: readonly string[],
  options: { timeout: number; maxBuffer: number; windowsHide: boolean },
) => Promise<{ stdout: string }>;

export type PhysicalIdentitySources = {
  readText: (path: string) => Promise<string>;
  runCommand: PhysicalIdentityCommandRunner;
};

const defaultCommandRunner: PhysicalIdentityCommandRunner = async (executable, args, options) => {
  const { stdout } = await execFileAsync(executable, [...args], options);
  return { stdout: String(stdout) };
};

const defaultSources: PhysicalIdentitySources = {
  readText: (path) => readFile(path, "utf8"),
  runCommand: defaultCommandRunner,
};

function nonZero(value: string) {
  return /[1-9a-f]/.test(value.replaceAll("-", ""));
}

export function parsePhysicalMachineIdentifier(target: AgentPlatform, output: string): string | null {
  if (target === "linux") {
    const value = output.trim().toLowerCase();
    return /^[0-9a-f]{32}$/.test(value) && nonZero(value) ? value : null;
  }
  if (target === "darwin") {
    const value = output.match(new RegExp(`"IOPlatformUUID"\\s*=\\s*"(${UUID_PATTERN})"`))?.[1]?.toLowerCase() ?? null;
    return value && nonZero(value) ? value : null;
  }
  const value = output.match(new RegExp(`^\\s*MachineGuid\\s+REG_SZ\\s+({?${UUID_PATTERN}}?)\\s*$`, "mi"))?.[1]
    ?.replace(/^\{|\}$/g, "")
    .toLowerCase() ?? null;
  return value && nonZero(value) ? value : null;
}

export function derivePhysicalHostId(target: AgentPlatform, machineIdentifier: string): PhysicalHostId {
  const digest = createHash("sha256")
    .update(`${IDENTITY_DOMAIN}\0${target}\0${machineIdentifier}`, "utf8")
    .digest("hex");
  return PhysicalHostIdSchema.parse(`${PHYSICAL_HOST_ID_PREFIX}${digest}`);
}

async function readLinuxMachineIdentifier(sources: PhysicalIdentitySources) {
  for (const path of LINUX_MACHINE_ID_PATHS) {
    const output = await sources.readText(path).catch(() => null);
    if (output !== null) {
      const parsed = parsePhysicalMachineIdentifier("linux", output);
      if (parsed) return parsed;
    }
  }
  return null;
}

async function readCommandMachineIdentifier(target: "darwin" | "win32", sources: PhysicalIdentitySources) {
  const invocation = target === "darwin"
    ? { executable: "/usr/sbin/ioreg", args: ["-rd1", "-c", "IOPlatformExpertDevice"] }
    : { executable: "reg.exe", args: ["QUERY", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"] };
  const result = await sources.runCommand(invocation.executable, invocation.args, {
    timeout: 4_000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
  }).catch(() => null);
  return result ? parsePhysicalMachineIdentifier(target, result.stdout) : null;
}

export async function collectPhysicalHostId(
  target = platform() as AgentPlatform,
  overrides: Partial<PhysicalIdentitySources> = {},
): Promise<PhysicalHostId | null> {
  const sources = { ...defaultSources, ...overrides };
  const machineIdentifier = target === "linux"
    ? await readLinuxMachineIdentifier(sources)
    : await readCommandMachineIdentifier(target, sources);
  return machineIdentifier ? derivePhysicalHostId(target, machineIdentifier) : null;
}
