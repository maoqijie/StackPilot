import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isAgentProtocolCompatible, RemoteTaskEnvelopeSchema, type AgentCapability, type AgentPlatform, type RemoteTaskStatusUpdate } from "@stackpilot/contracts";
import { taskRegistry } from "./registry.js";
import { z } from "zod";

type Receipt = { taskId: string; idempotencyKey: string; attempt: number; status: "running" | "succeeded" | "failed" | "cancelled"; updatedAt: string; reported: boolean; update: RemoteTaskStatusUpdate };
const ReceiptSchema: z.ZodType<Receipt> = z.object({ taskId: z.string().uuid(), idempotencyKey: z.string(), attempt: z.number().int().min(1).max(3), status: z.enum(["running", "succeeded", "failed", "cancelled"]), updatedAt: z.string().datetime(), reported: z.boolean(), update: z.object({ taskId: z.string().uuid(), attempt: z.number().int().min(1).max(3), status: z.enum(["running", "succeeded", "failed", "cancelled"]), timestamp: z.string().datetime(), result: z.object({ message: z.string(), data: z.record(z.string(), z.unknown()).optional(), truncated: z.boolean() }).optional(), errorCode: z.string().optional() }).strict() }).strict();

export class TaskExecutor {
  private receipts = new Map<string, Receipt>();
  private running = new Map<string, AbortController>();
  constructor(private readonly receiptPath: string, private readonly nodeId: string, private readonly platform: AgentPlatform, private readonly capabilities: readonly AgentCapability[], private readonly registry = taskRegistry) {}
  async load() {
    try {
      const rows = z.array(ReceiptSchema).max(1000).parse(JSON.parse(await readFile(this.receiptPath, "utf8")));
      this.receipts = new Map(rows.map((row) => {
        if (row.status !== "running") return [row.taskId, row];
        const update: RemoteTaskStatusUpdate = { taskId: row.taskId, attempt: row.attempt ?? 1, status: "failed", timestamp: new Date().toISOString(), errorCode: "AGENT_RESTARTED_DURING_TASK", result: { message: "Agent restarted before task completion", truncated: false } };
        return [row.taskId, { ...row, attempt: row.attempt ?? 1, status: "failed" as const, updatedAt: update.timestamp, reported: false, update }];
      }));
      await this.persist();
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  private async persist() { const directory = dirname(this.receiptPath); await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700); const temporary = `${this.receiptPath}.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify([...this.receipts.values()].slice(-1000), null, 2), { mode: 0o600 }); await rename(temporary, this.receiptPath); await chmod(this.receiptPath, 0o600); }
  cancel(taskId: string) { this.running.get(taskId)?.abort(); }
  get activeCount() { return this.running.size; }
  pendingUpdates() { return [...this.receipts.values()].filter((receipt) => !receipt.reported).map((receipt) => receipt.update); }
  async markReported(taskId: string) { const receipt = this.receipts.get(taskId); if (receipt) { receipt.reported = true; await this.persist(); } }
  async execute(raw: unknown, onRunning?: (update: RemoteTaskStatusUpdate) => Promise<void>): Promise<RemoteTaskStatusUpdate> {
    const task = RemoteTaskEnvelopeSchema.parse(raw); const existing = this.receipts.get(task.taskId);
    if (existing && !(existing.status === "failed" && task.attempt > existing.attempt && this.registry[task.type]?.retryable)) return existing.update;
    const duplicateKey = [...this.receipts.values()].find((receipt) => receipt.idempotencyKey === task.idempotencyKey && receipt.taskId !== task.taskId);
    if (duplicateKey) return { taskId: task.taskId, attempt: task.attempt, status: "failed", timestamp: new Date().toISOString(), errorCode: "DUPLICATE_IDEMPOTENCY_KEY", result: { message: "Task idempotency key was already processed", truncated: false } };
    if (!isAgentProtocolCompatible(task.protocolVersion)) throw new Error("INCOMPATIBLE_PROTOCOL");
    if (task.targetNodeId !== this.nodeId) throw new Error("WRONG_TARGET");
    if (Date.parse(task.expiresAt) <= Date.now()) throw new Error("TASK_EXPIRED");
    const definition = this.registry[task.type];
    if (!definition || definition.capability !== task.requiredCapability || !this.capabilities.includes(definition.capability)) throw new Error("CAPABILITY_DENIED");
    if (!definition.platforms.includes(this.platform)) throw new Error("PLATFORM_UNSUPPORTED");
    const parameters = definition.validate(task.parameters); const startedAt = new Date().toISOString();
    const runningUpdate: RemoteTaskStatusUpdate = { taskId: task.taskId, attempt: task.attempt, status: "running", timestamp: startedAt };
    this.receipts.set(task.taskId, { taskId: task.taskId, idempotencyKey: task.idempotencyKey, attempt: task.attempt, status: "running", updatedAt: startedAt, reported: false, update: runningUpdate }); await this.persist();
    if (onRunning) {
      try { await onRunning(runningUpdate); const receipt = this.receipts.get(task.taskId); if (receipt) { receipt.reported = true; await this.persist(); } }
      catch { /* The terminal receipt is authoritative when the running acknowledgement is lost. */ }
    }
    const controller = new AbortController(); this.running.set(task.taskId, controller); const timer = setTimeout(() => controller.abort(), definition.timeoutMs);
    let update: RemoteTaskStatusUpdate;
    try { const result = await definition.run(parameters, controller.signal); controller.signal.throwIfAborted(); update = { taskId: task.taskId, attempt: task.attempt, status: "succeeded", timestamp: new Date().toISOString(), result }; }
    catch (error) { const cancelled = controller.signal.aborted; update = { taskId: task.taskId, attempt: task.attempt, status: cancelled ? "cancelled" : "failed", timestamp: new Date().toISOString(), errorCode: cancelled ? "TASK_CANCELLED_OR_TIMEOUT" : error instanceof Error ? error.name.slice(0, 80) : "TASK_FAILED", result: { message: cancelled ? "Task cancelled or timed out" : "Task failed", truncated: false } }; }
    finally { clearTimeout(timer); this.running.delete(task.taskId); }
    this.receipts.set(task.taskId, { taskId: task.taskId, idempotencyKey: task.idempotencyKey, attempt: task.attempt, status: update.status, updatedAt: update.timestamp, reported: false, update }); await this.persist(); return update;
  }
}
