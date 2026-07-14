import { z } from "zod";

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
