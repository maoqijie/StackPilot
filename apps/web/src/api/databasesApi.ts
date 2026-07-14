import {
  AgentNodeListResponseSchema,
  BusinessDatabaseBackupPlanResponseSchema,
  BusinessDatabaseBackupsPayloadSchema,
  CreateBusinessDatabaseBackupPlanRequestSchema,
  CreateDatabaseOperationPlanRequestSchema,
  DatabaseInstanceDetailSchema,
  DatabaseInstancesPayloadSchema,
  DatabaseOperationPlanResponseSchema,
  DatabaseOperationResponseSchema,
  DatabaseSlowQueriesPayloadSchema,
  DatabaseSlowQueryResponseSchema,
  ExecuteDatabaseOperationPlanRequestSchema,
  ExplainDatabaseQueryRequestSchema,
  ResolveDatabaseQueryRequestSchema,
  RunBusinessDatabaseBackupPlanRequestSchema,
  RunBusinessDatabaseBackupPlanResponseSchema,
  UpdateBusinessDatabaseBackupPlanRequestSchema,
} from "@stackpilot/contracts";
import type {
  CreateBusinessDatabaseBackupPlanRequest,
  CreateDatabaseOperationPlanRequest,
  ExecuteDatabaseOperationPlanRequest,
  UpdateBusinessDatabaseBackupPlanRequest,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

const parse = <T>(promise: Promise<unknown>, schema: { parse(value: unknown): T }) => promise.then((value) => schema.parse(value));

export const fetchDatabases = (signal?: AbortSignal) => parse(requestJson<unknown>("/databases", { signal }), DatabaseInstancesPayloadSchema);
export const fetchDatabaseDetail = (id: string, signal?: AbortSignal) => parse(requestJson<unknown>(`/databases/${encodeURIComponent(id)}`, { signal }), DatabaseInstanceDetailSchema);
export const fetchDatabaseSlowQueries = (range: "24h" | "7d", signal?: AbortSignal) => parse(requestJson<unknown>(`/databases/slow-queries?range=${range}`, { signal }), DatabaseSlowQueriesPayloadSchema);
export const fetchBusinessDatabaseBackups = (signal?: AbortSignal) => parse(requestJson<unknown>("/databases/backups", { signal }), BusinessDatabaseBackupsPayloadSchema);
export const fetchDatabaseNodes = (signal?: AbortSignal) => parse(requestJson<unknown>("/databases/install-nodes", { signal }), AgentNodeListResponseSchema);

export const createBackupPlan = (input: CreateBusinessDatabaseBackupPlanRequest) => parse(requestJson<unknown>("/databases/backup-plans", {
  method: "POST", body: JSON.stringify(CreateBusinessDatabaseBackupPlanRequestSchema.parse(input)),
}), BusinessDatabaseBackupPlanResponseSchema);
export const updateBackupPlan = (id: string, input: UpdateBusinessDatabaseBackupPlanRequest) => parse(requestJson<unknown>(`/databases/backup-plans/${encodeURIComponent(id)}`, {
  method: "PATCH", body: JSON.stringify(UpdateBusinessDatabaseBackupPlanRequestSchema.parse(input)),
}), BusinessDatabaseBackupPlanResponseSchema);
export const runBackupPlan = (id: string, idempotencyKey: string) => parse(requestJson<unknown>(`/databases/backup-plans/${encodeURIComponent(id)}/run`, {
  method: "POST", body: JSON.stringify(RunBusinessDatabaseBackupPlanRequestSchema.parse({ idempotencyKey })),
}), RunBusinessDatabaseBackupPlanResponseSchema);

export const explainDatabaseQuery = (queryId: string, idempotencyKey: string) => parse(requestJson<unknown>(`/databases/queries/${encodeURIComponent(queryId)}/explain`, {
  method: "POST", body: JSON.stringify(ExplainDatabaseQueryRequestSchema.parse({ idempotencyKey })),
}), DatabaseOperationResponseSchema);
export const resolveDatabaseQuery = (queryId: string, resolution: string) => parse(requestJson<unknown>(`/databases/queries/${encodeURIComponent(queryId)}/resolve`, {
  method: "POST", body: JSON.stringify(ResolveDatabaseQueryRequestSchema.parse({ resolution })),
}), DatabaseSlowQueryResponseSchema);

export const createDatabaseOperationPlan = (input: CreateDatabaseOperationPlanRequest) => parse(requestJson<unknown>("/databases/operation-plans", {
  method: "POST", body: JSON.stringify(CreateDatabaseOperationPlanRequestSchema.parse(input)),
}), DatabaseOperationPlanResponseSchema);
export const executeDatabaseOperationPlan = (id: string, input: ExecuteDatabaseOperationPlanRequest) => parse(requestJson<unknown>(`/databases/operation-plans/${encodeURIComponent(id)}/execute`, {
  method: "POST", body: JSON.stringify(ExecuteDatabaseOperationPlanRequestSchema.parse(input)),
}), DatabaseOperationResponseSchema);
export const fetchDatabaseOperation = (id: string, signal?: AbortSignal) => parse(requestJson<unknown>(`/databases/operations/${encodeURIComponent(id)}`, { signal }), DatabaseOperationResponseSchema);

export type {
  AgentNodeRecord, BusinessDatabaseBackupsPayload, BusinessDatabaseBackupPlan, DatabaseBackupJob, DatabaseInstanceDetail,
  DatabaseInstanceRecord, DatabaseInstancesPayload, DatabaseOperation, DatabaseOperationPlan, DatabaseRestorePoint,
  DatabaseSession, DatabaseSlowQueriesPayload, DatabaseSlowQueryInstance, DatabaseSlowQueryRecord,
} from "@stackpilot/contracts";
