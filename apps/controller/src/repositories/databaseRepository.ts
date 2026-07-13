import type {
  AgentDatabaseQueryUpload, AgentDatabaseSnapshot, BusinessDatabaseBackupPlan, CreateBusinessDatabaseBackupPlanRequest,
  CreateDatabaseOperationPlanRequest, DatabaseBackupJob, DatabaseInstanceRecord, DatabaseOperation, DatabaseOperationPlan,
  DatabaseRestorePoint, DatabaseSession, DatabaseSlowQueryRecord, UpdateBusinessDatabaseBackupPlanRequest, AgentDatabaseOperationUpdate,
  AgentDatabaseOperationDispatch, DatabaseOperationKind,
} from "@stackpilot/contracts";

export class DatabaseRepositoryError extends Error {
  constructor(readonly status:number,readonly code:"BAD_REQUEST"|"FORBIDDEN"|"NOT_FOUND"|"INTERNAL_ERROR",message:string){super(message);this.name="DatabaseRepositoryError";}
}

export type DatabaseAccess = { nodeScope: "all" | readonly string[]; includeSql: boolean };
export type CreatePlanRecord = {
  actorUserId: string; nodeId: string; instanceId: string | null; input: CreateDatabaseOperationPlanRequest;
  target: string; impact: string[]; now: string; expiresAt: string;
};
export interface DatabaseRepository {
  saveSnapshot(nodeId: string, snapshot: AgentDatabaseSnapshot): void;
  saveQueryUpload(nodeId: string, upload: AgentDatabaseQueryUpload): void;
  listInstances(nodeScope: DatabaseAccess["nodeScope"]): DatabaseInstanceRecord[];
  findInstance(id: string, nodeScope: DatabaseAccess["nodeScope"]): DatabaseInstanceRecord | null;
  listSessions(instanceId: string): DatabaseSession[];
  listQueries(nodeScope: DatabaseAccess["nodeScope"], range: "24h" | "7d", includeSql: boolean): DatabaseSlowQueryRecord[];
  findQuery(id: string, nodeScope: DatabaseAccess["nodeScope"], includeSql: boolean): DatabaseSlowQueryRecord | null;
  resolveQuery(id: string, at: string): DatabaseSlowQueryRecord | null;
  createBackupPlan(input: CreateBusinessDatabaseBackupPlanRequest, now: string): BusinessDatabaseBackupPlan;
  updateBackupPlan(id: string, input: UpdateBusinessDatabaseBackupPlanRequest, now: string): BusinessDatabaseBackupPlan | null;
  listBackupPlans(nodeScope: DatabaseAccess["nodeScope"]): BusinessDatabaseBackupPlan[];
  createBackupJob(plan: BusinessDatabaseBackupPlan, operationId: string, now: string): DatabaseBackupJob;
  findBackupJobByOperation(operationId: string): DatabaseBackupJob | null;
  listBackupJobs(nodeScope: DatabaseAccess["nodeScope"]): DatabaseBackupJob[];
  listRestorePoints(nodeScope: DatabaseAccess["nodeScope"]): DatabaseRestorePoint[];
  createOperationPlan(input: CreatePlanRecord): DatabaseOperationPlan;
  findOperationPlan(id: string): { plan: DatabaseOperationPlan; input: CreateDatabaseOperationPlanRequest } | null;
  findRestorePoint(id: string, nodeScope: DatabaseAccess["nodeScope"]): DatabaseRestorePoint | null;
  executeOperationPlan(planId: string, version: number, userId: string, idempotencyKey: string, requestId: string, now: string): DatabaseOperation;
  createDirectOperation(kind: "backup" | "explain", nodeId: string, instanceId: string, userId: string, idempotencyKey: string, requestId: string, now: string, context: Record<string,string>): DatabaseOperation;
  findOperation(id: string, nodeScope: DatabaseAccess["nodeScope"]): DatabaseOperation | null;
  pollOperations(nodeId: string, limit: number, allowedKinds: readonly DatabaseOperationKind[]): AgentDatabaseOperationDispatch[];
  updateOperation(nodeId: string, update: AgentDatabaseOperationUpdate): DatabaseOperation;
  purgeExpiredSql(now: string): number;
  purgeExpiredSensitiveData(now: string): { sql: number; credentials: number; operationResults: number };
}
