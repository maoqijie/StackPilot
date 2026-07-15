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
