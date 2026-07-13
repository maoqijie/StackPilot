import { z } from "zod";

export const TrashEntryKindSchema = z.enum(["file", "directory"]);
export type TrashEntryKind = z.infer<typeof TrashEntryKindSchema>;

export const TrashEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  kind: TrashEntryKindSchema,
  originalPath: z.string().startsWith("/"),
  sizeBytes: z.number().int().nonnegative().nullable(),
  deletedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  owner: z.string().min(1),
  reason: z.string().min(1),
}).strict();
export type TrashEntry = z.infer<typeof TrashEntrySchema>;

export const RestoredTrashEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  originalPath: z.string().startsWith("/"),
  restoredAt: z.string().datetime(),
  restoredBy: z.string().min(1),
}).strict();
export type RestoredTrashEntry = z.infer<typeof RestoredTrashEntrySchema>;

export const TrashPayloadSchema = z.object({
  entries: z.array(TrashEntrySchema),
  recentlyRestored: z.array(RestoredTrashEntrySchema),
  retentionDays: z.number().int().positive(),
  collectedAt: z.string().datetime(),
}).strict();
export type TrashPayload = z.infer<typeof TrashPayloadSchema>;

export const TrashMutationResponseSchema = z.object({
  message: z.string().min(1),
  trash: TrashPayloadSchema,
}).strict();
export type TrashMutationResponse = z.infer<typeof TrashMutationResponseSchema>;
