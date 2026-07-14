import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import {
  AgentDatabaseOperationDispatchSchema, AgentDatabaseOperationUpdateSchema,
  type AgentDatabaseOperationDispatch, type AgentDatabaseOperationUpdate,
} from "@stackpilot/contracts";
import { HelperError } from "../domain.js";

const RecordSchema = z.object({
  operation: AgentDatabaseOperationDispatchSchema, status: z.enum(["running", "completed"]),
  update: AgentDatabaseOperationUpdateSchema.nullable(), updatedAt: z.string().datetime(),
}).strict();
type RecordValue = z.infer<typeof RecordSchema>;

export class OperationJournal {
  private values = new Map<string, RecordValue>(); private loaded = false;
  constructor(private readonly path: string) {}
  async load() {
    if (this.loaded) return;
    try {
      const rows = z.array(RecordSchema).max(2_000).parse(JSON.parse(await readFile(this.path, "utf8")));
      for (const row of rows) {
        if (row.status === "running") {
          const update = AgentDatabaseOperationUpdateSchema.parse({ operationId: row.operation.operationId, version: row.operation.version, status: "failed", errorCode: "HELPER_RESTARTED_DURING_OPERATION", errorMessage: "helper 重启，操作结果不确定，未自动重试", credentialEnvelope: null, updatedAt: new Date().toISOString() });
          this.values.set(row.operation.operationId, { ...row, status: "completed", update, updatedAt: update.updatedAt });
        } else this.values.set(row.operation.operationId, row);
      }
      await this.persist();
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    this.loaded = true;
  }
  async recoverStale(now = new Date().toISOString()) {
    await this.load(); let changed = false;
    for (const [id, row] of this.values) if (row.status === "running") {
      const update = AgentDatabaseOperationUpdateSchema.parse({ operationId: row.operation.operationId, version: row.operation.version, status: "failed", errorCode: "HELPER_RESTARTED_DURING_OPERATION", errorMessage: "helper 重启，操作结果不确定，未自动重试", credentialEnvelope: null, updatedAt: now });
      this.values.set(id, { ...row, status: "completed", update, updatedAt: now }); changed = true;
    }
    if (changed) await this.persist();
  }
  async begin(operation: AgentDatabaseOperationDispatch) {
    await this.load(); const existing = this.values.get(operation.operationId);
    if (existing?.update) return existing.update;
    const duplicate = [...this.values.values()].find((row) => row.operation.idempotencyKey === operation.idempotencyKey && row.operation.operationId !== operation.operationId);
    if (duplicate) throw new HelperError("DUPLICATE_IDEMPOTENCY_KEY", "幂等键已由其他操作使用");
    this.values.set(operation.operationId, { operation, status: "running", update: null, updatedAt: new Date().toISOString() }); await this.persist(); return null;
  }
  async complete(operation: AgentDatabaseOperationDispatch, update: AgentDatabaseOperationUpdate) {
    this.values.set(operation.operationId, { operation, status: "completed", update, updatedAt: update.updatedAt }); await this.persist();
  }
  private async persist() {
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 }); await chmod(dirname(this.path), 0o700);
    const temporary = `${this.path}.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify([...this.values.values()].slice(-2_000), null, 2), { mode: 0o600 }); await rename(temporary, this.path); await chmod(this.path, 0o600);
  }
}
