import { z } from "zod";
import { AgentCapabilitySchema } from "../agent/capabilities.js";
import { RemoteTaskRecordSchema } from "../agent/tasks.js";

export const TerminalSnippetRiskSchema = z.enum(["read", "change", "danger"]);
export const TerminalSnippetIdSchema = z.string().min(3).max(80).regex(/^[a-z0-9-]+$/);
export const TerminalSnippetRecordSchema = z.object({
  id: TerminalSnippetIdSchema,
  version: z.number().int().positive(),
  title: z.string().min(1).max(120),
  command: z.string().min(1).max(500),
  category: z.string().min(1).max(40),
  risk: TerminalSnippetRiskSchema,
  description: z.string().min(1).max(500),
  favorite: z.boolean(),
  lastUsedAt: z.string().datetime().nullable(),
  executable: z.boolean(),
  requiredCapability: AgentCapabilitySchema.nullable(),
}).strict();
export const TerminalSnippetListResponseSchema = z.object({
  snippets: z.array(TerminalSnippetRecordSchema),
  collectedAt: z.string().datetime(),
}).strict();
export const UpdateTerminalSnippetFavoriteRequestSchema = z.object({ favorite: z.boolean() }).strict();
export const ExecuteTerminalSnippetRequestSchema = z.object({
  nodeId: z.string().uuid(),
  snippetVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(8).max(160),
}).strict();
export const ExecuteTerminalSnippetResponseSchema = z.object({
  snippet: TerminalSnippetRecordSchema,
  task: RemoteTaskRecordSchema,
}).strict();

export type TerminalSnippetRecord = z.infer<typeof TerminalSnippetRecordSchema>;
export type TerminalSnippetListResponse = z.infer<typeof TerminalSnippetListResponseSchema>;
export type ExecuteTerminalSnippetRequest = z.infer<typeof ExecuteTerminalSnippetRequestSchema>;
