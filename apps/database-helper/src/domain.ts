import { z } from "zod";
import { DatabaseEngineSchema } from "@stackpilot/contracts";

export const LocalIdSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
export const DatabaseIdentifierSchema = z.string().min(1).max(128).regex(/^[A-Za-z_][A-Za-z0-9_$]*$/);
export const ManagedInstanceSchema = z.object({
  id: LocalIdSchema, name: LocalIdSchema, engine: DatabaseEngineSchema, version: z.string().max(80).nullable(),
  port: z.number().int().min(1).max(65_535), managed: z.boolean(), serviceName: z.string().min(1).max(120).regex(/^[A-Za-z0-9_.@:-]+$/),
  dataDirectory: z.string().min(1).max(512).refine((value) => value.startsWith("/")),
  backupDirectory: z.string().min(1).max(512).refine((value) => value.startsWith("/")),
  host: z.enum(["127.0.0.1", "::1"]), username: DatabaseIdentifierSchema, initialDatabase: DatabaseIdentifierSchema,
  historicalSlowQueriesAvailable: z.boolean(), createdAt: z.string().datetime(),
}).strict();
export const InstanceCredentialSchema = z.object({
  instanceId: LocalIdSchema, username: DatabaseIdentifierSchema, password: z.string().min(16).max(512),
}).strict();

export type ManagedInstance = z.infer<typeof ManagedInstanceSchema>;
export type InstanceCredential = z.infer<typeof InstanceCredentialSchema>;

export const RegistrySchema = z.object({ version: z.literal(1), instances: z.array(ManagedInstanceSchema).max(256) }).strict();

export class HelperError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "HelperError"; }
}
