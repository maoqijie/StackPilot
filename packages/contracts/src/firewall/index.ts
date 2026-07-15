import { z } from "zod";

export const FirewallOpenPortProtocolSchema = z.enum(["TCP", "UDP"]);
export const FirewallExposureSchema = z.enum(["public", "private", "loopback", "specific"]);

export const FirewallOpenPortSchema = z.object({
  id: z.string().regex(/^port_[a-f0-9]{24}$/),
  protocol: FirewallOpenPortProtocolSchema,
  port: z.number().int().min(1).max(65_535),
  address: z.string().min(1).max(255),
  source: z.string().min(1).max(255),
  exposure: FirewallExposureSchema,
  host: z.string().min(1).max(255),
}).strict();

export const FirewallOpenPortsPayloadSchema = z.object({
  collectedAt: z.string().datetime(),
  collectionStatus: z.enum(["complete", "unavailable"]),
  backend: z.literal("ss"),
  warnings: z.array(z.string().min(1).max(512)).max(20),
  ports: z.array(FirewallOpenPortSchema).max(10_000),
}).strict();

export type FirewallExposure = z.infer<typeof FirewallExposureSchema>;
export type FirewallOpenPort = z.infer<typeof FirewallOpenPortSchema>;
export type FirewallOpenPortsPayload = z.infer<typeof FirewallOpenPortsPayloadSchema>;
