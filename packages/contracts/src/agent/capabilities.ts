import { z } from "zod";

export const AgentPlatformSchema = z.enum(["linux", "darwin", "win32"]);
export const AGENT_FEATURE_DATABASE_INVENTORY = "database-inventory-v1";
export const AgentCapabilitySchema = z.enum([
  "system.summary.read", "service.status.read", "sites.inventory.read", "sites.certificates.renew", "databases.inventory.read",
]);
export const AgentCapabilitiesSchema = z.array(AgentCapabilitySchema).max(16).transform((items) => [...new Set(items)]);

export type AgentPlatform = z.infer<typeof AgentPlatformSchema>;
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;
