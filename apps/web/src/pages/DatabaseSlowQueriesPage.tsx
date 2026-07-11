import { Activity, Clock3, Database, Download, Plus, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { setDatabaseFocusRoute } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch, PanelCard } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { Sparkline, StatusLight } from "../components/ui/StatusVisuals";
import type { DatabaseInstance, DatabaseSlowQuery } from "../features/databases/types";
import { databaseHealthTone, readSlowRemediationIds, writeSlowRemediationIds } from "../features/databases/model";
import { dbRows, initialDatabaseSlowQueries } from "../mocks/demoData";
import type { Notify, PageKey, SetPage, Tone } from "../types/app";
import { secondsFromDuration } from "../utils/time";

function DatabaseSlowQueriesPage({ page, setPage, notify }: { page: PageKey; setPage: SetPage; notify: Notify }) {
  const [queries, setQueries] = useState(initialDatabaseSlowQueries);
  const [search, setSearch] = useState("");
  const [databaseFilter, setDatabaseFilter] = useState("全部");
  const [levelFilter, setLevelFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [timeRange, setTimeRange] = useState("近 24 小时");
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [drawerAutoFocus, setDrawerAutoFocus] = useState(false);
  const [instanceRemediationIds, setInstanceRemediationIds] = useState(readSlowRemediationIds);
  const delayedInstances = dbRows.filter((instance) => instance.connectionHealth.startsWith("延迟") || instance.slowQueries > 0);
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
  const selectedQuery = drawerId ? filteredQueries.find((query) => query.id === drawerId) ?? null : null;
  const primaryQuery = selectedQuery ?? filteredQueries[0] ?? null;
  const pendingCount = queries.filter((query) => query.status !== "已处理").length;
  const highLatencyCount = delayedInstances.filter((instance) => instance.connectionHealth.startsWith("延迟") || instance.slowQueries >= 10).length;
  const highCount = queries.filter((query) => query.level === "高" && query.status !== "已处理").length + highLatencyCount;
  const affectedDatabases = new Set([
    ...queries.filter((query) => query.status !== "已处理").map((query) => query.database),
    ...delayedInstances.map((instance) => instance.name),
  ]).size;
  const highestP95 = queries.reduce((max, query) => (
    secondsFromDuration(query.p95Time) > secondsFromDuration(max.p95Time) ? query : max
  ), queries[0]);
  const updateQuery = (id: string, patch: Partial<DatabaseSlowQuery>) => {
    setQueries((current) => current.map((query) => query.id === id ? { ...query, ...patch } : query));
  };
  const openQuery = (query: DatabaseSlowQuery) => {
    setDrawerAutoFocus(true);
    setDrawerId(query.id);
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
  const levelTone = (level: DatabaseSlowQuery["level"]): Tone => {
    if (level === "高") return "red";
    if (level === "中") return "orange";
    return "blue";
  };
  const statusTone = (status: DatabaseSlowQuery["status"]): Tone => {
    if (status === "已处理") return "green";
    if (status === "分析中") return "blue";
    return "orange";
  };
  const handlePrimaryIndexAdvice = () => {
    if (!primaryQuery) {
      notify("没有可生成建议的慢查询", "warning");
      return;
    }
    createIndexAdvice(primaryQuery);
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
        detail: `治理连接延迟 ${instance.connectionHealth}，慢查询 ${instance.slowQueries} 条，主机 ${instance.host}`,
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
      tone: levelTone(query.level),
      onOpen: () => openQuery(query),
    })),
  ];

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={`聚焦慢查询指纹、耗时分布和治理动作，不混入数据库创建流程。采样窗口：${timeRange}`}
      page={page}
      viewContext={{
        eyebrow: "数据库 / 慢查询",
        title: "慢查询中心",
        chips: [`窗口 ${timeRange}`, `待处理 ${pendingCount + delayedInstances.length}`, `延迟实例 ${delayedInstances.filter((instance) => instance.connectionHealth.startsWith("延迟")).length}`],
      }}
      actions={<><button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredQueries.length} 条慢查询`, "info")}><Download size={15} /> 导出慢查询</button><button className="ghost" type="button" onClick={() => { setTimeRange(timeRange === "近 24 小时" ? "近 7 天" : "近 24 小时"); notify("慢查询采样窗口已切换", "info"); }}><Clock3 size={15} /> 切换窗口</button><button className="primary" type="button" disabled={!primaryQuery} onClick={handlePrimaryIndexAdvice}><Plus size={15} /> 生成索引建议</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索 SQL、指纹、数据库或负责人" onChange={setSearch} /><FieldSelect label="数据库" value={databaseFilter} options={databaseOptions} onChange={setDatabaseFilter} /><FieldSelect label="等级" value={levelFilter} options={["全部", "高", "中", "低"]} onChange={setLevelFilter} /><FieldSelect label="状态" value={statusFilter} options={["全部", "待处理", "分析中", "已处理"]} onChange={setStatusFilter} /></>}
      metrics={<><MetricTile icon={Activity} label="慢查询指纹" value={`${queries.length}`} tone="orange" /><MetricTile icon={Clock3} label="P95 最高" value={highestP95?.p95Time ?? "-"} tone="red" /><MetricTile icon={Database} label="受影响实例" value={`${affectedDatabases}`} tone="blue" /><MetricTile icon={Shield} label="高风险待处理" value={`${highCount}`} tone={highCount ? "red" : "green"} /></>}
      side={selectedQuery && (
        <DetailDrawer title="慢查询详情" subtitle={selectedQuery.fingerprint} onClose={() => { setDrawerAutoFocus(false); setDrawerId(null); }} autoFocus={drawerAutoFocus} actions={<><button className="ghost" type="button" onClick={() => void copyFingerprint(selectedQuery.fingerprint)}>复制指纹</button><button className="primary" type="button" onClick={() => runExplain(selectedQuery.id)}>生成 Explain</button></>}>
          <div className="slow-query-drawer">
            <p><span>数据库</span><b>{selectedQuery.database}</b></p>
            <p><span>等级 / 状态</span><b>{selectedQuery.level} · {selectedQuery.status}</b></p>
            <p><span>平均 / P95</span><b>{selectedQuery.avgTime} / {selectedQuery.p95Time}</b></p>
            <p><span>调用次数</span><b>{selectedQuery.calls} 次 · 扫描 {selectedQuery.rows} 行</b></p>
            <p><span>会话</span><b>{selectedQuery.sessionId}</b></p>
            <code>{selectedQuery.sql}</code>
            <p><span>优化建议</span><b>{selectedQuery.suggestion}</b></p>
            <code>{selectedQuery.explain ?? "尚未生成 Explain，点击下方操作开始分析。"}</code>
            <div className="slow-drawer-actions">
              <button type="button" onClick={() => createIndexAdvice(selectedQuery)}>索引建议</button>
              <button type="button" onClick={() => killSession(selectedQuery)}>终止会话</button>
              <button type="button" onClick={() => markResolved(selectedQuery)}>标记处理</button>
            </div>
          </div>
        </DetailDrawer>
      )}
    >
      <div className="database-slow-content">
        <DataTable
          columns={[
            { key: "fingerprint", label: "SQL 指纹", width: "220px", render: (query) => <button className="module-row-link" type="button" aria-label={`查看慢查询 ${query.fingerprint}`} onClick={() => openQuery(query)}><StatusLight tone={levelTone(query.level)} /><b>{query.fingerprint}</b></button> },
            { key: "database", label: "数据库", width: "150px", render: (query) => <span className="pill blue">{query.database}</span> },
            { key: "sql", label: "SQL 摘要", render: (query) => <code>{query.sql}</code> },
            { key: "avg", label: "平均", width: "76px", render: (query) => query.avgTime },
            { key: "p95", label: "P95", width: "76px", render: (query) => <b className={query.level === "高" ? "red-text" : ""}>{query.p95Time}</b> },
            { key: "calls", label: "调用", width: "72px", render: (query) => query.calls },
            { key: "level", label: "等级", width: "70px", render: (query) => <span className={`pill ${levelTone(query.level)}`}>{query.level}</span> },
            { key: "status", label: "状态", width: "86px", render: (query) => <span className={`pill ${statusTone(query.status)}`}>{query.status}</span> },
            { key: "ops", label: "操作", width: "250px", render: (query) => <span className="table-actions"><button type="button" aria-label={`生成 ${query.fingerprint} Explain`} onClick={() => runExplain(query.id)}>Explain</button><button type="button" aria-label={`创建 ${query.fingerprint} 索引建议`} onClick={() => createIndexAdvice(query)}>索引</button><button type="button" aria-label={`标记 ${query.fingerprint} 已处理`} onClick={() => markResolved(query)}>处理</button><button type="button" aria-label={`打开 ${query.fingerprint} 详情`} onClick={() => openQuery(query)}>详情</button></span> },
          ]}
          rows={filteredQueries}
          emptyText="没有匹配的慢查询指纹"
          getRowKey={(query) => query.id}
          mobileCard={(query) => (
            <>
              <div className="module-card-head">
                <button className="module-row-link" type="button" aria-label={`查看慢查询 ${query.fingerprint}`} onClick={() => openQuery(query)}><StatusLight tone={levelTone(query.level)} /><b>{query.fingerprint}</b></button>
                <span className={`pill ${levelTone(query.level)}`}>{query.level}</span>
              </div>
              <code className="module-card-code">{query.sql}</code>
              <div className="module-card-meta">
                <span><b>数据库</b><em>{query.database}</em></span>
                <span><b>平均</b><em>{query.avgTime}</em></span>
                <span><b>P95</b><em className={query.level === "高" ? "red-text" : ""}>{query.p95Time}</em></span>
                <span><b>调用</b><em>{query.calls}</em></span>
              </div>
              <div className="module-card-footer">
                <span className={`pill ${statusTone(query.status)}`}>{query.status}</span>
                <div className="table-actions actions-4"><button type="button" aria-label={`生成 ${query.fingerprint} Explain`} onClick={() => runExplain(query.id)}>Explain</button><button type="button" aria-label={`创建 ${query.fingerprint} 索引建议`} onClick={() => createIndexAdvice(query)}>索引</button><button type="button" aria-label={`标记 ${query.fingerprint} 已处理`} onClick={() => markResolved(query)}>处理</button><button type="button" aria-label={`打开 ${query.fingerprint} 详情`} onClick={() => openQuery(query)}>详情</button></div>
              </div>
            </>
          )}
        />
        <section className="slow-query-lower">
          <PanelCard title="连接延迟实例" action="查看实例页" onAction={openDelayedInstancesPage}>
            <div className="slow-instance-list">
              {filteredDelayedInstances.map((instance) => (
                <article key={instance.id}>
                  <span><StatusLight tone={instance.connectionHealth.startsWith("延迟") ? "orange" : "blue"} /><b>{instance.name}</b></span>
                  <em>{instance.connectionHealth} · 慢查询 {instance.slowQueries} · {instance.host}</em>
                  <button type="button" onClick={() => queueInstanceRemediation(instance)}>{instanceRemediationIds.includes(instance.id) ? "已入队" : "治理"}</button>
                </article>
              ))}
              {filteredDelayedInstances.length === 0 && <p className="module-card-empty">没有匹配的连接延迟实例</p>}
            </div>
          </PanelCard>
          <PanelCard title="治理队列" action="刷新采样" onAction={() => notify("慢查询采样已刷新")}>
            <div className="slow-remediation-list">
              {remediationItems.map((item) => (
                <article key={item.id}>
                  <span><StatusLight tone={item.tone} /><b>{item.title}</b></span>
                  <em>{item.detail}</em>
                  <button type="button" onClick={item.onOpen}>查看</button>
                </article>
              ))}
              {remediationItems.length === 0 && <p className="module-card-empty">当前没有待处理治理项</p>}
            </div>
          </PanelCard>
          <PanelCard title="耗时趋势">
            <div className="slow-trend-panel">
              {[
                ["平均耗时", [42, 46, 51, 58, 54, 62, 67], "orange"],
                ["P95 耗时", [50, 54, 61, 70, 74, 78, 82], "red"],
                ["调用次数", [22, 28, 24, 33, 38, 42, 36], "blue"],
              ].map(([label, points, tone]) => (
                <p key={label as string}><span>{label as string}</span><Sparkline values={points as number[]} tone={tone as Tone} /></p>
              ))}
            </div>
          </PanelCard>
        </section>
      </div>
    </ModulePageShell>
  );
}

export { DatabaseSlowQueriesPage };
