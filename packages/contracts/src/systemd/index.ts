import { z } from "zod";

export const SystemdUnitNameSchema = z.string().min(1).max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.@:-]*\.(?:service|timer|socket|target)$/);
export const SystemdUnitStateSchema = z.enum(["active", "failed", "inactive"]);
export const SystemdUnitActionSchema = z.enum(["start", "stop", "restart"]);

export const SystemdUnitSchema = z.object({
  id: SystemdUnitNameSchema,
  name: SystemdUnitNameSchema,
  description: z.string().max(512),
  host: z.string().min(1).max(255),
  state: SystemdUnitStateSchema,
  activeState: z.string().min(1).max(80),
  subState: z.string().min(1).max(80),
  restarts: z.number().int().nonnegative(),
  memoryBytes: z.number().int().nonnegative().nullable(),
  stateChangedAt: z.string().datetime().nullable(),
  availableActions: z.array(SystemdUnitActionSchema).max(3),
}).strict();

export const SystemdUnitsPayloadSchema = z.object({
  units: z.array(SystemdUnitSchema).max(2_000),
  collectedAt: z.string().datetime(),
  host: z.string().min(1).max(255),
  warnings: z.array(z.string().max(512)).max(10).default([]),
}).strict();

export const SystemdJournalLineSchema = z.object({
  timestamp: z.string().datetime(),
  message: z.string().max(4_096),
}).strict();
export const SystemdJournalPayloadSchema = z.object({
  unit: SystemdUnitNameSchema,
  entries: z.array(SystemdJournalLineSchema).max(200),
  collectedAt: z.string().datetime(),
  truncated: z.boolean(),
}).strict();
export const SystemdActionRequestSchema = z.object({
  idempotencyKey: z.string().uuid(),
}).strict();
export const SystemdActionResponseSchema = z.object({
  unit: SystemdUnitSchema,
  collectedAt: z.string().datetime(),
  message: z.string().max(512),
  tone: z.enum(["success", "info", "warning", "danger"]),
}).strict();

export type SystemdUnit = z.infer<typeof SystemdUnitSchema>;
export type SystemdUnitsPayload = z.infer<typeof SystemdUnitsPayloadSchema>;
export type SystemdJournalPayload = z.infer<typeof SystemdJournalPayloadSchema>;
export type SystemdUnitAction = z.infer<typeof SystemdUnitActionSchema>;
export type SystemdActionRequest = z.infer<typeof SystemdActionRequestSchema>;

export const SYSTEMD_MAX_SERVICES = 64;
export const SYSTEMD_MAX_JOURNAL_ENTRIES = 4;
export const SystemdCollectionStatusSchema = z.enum(["complete", "partial", "unavailable"]);
export const SystemdFreshnessSchema = z.enum(["current", "stale", "awaiting"]);
export const SystemdActiveStateSchema = z.enum(["active", "reloading", "inactive", "failed", "activating", "deactivating", "unknown"]);

export const SystemdJournalEntrySchema = z.object({
  cursor: z.string().min(1).max(256).regex(/^[\x20-\x7e]+$/),
  timestamp: z.string().datetime(),
  priority: z.number().int().min(0).max(7),
  identifier: z.string().min(1).max(120).nullable(),
  pid: z.string().regex(/^\d{1,20}$/).nullable(),
  message: z.string().max(512),
}).strict();

export const AgentSystemdServiceSchema = z.object({
  unit: z.string().min(1).max(256).regex(/^[A-Za-z0-9_.@:-]+\.service$/),
  description: z.string().min(1).max(256),
  loadState: z.string().min(1).max(40),
  activeState: SystemdActiveStateSchema,
  subState: z.string().min(1).max(80),
  memoryCurrentBytes: z.number().int().nonnegative().safe().nullable(),
  restartCount: z.number().int().nonnegative().safe().nullable(),
  stateChangedAt: z.string().datetime().nullable(),
  journal: z.array(SystemdJournalEntrySchema).max(SYSTEMD_MAX_JOURNAL_ENTRIES),
}).strict();

export const AgentSystemdSnapshotSchema = z.object({
  collectedAt: z.string().datetime(),
  collectionStatus: SystemdCollectionStatusSchema,
  warnings: z.array(z.string().min(1).max(256)).max(20),
  services: z.array(AgentSystemdServiceSchema).max(SYSTEMD_MAX_SERVICES),
}).strict().superRefine((value, context) => {
  const units = new Set<string>();
  value.services.forEach((service, index) => {
    if (units.has(service.unit)) context.addIssue({ code: "custom", path: ["services", index, "unit"], message: "systemd units must be unique" });
    units.add(service.unit);
  });
});

export const SystemdServiceRecordSchema = AgentSystemdServiceSchema.extend({
  id: z.string().min(3).max(420),
  nodeId: z.string().uuid(),
  host: z.string().min(1).max(120),
  platform: z.enum(["linux", "darwin", "win32"]),
  sourceCollectedAt: z.string().datetime(),
  freshness: SystemdFreshnessSchema,
}).strict();

export const SystemdServicesPayloadSchema = z.object({
  collectedAt: z.string().datetime(),
  collectionStatus: SystemdCollectionStatusSchema,
  warnings: z.array(z.string().min(1).max(256)).max(100),
  services: z.array(SystemdServiceRecordSchema).max(10_000),
}).strict();

export type AgentSystemdService = z.infer<typeof AgentSystemdServiceSchema>;
export type AgentSystemdSnapshot = z.infer<typeof AgentSystemdSnapshotSchema>;
export type SystemdJournalEntry = z.infer<typeof SystemdJournalEntrySchema>;
export type SystemdServiceRecord = z.infer<typeof SystemdServiceRecordSchema>;
export type SystemdServicesPayload = z.infer<typeof SystemdServicesPayloadSchema>;
