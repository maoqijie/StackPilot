import { Activity, AlertTriangle, CheckCircle2, CircleDashed, Clock3, CloudOff, Database, Download, FileSearch, Gauge, Server, UserRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { DatabaseSlowQueriesPayload, DatabaseSlowQueryRecord } from "@stackpilot/contracts";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch, PanelCard } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { Sparkline } from "../components/ui/StatusVisuals";
import { useDatabaseSlowQueries } from "../features/databases/useDatabaseSlowQueries";
import type { Notify, PageKey, Tone } from "../types/app";
import { formatBackendDateTime } from "../utils/time";

type RiskLabel = "高" | "中" | "低";
function DatabaseSlowQueriesPage({ page, notify, initialPayload = null }: { page: PageKey; notify: Notify; initialPayload?: DatabaseSlowQueriesPayload | null }) {
  const { payload, loading, error, retry } = useDatabaseSlowQueries(initialPayload);
  const [search, setSearch] = useState(""); const [databaseFilter, setDatabaseFilter] = useState("全部");
  const [levelFilter, setLevelFilter] = useState("全部"); const [stateFilter, setStateFilter] = useState("全部");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const queries = useMemo(() => payload?.queries ?? [], [payload]); const instances = payload?.instances ?? [];
  const available = payload !== null && payload.collectionStatus !== "unavailable";
  const collectedAt = formatBackendDateTime(payload?.collectedAt, "暂不可用");
  const databaseOptions = ["全部", ...new Set([...queries.map((query) => query.database), ...instances.map((instance) => instance.name)])];
  const filteredQueries = queries.filter((query) => {
    const keyword = search.trim().toLowerCase();
    return (!keyword || `${query.database} ${query.fingerprint} ${query.sql} ${query.owner ?? ""}`.toLowerCase().includes(keyword))
      && (databaseFilter === "全部" || query.database === databaseFilter) && (levelFilter === "全部" || riskLabel(query.risk) === levelFilter)
      && (stateFilter === "全部" || stateLabel(query.state) === stateFilter);
  });
  const selectedQuery = drawerId ? queries.find((query) => query.id === drawerId) ?? null : null;
  const affectedDatabases = new Set(queries.map((query) => query.database)).size;
  const longestDuration = queries.reduce((max, query) => Math.max(max, query.durationMs), 0);
  const highCount = queries.filter((query) => query.risk === "high").length;
  const exportQueries = () => {
    const rows = [["SQL 指纹", "数据库", "SQL", "当前耗时", "风险", "状态", "用户", "开始时间", "会话"], ...filteredQueries.map((query) => [query.fingerprint, query.database, query.sql, duration(query.durationMs), riskLabel(query.risk), stateLabel(query.state), query.owner ?? "暂不可用", query.startedAt, query.sessionId ?? "暂不可用"])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "database-slow-queries.csv"; anchor.click(); URL.revokeObjectURL(url); notify(`已导出 ${filteredQueries.length} 条真实慢查询`, "info");
  };
  return <><ModulePageShell title={resolvePageMeta(page).title} subtitle={`聚焦当前执行超过 ${payload ? duration(payload.thresholdMs) : "1 秒"} 的 PostgreSQL 查询`} page={page}
    viewContext={{ eyebrow: "数据库 / 慢查询", title: "慢查询中心", chips: available ? [`当前慢查询 ${queries.length}`, `数据库 ${instances.length}`] : ["当前慢查询 暂不可用", "数据库 暂不可用"] }}
    actions={<button className="ghost" type="button" disabled={!filteredQueries.length} onClick={exportQueries}><Download size={15} /> 导出</button>}
    filters={<><ModuleSearch value={search} placeholder="搜索 SQL、指纹、数据库或用户" onChange={setSearch} /><FieldSelect label="数据库" value={databaseFilter} options={databaseOptions} onChange={setDatabaseFilter} /><FieldSelect label="风险" value={levelFilter} options={["全部", "高", "中", "低"]} onChange={setLevelFilter} /><FieldSelect label="状态" value={stateFilter} options={["全部", "执行中", "等待中"]} onChange={setStateFilter} /></>}
    metrics={<><MetricTile icon={Activity} label="当前慢查询" value={available ? `${queries.length}` : "暂不可用"} tone="blue" /><MetricTile icon={Clock3} label="最长耗时" value={available && queries.length ? duration(longestDuration) : "暂不可用"} tone="purple" /><MetricTile icon={Database} label="受影响数据库" value={available ? `${affectedDatabases}` : "暂不可用"} tone="green" /><MetricTile icon={AlertTriangle} label="高风险" value={available ? `${highCount}` : "暂不可用"} tone="orange" /></>}>
    {loading && !payload && <span className="sr-only" role="status">正在从真实后端采集数据库慢查询</span>}
    {error && !payload && <div className="overview-error-state"><CloudOff size={18} /><span>{error}</span><button type="button" disabled={loading} onClick={() => void retry()}>重试</button></div>}
    <div className="slow-freshness" role="status"><CloudOff size={20} aria-hidden="true" /><div><strong>采集时间 {collectedAt}</strong><span>{!payload || payload.collectionStatus === "unavailable" ? payload?.warnings[0] ?? "等待真实后端返回慢查询统计。" : `数据来源：Controller 本机 PostgreSQL pg_stat_activity${payload.warnings[0] ? ` · ${payload.warnings[0]}` : ""}`}</span></div></div>
    <div className="database-slow-content"><DataTable columns={[
      { key: "fingerprint", label: "SQL 指纹", width: "190px", render: (query) => <button className="module-row-link slow-fingerprint" type="button" aria-label={`查看慢查询 ${query.fingerprint}`} title={query.fingerprint} onClick={() => setDrawerId(query.id)}><FileSearch size={16} /><b>{query.fingerprint}</b></button> },
      { key: "database", label: "数据库", width: "152px", render: (query) => <span className="slow-database-name" title={query.database}>{query.database}</span> },
      { key: "sql", label: "SQL 摘要", render: (query) => <code className="slow-sql-summary" title={query.sql ?? undefined}>{query.sql ?? "无权查看完整 SQL"}</code> },
      { key: "duration", label: "当前耗时", width: "104px", sortValue: (query) => query.durationMs, render: (query) => <b>{duration(query.durationMs)}</b> },
      { key: "owner", label: "用户", width: "100px", render: (query) => query.owner ?? "暂不可用" },
      { key: "startedAt", label: "开始时间", width: "144px", render: (query) => formatBackendDateTime(query.startedAt) },
      { key: "risk", label: "风险", width: "104px", sortValue: (query) => riskRank(query.risk), render: (query) => <RiskBadge risk={query.risk} /> },
      { key: "state", label: "状态", width: "104px", render: (query) => <StateBadge state={query.state} /> },
    ]} rows={filteredQueries} emptyText={available ? "当前没有执行超过阈值的查询" : "慢查询统计暂不可用"} getRowKey={(query) => query.id}
    mobileCard={(query) => <><div className="module-card-head"><button className="module-row-link slow-fingerprint" type="button" aria-label={`查看慢查询 ${query.fingerprint}`} onClick={() => setDrawerId(query.id)}><FileSearch size={16} /><b>{query.fingerprint}</b></button><RiskBadge risk={query.risk} /></div><code className="module-card-code">{query.sql}</code><div className="module-card-meta"><span><b>数据库</b><em>{query.database}</em></span><span><b>当前耗时</b><em>{duration(query.durationMs)}</em></span><span><b>用户</b><em>{query.owner ?? "暂不可用"}</em></span><span><b>开始时间</b><em>{formatBackendDateTime(query.startedAt)}</em></span></div><div className="module-card-footer"><StateBadge state={query.state} /></div></>} />
    <section className="slow-query-lower"><PanelCard title="数据库连接"><div className="slow-instance-list">{instances.map((instance) => <article key={instance.id}><span className="slow-list-icon blue"><Server size={20} /></span><div><strong title={instance.name}>{instance.name}</strong><span>{instance.engine} · {instance.host}:{instance.port}</span><small><Clock3 size={12} />采集于 {formatBackendDateTime(instance.collectedAt)}</small></div><span className={`slow-status-badge ${instance.slowQueryCount ? "orange" : "green"}`}>{instance.slowQueryCount ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}{instance.slowQueryCount} 条慢查询</span><b>{instance.activeConnections} 连接</b></article>)}{!instances.length && <p className="module-card-empty">数据库实例暂不可用</p>}</div></PanelCard>
    <PanelCard title="当前耗时分布" className="slow-trend-card"><div className="slow-trend-panel"><div><span><b>执行时长</b><em>{filteredQueries.length ? duration(Math.max(...filteredQueries.map((query) => query.durationMs))) : "暂不可用"}</em></span><Sparkline values={filteredQueries.length ? filteredQueries.map((query) => query.durationMs) : [0]} tone="purple" /></div></div></PanelCard></section></div>
  </ModulePageShell>{selectedQuery && <DetailDrawer title="慢查询详情" subtitle={selectedQuery.fingerprint} onClose={() => setDrawerId(null)} autoFocus modal><div className="slow-query-drawer"><div className="slow-drawer-summary"><span className="slow-list-icon blue"><Database size={18} /></span><div><strong>{selectedQuery.database}</strong><span>{selectedQuery.fingerprint}</span></div><RiskBadge risk={selectedQuery.risk} /></div><dl><div><dt>状态</dt><dd><StateBadge state={selectedQuery.state} /></dd></div><div><dt>当前耗时</dt><dd>{duration(selectedQuery.durationMs)}</dd></div><div><dt>P95 / 调用</dt><dd>暂不可用 / 暂不可用</dd></div><div><dt>数据库用户</dt><dd><UserRound size={13} />{selectedQuery.owner ?? "暂不可用"}</dd></div><div><dt>开始时间</dt><dd><Clock3 size={13} />{formatBackendDateTime(selectedQuery.startedAt)}</dd></div><div><dt>会话</dt><dd><code>{selectedQuery.sessionId ?? "暂不可用"}</code></dd></div><div><dt>等待事件</dt><dd>{selectedQuery.waitEvent ?? "无"}</dd></div></dl><section><h3>标准化 SQL</h3><code>{selectedQuery.sql}</code></section><section><h3>统计说明</h3><p>当前采集来自 pg_stat_activity。历史 P95、调用次数、执行计划与索引建议需启用 pg_stat_statements 后才能提供。</p></section></div></DetailDrawer>}</>;
}

function RiskBadge({ risk }: { risk: DatabaseSlowQueryRecord["risk"] }) { const Icon = risk === "high" ? AlertTriangle : risk === "medium" ? Gauge : CheckCircle2; return <span className={`slow-status-badge ${riskTone(risk)}`}><Icon size={13} />{riskLabel(risk)}风险</span>; }
function StateBadge({ state }: { state: DatabaseSlowQueryRecord["state"] }) { const waiting = state === "waiting"; return <span className={`slow-status-badge ${waiting ? "orange" : "blue"}`}>{waiting ? <Clock3 size={13} /> : <CircleDashed size={13} />}{stateLabel(state)}</span>; }
function duration(ms: number) { return ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} 分` : ms >= 1_000 ? `${(ms / 1_000).toFixed(2)} 秒` : `${ms}ms`; }
function riskLabel(risk: DatabaseSlowQueryRecord["risk"]): RiskLabel { return risk === "high" ? "高" : risk === "medium" ? "中" : "低"; }
function stateLabel(state: DatabaseSlowQueryRecord["state"]) { return state === "waiting" ? "等待中" : "执行中"; }
function riskTone(risk: DatabaseSlowQueryRecord["risk"]): Tone { return risk === "high" ? "orange" : risk === "medium" ? "blue" : "green"; }
function riskRank(risk: DatabaseSlowQueryRecord["risk"]) { return risk === "high" ? 3 : risk === "medium" ? 2 : 1; }

export { DatabaseSlowQueriesPage };
