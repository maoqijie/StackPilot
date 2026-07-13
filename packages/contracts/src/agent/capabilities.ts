import { z } from "zod";

export const AgentPlatformSchema = z.enum(["linux", "darwin", "win32"]);
export const AgentCapabilitySchema = z.enum([
  "system.summary.read", "service.status.read", "database.inventory.read", "database.sql.read",
  "database.backup", "database.operate", "database.install", "database.restore",
]);
export const AgentCapabilitiesSchema = z.array(AgentCapabilitySchema).max(16).transform((items) => [...new Set(items)]);

export type AgentPlatform = z.infer<typeof AgentPlatformSchema>;
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;
