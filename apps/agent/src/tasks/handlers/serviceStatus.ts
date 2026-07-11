import { platform } from "node:os";
import { ServiceStatusTaskParametersSchema, type RemoteTaskResultSummary } from "@stackpilot/contracts";
import { runPlatformProbe } from "../../platform/commandRunner.js";

export async function serviceStatusHandler(parameters: unknown, signal: AbortSignal): Promise<RemoteTaskResultSummary> {
  const { serviceName } = ServiceStatusTaskParametersSchema.parse(parameters); const current = platform();
  const probe = current === "linux"
    ? await runPlatformProbe("systemctl", ["show", serviceName, "--property=ActiveState,SubState", "--no-pager"], signal, 5_000, 16_384)
    : current === "darwin"
      ? await runPlatformProbe("launchctl", ["print", `system/${serviceName}`], signal, 5_000, 16_384)
      : await runPlatformProbe("sc.exe", ["query", serviceName], signal, 5_000, 16_384);
  const safeState = probe.output.match(/(?:ActiveState=|STATE\s*:\s*\d+\s+)([A-Za-z_-]+)/i)?.[1] ?? (probe.ok ? "available" : "unavailable");
  return { message: probe.ok ? "Service status collected" : "Service status unavailable", truncated: probe.output.length >= 16_384, data: { serviceName, state: safeState, available: probe.ok } };
}
