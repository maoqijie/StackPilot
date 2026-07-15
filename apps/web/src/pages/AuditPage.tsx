import { CheckCircle2, Download, FileText, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAuditEvents, type AuditEvent } from "../api/auditApi";
import { auditPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { clearAuditSourceRoute, consumePendingAuditSource, readAuditSourceParam } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { AuditExportActions, AuditExportBody, AuditExportFilters, AuditExportMetrics } from "../features/audit/AuditExportView";
import { useAuditExports } from "../features/audit/useAuditExports";
import type { AuditRecord } from "../features/audit/types";
import { initialAuditRecords } from "../mocks/demoData";
import type { Permission } from "@stackpilot/contracts";
import type { AuditSource, Notify, PageKey } from "../types/app";
import { usePollingResource } from "../hooks/usePollingResource";

function AuditPage({ page, notify, permissions }: { page: PageKey; notify: Notify; permissions: Permission[] }) {
  const auditPreset = auditPagePreset(page);
  const [sourceByPage, setSourceByPage] = useState<Partial<Record<string, AuditSource>>>(() => (
    page === "audit" ? { audit: readAuditSourceParam() ?? undefined } : {}
  ));
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [userByPage, setUserByPage] = useState<Record<string, string>>({});
  const [resultByPage, setResultByPage] = useState<Record<string, string>>({});
  const [formatFilter, setFormatFilter] = useState("全部");
  const [exportStatusFilter, setExportStatusFilter] = useState("全部");
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  const isExportMode = auditPreset.mode === "exports";
  const canExport = permissions.includes("audit:export");
  const auditExports = useAuditExports(isExportMode && canExport);
  const auditSource = sourceByPage[page];
  const databaseAudit = usePollingResource(fetchAuditEvents, null, auditSource === "database");
  const auditRecords = auditSource === "database"
    ? (databaseAudit.data ?? []).filter((event) => event.action.startsWith("database.")).map(databaseAuditRecord)
    : initialAuditRecords;
  const users = ["全部", ...Array.from(new Set(auditRecords.map((row) => row.user)))];
  const search = searchByPage[page] ?? auditPreset.search;
  const userFilter = userByPage[page] ?? auditPreset.user;
  const resultFilter = resultByPage[page] ?? auditPreset.result;

  useEffect(() => {
    const applyAuditSource = () => {
      const source = consumePendingAuditSource() ?? readAuditSourceParam();
      if (!source) {
        setSourceByPage((current) => (current[page] ? { ...current, [page]: undefined } : current));
        return;
      }
      setSourceByPage((current) => ({ ...current, [page]: source }));
      setSearchByPage((current) => ({ ...current, [page]: "" }));
      setUserByPage((current) => ({ ...current, [page]: "全部" }));
      setResultByPage((current) => ({ ...current, [page]: "全部" }));
      setSelected(null);
      notify("已切换到数据库审计上下文", "info");
    };
    applyAuditSource();
    window.addEventListener("stackpilot:audit-source", applyAuditSource);
    window.addEventListener("hashchange", applyAuditSource);
    window.addEventListener("popstate", applyAuditSource);
    return () => {
      window.removeEventListener("stackpilot:audit-source", applyAuditSource);
      window.removeEventListener("hashchange", applyAuditSource);
      window.removeEventListener("popstate", applyAuditSource);
    };
  }, [notify, page]);

  const filteredRows = auditRecords.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.user} ${row.action} ${row.object} ${row.result} ${row.traceId} ${row.ip}`.toLowerCase().includes(query);
    return matchSearch && (userFilter === "全部" || row.user === userFilter) && (resultFilter === "全部" || row.result === resultFilter);
  });
  const returnToGlobalAudit = () => {
    clearAuditSourceRoute();
    setSourceByPage((current) => ({ ...current, [page]: undefined }));
    setSearchByPage((current) => ({ ...current, [page]: "" }));
    setSelected(null);
    notify("已返回全部审计日志", "info");
  };
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={auditSource === "database" ? "数据库审计视图，只展示数据库实例、备份、连接池和权限相关操作。" : auditPreset.subtitle}
      page={page}
      viewContext={isExportMode ? undefined : {
        eyebrow: auditSource === "database" ? "审计日志 / 数据库" : "审计日志 / 全部",
        title: auditSource === "database" ? "数据库审计" : "只读审计",
        chips: [`记录 ${filteredRows.length}/${auditRecords.length}`, `结果 ${resultFilter}`, `用户 ${userFilter}`],
      }}
      actions={isExportMode ? canExport ? <AuditExportActions resource={auditExports} notify={notify} /> : undefined : <><button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredRows.length} 条审计日志`, "info")}><Download size={15} />导出</button>{auditSource === "database" && <button className="ghost" type="button" onClick={returnToGlobalAudit}>全部审计</button>}</>}
      filters={isExportMode
        ? canExport ? <AuditExportFilters search={search} format={formatFilter} status={exportStatusFilter} onSearch={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} onFormat={setFormatFilter} onStatus={setExportStatusFilter} /> : undefined
        : <><ModuleSearch value={search} placeholder="搜索关键字、对象或 trace id" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="用户" value={userFilter} options={users} onChange={(value) => setUserByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="结果" value={resultFilter} options={["全部", "成功", "失败"]} onChange={(value) => setResultByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={isExportMode
        ? canExport ? <AuditExportMetrics resource={auditExports} /> : undefined
        : <><MetricTile icon={FileText} label="日志" value={`${auditRecords.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="成功" value={`${auditRecords.filter((row) => row.result === "成功").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${auditRecords.filter((row) => row.result === "失败").length}`} tone="red" /></>}
      side={!isExportMode && selected && (
        <DetailDrawer className="audit-detail-drawer" modal title="审计详情" subtitle={selected.traceId} closeLabel="关闭审计详情" scrimCloseLabel="点击遮罩关闭审计详情" onClose={() => setSelected(null)}>
          <div className="detail-kv">
            <p><span>时间</span><b>{selected.time}</b></p>
            <p><span>用户</span><b>{selected.user}</b></p>
            <p><span>IP</span><b>{selected.ip}</b></p>
            <p><span>对象</span><b>{selected.object}</b></p>
            <p><span>摘要</span><b>{selected.summary}</b></p>
          </div>
        </DetailDrawer>
      )}
    >
      {isExportMode ? (
        canExport
          ? <AuditExportBody resource={auditExports} search={search} format={formatFilter} status={exportStatusFilter} notify={notify} />
          : <div className="overview-error-state" role="alert"><Shield size={18} /><span>当前账号没有审计导出权限</span></div>
      ) : (
        <>{auditSource === "database" && databaseAudit.loading && !databaseAudit.data && <span className="sr-only" role="status">正在读取数据库审计</span>}
        {auditSource === "database" && databaseAudit.error && !databaseAudit.data && <div className="overview-error-state"><Shield size={18} /><span>{databaseAudit.error}</span><button type="button" onClick={() => void databaseAudit.retry()}>重试</button></div>}
        <DataTable
          columns={[
            { key: "time", label: "时间", width: "130px", render: (row) => row.time },
            { key: "ip", label: "IP", render: (row) => row.ip },
            { key: "user", label: "用户", render: (row) => row.user },
            { key: "action", label: "动作", render: (row) => row.action },
            { key: "object", label: "对象", render: (row) => row.object },
            { key: "result", label: "结果", render: (row) => <span className={`pill ${row.result === "成功" ? "green" : "red"}`}>{row.result}</span> },
            { key: "trace", label: "trace id", render: (row) => row.traceId },
            { key: "ops", label: "操作", width: "78px", render: (row) => <span className="table-actions"><button type="button" onClick={() => setSelected(row)}>详情</button></span> },
          ]}
          rows={filteredRows}
          emptyText="没有匹配的审计日志"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <>
              <div className="module-card-head">
                <span className="module-card-title"><FileText size={15} /><b>{row.action}</b></span>
                <span className={`pill ${row.result === "成功" ? "green" : "red"}`}>{row.result}</span>
              </div>
              <code className="module-card-code">{row.traceId}</code>
              <div className="module-card-meta">
                <span><b>用户</b><em>{row.user}</em></span>
                <span><b>对象</b><em>{row.object}</em></span>
                <span><b>IP</b><em>{row.ip}</em></span>
                <span><b>时间</b><em>{row.time}</em></span>
              </div>
              <div className="module-card-footer">
                <div className="table-actions actions-1"><button type="button" onClick={() => setSelected(row)}>详情</button></div>
              </div>
            </>
          )}
        /></>
      )}
    </ModulePageShell>
  );
}

function databaseAuditRecord(event: AuditEvent): AuditRecord {
  const result = ["failed", "failure", "denied", "error"].includes(event.outcome.toLowerCase()) ? "失败" : "成功";
  return {
    id: event.eventId,
    time: new Date(event.occurredAt).toLocaleString("zh-CN", { hour12: false }),
    ip: event.source,
    user: event.actorId ?? event.actorType,
    action: event.action,
    object: event.targetId ?? event.targetType ?? "数据库",
    result,
    traceId: event.traceId,
    summary: `${event.action} · ${event.outcome}`,
  };
}

export { AuditPage };
