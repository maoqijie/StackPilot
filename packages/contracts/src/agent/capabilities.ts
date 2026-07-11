import { z } from "zod";

export const AgentPlatformSchema = z.enum(["linux", "darwin", "win32"]);
export const AgentCapabilitySchema = z.enum(["system.summary.read", "service.status.read"]);
export const AgentCapabilitiesSchema = z.array(AgentCapabilitySchema).max(16).transform((items) => [...new Set(items)]);

export type AgentPlatform = z.infer<typeof AgentPlatformSchema>;
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;
