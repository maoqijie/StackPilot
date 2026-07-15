import { CheckCircle2, Download, FileText, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAuditEvents } from "../api/auditApi";
import { auditPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { clearAuditSourceRoute, consumePendingAuditSource, readAuditSourceParam } from "../app/routing";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import type { AuditExportRecord } from "../features/audit/types";
import { auditRecord, downloadAuditCsv } from "../features/audit/model";
import { initialAuditExports } from "../mocks/demoData";
import type { AuditSource, Notify, PageKey } from "../types/app";
import { currentClock, formatBackendDateTime } from "../utils/time";
import { usePollingResource } from "../hooks/usePollingResource";

function AuditPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const auditPreset = auditPagePreset(page);
  const [sourceByPage, setSourceByPage] = useState<Partial<Record<string, AuditSource>>>(() => (
    page === "audit" ? { audit: readAuditSourceParam() ?? undefined } : {}
  ));
  const [exportRows, setExportRows] = useState(initialAuditExports);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [userByPage, setUserByPage] = useState<Record<string, string>>({});
  const [resultByPage, setResultByPage] = useState<Record<string, string>>({});
  const [formatFilter, setFormatFilter] = useState("全部");
  const [exportStatusFilter, setExportStatusFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedExport, setSelectedExport] = useState<AuditExportRecord | null>(null);
  const isExportMode = auditPreset.mode === "exports";
  const auditSource = sourceByPage[page];
  const audit = usePollingResource(fetchAuditEvents, null, !isExportMode, `audit:${auditSource ?? "all"}`);
  const auditEvents = audit.data?.events ?? [];
  const auditRecords = auditEvents
    .filter((event) => auditSource !== "database" || event.action.startsWith("database."))
    .map(auditRecord);
  const selected = auditRecords.find((row) => row.id === selectedId) ?? null;
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
      setSelectedId(null);
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
    const matchSearch = !query || `${row.user} ${row.action} ${row.object} ${row.result} ${row.traceId} ${row.source} ${row.outcome}`.toLowerCase().includes(query);
    return matchSearch && (userFilter === "全部" || row.user === userFilter) && (resultFilter === "全部" || row.result === resultFilter);
  });
  const filteredExports = exportRows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.name} ${row.format} ${row.range} ${row.status} ${row.creator} ${row.traceId}`.toLowerCase().includes(query);
    return matchSearch && (formatFilter === "全部" || row.format === formatFilter) && (exportStatusFilter === "全部" || row.status === exportStatusFilter);
  });
  const createExport = () => {
    const exportId = crypto.randomUUID();
    const next: AuditExportRecord = {
      id: `exp-${exportId}`,
      name: `审计导出 ${exportRows.length + 1}`,
      format: formatFilter === "全部" ? "CSV" : formatFilter as AuditExportRecord["format"],
      range: "当前筛选范围",
      status: "生成中",
      rows: filteredRows.length,
      size: "生成中",
      creator: "管理员",
      createdAt: currentClock(),
      expiresAt: "7 天后",
      traceId: `EXP-${exportId}`,
    };
    setExportRows((current) => [next, ...current]);
    setExportStatusFilter("全部");
    notify(`${next.name} 已创建`, "success");
  };
  const regenerateExport = (row: AuditExportRecord) => {
    setExportRows((current) => current.map((item) => item.id === row.id ? {
      ...item,
      status: "生成中",
      size: "生成中",
      createdAt: currentClock(),
      expiresAt: "7 天后",
    } : item));
    notify(`${row.name} 已加入重新生成队列`, row.status === "失败" ? "warning" : "info");
  };
  const handleExportPrimaryAction = (row: AuditExportRecord) => {
    if (row.status === "可下载") {
      notify(`${row.name} 已开始下载`, "success");
      return;
    }
    regenerateExport(row);
  };
  const exportAuditRecords = () => {
    downloadAuditCsv(filteredRows);
    notify(`已导出 ${filteredRows.length} 条真实审计日志`, "success");
  };
  const returnToGlobalAudit = () => {
    clearAuditSourceRoute();
    setSourceByPage((current) => ({ ...current, [page]: undefined }));
    setSearchByPage((current) => ({ ...current, [page]: "" }));
    setSelectedId(null);
    notify("已返回全部审计日志", "info");
  };
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={isExportMode ? auditPreset.subtitle : `${auditSource === "database" ? "数据库审计视图，只展示数据库相关操作。" : auditPreset.subtitle} · ${audit.backgroundError ? `后台刷新失败，保留上次数据：${audit.backgroundError}` : `后端采集于 ${formatBackendDateTime(audit.data?.collectedAt)}`}`}
      page={page}
      viewContext={isExportMode ? undefined : {
        eyebrow: auditSource === "database" ? "审计日志 / 数据库" : page === "audit-failed" ? "审计日志 / 失败操作" : "审计日志 / 全部",
        title: auditSource === "database" ? "数据库审计" : page === "audit-failed" ? "失败审计" : "只读审计",
        chips: [`记录 ${filteredRows.length}/${auditRecords.length}`, `结果 ${resultFilter}`, `用户 ${userFilter}`],
      }}
      actions={<><button className="ghost" type="button" disabled={!isExportMode && !filteredRows.length} onClick={() => isExportMode ? createExport() : exportAuditRecords()}><Download size={15} /> {isExportMode ? "新建导出" : "导出"}</button>{!isExportMode && auditSource === "database" && <button className="ghost" type="button" onClick={returnToGlobalAudit}>全部审计</button>}</>}
      filters={isExportMode
        ? <><ModuleSearch value={search} placeholder="搜索导出名称、范围或 trace id" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="格式" value={formatFilter} options={["全部", "CSV", "JSON", "ZIP"]} onChange={setFormatFilter} /><FieldSelect label="状态" value={exportStatusFilter} options={["全部", "可下载", "生成中", "失败"]} onChange={setExportStatusFilter} /></>
        : <><ModuleSearch value={search} placeholder="搜索关键字、对象或 trace id" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="用户" value={userFilter} options={users} onChange={(value) => setUserByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="结果" value={resultFilter} options={["全部", "成功", "失败"]} onChange={(value) => setResultByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={isExportMode
        ? <><MetricTile icon={Download} label="导出任务" value={`${exportRows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="可下载" value={`${exportRows.filter((row) => row.status === "可下载").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${exportRows.filter((row) => row.status === "失败").length}`} tone="red" /></>
        : <><MetricTile icon={FileText} label="日志" value={`${auditRecords.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="成功" value={`${auditRecords.filter((row) => row.result === "成功").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${auditRecords.filter((row) => row.result === "失败").length}`} tone="red" /></>}
      side={isExportMode && selectedExport ? (
        <DetailDrawer title="导出详情" subtitle={selectedExport.traceId} onClose={() => setSelectedExport(null)}>
          <div className="detail-kv">
            <p><span>名称</span><b>{selectedExport.name}</b></p>
            <p><span>格式</span><b>{selectedExport.format}</b></p>
            <p><span>范围</span><b>{selectedExport.range}</b></p>
            <p><span>记录数</span><b>{selectedExport.rows.toLocaleString("zh-CN")}</b></p>
            <p><span>状态</span><b>{selectedExport.status}</b></p>
            <p><span>过期</span><b>{selectedExport.expiresAt}</b></p>
          </div>
        </DetailDrawer>
      ) : !isExportMode && selected && (
        <DetailDrawer title="审计详情" subtitle={selected.traceId} onClose={() => setSelectedId(null)}>
          <div className="detail-kv">
            <p><span>时间</span><b>{selected.time}</b></p>
            <p><span>用户</span><b>{selected.user}</b></p>
            <p><span>来源</span><b>{selected.source}</b></p>
            <p><span>对象</span><b>{selected.object}</b></p>
            <p><span>结果</span><b>{selected.outcome}</b></p>
            <p><span>授权</span><b>{selected.authorization}</b></p>
            <p><span>请求 ID</span><b>{selected.requestId}</b></p>
            <p><span>摘要</span><b>{selected.summary}</b></p>
            <p><span>参数</span><code>{selected.parameters}</code></p>
          </div>
        </DetailDrawer>
      )}
    >
      {isExportMode ? (
        <>
          <div className="export-list">
            {filteredExports.map((row) => (
              <p key={row.id}>
                <Download size={14} />
                <span><b>{row.name}</b><em>{row.range} · {row.rows.toLocaleString("zh-CN")} 条 · {row.size}</em></span>
                <strong className={row.status === "可下载" ? "green-text" : row.status === "生成中" ? "blue-text" : "red-text"}>{row.status}</strong>
              </p>
            ))}
            {filteredExports.length === 0 && <div className="module-empty-card">没有匹配的导出记录</div>}
          </div>
          <DataTable
            columns={[
              { key: "name", label: "导出名称", width: "220px", render: (row) => <b>{row.name}</b> },
              { key: "format", label: "格式", render: (row) => <span className="pill blue">{row.format}</span> },
              { key: "range", label: "范围", render: (row) => row.range },
              { key: "status", label: "状态", render: (row) => <span className={`pill ${row.status === "可下载" ? "green" : row.status === "生成中" ? "blue" : "red"}`}>{row.status}</span> },
              { key: "rows", label: "记录数", render: (row) => row.rows.toLocaleString("zh-CN") },
              { key: "creator", label: "创建人", render: (row) => row.creator },
              { key: "created", label: "创建时间", render: (row) => row.createdAt },
              { key: "ops", label: "操作", width: "160px", render: (row) => <span className="table-actions export-actions"><button type="button" onClick={() => setSelectedExport(row)}>详情</button><button type="button" onClick={() => handleExportPrimaryAction(row)}>{row.status === "可下载" ? "下载" : "重试"}</button></span> },
            ]}
            rows={filteredExports}
            emptyText="没有匹配的导出记录"
            getRowKey={(row) => row.id}
            mobileCard={(row) => (
              <>
                <div className="module-card-head">
                  <span className="module-card-title"><Download size={15} /><b>{row.name}</b></span>
                  <span className={`pill ${row.status === "可下载" ? "green" : row.status === "生成中" ? "blue" : "red"}`}>{row.status}</span>
                </div>
                <code className="module-card-code">{row.traceId}</code>
                <div className="module-card-meta">
                  <span><b>格式</b><em>{row.format}</em></span>
                  <span><b>记录数</b><em>{row.rows.toLocaleString("zh-CN")}</em></span>
                  <span><b>大小</b><em>{row.size}</em></span>
                  <span><b>创建人</b><em>{row.creator}</em></span>
                </div>
                <div className="module-card-footer">
                  <div className="table-actions actions-2">
                    <button type="button" onClick={() => setSelectedExport(row)}>详情</button>
                    <button type="button" onClick={() => handleExportPrimaryAction(row)}>{row.status === "可下载" ? "下载" : "重试"}</button>
                  </div>
                </div>
              </>
            )}
          />
        </>
      ) : (
        <>{audit.loading && !audit.data && <span className="sr-only" role="status">正在读取真实审计日志</span>}
        {audit.error && !audit.data && <div className="overview-error-state"><Shield size={18} /><span>{audit.error}</span><button type="button" onClick={() => void audit.retry()}>重试</button></div>}
        <DataTable
          columns={[
            { key: "time", label: "时间", width: "130px", render: (row) => row.time },
            { key: "source", label: "来源", render: (row) => row.source },
            { key: "user", label: "用户", render: (row) => row.user },
            { key: "action", label: "动作", render: (row) => row.action },
            { key: "object", label: "对象", render: (row) => row.object },
            { key: "result", label: "结果", render: (row) => <span className={`pill ${row.result === "成功" ? "green" : "red"}`}>{row.result}</span> },
            { key: "trace", label: "trace id", render: (row) => row.traceId },
            { key: "ops", label: "操作", width: "78px", render: (row) => <span className="table-actions"><button type="button" onClick={() => setSelectedId(row.id)}>详情</button></span> },
          ]}
          rows={filteredRows}
          emptyText={audit.error ? "真实审计日志读取失败" : audit.loading ? "正在读取真实审计日志" : "没有匹配的审计日志"}
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
                <span><b>来源</b><em>{row.source}</em></span>
                <span><b>时间</b><em>{row.time}</em></span>
              </div>
              <div className="module-card-footer">
                <div className="table-actions actions-1"><button type="button" onClick={() => setSelectedId(row.id)}>详情</button></div>
              </div>
            </>
          )}
        /></>
      )}
    </ModulePageShell>
  );
}

export { AuditPage };
