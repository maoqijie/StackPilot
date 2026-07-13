import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  CloudOff,
  Database,
  Download,
  Eye,
  FileSearch,
  Gauge,
  Lightbulb,
  ListChecks,
  Plus,
  ShieldAlert,
  UserRound,
  Wrench,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolvePageMeta } from "../app/navigation";
import { setDatabaseFocusRoute } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch, PanelCard } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { Sparkline } from "../components/ui/StatusVisuals";
import type { DatabaseInstance, DatabaseSlowQuery } from "../features/databases/types";
import { databaseHealthTone, readSlowRemediationIds, writeSlowRemediationIds } from "../features/databases/model";
import type { Notify, PageKey, SetPage, Tone } from "../types/app";
import { formatBackendDateTime, secondsFromDuration } from "../utils/time";

type SlowQuerySnapshot = {
  queries: DatabaseSlowQuery[];
  instances: DatabaseInstance[];
  collectedAt?: string | null;
};

function DatabaseSlowQueriesPage({ page, setPage, notify, snapshot = null }: { page: PageKey; setPage: SetPage; notify: Notify; snapshot?: SlowQuerySnapshot | null }) {
  const [queries, setQueries] = useState(() => snapshot?.queries ?? []);
  const [search, setSearch] = useState("");
  const [databaseFilter, setDatabaseFilter] = useState("全部");
  const [levelFilter, setLevelFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [timeRange, setTimeRange] = useState("近 24 小时");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerAutoFocus, setDrawerAutoFocus] = useState(false);
  const [instanceRemediationIds, setInstanceRemediationIds] = useState(readSlowRemediationIds);
  const hasCollectedData = snapshot !== null;
  const collectedAt = formatBackendDateTime(snapshot?.collectedAt, "暂不可用");
  const delayedInstances = (snapshot?.instances ?? []).filter((instance) => instance.connectionHealth.startsWith("延迟") || instance.slowQueries > 0);
  const databaseOptions = ["全部", ...Array.from(new Set([...queries.map((query) => query.database), ...delayedInstances.map((instance) => instance.name)]))];
  const filteredQueries = queries.filter((query) => {
    const keyword = search.trim().toLowerCase();
    const matchSearch = !keyword || `${query.database} ${query.fingerprint} ${query.sql} ${query.owner}`.toLowerCase().includes(keyword);
    const matchDatabase = databaseFilter === "全部" || query.database === databaseFilter;
    const matchLevel = levelFilter === "全部" || query.level === levelFilter;
    const matchStatus = statusFilter === "全部" || query.status === statusFilter;
    return matchSearch && matchDatabase && matchLevel && matchStatus;
  });
  const filteredDelayedInstances = delayedInstances.filter((instance) => {
    const keyword = search.trim().toLowerCase();
    const matchSearch = !keyword || `${instance.name} ${instance.engine} ${instance.host} ${instance.connectionHealth} ${instance.owner}`.toLowerCase().includes(keyword);
    const matchDatabase = databaseFilter === "全部" || instance.name === databaseFilter;
    const matchLevel = levelFilter === "全部" || (levelFilter === "高" ? instance.connectionHealth.startsWith("延迟") || instance.slowQueries >= 10 : levelFilter === "中" ? instance.slowQueries > 0 : false);
    const matchStatus = statusFilter === "全部" || statusFilter === "待处理";
    return matchSearch && matchDatabase && matchLevel && matchStatus;
  });
  const selectedQuery = drawerId ? queries.find((query) => query.id === drawerId) ?? null : null;
  const primaryQuery = filteredQueries[0] ?? null;
  const pendingCount = queries.filter((query) => query.status !== "已处理").length;
  const highLatencyCount = delayedInstances.filter((instance) => instance.connectionHealth.startsWith("延迟") || instance.slowQueries >= 10).length;
  const highCount = queries.filter((query) => query.level === "高" && query.status !== "已处理").length + highLatencyCount;
  const affectedDatabases = new Set([
    ...queries.filter((query) => query.status !== "已处理").map((query) => query.database),
    ...delayedInstances.map((instance) => instance.name),
  ]).size;
  const highestP95 = queries.reduce<DatabaseSlowQuery | null>((max, query) => (
    !max || secondsFromDuration(query.p95Time) > secondsFromDuration(max.p95Time) ? query : max
  ), null);
  const distributionMetrics = [
    {
      label: "平均耗时",
      value: filteredQueries.length
        ? `${(filteredQueries.reduce((sum, query) => sum + secondsFromDuration(query.avgTime), 0) / filteredQueries.length).toFixed(2)}s`
        : "暂不可用",
      points: filteredQueries.map((query) => secondsFromDuration(query.avgTime)),
      tone: "blue" as Tone,
    },
    {
      label: "P95 最高",
      value: filteredQueries.reduce<DatabaseSlowQuery | null>((max, query) => (
        !max || secondsFromDuration(query.p95Time) > secondsFromDuration(max.p95Time) ? query : max
      ), null)?.p95Time ?? "暂不可用",
      points: filteredQueries.map((query) => secondsFromDuration(query.p95Time)),
      tone: "purple" as Tone,
    },
    {
      label: "调用总量",
      value: filteredQueries.length ? `${filteredQueries.reduce((sum, query) => sum + query.calls, 0)} 次` : "暂不可用",
      points: filteredQueries.map((query) => query.calls),
      tone: "green" as Tone,
    },
  ];
  const updateQuery = (id: string, patch: Partial<DatabaseSlowQuery>) => {
    setQueries((current) => current.map((query) => query.id === id ? { ...query, ...patch } : query));
  };
  const openQuery = (query: DatabaseSlowQuery) => {
    setDrawerAutoFocus(true);
    setDrawerId(query.id);
  };
  const closeQuery = () => {
    setDrawerAutoFocus(false);
    setDrawerId(null);
  };
  const runExplain = (queryId: string) => {
    const target = queries.find((query) => query.id === queryId);
    if (!target) {
      notify("未找到可分析的慢查询", "warning");
      return;
    }
    const nextExplain = target.explain ?? `${target.database.toLowerCase().includes("mysql") ? "type=range" : "Bitmap Heap Scan"} · rows=${target.rows} · cost=high · 建议按指纹创建索引`;
    setDrawerAutoFocus(true);
    setDrawerId(target.id);
    setQueries((current) => current.map((item) => (
      item.id === queryId
        ? { ...item, status: item.status === "已处理" ? "已处理" : "分析中", explain: nextExplain }
        : item
    )));
    notify(`${target.fingerprint} 的 Explain 已生成`, "info");
  };
  const markResolved = (query: DatabaseSlowQuery) => {
    updateQuery(query.id, { status: "已处理" });
    notify(`${query.fingerprint} 已标记处理`);
  };
  const createIndexAdvice = (query: DatabaseSlowQuery) => {
    updateQuery(query.id, { suggestion: `${query.suggestion} · 已生成索引建议草案。`, status: query.status === "已处理" ? "已处理" : "分析中" });
    setDrawerAutoFocus(true);
    setDrawerId(query.id);
    notify(`${query.database} 索引建议已生成`);
  };
  const killSession = (query: DatabaseSlowQuery) => {
    updateQuery(query.id, { status: query.status === "已处理" ? "已处理" : "分析中" });
    notify(`${query.sessionId} 已发送终止会话指令`, "warning");
  };
  const copyFingerprint = async (fingerprint: string) => {
    try {
      await navigator.clipboard?.writeText(fingerprint);
      notify("SQL 指纹已复制", "info");
    } catch {
      notify("浏览器未允许复制 SQL 指纹", "warning");
    }
  };
  const handlePrimaryIndexAdvice = () => {
    if (!primaryQuery) {
      notify("没有可生成建议的慢查询", "warning");
      return;
    }
    createIndexAdvice(primaryQuery);
  };
  const exportQueries = () => {
    const cells = [
      ["SQL 指纹", "数据库", "SQL", "平均耗时", "P95", "调用次数", "等级", "状态", "负责人", "首次发现"],
      ...filteredQueries.map((query) => [query.fingerprint, query.database, query.sql, query.avgTime, query.p95Time, query.calls, query.level, query.status, query.owner, query.firstSeen]),
    ];
    const csv = cells.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "database-slow-queries.csv";
    anchor.click();
    URL.revokeObjectURL(url);
    notify(`已导出 ${filteredQueries.length} 条慢查询`, "info");
  };
  const openDelayedInstancesPage = () => {
    if (filteredDelayedInstances.length === 0) {
      setPage("databases", { message: "已打开数据库实例页", tone: "info" });
      return;
    }
    const target = filteredDelayedInstances.find((instance) => instance.connectionHealth.startsWith("延迟")) ?? filteredDelayedInstances[0];
    setDatabaseFocusRoute(target.name);
    notify(`已定位 ${target.name}，共发现 ${filteredDelayedInstances.length} 个延迟实例`, "warning");
  };
  const queueInstanceRemediation = (instance: DatabaseInstance) => {
    setInstanceRemediationIds((current) => (
      current.includes(instance.id) ? current : [instance.id, ...current]
    ));
    setSearch(instance.name);
    setStatusFilter("待处理");
    notify(`${instance.name} 已加入慢查询治理队列`, "info");
  };
  useEffect(() => {
    writeSlowRemediationIds(instanceRemediationIds);
  }, [instanceRemediationIds]);
  const remediationItems = [
    ...instanceRemediationIds
      .map((id) => delayedInstances.find((instance) => instance.id === id))
      .filter((instance): instance is DatabaseInstance => Boolean(instance))
      .map((instance) => ({
        id: `instance-${instance.id}`,
        title: instance.name,
        detail: `${instance.connectionHealth} · 慢查询 ${instance.slowQueries} 条 · ${instance.host}`,
        freshness: "采集时间暂不可用",
        status: "已入队",
        tone: databaseHealthTone(instance),
        onOpen: () => {
          setDatabaseFocusRoute(instance.name);
          notify(`已定位 ${instance.name} 实例详情`, "warning");
        },
      })),
    ...filteredQueries.filter((query) => query.status !== "已处理").map((query) => ({
      id: `query-${query.id}`,
      title: query.database,
      detail: query.suggestion,
      freshness: `首次发现 ${query.firstSeen}`,
      status: query.status,
      tone: levelTone(query.level),
      onOpen: () => openQuery(query),
    })),
  ];

  return (
    <>
      <ModulePageShell
        title={resolvePageMeta(page).title}
        subtitle={`聚焦慢查询指纹、耗时分布与治理动作 · 采样窗口 ${timeRange}`}
        page={page}
        viewContext={{
          eyebrow: "数据库 / 慢查询",
          title: "慢查询中心",
          chips: hasCollectedData
            ? [`待处理 ${pendingCount + delayedInstances.length}`, `延迟实例 ${delayedInstances.filter((instance) => instance.connectionHealth.startsWith("延迟")).length}`]
            : ["待处理 暂不可用", "延迟实例 暂不可用"],
        }}
        actions={<><button className="ghost" type="button" disabled={!filteredQueries.length} onClick={exportQueries}><Download size={15} /> 导出</button><button className="primary" type="button" disabled={!primaryQuery} onClick={handlePrimaryIndexAdvice}><Plus size={15} /> 索引建议</button></>}
        filters={<><ModuleSearch value={search} placeholder="搜索 SQL、指纹、数据库或负责人" onChange={setSearch} /><FieldSelect label="时间范围" value={timeRange} options={["近 24 小时", "近 7 天"]} onChange={setTimeRange} /><FieldSelect label="数据库" value={databaseFilter} options={databaseOptions} onChange={setDatabaseFilter} /><FieldSelect label="等级" value={levelFilter} options={["全部", "高", "中", "低"]} onChange={setLevelFilter} /><FieldSelect label="状态" value={statusFilter} options={["全部", "待处理", "分析中", "已处理"]} onChange={setStatusFilter} /></>}
        metrics={<><MetricTile icon={Activity} label="慢查询指纹" value={hasCollectedData ? `${queries.length}` : "暂不可用"} tone="blue" /><MetricTile icon={Clock3} label="P95 最高" value={hasCollectedData ? highestP95?.p95Time ?? "暂不可用" : "暂不可用"} tone="purple" /><MetricTile icon={Database} label="受影响实例" value={hasCollectedData ? `${affectedDatabases}` : "暂不可用"} tone="green" /><MetricTile icon={ShieldAlert} label="高风险待处理" value={hasCollectedData ? `${highCount}` : "暂不可用"} tone="orange" /></>}
      >
        <div className="slow-freshness" role="status">
          <CloudOff size={20} aria-hidden="true" />
          <div><strong>采集时间 {collectedAt}</strong><span>{hasCollectedData ? "数据源未返回采集时间时，将保留当前有效结果。" : "慢查询采集尚未接入，未显示示例数据。"}</span></div>
        </div>
        <div className="database-slow-content">
          <DataTable
            columns={[
              { key: "fingerprint", label: "SQL 指纹", width: "190px", render: (query) => <button className="module-row-link slow-fingerprint" type="button" aria-label={`查看慢查询 ${query.fingerprint}`} title={query.fingerprint} onClick={() => openQuery(query)}><FileSearch size={16} /><b>{query.fingerprint}</b></button> },
              { key: "database", label: "数据库", width: "152px", render: (query) => <span className="slow-database-name" title={query.database}>{query.database}</span> },
              { key: "sql", label: "SQL 摘要", render: (query) => <code className="slow-sql-summary" title={query.sql}>{query.sql}</code> },
              { key: "p95", label: "P95", width: "76px", sortValue: (query) => secondsFromDuration(query.p95Time), render: (query) => <b>{query.p95Time}</b> },
              { key: "calls", label: "调用", width: "68px", sortValue: (query) => query.calls, render: (query) => query.calls },
              { key: "owner", label: "负责人", width: "82px", render: (query) => query.owner },
              { key: "firstSeen", label: "首次发现", width: "104px", render: (query) => query.firstSeen },
              { key: "level", label: "风险", width: "104px", sortValue: (query) => levelRank(query.level), render: (query) => <LevelBadge level={query.level} /> },
              { key: "status", label: "状态", width: "104px", render: (query) => <QueryStatusBadge status={query.status} /> },
              { key: "ops", label: "操作", width: "168px", render: (query) => <QueryActions query={query} onExplain={runExplain} onIndex={createIndexAdvice} onResolve={markResolved} onOpen={openQuery} /> },
            ]}
            rows={filteredQueries}
            emptyText={hasCollectedData ? "没有匹配的慢查询指纹" : "等待接入慢查询采集"}
            getRowKey={(query) => query.id}
            mobileCard={(query) => (
              <>
                <div className="module-card-head">
                  <button className="module-row-link slow-fingerprint" type="button" aria-label={`查看慢查询 ${query.fingerprint}`} onClick={() => openQuery(query)}><FileSearch size={16} /><b>{query.fingerprint}</b></button>
                  <LevelBadge level={query.level} />
                </div>
                <code className="module-card-code">{query.sql}</code>
                <div className="module-card-meta">
                  <span><b>数据库</b><em>{query.database}</em></span>
                  <span><b>P95</b><em>{query.p95Time}</em></span>
                  <span><b>调用</b><em>{query.calls} 次</em></span>
                  <span><b>负责人</b><em>{query.owner}</em></span>
                  <span><b>首次发现</b><em>{query.firstSeen}</em></span>
                </div>
                <div className="module-card-footer">
                  <QueryStatusBadge status={query.status} />
                  <QueryActions query={query} onExplain={runExplain} onIndex={createIndexAdvice} onResolve={markResolved} onOpen={openQuery} />
                </div>
              </>
            )}
          />
          <section className="slow-query-lower">
            <PanelCard title="连接延迟实例" action="查看实例页" onAction={openDelayedInstancesPage}>
              <div className="slow-instance-list">
                {filteredDelayedInstances.map((instance) => (
                  <article key={instance.id}>
                    <span className={`slow-list-icon ${databaseHealthTone(instance)}`}><Gauge size={20} /></span>
                    <div><strong title={instance.name}>{instance.name}</strong><span>{instance.connectionHealth} · 慢查询 {instance.slowQueries} 条 · {instance.host}</span><small><Clock3 size={12} />采集时间暂不可用</small></div>
                    <span className="slow-status-badge orange"><AlertTriangle size={13} />需关注</span>
                    <button type="button" onClick={() => queueInstanceRemediation(instance)}>{instanceRemediationIds.includes(instance.id) ? <><CheckCircle2 size={14} />已入队</> : <><Wrench size={14} />治理</>}</button>
                  </article>
                ))}
                {filteredDelayedInstances.length === 0 && <p className="module-card-empty">{hasCollectedData ? "没有匹配的连接延迟实例" : "连接延迟数据暂不可用"}</p>}
              </div>
            </PanelCard>
            <PanelCard title="治理队列">
              <div className="slow-remediation-list">
                {remediationItems.map((item) => (
                  <article key={item.id}>
                    <span className={`slow-list-icon ${item.tone}`}><ListChecks size={20} /></span>
                    <div><strong title={item.title}>{item.title}</strong><span>{item.detail}</span><small><Clock3 size={12} />{item.freshness}</small></div>
                    <span className={`slow-status-badge ${item.tone}`}><CircleDashed size={13} />{item.status}</span>
                    <button type="button" onClick={item.onOpen}><Eye size={14} />查看</button>
                  </article>
                ))}
                {remediationItems.length === 0 && <p className="module-card-empty">当前没有待处理治理项</p>}
              </div>
            </PanelCard>
            <PanelCard title="指纹指标分布" className="slow-trend-card">
              <div className="slow-trend-panel">
                {distributionMetrics.map((metric) => (
                  <div key={metric.label}><span><b>{metric.label}</b><em>{metric.value}</em></span><Sparkline values={metric.points.length ? metric.points : [0]} tone={metric.tone} /></div>
                ))}
              </div>
            </PanelCard>
          </section>
        </div>
      </ModulePageShell>
      {selectedQuery && (
        <DetailDrawer title="慢查询详情" subtitle={selectedQuery.fingerprint} onClose={closeQuery} autoFocus={drawerAutoFocus} modal actions={<><button className="ghost" type="button" onClick={() => void copyFingerprint(selectedQuery.fingerprint)}>复制指纹</button><button className="primary" type="button" onClick={() => runExplain(selectedQuery.id)}><FileSearch size={15} />生成 Explain</button></>}>
          <div className="slow-query-drawer">
            <div className="slow-drawer-summary">
              <span className="slow-list-icon blue"><Database size={18} /></span>
              <div><strong>{selectedQuery.database}</strong><span>{selectedQuery.fingerprint}</span></div>
              <LevelBadge level={selectedQuery.level} />
            </div>
            <dl>
              <div><dt>状态</dt><dd><QueryStatusBadge status={selectedQuery.status} /></dd></div>
              <div><dt>平均 / P95</dt><dd>{selectedQuery.avgTime} / {selectedQuery.p95Time}</dd></div>
              <div><dt>调用 / 扫描</dt><dd>{selectedQuery.calls} 次 / {selectedQuery.rows} 行</dd></div>
              <div><dt>负责人</dt><dd><UserRound size={13} />{selectedQuery.owner}</dd></div>
              <div><dt>首次发现</dt><dd><Clock3 size={13} />{selectedQuery.firstSeen}</dd></div>
              <div><dt>会话</dt><dd><code>{selectedQuery.sessionId}</code></dd></div>
            </dl>
            <section><h3>SQL</h3><code>{selectedQuery.sql}</code></section>
            <section><h3>优化建议</h3><p>{selectedQuery.suggestion}</p></section>
            <section><h3>Explain</h3><code>{selectedQuery.explain ?? "尚未生成 Explain。"}</code></section>
            <div className="slow-drawer-actions">
              <button type="button" onClick={() => createIndexAdvice(selectedQuery)}><Lightbulb size={15} />索引建议</button>
              <button className="slow-destructive-action" type="button" onClick={() => killSession(selectedQuery)}><XCircle size={15} />终止会话</button>
              <button type="button" onClick={() => markResolved(selectedQuery)}><CheckCircle2 size={15} />标记处理</button>
            </div>
          </div>
        </DetailDrawer>
      )}
    </>
  );
}

function LevelBadge({ level }: { level: DatabaseSlowQuery["level"] }) {
  const Icon = level === "高" ? AlertTriangle : level === "中" ? Gauge : CheckCircle2;
  return <span className={`slow-status-badge ${levelTone(level)}`}><Icon size={13} />{level}风险</span>;
}

function QueryStatusBadge({ status }: { status: DatabaseSlowQuery["status"] }) {
  const Icon = status === "已处理" ? CheckCircle2 : status === "分析中" ? FileSearch : CircleDashed;
  return <span className={`slow-status-badge ${statusTone(status)}`}><Icon size={13} />{status}</span>;
}

function QueryActions({
  query,
  onExplain,
  onIndex,
  onResolve,
  onOpen,
}: {
  query: DatabaseSlowQuery;
  onExplain: (id: string) => void;
  onIndex: (query: DatabaseSlowQuery) => void;
  onResolve: (query: DatabaseSlowQuery) => void;
  onOpen: (query: DatabaseSlowQuery) => void;
}) {
  return (
    <span className="table-icon-actions slow-query-actions">
      <SlowIconAction icon={FileSearch} label="生成 Explain" accessibleLabel={`生成 ${query.fingerprint} Explain`} onClick={() => onExplain(query.id)} />
      <SlowIconAction icon={Lightbulb} label="创建索引建议" accessibleLabel={`创建 ${query.fingerprint} 索引建议`} onClick={() => onIndex(query)} />
      <SlowIconAction icon={CheckCircle2} label="标记已处理" accessibleLabel={`标记 ${query.fingerprint} 已处理`} disabled={query.status === "已处理"} onClick={() => onResolve(query)} />
      <SlowIconAction icon={Eye} label="查看详情" accessibleLabel={`打开 ${query.fingerprint} 详情`} onClick={() => onOpen(query)} />
    </span>
  );
}

function SlowIconAction({ icon: Icon, label, accessibleLabel, disabled, onClick }: { icon: LucideIcon; label: string; accessibleLabel: string; disabled?: boolean; onClick: () => void }) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<number | null>(null);
  const [tooltip, setTooltip] = useState<{ left: number; top: number } | null>(null);
  const hideTooltip = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setTooltip(null);
  };
  const showTooltip = () => {
    if (disabled || timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      setTooltip({ left: Math.max(16, Math.min(window.innerWidth - 16, rect.left + rect.width / 2)), top: rect.top - 8 });
      timerRef.current = null;
    }, 400);
  };
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);
  return (
    <>
      <button ref={buttonRef} type="button" disabled={disabled} aria-label={accessibleLabel} onMouseEnter={showTooltip} onMouseLeave={hideTooltip} onFocus={showTooltip} onBlur={hideTooltip} onClick={() => { hideTooltip(); onClick(); }}><Icon size={15} /></button>
      {tooltip && createPortal(<span className="slow-action-tooltip" role="tooltip" style={tooltip}>{label}</span>, document.body)}
    </>
  );
}

function levelTone(level: DatabaseSlowQuery["level"]): Tone {
  if (level === "高") return "orange";
  if (level === "中") return "blue";
  return "green";
}

function levelRank(level: DatabaseSlowQuery["level"]) {
  if (level === "高") return 3;
  if (level === "中") return 2;
  return 1;
}

function statusTone(status: DatabaseSlowQuery["status"]): Tone {
  if (status === "已处理") return "green";
  if (status === "分析中") return "blue";
  return "orange";
}

export { DatabaseSlowQueriesPage };
export type { SlowQuerySnapshot };
