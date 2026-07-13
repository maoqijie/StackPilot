import { CircleAlert, CircleCheck, CircleX, Database, LockKeyhole } from "lucide-react";
import type { DatabaseInstance } from "./types";

function BackupSummary({ rows }: { rows: DatabaseInstance[] }) {
  const summary = [
    { label: "成功", count: rows.filter((row) => row.backupStatus === "成功").length, tone: "green", Icon: CircleCheck },
    { label: "待确认 / 运行中 / 不可用", count: rows.filter((row) => row.backupStatus === "等待确认" || row.backupStatus === "运行中" || row.backupStatus === "暂不可用").length, tone: "orange", Icon: CircleAlert },
    { label: "失败", count: rows.filter((row) => row.backupStatus === "失败").length, tone: "red", Icon: CircleX },
  ];
  return (
    <div className="database-summary-list">
      {summary.map(({ label, count, tone, Icon }) => (
        <p key={label}>
          <span className={`database-summary-icon ${tone}`}><Icon size={16} aria-hidden="true" /></span>
          <span>{label}</span>
          <b>{count} 个实例</b>
        </p>
      ))}
      <small>统计范围：当前筛选结果</small>
    </div>
  );
}

function HealthMini({ instance, collectedAt }: { instance: DatabaseInstance | null; collectedAt: string }) {
  if (!instance) return <p className="module-card-empty">没有可展示的连接健康数据</p>;
  const latency = parseMetric(instance.latency);
  const latencyUnavailable = latency === null;
  return (
    <div className="health-mini">
      <p><span>连接延迟</span><b className={latencyUnavailable ? "gray-text" : latency > 120 ? "orange-text" : "green-text"}>{instance.latency}</b><em>{latencyUnavailable ? "等待采集" : latency > 120 ? "需要关注" : "连接正常"}</em></p>
      <p><span>连接占用</span><b>{instance.connections}</b><em>当前连接 / 上限</em></p>
      <p><span>区域</span><b>{instance.region}</b><em>{instance.engine}</em></p>
      <p><span>采集时间</span><b>{collectedAt}</b><em>{instance.freshness === "stale" ? "数据已过期" : "后端采集"}</em></p>
    </div>
  );
}

function SlowInstanceList({ rows, onOpen }: { rows: DatabaseInstance[]; onOpen: (id: string) => void }) {
  const slowInstances = [...rows]
    .filter((row) => (row.slowQueries ?? 0) > 0)
    .sort((left, right) => (right.slowQueries ?? 0) - (left.slowQueries ?? 0))
    .slice(0, 5);
  if (slowInstances.length === 0) return <p className="module-card-empty">当前筛选没有慢查询实例</p>;
  return (
    <div className="database-watch-list">
      {slowInstances.map((instance) => (
        <button key={instance.id} type="button" onClick={() => onOpen(instance.id)}>
          <span className="database-summary-icon orange"><CircleAlert size={16} aria-hidden="true" /></span>
          <span><b title={instance.name}>{instance.name}</b><em>{instance.host}:{instance.port}</em></span>
          <strong>{instance.slowQueries ?? 0} 条</strong>
        </button>
      ))}
    </div>
  );
}

function AccessSummary({ rows }: { rows: DatabaseInstance[] }) {
  const accessTypes: DatabaseInstance["access"][] = ["读写", "只读", "仅备份", "未知"];
  return (
    <div className="database-summary-list">
      {accessTypes.map((access) => (
        <p key={access}>
          <span className={`database-summary-icon ${access === "读写" ? "blue" : access === "只读" ? "green" : "orange"}`}>
            {access === "读写" ? <Database size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}
          </span>
          <span>{access}</span>
          <b>{rows.filter((row) => row.access === access).length} 个实例</b>
        </p>
      ))}
      <small>权限状态始终同时显示文字标签</small>
    </div>
  );
}

function parseMetric(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export { AccessSummary, BackupSummary, HealthMini, SlowInstanceList };
