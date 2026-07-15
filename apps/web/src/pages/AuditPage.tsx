import { CheckCircle2, Clock3, Download, FileText, Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchAuditEvents } from "../api/auditApi";
import { auditPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { clearAuditSourceRoute, consumePendingAuditSource, readAuditSourceParam } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { auditRecord, downloadAuditCsv, formatAuditParameters } from "../features/audit/model";
import { usePollingResource } from "../hooks/usePollingResource";
import type { AuditSource, Notify, PageKey } from "../types/app";
import { formatBackendDateTime } from "../utils/time";

function AuditPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const preset = auditPagePreset(page);
  const [auditSource, setAuditSource] = useState<AuditSource | undefined>(() => readAuditSourceParam() ?? undefined);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [userByPage, setUserByPage] = useState<Record<string, string>>({});
  const [resultByPage, setResultByPage] = useState<Record<string, string>>({});
  const [selectedByPage, setSelectedByPage] = useState<Record<string, string | null>>({});
  const [exportOpen, setExportOpen] = useState(false);
  const backendResult = page === "audit-failed" ? "failed" : "all";
  const actionPrefix = auditSource === "database" ? "database." : undefined;
  const loadAudit = useCallback((signal: AbortSignal) => fetchAuditEvents({ signal, limit: 200, result: backendResult, actionPrefix }), [actionPrefix, backendResult]);
  const audit = usePollingResource(loadAudit, null, true, `audit:${backendResult}:${actionPrefix ?? "all"}`);
  const records = (audit.data?.events ?? []).map(auditRecord);
  const selectedId = selectedByPage[page] ?? null;
  const selected = records.find((row) => row.id === selectedId) ?? null;
  const search = searchByPage[page] ?? preset.search;
  const userFilter = userByPage[page] ?? preset.user;
  const resultFilter = resultByPage[page] ?? preset.result;
  const users = ["全部", ...new Set(records.map((row) => row.user))];
  const setSelectedId = useCallback((id: string | null) => setSelectedByPage((current) => ({ ...current, [page]: id })), [page]);

  useEffect(() => {
    const applyAuditSource = () => {
      const source = consumePendingAuditSource() ?? readAuditSourceParam() ?? undefined;
      setAuditSource(source);
      setSearchByPage((current) => ({ ...current, [page]: "" }));
      setUserByPage((current) => ({ ...current, [page]: "全部" }));
      setResultByPage((current) => ({ ...current, [page]: preset.result }));
      setSelectedId(null);
      if (source === "database") notify("已切换到数据库审计上下文", "info");
    };
    window.addEventListener("stackpilot:audit-source", applyAuditSource);
    window.addEventListener("hashchange", applyAuditSource);
    window.addEventListener("popstate", applyAuditSource);
    return () => {
      window.removeEventListener("stackpilot:audit-source", applyAuditSource);
      window.removeEventListener("hashchange", applyAuditSource);
      window.removeEventListener("popstate", applyAuditSource);
    };
  }, [notify, page, preset.result, setSelectedId]);

  useEffect(() => {
    if (!selectedId || !audit.data || selected) return;
    let active = true;
    queueMicrotask(() => { if (active) setSelectedId(null); });
    return () => { active = false; };
  }, [audit.data, selected, selectedId, setSelectedId]);

  const rows = records.filter((row) => {
    const query = search.trim().toLowerCase();
    const searchable = `${row.user} ${row.actorType} ${row.action} ${row.object} ${row.targetType} ${row.result} ${row.outcome} ${row.traceId} ${row.requestId} ${row.source}`.toLowerCase();
    return (!query || searchable.includes(query)) && (userFilter === "全部" || row.user === userFilter) && (resultFilter === "全部" || row.result === resultFilter);
  });
  const returnToGlobalAudit = () => {
    clearAuditSourceRoute();
    setAuditSource(undefined);
    setSearchByPage((current) => ({ ...current, [page]: "" }));
    setSelectedId(null);
    notify("已返回全部审计日志", "info");
  };
  const exportCsv = () => {
    downloadAuditCsv(rows);
    setExportOpen(false);
    notify(`已导出 ${rows.length} 条真实审计日志`, "success");
  };
  const pageTitle = auditSource === "database" ? "数据库审计" : page === "audit-failed" ? "失败审计" : page === "audit-export" ? "导出真实审计" : "只读审计";
  const freshness = audit.backgroundError ? `后台刷新失败，保留上次数据：${audit.backgroundError}` : "数据来自 Controller 追加式审计表，每 10 秒自动查询";

  return <><ModulePageShell
    title={resolvePageMeta(page).title}
    subtitle={auditSource === "database" ? "数据库审计视图，只展示数据库相关操作。" : preset.subtitle}
    page={page}
    viewContext={{ eyebrow: auditSource === "database" ? "审计日志 / 数据库" : page === "audit-failed" ? "审计日志 / 失败操作" : page === "audit-export" ? "审计日志 / 导出" : "审计日志 / 全部", title: pageTitle, chips: [`记录 ${rows.length}/${records.length}`, `结果 ${resultFilter}`, `用户 ${userFilter}`] }}
    actions={<><button className="ghost" type="button" disabled={!rows.length} onClick={() => setExportOpen(true)}><Download size={15} /> 导出 CSV</button>{auditSource === "database" && <button className="ghost" type="button" onClick={returnToGlobalAudit}>全部审计</button>}</>}
    filters={<><ModuleSearch value={search} placeholder="搜索关键字、对象、request id 或 trace id" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="用户" value={userFilter} options={users} onChange={(value) => setUserByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="结果" value={resultFilter} options={page === "audit-failed" ? ["失败"] : ["全部", "成功", "失败", "已记录"]} onChange={(value) => setResultByPage((current) => ({ ...current, [page]: value }))} /></>}
    metrics={<><MetricTile icon={FileText} label="日志" value={`${records.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="成功" value={`${records.filter((row) => row.result === "成功").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${records.filter((row) => row.result === "失败").length}`} tone="red" /></>}
    side={selected && <DetailDrawer className="audit-detail-drawer" modal title="审计详情" subtitle={selected.traceId} closeLabel="关闭审计详情" scrimCloseLabel="点击遮罩关闭审计详情" onClose={() => setSelectedId(null)}><div className="detail-kv">
      <p><span>时间</span><b>{selected.time}</b></p><p><span>操作者</span><b>{selected.user}（{selected.actorType}）</b></p>
      <p><span>来源</span><b>{selected.source}</b></p><p><span>动作</span><b>{selected.action}</b></p>
      <p><span>对象</span><b>{selected.object}（{selected.targetType}）</b></p><p><span>原始结果</span><b>{selected.outcome}</b></p>
      <p><span>授权</span><b>{selected.authorization}</b></p><p><span>Request ID</span><b>{selected.requestId}</b></p>
      <p><span>参数</span><code>{formatAuditParameters(selected.parameters)}</code></p>
    </div></DetailDrawer>}
    sideModal={Boolean(selected)}
  >
    {audit.loading && !audit.data && <span className="sr-only" role="status">正在读取真实审计日志</span>}
    {audit.error && !audit.data && <div className="overview-error-state"><Shield size={18} /><span>{audit.error}</span><button type="button" onClick={() => void audit.retry()}>重试</button></div>}
    <div className="slow-freshness"><Clock3 size={20} /><div><strong>后端查询时间 {formatBackendDateTime(audit.data?.collectedAt, "等待查询")}</strong><span>{freshness}</span></div></div>
    <DataTable
      columns={[
        { key: "time", label: "时间", width: "154px", sortValue: (row) => row.time, render: (row) => <span className="audit-cell-value" title={row.time}>{row.time}</span> },
        { key: "source", label: "来源", width: "130px", render: (row) => <span className="audit-cell-value" title={row.source}>{row.source}</span> },
        { key: "user", label: "用户", width: "110px", render: (row) => <span className="audit-cell-value" title={row.user}>{row.user}</span> },
        { key: "action", label: "动作", width: "170px", render: (row) => <span className="audit-cell-value" title={row.action}>{row.action}</span> },
        { key: "object", label: "对象", width: "180px", render: (row) => <span className="audit-cell-value" title={row.object}>{row.object}</span> },
        { key: "result", label: "结果", width: "92px", render: (row) => <span className={`pill ${row.result === "失败" ? "red" : row.result === "成功" ? "green" : "blue"}`}>{row.result}</span> },
        { key: "trace", label: "trace id", width: "150px", render: (row) => <code className="audit-cell-value" title={row.traceId}>{row.traceId}</code> },
        { key: "ops", label: "操作", width: "78px", render: (row) => <span className="table-actions"><button type="button" onClick={() => setSelectedId(row.id)}>详情</button></span> },
      ]}
      rows={rows}
      emptyText={audit.loading && !audit.data ? "正在读取真实审计日志" : audit.error && !audit.data ? "真实审计日志读取失败" : "没有匹配的真实审计日志，系统将继续自动查询"}
      getRowKey={(row) => row.id}
      pageSize={50}
      mobileCard={(row) => <><div className="module-card-head"><span className="module-card-title"><FileText size={15} /><b title={row.action}>{row.action}</b></span><span className={`pill ${row.result === "失败" ? "red" : row.result === "成功" ? "green" : "blue"}`}>{row.result}</span></div><code className="module-card-code">{row.traceId}</code><div className="module-card-meta"><span><b>用户</b><em>{row.user}</em></span><span><b>对象</b><em>{row.object}</em></span><span><b>来源</b><em>{row.source}</em></span><span><b>时间</b><em>{row.time}</em></span></div><div className="module-card-footer"><div className="table-actions actions-1"><button type="button" onClick={() => setSelectedId(row.id)}>详情</button></div></div></>}
    />
  </ModulePageShell>{exportOpen && <ConfirmDialog className="audit-export-confirm" tone="info" title="导出真实审计" message="将按当前真实查询结果和筛选条件生成 CSV 文件。" confirmLabel="下载 CSV" detail={`CSV · 当前筛选范围 · ${rows.length.toLocaleString("zh-CN")} 条记录`} onClose={() => setExportOpen(false)} onConfirm={exportCsv}><div className="audit-export-confirm-summary"><p><span>格式</span><b>CSV</b></p><p><span>范围</span><b>当前筛选范围</b></p><p><span>记录数</span><b>{rows.length.toLocaleString("zh-CN")}</b></p></div></ConfirmDialog>}</>;
}

export { AuditPage };
