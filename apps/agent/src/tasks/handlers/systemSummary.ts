import { cpus, freemem, hostname, loadavg, platform, totalmem, uptime } from "node:os";
import { SystemSummaryTaskParametersSchema, type RemoteTaskResultSummary } from "@stackpilot/contracts";

export async function systemSummaryHandler(parameters: unknown): Promise<RemoteTaskResultSummary> {
  const input = SystemSummaryTaskParametersSchema.parse(parameters);
  return { message: "System summary collected", truncated: false, data: { hostname: hostname().slice(0, 120), platform: platform(), cpuCount: cpus().length, totalMemoryBytes: totalmem(), freeMemoryBytes: freemem(), uptimeSeconds: Math.floor(uptime()), ...(input.includeLoad ? { loadAverage: loadavg().slice(0, 3) } : {}) } };
}
