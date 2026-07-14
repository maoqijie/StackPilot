import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentCapability, AgentDatabaseSnapshot, AgentHeartbeat, AgentNodeRecord, AgentSiteSnapshot, AgentTelemetrySnapshot, RemoteTaskRecord } from "@stackpilot/contracts";
import { AgentHeartbeatDatabaseSnapshotSchema, AgentHealthSchema, AgentNodeRecordSchema, AgentSiteSnapshotSchema, AgentTelemetrySnapshotSchema, RemoteTaskRecordSchema } from "@stackpilot/contracts";
import { z } from "zod";

export type EnrollmentState = { enrollmentId: string; tokenDigest: string; nodeName: string; expiresAt: string; usedAt: string | null; revokedAt: string | null };
export type AgentCredentialState = { credentialId: string; nodeId: string; publicKey: string; createdAt: string; revokedAt: string | null; replacedBy: string | null; rotationId: string | null };
export type AgentNodeState = AgentNodeRecord & { telemetry?: AgentTelemetrySnapshot; siteSnapshot?: AgentSiteSnapshot; databaseSnapshot?: AgentDatabaseSnapshot; heartbeatHealthStatus?: AgentHeartbeat["health"]["status"] };
export const AgentNodeStateSchema = AgentNodeRecordSchema.extend({
  telemetry: AgentTelemetrySnapshotSchema.optional(),
  siteSnapshot: AgentSiteSnapshotSchema.optional(),
  databaseSnapshot: AgentHeartbeatDatabaseSnapshotSchema.optional(),
  heartbeatHealthStatus: AgentHealthSchema.shape.status.optional(),
});
export type AgentNonceConsumption = "accepted" | "replayed" | "unauthorized";
export type AgentNonceRequest = {
  nodeId: string;
  credentialId: string;
  nonce: string;
  expiresAt: string;
  allowRevokedCredential: boolean;
};
export type AuditEvent = { eventId: string; timestamp: string; requester: string; nodeId: string | null; taskId: string | null; event: string; taskType: string | null; parameters: Record<string, unknown> | null; fromStatus: string | null; toStatus: string | null; resultSummary: string | null; traceId: string };
export type AgentControlState = {
  enrollments: EnrollmentState[];
  credentials: AgentCredentialState[];
  nodes: AgentNodeState[];
  nonces: Array<{ credentialId: string; nonce: string; expiresAt: string }>;
  tasks: RemoteTaskRecord[];
  audits: AuditEvent[];
};

const AgentControlStateSchema: z.ZodType<AgentControlState> = z.object({
  enrollments: z.array(z.object({ enrollmentId: z.string().uuid(), tokenDigest: z.string().regex(/^[a-f0-9]{64}$/), nodeName: z.string(), expiresAt: z.string().datetime(), usedAt: z.string().datetime().nullable(), revokedAt: z.string().datetime().nullable() })),
  credentials: z.array(z.object({ credentialId: z.string().uuid(), nodeId: z.string().uuid(), publicKey: z.string(), createdAt: z.string().datetime(), revokedAt: z.string().datetime().nullable(), replacedBy: z.string().uuid().nullable(), rotationId: z.string().uuid().nullable() })),
  nodes: z.array(AgentNodeStateSchema),
  nonces: z.array(z.object({ credentialId: z.string().uuid(), nonce: z.string(), expiresAt: z.string().datetime() })),
  tasks: z.array(RemoteTaskRecordSchema),
  audits: z.array(z.object({ eventId: z.string().uuid(), timestamp: z.string().datetime(), requester: z.string(), nodeId: z.string().uuid().nullable(), taskId: z.string().uuid().nullable(), event: z.string(), taskType: z.string().nullable(), parameters: z.record(z.string(), z.unknown()).nullable(), fromStatus: z.string().nullable(), toStatus: z.string().nullable(), resultSummary: z.string().nullable(), traceId: z.string().uuid() })),
});

const emptyState = (): AgentControlState => ({ enrollments: [], credentials: [], nodes: [], nonces: [], tasks: [], audits: [] });
const sensitiveAuditKey = /authorization|cookie|token|secret|password|private|key|environment|stdout|stderr/i;
function redactAuditValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(redactAuditValue); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sensitiveAuditKey.test(key) ? "[REDACTED]" : redactAuditValue(nested)])); return value; }
function sanitizeState(state: AgentControlState) { state.audits = state.audits.map((event) => ({ ...event, parameters: event.parameters ? redactAuditValue(event.parameters) as Record<string, unknown> : null, resultSummary: event.resultSummary?.slice(0, 1024) ?? null })); }

export interface AgentControlRepository {
  read(): Promise<AgentControlState>;
  update(mutate: (state: AgentControlState) => void): Promise<AgentControlState>;
  consumeNonce(request: AgentNonceRequest): Promise<AgentNonceConsumption>;
  updateNodeWithAudit(nodeId: string, mutate: (node: AgentNodeState) => AuditEvent): Promise<AgentNodeState | null>;
}

function consumeNonce(state: AgentControlState, request: AgentNonceRequest): AgentNonceConsumption {
  state.nonces = state.nonces.filter((item) => Date.parse(item.expiresAt) > Date.now());
  const node = state.nodes.find((item) => item.nodeId === request.nodeId);
  const credential = state.credentials.find((item) => item.credentialId === request.credentialId && item.nodeId === request.nodeId);
  const revokedCredentialAllowed = request.allowRevokedCredential && Boolean(credential?.revokedAt && credential.replacedBy && credential.rotationId);
  if (!node || node.revokedAt || !credential || (credential.revokedAt && !revokedCredentialAllowed)) return "unauthorized";
  if (state.nonces.some((item) => item.credentialId === request.credentialId && item.nonce === request.nonce)) return "replayed";
  state.nonces.push({ credentialId: request.credentialId, nonce: request.nonce, expiresAt: request.expiresAt });
  return "accepted";
}

export class MemoryAgentControlRepository implements AgentControlRepository {
  private state = emptyState();
  async read() { return structuredClone(this.state); }
  async update(mutate: (state: AgentControlState) => void) { const next = structuredClone(this.state); mutate(next); sanitizeState(next); this.state = next; return structuredClone(next); }
  async consumeNonce(request: AgentNonceRequest) {
    let result: AgentNonceConsumption = "unauthorized";
    await this.update((state) => { result = consumeNonce(state, request); });
    return result;
  }
  async updateNodeWithAudit(nodeId: string, mutate: (node: AgentNodeState) => AuditEvent) {
    let updated: AgentNodeState | undefined;
    await this.update((state) => {
      const node = state.nodes.find((item) => item.nodeId === nodeId);
      if (!node) return;
      state.audits.push(mutate(node));
      updated = node;
    });
    return updated ? structuredClone(updated) : null;
  }
}

export class FileAgentControlRepository implements AgentControlRepository {
  private queue = Promise.resolve();
  constructor(private readonly filePath: string) {}

  async read(): Promise<AgentControlState> {
    try { return AgentControlStateSchema.parse(JSON.parse(await readFile(this.filePath, "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyState(); throw error; }
  }

  async update(mutate: (state: AgentControlState) => void): Promise<AgentControlState> {
    const operation = this.queue.catch(() => undefined).then(async () => {
      const state = await this.read();
      mutate(state);
      sanitizeState(state);
      state.nonces = state.nonces.filter((item) => Date.parse(item.expiresAt) > Date.now());
      state.audits = state.audits.slice(-10_000);
      await mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
      await chmod(dirname(this.filePath), 0o700);
      const temporary = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(temporary, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, this.filePath);
      await chmod(this.filePath, 0o600);
      return structuredClone(state);
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async consumeNonce(request: AgentNonceRequest) {
    let result: AgentNonceConsumption = "unauthorized";
    await this.update((state) => { result = consumeNonce(state, request); });
    return result;
  }

  async updateNodeWithAudit(nodeId: string, mutate: (node: AgentNodeState) => AuditEvent) {
    let updated: AgentNodeState | undefined;
    await this.update((state) => {
      const node = state.nodes.find((item) => item.nodeId === nodeId);
      if (!node) return;
      state.audits.push(mutate(node));
      updated = node;
    });
    return updated ? structuredClone(updated) : null;
  }
}

export const CONTROLLER_SUPPORTED_AGENT_CAPABILITIES: readonly AgentCapability[] = [
  "system.summary.read", "service.status.read", "sites.inventory.read", "sites.logs.read",
  "terminal.command.execute", "sites.deploy", "sites.lifecycle.manage", "sites.certificates.renew", "runtime.install", "databases.inventory.read",
  "database.inventory.read", "database.sql.read", "database.backup", "database.operate", "database.install", "database.restore",
];
export const DEFAULT_AGENT_CAPABILITIES: readonly AgentCapability[] = ["system.summary.read", "service.status.read", "sites.inventory.read", "databases.inventory.read"];
