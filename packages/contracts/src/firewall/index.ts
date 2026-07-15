import { z } from "zod";

export const FirewallProtocolSchema = z.enum(["tcp", "udp"]);
export const FirewallActionSchema = z.enum(["allow", "deny", "reject", "limit"]);
export const FirewallDirectionSchema = z.enum(["in", "out"]);
export const FirewallCollectionStatusSchema = z.enum(["complete", "unavailable"]);

export const FirewallRuleSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[A-Za-z0-9._:-]+$/),
  name: z.string().min(1).max(120),
  port: z.string().min(1).max(64),
  protocol: FirewallProtocolSchema.nullable(),
  source: z.string().min(1).max(128),
  destination: z.string().min(1).max(128),
  action: FirewallActionSchema,
  direction: FirewallDirectionSchema,
  ipVersion: z.enum(["ipv4", "ipv6"]),
  managed: z.boolean(),
  version: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const FirewallRulesPayloadSchema = z.object({
  engine: z.literal("ufw"),
  host: z.string().min(1).max(255),
  active: z.boolean(),
  collectedAt: z.string().datetime(),
  collectionStatus: FirewallCollectionStatusSchema,
  warnings: z.array(z.string().min(1).max(512)).max(20),
  rules: z.array(FirewallRuleSchema).max(2_000),
}).strict();

export const CreateFirewallRuleRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  port: z.number().int().min(1).max(65_535),
  protocol: FirewallProtocolSchema,
  source: z.string().trim().min(1).max(128),
  idempotencyKey: z.string().uuid(),
}).strict();

export const DeleteFirewallRuleRequestSchema = z.object({
  version: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().uuid(),
}).strict();

export const FirewallMutationResponseSchema = FirewallRulesPayloadSchema.extend({
  message: z.string().min(1).max(512),
  tone: z.enum(["success", "warning"]),
}).strict();

export type FirewallProtocol = z.infer<typeof FirewallProtocolSchema>;
export type FirewallRule = z.infer<typeof FirewallRuleSchema>;
export type FirewallRulesPayload = z.infer<typeof FirewallRulesPayloadSchema>;
export type CreateFirewallRuleRequest = z.infer<typeof CreateFirewallRuleRequestSchema>;
export type DeleteFirewallRuleRequest = z.infer<typeof DeleteFirewallRuleRequestSchema>;
export type FirewallMutationResponse = z.infer<typeof FirewallMutationResponseSchema>;
