import type { DatabaseInstance } from "./types";
import type { Tone } from "../../types/app";
import type { DatabaseInstanceRecord } from "@stackpilot/contracts";
import { formatBackendDateTime } from "../../utils/time";

function databaseHealthTone(instance: DatabaseInstance): Tone {
  if (instance.freshness === "stale") return "gray";
  return instance.connectionHealth === "运行中" ? "green" : instance.connectionHealth === "未知" ? "gray" : "orange";
}

function databaseHealthLabel(instance: DatabaseInstance) {
  return instance.freshness === "stale" ? "数据已过期" : instance.connectionHealth;
}

function isDatabaseHealthy(instance: DatabaseInstance) {
  return instance.freshness === "current" && instance.connectionHealth === "运行中";
}

function isDatabaseAlert(instance: DatabaseInstance) {
  return instance.freshness === "stale" || (instance.connectionHealth !== "运行中" && instance.connectionHealth !== "未知");
}

const engineLabel = { postgresql: "PostgreSQL", mysql: "MySQL", mariadb: "MariaDB" } as const;
const statusLabel = { running: "运行中", degraded: "异常", stopped: "已停止", unknown: "未知" } as const;
const backupLabel = { succeeded: "成功", failed: "失败", running: "运行中", pending: "等待确认", unavailable: "暂不可用" } as const;
const accessLabel = { "read-write": "读写", "read-only": "只读", "backup-only": "仅备份", unknown: "未知" } as const;

function formatBytes(value: number | null) {
  if (value === null) return "暂不可用";
  const units = ["B", "KB", "MB", "GB", "TB"]; let amount = value; let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount >= 10 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`;
}

function databaseInstanceFromApi(record: DatabaseInstanceRecord): DatabaseInstance {
  return {
    id: record.id, name: record.name, engine: `${engineLabel[record.engine]}${record.version ? ` ${record.version}` : ""}`,
    host: record.address ?? record.host, port: record.port === null ? "待采集" : String(record.port), connectionHealth: statusLabel[record.status],
    backupStatus: backupLabel[record.backupStatus], slowQueries: record.slowQueryCount,
    lastBackup: record.lastBackupAt ? formatBackendDateTime(record.lastBackupAt) : "暂不可用", access: accessLabel[record.accessMode],
    owner: record.owner ?? "未分配", storage: formatBytes(record.storageBytes),
    connections: record.activeConnections === null ? "暂不可用" : `${record.activeConnections} / ${record.maxConnections ?? "?"}`,
    latency: record.latencyMs === null ? "暂不可用" : `${record.latencyMs}ms`, region: record.region ?? "未标记",
    autoBackup: record.autoBackup === true, remoteAccess: record.remoteAccess === true, nodeName: record.nodeName, source: record.source,
    collectedAt: record.collectedAt, freshness: record.freshness,
  };
}

function databaseBackupTone(status: DatabaseInstance["backupStatus"]): Tone {
  if (status === "失败") return "red";
  if (status === "等待确认" || status === "运行中") return "orange";
  if (status === "暂不可用") return "gray";
  return "green";
}

export { databaseBackupTone, databaseHealthLabel, databaseHealthTone, databaseInstanceFromApi, isDatabaseAlert, isDatabaseHealthy };
