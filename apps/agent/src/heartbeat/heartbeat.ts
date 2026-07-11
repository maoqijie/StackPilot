import { uptime } from "node:os";
import { AGENT_PROTOCOL_VERSION, type AgentHeartbeat } from "@stackpilot/contracts";
import type { AgentConfig } from "../config/environment.js";
export function createHeartbeat(config: AgentConfig, nodeId: string, capabilities: AgentHeartbeat["capabilities"]): AgentHeartbeat { return { nodeId, agentVersion: config.agentVersion, protocolVersion: AGENT_PROTOCOL_VERSION, timestamp: new Date().toISOString(), platform: config.platform, capabilities, health: { status: "healthy", uptimeSeconds: Math.floor(uptime()) } }; }
