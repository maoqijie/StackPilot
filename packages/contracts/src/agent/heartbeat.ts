import { z } from "zod";
import { AgentCapabilitiesSchema, AgentPlatformSchema } from "./capabilities.js";
import { ProtocolVersionSchema } from "../versioning/index.js";

export const AgentHealthSchema = z.object({ status: z.enum(["healthy", "degraded"]), uptimeSeconds: z.number().int().nonnegative() }).strict();
export const AgentHeartbeatSchema = z.object({
  nodeId: z.string().uuid(), agentVersion: z.string().min(1).max(40), protocolVersion: ProtocolVersionSchema,
  timestamp: z.string().datetime(), platform: AgentPlatformSchema, capabilities: AgentCapabilitiesSchema, health: AgentHealthSchema,
}).strict();
export const AgentHeartbeatResponseSchema = z.object({ acceptedAt: z.string().datetime(), nextHeartbeatSeconds: z.number().int().positive() });

export type AgentHeartbeat = z.infer<typeof AgentHeartbeatSchema>;
