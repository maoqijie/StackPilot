import { z } from "zod";

export const AgentPlatformSchema = z.enum(["linux", "darwin", "win32"]);
export const AgentCapabilitySchema = z.enum([
  "system.summary.read", "service.status.read", "sites.inventory.read", "sites.certificates.renew",
]);
export const AgentCapabilitiesSchema = z.array(AgentCapabilitySchema).max(4).transform((items) => [...new Set(items)]);

export type AgentPlatform = z.infer<typeof AgentPlatformSchema>;
export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;
