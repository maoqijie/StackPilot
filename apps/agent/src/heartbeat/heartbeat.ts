import { uptime } from "node:os";
import { AGENT_PROTOCOL_VERSION, type AgentHeartbeat, type AgentSiteSnapshot, type AgentTelemetrySnapshot } from "@stackpilot/contracts";
import type { AgentConfig } from "../config/environment.js";
import { telemetryIsDegraded } from "../telemetry/collector.js";
export function createHeartbeat(config: AgentConfig, nodeId: string, capabilities: AgentHeartbeat["capabilities"], telemetry?: AgentTelemetrySnapshot, telemetryCollectionFailed = false, siteSnapshot?: AgentSiteSnapshot): AgentHeartbeat {
  let uptimeSeconds = 0;
  try { uptimeSeconds = Math.max(0, Math.floor(uptime())); } catch { uptimeSeconds = 0; }
  return {
    nodeId, agentVersion: config.agentVersion, protocolVersion: AGENT_PROTOCOL_VERSION,
    timestamp: new Date().toISOString(), platform: config.platform, capabilities,
    health: { status: telemetryCollectionFailed || telemetry && telemetryIsDegraded(telemetry) ? "degraded" : "healthy", uptimeSeconds },
    ...(telemetry ? { telemetry } : {}), ...(siteSnapshot ? { siteSnapshot } : {}),
  };
}
