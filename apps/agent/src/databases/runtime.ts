import {
  AgentDatabaseBackupPlanPollResponseSchema, AgentDatabaseOperationPollResponseSchema, AgentDatabaseOperationUpdateSchema,
  AgentDatabaseScheduledBackupResultsResponseSchema, DatabaseHelperBackupPlansResponseSchema,
  DatabaseHelperBackupResultAckSchema, DatabaseHelperBackupResultsResponseSchema,
  AGENT_DATABASE_UPLOAD_LIMIT_BYTES, AgentDatabaseQueryUploadSchema, DatabaseHelperCollectionSchema,
  type AgentDatabaseOperationUpdate, type AgentDatabaseQueryUpload,
} from "@stackpilot/contracts";
import type { AgentIdentity } from "../identity/identityStore.js";
import type { ControllerClient } from "../transport/controllerClient.js";
import { agentLogger } from "../logging/logger.js";
import type { DatabaseHelperClient } from "./helperClient.js";
import { MemoryDatabaseOperationOutbox, type DatabaseOperationOutbox } from "./operationOutbox.js";

export const sleepWithAbort = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal?.removeEventListener("abort", finish);
    resolve();
  };
  const timer = setTimeout(finish, ms);
  if (signal?.aborted) finish();
  else signal?.addEventListener("abort", finish, { once: true });
});

const byteLength = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
export function boundQueryUpload(upload: AgentDatabaseQueryUpload, limitBytes = AGENT_DATABASE_UPLOAD_LIMIT_BYTES) {
  if (byteLength(upload) <= limitBytes) return upload;
  const warning = "数据库查询上传已按传输上限截断";
  const base = { ...upload, collectionStatus: "partial" as const, warnings: [...upload.warnings.filter((item) => item !== warning).slice(0, 19), warning], sessions: [], queries: [] };
  const sessions: AgentDatabaseQueryUpload["sessions"] = [], queries: AgentDatabaseQueryUpload["queries"] = [];
  for (const session of upload.sessions) {
    const candidate = { ...base, sessions: [...sessions, session], queries };
    if (byteLength(candidate) > limitBytes) break; sessions.push(session);
  }
  for (const query of upload.queries) {
    const candidate = { ...base, sessions, queries: [...queries, query] };
    if (byteLength(candidate) > limitBytes) break; queries.push(query);
  }
  return AgentDatabaseQueryUploadSchema.parse({ ...base, sessions, queries });
}

export class DatabaseAgentRuntime {
  private collectionRunning = false; private operationRunning = false; private backupSyncRunning = false; private nextCollectionAt = 0; private nextBackupSyncAt = 0;
  constructor(private readonly helper: DatabaseHelperClient, private readonly controller: ControllerClient, private readonly identity: AgentIdentity, private readonly intervalMs = 60_000, private readonly outbox: DatabaseOperationOutbox = new MemoryDatabaseOperationOutbox(), private readonly enabled = () => true) {}
  async run(signal?: AbortSignal) {
    while (!signal?.aborted) {
      await this.runCycle();
      await sleepWithAbort(10_000, signal);
    }
  }
  async runCycle() {
    if (!this.enabled()) return;
    await Promise.allSettled([this.collectIfDue(), this.syncBackupPlansIfDue(), this.processOperations()]);
  }
  async syncBackupPlansIfDue(now = Date.now()) {
    if (this.backupSyncRunning || now < this.nextBackupSyncAt) return; this.backupSyncRunning = true;
    try {
      for (let batch = 0; batch < 10; batch += 1) {
        const pending = await this.helper.request({ action: "list-backup-results", limit: 100 });
        if (!pending.ok) throw new Error(pending.code);
        const reports = DatabaseHelperBackupResultsResponseSchema.parse(pending.result).reports;
        if (!reports.length) break;
        const accepted = AgentDatabaseScheduledBackupResultsResponseSchema.parse(await this.controller.json("/api/agent/databases/backup-plans/results", { reports }, this.identity));
        const submitted = new Set(reports.map((report) => report.reportId));
        if (accepted.acceptedReportIds.some((id) => !submitted.has(id))) throw new Error("INVALID_ACCEPTED_BACKUP_REPORT");
        if (accepted.acceptedReportIds.length) {
          const acknowledgment = await this.helper.request({ action: "ack-backup-results", reportIds: accepted.acceptedReportIds });
          if (!acknowledgment.ok) throw new Error(acknowledgment.code);
          DatabaseHelperBackupResultAckSchema.parse(acknowledgment.result);
        }
        if (accepted.acceptedReportIds.length !== reports.length || reports.length < 100) break;
      }
      const response = AgentDatabaseBackupPlanPollResponseSchema.parse(await this.controller.json("/api/agent/databases/backup-plans/poll", {}, this.identity));
      const synced = await this.helper.request({ action: "replace-backup-plans", plans: response.plans });
      if (!synced.ok) throw new Error(synced.code); DatabaseHelperBackupPlansResponseSchema.parse(synced.result);
    } catch (error) {
      agentLogger.log({ level: "warn", time: new Date().toISOString(), message: "Database backup schedule synchronization failed", errorName: error instanceof Error ? error.name : "UnknownError" });
    } finally { this.nextBackupSyncAt = now + this.intervalMs; this.backupSyncRunning = false; }
  }
  async collectIfDue(now = Date.now()) {
    if (this.collectionRunning || now < this.nextCollectionAt) return;
    this.collectionRunning = true;
    try {
      const response = await this.helper.request({ action: "collect" });
      if (!response.ok) throw new Error(response.code);
      const value = DatabaseHelperCollectionSchema.safeParse(response.result); if (!value.success) throw new Error("INVALID_HELPER_COLLECTION");
      await this.controller.json("/api/agent/databases/snapshot", value.data.snapshot, this.identity);
      await this.controller.json("/api/agent/databases/queries", boundQueryUpload(value.data.queryUpload), this.identity);
      this.nextCollectionAt = now + this.intervalMs;
    } catch (error) {
      this.nextCollectionAt = now + this.intervalMs;
      agentLogger.log({ level: "warn", time: new Date().toISOString(), message: "Database collection or upload failed", errorName: error instanceof Error ? error.name : "UnknownError" });
    } finally { this.collectionRunning = false; }
  }
  async processOperations() {
    if (this.operationRunning) return; this.operationRunning = true;
    try {
      for (const pending of await this.outbox.pending()) {
        await this.controller.json("/api/agent/databases/operations/status", pending, this.identity); await this.outbox.markReported(pending.operationId);
      }
      const poll = AgentDatabaseOperationPollResponseSchema.parse(await this.controller.json("/api/agent/databases/operations/poll", { limit: 4 }, this.identity));
      for (const operation of poll.operations) {
        const response = await this.helper.request({ action: "execute", operation });
        if (!response.ok) {
          const failed = AgentDatabaseOperationUpdateSchema.parse({ operationId: operation.operationId, version: operation.version, status: "failed", errorCode: response.code, errorMessage: response.error, credentialEnvelope: null, updatedAt: new Date().toISOString() });
          await this.deliver(failed); continue;
        }
        const update = AgentDatabaseOperationUpdateSchema.safeParse(response.result); if (!update.success) throw new Error("INVALID_HELPER_OPERATION_UPDATE");
        await this.deliver(update.data);
      }
    } catch (error) {
      agentLogger.log({ level: "warn", time: new Date().toISOString(), message: "Database operation polling failed", errorName: error instanceof Error ? error.name : "UnknownError" });
    } finally { this.operationRunning = false; }
  }
  private async deliver(update: AgentDatabaseOperationUpdate) {
    await this.outbox.save(update); await this.controller.json("/api/agent/databases/operations/status", update, this.identity); await this.outbox.markReported(update.operationId);
  }
}
