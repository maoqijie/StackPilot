import { randomUUID } from "node:crypto";
import {
  AGENT_PROTOCOL_VERSION, RemoteTaskEnvelopeSchema, RemoteTaskRecordSchema,
  type AgentCapability, type CreateRemoteTaskRequest, type RemoteTaskRecord, type RemoteTaskStatus, type RemoteTaskStatusUpdate,
} from "@stackpilot/contracts";
import type { AgentControlRepository, AuditEvent } from "../../repositories/agentControlRepository.js";
import { ServiceError } from "../serviceError.js";

const terminal: readonly RemoteTaskStatus[] = ["succeeded", "failed", "cancelled", "expired"];
const transitions: Record<RemoteTaskStatus, readonly RemoteTaskStatus[]> = {
  queued: ["dispatched", "cancelled", "expired"], dispatched: ["running", "queued", "succeeded", "failed", "cancelled", "expired"],
  running: ["succeeded", "failed", "cancelled", "expired"], succeeded: [], failed: ["queued"], cancelled: [], expired: [],
};
const requiredCapability: Record<CreateRemoteTaskRequest["type"], AgentCapability> = {
  "system.summary.read": "system.summary.read",
  "service.status.read": "service.status.read",
  "sites.plan.prepare": "sites.deploy",
  "sites.plan.activate": "sites.deploy",
  "sites.lifecycle.update": "sites.lifecycle.manage",
  "sites.logs.read": "sites.logs.read",
  "sites.certificates.renew": "sites.certificates.renew",
};
const audit = (event: Omit<AuditEvent, "eventId" | "timestamp">): AuditEvent => ({ eventId: randomUUID(), timestamp: new Date().toISOString(), ...event });
const sensitiveResultKey = /authorization|cookie|token|secret|password|private|environment|stdout|stderr/i;
function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveKey);
  if (value && typeof value === "object") return Object.entries(value).some(([key, nested]) => sensitiveResultKey.test(key) || containsSensitiveKey(nested));
  return false;
}

export function transitionTask(task: RemoteTaskRecord, next: RemoteTaskStatus, now = new Date().toISOString()) {
  if (!transitions[task.status].includes(next)) throw new ServiceError(409, "BAD_REQUEST", `任务状态不能从 ${task.status} 转换为 ${next}`);
  task.status = next; task.updatedAt = now;
}

export class RemoteTaskService {
  constructor(private readonly repository: AgentControlRepository, private readonly queueLimit = 100) {}

  private reconcile(state: { tasks: RemoteTaskRecord[]; audits: AuditEvent[] }, traceId: string = randomUUID(), now = new Date().toISOString()) {
    for (const task of state.tasks) {
      if (!terminal.includes(task.status) && Date.parse(task.expiresAt) <= Date.parse(now)) {
        const previous = task.status; task.status = "expired"; task.updatedAt = now; task.errorCode = "TASK_EXPIRED";
        state.audits.push(audit({ requester: "controller", nodeId: task.targetNodeId, taskId: task.taskId, event: "task.expired", taskType: task.type, parameters: null, fromStatus: previous, toStatus: "expired", resultSummary: null, traceId })); continue;
      }
      if (task.status === "dispatched" && Date.parse(now) - Date.parse(task.updatedAt) > 30_000 && task.attempt < task.maxAttempts) {
        task.status = "queued"; task.updatedAt = now; task.errorCode = "DISPATCH_LEASE_EXPIRED";
        task.nextAttemptAt = new Date(Date.parse(now) + 1000 * (2 ** Math.max(task.attempt - 1, 0))).toISOString();
        state.audits.push(audit({ requester: "controller", nodeId: task.targetNodeId, taskId: task.taskId, event: "task.dispatch-recovered", taskType: task.type, parameters: null, fromStatus: "dispatched", toStatus: "queued", resultSummary: null, traceId }));
      }
    }
  }

  async create(nodeId: string, input: CreateRemoteTaskRequest, requester: string, traceId: string) {
    let created: RemoteTaskRecord | undefined;
    await this.repository.update((state) => {
      this.reconcile(state, traceId);
      const node = state.nodes.find((item) => item.nodeId === nodeId);
      if (!node || node.revokedAt) throw new ServiceError(404, "NOT_FOUND", "目标节点不存在或已撤销");
      const capability = requiredCapability[input.type];
      if (!node.allowedCapabilities.includes(capability) || !node.declaredCapabilities.includes(capability)) throw new ServiceError(403, "FORBIDDEN", "Controller 未授权节点执行该能力或 Agent 未声明该能力");
      const duplicate = state.tasks.find((item) => item.targetNodeId === nodeId && item.idempotencyKey === input.idempotencyKey);
      if (duplicate) { created = duplicate; return; }
      if (state.tasks.filter((item) => item.targetNodeId === nodeId && !terminal.includes(item.status)).length >= this.queueLimit) throw new ServiceError(409, "BAD_REQUEST", "节点任务队列已满");
      const now = new Date().toISOString();
      created = RemoteTaskRecordSchema.parse({
        protocolVersion: AGENT_PROTOCOL_VERSION, taskId: randomUUID(), type: input.type, targetNodeId: nodeId,
        parameters: input.parameters, createdAt: now, expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
        idempotencyKey: input.idempotencyKey, requester, traceId, requiredCapability: capability, attempt: 0,
        maxAttempts: input.type.startsWith("sites.") ? 1 : 3,
        status: "queued", updatedAt: now, result: null, errorCode: null,
        retryable: !input.type.startsWith("sites."), nextAttemptAt: null,
      });
      state.tasks.push(created);
      const parameters = input.parameters as Record<string, unknown>;
      const identifiers = Object.fromEntries(["operationId", "planId", "siteId", "batchId"].flatMap((key) => typeof parameters[key] === "string" ? [[key, parameters[key]]] : []));
      state.audits.push(audit({ requester, nodeId, taskId: created.taskId, event: "task.created", taskType: input.type, parameters: identifiers, fromStatus: null, toStatus: "queued", resultSummary: null, traceId }));
    });
    if (!created) throw new ServiceError(500, "INTERNAL_ERROR", "任务状态未保存");
    return created as RemoteTaskRecord;
  }

  async list(nodeId?: string) {
    const state = await this.repository.update((next) => this.reconcile(next));
    return nodeId ? state.tasks.filter((item) => item.targetNodeId === nodeId) : state.tasks;
  }

  async poll(nodeId: string, traceId: string) {
    const dispatched: RemoteTaskRecord[] = [];
    await this.repository.update((state) => {
      this.reconcile(state, traceId); const node = state.nodes.find((item) => item.nodeId === nodeId);
      if (!node || node.revokedAt) throw new ServiceError(401, "UNAUTHORIZED", "节点不存在或已撤销");
      for (const task of state.tasks.filter((item) => item.targetNodeId === nodeId && item.status === "queued" && (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= Date.now())).slice(0, 10)) {
        if (!node.allowedCapabilities.includes(task.requiredCapability) || !node.declaredCapabilities.includes(task.requiredCapability)) { task.status = "cancelled"; task.errorCode = "CAPABILITY_REVOKED"; continue; }
        transitionTask(task, "dispatched"); task.attempt += 1; dispatched.push(structuredClone(task));
        state.audits.push(audit({ requester: `agent:${nodeId}`, nodeId, taskId: task.taskId, event: "task.dispatched", taskType: task.type, parameters: null, fromStatus: "queued", toStatus: "dispatched", resultSummary: null, traceId }));
      }
    });
    return dispatched.map((task) => RemoteTaskEnvelopeSchema.parse({
      protocolVersion: task.protocolVersion, taskId: task.taskId, type: task.type, targetNodeId: task.targetNodeId,
      parameters: task.parameters, createdAt: task.createdAt, expiresAt: task.expiresAt,
      idempotencyKey: task.idempotencyKey, requester: task.requester, traceId: task.traceId,
      requiredCapability: task.requiredCapability, attempt: task.attempt, maxAttempts: task.maxAttempts,
    }));
  }

  async cancellations(nodeId: string) {
    const state = await this.repository.read();
    return state.tasks.filter((item) => item.targetNodeId === nodeId && item.status === "cancelled").slice(-100).map((item) => item.taskId);
  }

  async update(nodeId: string, input: RemoteTaskStatusUpdate, traceId: string) {
    if (input.result && (Buffer.byteLength(JSON.stringify(input.result), "utf8") > 16_384 || containsSensitiveKey(input.result))) throw new ServiceError(400, "BAD_REQUEST", "任务结果包含禁止字段或超过大小限制");
    if (Math.abs(Date.now() - Date.parse(input.timestamp)) > 5 * 60 * 1000) throw new ServiceError(400, "BAD_REQUEST", "任务状态时间超出允许窗口");
    let updated: RemoteTaskRecord | null = null;
    await this.repository.update((state) => {
      const task = state.tasks.find((item) => item.taskId === input.taskId && item.targetNodeId === nodeId);
      if (!task) throw new ServiceError(404, "NOT_FOUND", "任务不存在");
      if (input.attempt !== task.attempt) throw new ServiceError(409, "BAD_REQUEST", "任务投递 attempt 不匹配");
      if (terminal.includes(task.status)) { updated = task; return; }
      if (task.status === input.status) { updated = task; return; }
      const previous = task.status; transitionTask(task, input.status, input.timestamp);
      task.result = input.result ?? null; task.errorCode = input.errorCode ?? null; task.nextAttemptAt = null;
      if (input.status === "failed" && task.retryable && task.attempt < task.maxAttempts && Date.parse(task.expiresAt) > Date.now()) {
        transitionTask(task, "queued"); task.nextAttemptAt = new Date(Date.now() + 1000 * (2 ** Math.max(task.attempt - 1, 0))).toISOString();
      }
      state.audits.push(audit({ requester: `agent:${nodeId}`, nodeId, taskId: task.taskId, event: "task.status", taskType: task.type, parameters: null, fromStatus: previous, toStatus: task.status, resultSummary: input.result?.message ?? null, traceId }));
      updated = task;
    });
    if (!updated) throw new ServiceError(500, "INTERNAL_ERROR", "任务状态未保存");
    return updated;
  }

  async cancel(taskId: string, requester: string, reason: string, traceId: string) {
    let updated: RemoteTaskRecord | null = null;
    await this.repository.update((state) => {
      const task = state.tasks.find((item) => item.taskId === taskId);
      if (!task) throw new ServiceError(404, "NOT_FOUND", "任务不存在");
      if (terminal.includes(task.status)) { updated = task; return; }
      const previous = task.status; transitionTask(task, "cancelled"); task.errorCode = "CANCELLED_BY_REQUESTER";
      state.audits.push(audit({ requester, nodeId: task.targetNodeId, taskId, event: "task.cancelled", taskType: task.type, parameters: { reason }, fromStatus: previous, toStatus: "cancelled", resultSummary: null, traceId }));
      updated = task;
    });
    if (!updated) throw new ServiceError(500, "INTERNAL_ERROR", "任务状态未保存");
    return updated;
  }
}
