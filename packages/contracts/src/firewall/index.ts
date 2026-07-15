import { z } from "zod";

export const FIREWALL_DENY_MAX_EVENTS = 500;
export const FirewallCollectionStatusSchema = z.enum(["complete", "partial", "unavailable"]);
export const FirewallProtocolSchema = z.enum(["TCP", "UDP", "ICMP", "ICMPV6", "OTHER"]);

export const AgentFirewallDenyEventSchema = z.object({
  id: z.string().regex(/^fw_[a-f0-9]{64}$/),
  occurredAt: z.string().datetime(),
  sourceAddress: z.union([z.ipv4(), z.ipv6()]),
  destinationAddress: z.union([z.ipv4(), z.ipv6()]).nullable(),
  destinationPort: z.number().int().min(1).max(65_535).nullable(),
  protocol: FirewallProtocolSchema,
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

export const UfwRuleProtocolSchema = z.enum(["TCP", "UDP"]);
export const FirewallActionSchema = z.enum(["ALLOW", "DENY", "REJECT", "LIMIT"]);
export const FirewallBackendStatusSchema = z.enum(["active", "inactive", "unavailable"]);

const IpSourceSchema = z.string().trim().min(1).max(64).regex(/^(?:\d{1,3}\.){3}\d{1,3}(?:\/(?:[0-9]|[12][0-9]|3[0-2]))?$/)
  .refine((value) => value.split("/")[0]!.split(".").every((octet) => Number(octet) <= 255), "invalid IPv4 source");
const FirewallRuleIdSchema = z.string().regex(/^fw_[a-f0-9]{64}$/);

export const FirewallRuleSchema = z.object({
  id: FirewallRuleIdSchema,
  name: z.string().min(1).max(120),
  port: z.string().min(1).max(64),
  protocol: z.enum(["TCP", "UDP", "ALL"]),
  source: z.string().min(1).max(128),
  action: FirewallActionSchema,
  direction: z.enum(["IN", "OUT"]),
  target: z.string().min(1).max(255),
  ipv6: z.boolean(),
  managed: z.boolean(),
}).strict();

export const FirewallPayloadSchema = z.object({
  collectedAt: z.string().datetime(),
  collectionStatus: FirewallCollectionStatusSchema,
  backend: z.literal("ufw"),
  backendStatus: FirewallBackendStatusSchema,
  host: z.string().min(1).max(255),
  warnings: z.array(z.string().min(1).max(512)).max(100),
  rules: z.array(FirewallRuleSchema).max(2_000),
}).strict();

export const CreateFirewallRuleRequestSchema = z.object({
  name: z.string().trim().min(1).max(64),
  port: z.number().int().min(1).max(65_535),
  protocol: UfwRuleProtocolSchema,
  source: IpSourceSchema,
  idempotencyKey: z.string().uuid(),
}).strict();

export const DeleteFirewallRuleRequestSchema = z.object({ idempotencyKey: z.string().uuid() }).strict();
export const FirewallMutationResponseSchema = FirewallPayloadSchema.extend({
  message: z.string().min(1).max(240),
  tone: z.enum(["success", "warning"]),
}).strict();

export type UfwRuleProtocol = z.infer<typeof UfwRuleProtocolSchema>;
export type FirewallRule = z.infer<typeof FirewallRuleSchema>;
export type FirewallPayload = z.infer<typeof FirewallPayloadSchema>;
export type CreateFirewallRuleRequest = z.infer<typeof CreateFirewallRuleRequestSchema>;
export type FirewallMutationResponse = z.infer<typeof FirewallMutationResponseSchema>;
