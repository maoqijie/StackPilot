import { z } from "zod";

export const FIREWALL_DENY_MAX_EVENTS = 500;
export const FirewallCollectionStatusSchema = z.enum(["complete", "partial", "unavailable"]);
export const FirewallDenyProtocolSchema = z.enum(["TCP", "UDP", "ICMP", "ICMPV6", "OTHER"]);

export const AgentFirewallDenyEventSchema = z.object({
  id: z.string().regex(/^fw_[a-f0-9]{64}$/),
  occurredAt: z.string().datetime(),
  sourceAddress: z.union([z.ipv4(), z.ipv6()]),
  destinationAddress: z.union([z.ipv4(), z.ipv6()]).nullable(),
  destinationPort: z.number().int().min(1).max(65_535).nullable(),
  protocol: FirewallDenyProtocolSchema,
  interfaceName: z.string().min(1).max(32).nullable(),
  rule: z.string().min(1).max(120),
  reason: z.string().min(1).max(256),
}).strict();

export const AgentFirewallDenySnapshotSchema = z.object({
  collectedAt: z.string().datetime(),
  collectionStatus: FirewallCollectionStatusSchema,
  warnings: z.array(z.string().min(1).max(256)).max(20),
  events: z.array(AgentFirewallDenyEventSchema).max(FIREWALL_DENY_MAX_EVENTS),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.events.forEach((event, index) => {
    if (ids.has(event.id)) context.addIssue({ code: "custom", path: ["events", index, "id"], message: "firewall event ids must be unique" });
    ids.add(event.id);
  });
});

export const FirewallDenyRecordSchema = AgentFirewallDenyEventSchema.extend({
  id: z.string().min(4).max(160),
  nodeId: z.string().uuid(),
  nodeName: z.string().min(1).max(120),
  sourceCollectedAt: z.string().datetime(),
}).strict();

export const FirewallDenyRecordsPayloadSchema = z.object({
  collectedAt: z.string().datetime().nullable(),
  collectionStatus: FirewallCollectionStatusSchema,
  warnings: z.array(z.string().min(1).max(256)).max(100),
  records: z.array(FirewallDenyRecordSchema).max(10_000),
}).strict();

export type AgentFirewallDenyEvent = z.infer<typeof AgentFirewallDenyEventSchema>;
export type AgentFirewallDenySnapshot = z.infer<typeof AgentFirewallDenySnapshotSchema>;
export type FirewallDenyRecord = z.infer<typeof FirewallDenyRecordSchema>;
export type FirewallDenyRecordsPayload = z.infer<typeof FirewallDenyRecordsPayloadSchema>;

export const FirewallProtocolSchema = z.enum(["tcp", "udp"]);
export const FirewallActionSchema = z.enum(["allow", "deny", "reject", "limit"]);
export const FirewallDirectionSchema = z.enum(["in", "out"]);

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
  collectionStatus: z.enum(["complete", "unavailable"]),
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
