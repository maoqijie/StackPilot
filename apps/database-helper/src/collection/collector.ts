import { readFile, readdir, stat, statfs } from "node:fs/promises";
import { join } from "node:path";
import {
  AgentDatabaseQueryUploadSchema, AgentDatabaseSnapshotSchema, DatabaseHelperCollectionSchema,
  type AgentDatabaseInstance, type AgentDatabaseQueryUpload,
} from "@stackpilot/contracts";
import type { ManagedInstance } from "../domain.js";
import type { DatabaseRegistry } from "../state/registry.js";
import type { QueryClient } from "./queryClient.js";
import { mysqlInventorySql, mysqlQueriesSql, postgresInventorySql, postgresQueriesSql } from "./sql.js";

type Inventory = { version: string; storageBytes: number; activeConnections: number; maxConnections: number; accessMode: "read-write" | "read-only" };
type Session = Omit<AgentDatabaseQueryUpload["sessions"][number], "instanceLocalId">;
type Query = Omit<AgentDatabaseQueryUpload["queries"][number], "instanceLocalId" | "calls" | "p95Ms" | "rowsExamined" | "historical">;
type Queries = { sessions: Array<Omit<Session, "protected"> & { protected: boolean | number }>; queries: Query[] };
type FileSystemReader = (path: string) => Promise<{ bsize: number | bigint; blocks: number | bigint; bavail: number | bigint }>;
type BackupState = { status: "succeeded" | "unavailable"; lastBackupAt: string | null };

const safeBytes = (value: bigint) => value > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(value);
const nullableIso = (value: string | null) => value === null ? null : new Date(value).toISOString();
const iso = (value: string) => new Date(value).toISOString();
async function volume(instance: ManagedInstance, readStatfs: FileSystemReader) {
  const data = await readStatfs(instance.dataDirectory); const size = BigInt(data.bsize) * BigInt(data.blocks); const free = BigInt(data.bsize) * BigInt(data.bavail);
  const totalBytes = safeBytes(size); const usedBytes = safeBytes(size - free);
  return totalBytes === null || usedBytes === null ? [] : [{ label: instance.dataDirectory, path: instance.dataDirectory, totalBytes, usedBytes }];
}
async function latestBackup(instance: ManagedInstance): Promise<BackupState> {
  try {
    const directories = (await readdir(instance.backupDirectory, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name));
    const candidates = await Promise.all(directories.map(async (entry) => ({ path: join(instance.backupDirectory, entry.name, "manifest.json"), time: (await stat(join(instance.backupDirectory, entry.name))).mtimeMs })));
    for (const candidate of candidates.sort((a, b) => b.time - a.time)) {
      const manifest = JSON.parse(await readFile(candidate.path, "utf8")) as { instanceId?: string; createdAt?: string };
      if (manifest.instanceId === instance.id && typeof manifest.createdAt === "string" && !Number.isNaN(Date.parse(manifest.createdAt))) return { status: "succeeded", lastBackupAt: new Date(manifest.createdAt).toISOString() };
    }
  } catch { /* Missing or invalid manifests are reported as unavailable. */ }
  return { status: "unavailable", lastBackupAt: null };
}

export class DatabaseCollector {
  constructor(private readonly registry: DatabaseRegistry, private readonly queries: QueryClient, private readonly readStatfs: FileSystemReader = statfs) {}
  async collect() {
    const collectedAt = new Date().toISOString(), instances: AgentDatabaseInstance[] = [], sessions: AgentDatabaseQueryUpload["sessions"] = [], queries: AgentDatabaseQueryUpload["queries"] = [], warnings: string[] = [];
    for (const instance of await this.registry.list()) {
      try {
        const credential = await this.registry.credential(instance.id);
        const started = performance.now();
        const inventory = await this.queries.query<Inventory>(instance, credential, instance.engine === "postgresql" ? postgresInventorySql : mysqlInventorySql);
        const latencyMs = Math.max(0, Math.round(performance.now() - started));
        const activity = await this.queries.query<Queries>(instance, credential, instance.engine === "postgresql" ? postgresQueriesSql : mysqlQueriesSql);
        instances.push(this.instance(instance, inventory, await volume(instance, this.readStatfs), activity.queries.length, latencyMs, await latestBackup(instance)));
        sessions.push(...activity.sessions.map((session) => ({ ...session, protected: session.protected === true || session.protected === 1,
          startedAt: nullableIso(session.startedAt), transactionStartedAt: nullableIso(session.transactionStartedAt), instanceLocalId: instance.id })));
        queries.push(...activity.queries.map((query) => ({ ...query, startedAt: iso(query.startedAt), lastSeenAt: iso(query.lastSeenAt),
          instanceLocalId: instance.id, calls: null, p95Ms: null, rowsExamined: null, historical: false })));
      } catch {
        warnings.push(`实例 ${instance.id} 采集不可用`);
        instances.push(this.unavailable(instance));
      }
    }
    const collectionStatus = warnings.length === 0 ? "complete" : instances.length === warnings.length ? "unavailable" : "partial";
    return DatabaseHelperCollectionSchema.parse({
      snapshot: AgentDatabaseSnapshotSchema.parse({ collectedAt, collectionStatus, warnings, instances }),
      queryUpload: AgentDatabaseQueryUploadSchema.parse({ collectedAt, collectionStatus, warnings, sessions, queries }),
    });
  }
  private instance(instance: ManagedInstance, value: Inventory, volumes: AgentDatabaseInstance["volumes"], slowQueryCount: number, latencyMs: number, backup: BackupState): AgentDatabaseInstance {
    return { id: instance.id, name: instance.name, engine: instance.engine, version: value.version, host: "localhost", port: instance.port,
      status: "running", source: instance.managed ? "stackpilot-managed" : "local-registration", managed: instance.managed,
      historicalSlowQueriesAvailable: instance.historicalSlowQueriesAvailable, latencyMs, storageBytes: value.storageBytes,
      activeConnections: value.activeConnections, maxConnections: value.maxConnections, slowQueryCount, backupStatus: backup.status,
      lastBackupAt: backup.lastBackupAt, accessMode: value.accessMode, owner: null, region: null, autoBackup: null, remoteAccess: instance.managed ? true : null, volumes };
  }
  private unavailable(instance: ManagedInstance): AgentDatabaseInstance {
    return { id: instance.id, name: instance.name, engine: instance.engine, version: instance.version, host: "localhost", port: instance.port,
      status: "unknown", source: instance.managed ? "stackpilot-managed" : "local-registration", managed: instance.managed,
      historicalSlowQueriesAvailable: instance.historicalSlowQueriesAvailable, latencyMs: null, storageBytes: null, activeConnections: null,
      maxConnections: null, slowQueryCount: null, backupStatus: "unavailable", lastBackupAt: null, accessMode: "unknown", owner: null,
      region: null, autoBackup: null, remoteAccess: instance.managed ? true : null, volumes: [] };
  }
}
