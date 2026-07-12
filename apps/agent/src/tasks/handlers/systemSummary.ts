import { platform } from "node:os";
import { SystemSummaryTaskParametersSchema, type RemoteTaskResultSummary } from "@stackpilot/contracts";
import { collectAgentTelemetry } from "../../telemetry/collector.js";

export async function systemSummaryHandler(parameters: unknown): Promise<RemoteTaskResultSummary> {
  const input = SystemSummaryTaskParametersSchema.parse(parameters);
  const telemetry = await collectAgentTelemetry(platform() as "linux" | "darwin" | "win32");
  return {
    message: "System summary collected",
    truncated: false,
    data: {
      hostname: telemetry.hostname,
      platform: platform(),
      primaryIp: telemetry.primaryIp,
      cpuPercent: telemetry.cpu?.usagePercent ?? null,
      totalMemoryBytes: telemetry.memory?.totalBytes ?? null,
      freeMemoryBytes: telemetry.memory?.availableBytes ?? null,
      uptimeSeconds: telemetry.uptimeSeconds,
      disks: telemetry.disks,
      ...(input.includeLoad ? { loadAverage: telemetry.loadAverage } : {}),
    },
  };
}
