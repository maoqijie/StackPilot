import { uptime } from "node:os";
import { AGENT_PROTOCOL_VERSION, type AgentHeartbeat, type AgentTelemetrySnapshot } from "@stackpilot/contracts";
import type { AgentConfig } from "../config/environment.js";
import { telemetryIsDegraded } from "../telemetry/collector.js";
export function createHeartbeat(config: AgentConfig, nodeId: string, capabilities: AgentHeartbeat["capabilities"], telemetry?: AgentTelemetrySnapshot): AgentHeartbeat {
  return {
    nodeId, agentVersion: config.agentVersion, protocolVersion: AGENT_PROTOCOL_VERSION,
    timestamp: new Date().toISOString(), platform: config.platform, capabilities,
    health: { status: telemetry && telemetryIsDegraded(telemetry) ? "degraded" : "healthy", uptimeSeconds: Math.floor(uptime()) },
    ...(telemetry ? { telemetry } : {}),
  };
}
