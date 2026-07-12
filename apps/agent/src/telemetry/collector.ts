import type { AgentTelemetrySnapshot } from "@stackpilot/contracts";

export {
  calculateCpuUsage,
  collectDiskVolumes,
  collectHostTelemetry as collectAgentTelemetry,
  parsePosixDiskUsage,
  parseWindowsDiskUsage,
  selectPrimaryIp,
} from "@stackpilot/host-telemetry";
export type { HostTelemetrySources as TelemetrySources } from "@stackpilot/host-telemetry";

export function telemetryIsDegraded(snapshot: AgentTelemetrySnapshot) {
  const memory = snapshot.memory
    ? (snapshot.memory.totalBytes - snapshot.memory.availableBytes) / snapshot.memory.totalBytes * 100
    : null;
  const totalDisk = snapshot.disks.reduce((sum, disk) => sum + disk.totalBytes, 0);
  const disk = totalDisk
    ? snapshot.disks.reduce((sum, item) => sum + item.usedBytes, 0) / totalDisk * 100
    : null;
  return snapshot.cpu === null
    || snapshot.memory === null
    || snapshot.disks.length === 0
    || snapshot.cpu.usagePercent >= 85
    || (memory !== null && memory >= 88)
    || (disk !== null && disk >= 90);
}
