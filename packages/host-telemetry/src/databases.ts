import { execFile } from "node:child_process";
import { hostname, platform } from "node:os";
import { promisify } from "node:util";
import { AgentDatabaseSnapshotSchema } from "@stackpilot/contracts";
import type { AgentDatabaseInstance, AgentDatabaseSnapshot, AgentPlatform } from "@stackpilot/contracts";

const execFileAsync = promisify(execFile);
const DATABASE_UNIT_PATTERNS = ["postgresql.service", "postgresql@*.service", "mysql.service", "mysqld.service", "mariadb.service", "mariadb@*.service"] as const;
type DatabaseUnitRunner = (signal?: AbortSignal) => Promise<string>;
type DatabaseCollectorOptions = { target?: AgentPlatform; hostName?: string; now?: () => Date; run?: DatabaseUnitRunner };

function engineForUnit(unit: string): AgentDatabaseInstance["engine"] | null {
  const value = unit.toLowerCase();
  if (value.startsWith("postgresql")) return "postgresql";
  if (value.startsWith("mariadb")) return "mariadb";
  if (value.startsWith("mysql") || value.startsWith("mysqld")) return "mysql";
  return null;
}

function statusForUnit(active: string, sub: string): AgentDatabaseInstance["status"] {
  if (active === "active" && sub === "running") return "running";
  if (active === "failed" || sub === "failed") return "degraded";
  if (active === "inactive" || active === "deactivating") return "stopped";
  return "unknown";
}

export function parseSystemdDatabaseUnits(output: string, hostName: string): AgentDatabaseInstance[] {
  const seen = new Set<string>(); const instances: AgentDatabaseInstance[] = [];
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/); const unit = columns[0] ?? ""; const engine = engineForUnit(unit);
    if (columns.length < 4 || !engine || seen.has(unit)) continue;
    seen.add(unit); const template = unit.match(/^[^@]+@(.+)\.service$/)?.[1];
    instances.push({
      id: unit, name: template ? `${engine}-${template}` : engine, engine, version: null, host: hostName, port: null,
      status: statusForUnit(columns[2] ?? "", columns[3] ?? ""), source: `systemd:${unit}`, managed: false, historicalSlowQueriesAvailable: false,
      latencyMs: null, storageBytes: null,
      activeConnections: null, maxConnections: null, slowQueryCount: null, backupStatus: "unavailable", lastBackupAt: null,
      accessMode: "unknown", owner: null, region: null, autoBackup: null, remoteAccess: null, volumes: [],
    });
  }
  return instances.slice(0, 256);
}

async function runSystemd(signal?: AbortSignal) {
  const { stdout } = await execFileAsync("systemctl", ["list-units", "--type=service", "--all", "--no-legend", "--plain", "--no-pager", ...DATABASE_UNIT_PATTERNS], { signal, timeout: 4_000, maxBuffer: 1024 * 1024, windowsHide: true });
  return stdout;
}

export class SystemdDatabaseCollector {
  private readonly target; private readonly hostName; private readonly now; private readonly run;
  constructor(options: DatabaseCollectorOptions = {}) {
    this.target = options.target ?? platform() as AgentPlatform; this.hostName = options.hostName ?? hostname();
    this.now = options.now ?? (() => new Date()); this.run = options.run ?? runSystemd;
  }
  async collect(signal?: AbortSignal): Promise<AgentDatabaseSnapshot> {
    const collectedAt = this.now().toISOString();
    if (this.target !== "linux") return AgentDatabaseSnapshotSchema.parse({ collectedAt, collectionStatus: "unavailable", warnings: ["数据库服务发现当前仅支持 Linux systemd"], instances: [] });
    try {
      return AgentDatabaseSnapshotSchema.parse({ collectedAt, collectionStatus: "complete", warnings: [], instances: parseSystemdDatabaseUnits(await this.run(signal), this.hostName) });
    } catch {
      return AgentDatabaseSnapshotSchema.parse({ collectedAt, collectionStatus: "unavailable", warnings: ["systemd 数据库服务清单不可用"], instances: [] });
    }
  }
}

export class DatabaseSnapshotCache {
  private snapshot: AgentDatabaseSnapshot | undefined; private active: Promise<void> | undefined; private lastStarted = 0;
  constructor(private readonly collector: SystemdDatabaseCollector, private readonly intervalMs = 60_000) {}
  async refreshIfDue(now = Date.now()) {
    if (this.active) return this.active; if (this.lastStarted && now - this.lastStarted < this.intervalMs) return;
    this.lastStarted = now;
    this.active = this.collector.collect().then((snapshot) => {
      this.snapshot = snapshot.collectionStatus === "unavailable" && this.snapshot?.instances.length
        ? { ...snapshot, collectedAt: this.snapshot.collectedAt, collectionStatus: "partial", instances: this.snapshot.instances, warnings: [...snapshot.warnings, "已保留上次成功采集的数据库实例"].slice(0, 20) }
        : snapshot;
    }).finally(() => { this.active = undefined; });
    await this.active;
  }
  get current() { return this.snapshot; }
}

export { DATABASE_UNIT_PATTERNS };
export type { DatabaseCollectorOptions, DatabaseUnitRunner };
