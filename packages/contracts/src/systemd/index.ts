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

export const SystemdJournalEntrySchema = z.object({
  timestamp: z.string().datetime(),
  message: z.string().max(4_096),
}).strict();
export const SystemdJournalPayloadSchema = z.object({
  unit: SystemdUnitNameSchema,
  entries: z.array(SystemdJournalEntrySchema).max(200),
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
