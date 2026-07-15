import type { AuditExportRecord } from "@stackpilot/contracts";
import { CheckCircle2, Download, Shield } from "lucide-react";
import { useState } from "react";
import { createAuditExport, downloadAuditExport, retryAuditExport } from "../../api/auditApi";
import { reauthenticate } from "../../api/identityApi";
import { MetricTile, ModuleSearch } from "../../components/ui/Cards";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DataTable } from "../../components/ui/DataTable";
import { DetailDrawer } from "../../components/ui/DetailDrawer";
import { FieldSelect } from "../../components/ui/FormControls";
import type { Notify } from "../../types/app";
import { formatBackendDateTime } from "../../utils/time";
import type { AuditExportsResource } from "./useAuditExports";

type PendingAction = { kind: "create"; name: string; format: "csv" | "json" } | { kind: "download" | "retry"; record: AuditExportRecord };

export function AuditExportActions({ resource, notify }: { resource: AuditExportsResource; notify: Notify }) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  return <><button className="ghost" type="button" onClick={() => setPending({ kind: "create", name: `审计快照 ${new Date().toLocaleDateString("zh-CN")}`, format: "csv" })}><Download size={15} />新建导出</button>{pending && <AuditExportConfirm pending={pending} resource={resource} notify={notify} onClose={() => setPending(null)} />}</>;
}

export function AuditExportFilters({ search, format, status, onSearch, onFormat, onStatus }: { search: string; format: string; status: string; onSearch: (value: string) => void; onFormat: (value: string) => void; onStatus: (value: string) => void }) {
  return <><ModuleSearch value={search} placeholder="搜索导出名称、创建人或 trace id" onChange={onSearch} /><FieldSelect label="格式" value={format} options={["全部", "CSV", "JSON"]} onChange={onFormat} /><FieldSelect label="状态" value={status} options={["全部", "可下载", "失败"]} onChange={onStatus} /></>;
}

export function AuditExportMetrics({ resource }: { resource: AuditExportsResource }) {
  const rows = resource.data?.exports;
  const unavailable = resource.loading && !rows ? "等待采集" : resource.error && !rows ? "暂不可用" : null;
  return <><MetricTile icon={Download} label="导出任务" value={unavailable ?? `${rows?.length ?? 0}`} tone="blue" /><MetricTile icon={CheckCircle2} label="可下载" value={unavailable ?? `${rows?.filter((row) => row.status === "ready").length ?? 0}`} tone="green" /><MetricTile icon={Shield} label="失败" value={unavailable ?? `${rows?.filter((row) => row.status === "failed").length ?? 0}`} tone="red" /></>;
}

export function AuditExportBody({ resource, search, format, status, notify }: { resource: AuditExportsResource; search: string; format: string; status: string; notify: Notify }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const rows = resource.data?.exports ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const filtered = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const visibleStatus = row.status === "ready" ? "可下载" : "失败";
    return (!query || `${row.name} ${row.createdBy} ${row.traceId}`.toLowerCase().includes(query))
      && (format === "全部" || row.format === format.toLowerCase())
      && (status === "全部" || visibleStatus === status);
  });
  if (resource.loading && !resource.data) return <span className="sr-only" role="status">正在读取审计导出</span>;
  if (resource.error && !resource.data) return <div className="overview-error-state"><Shield size={18} /><span>{resource.error}</span><button type="button" onClick={() => void resource.retry()}>重试</button></div>;
  return <>
    <div className="audit-export-freshness"><CheckCircle2 size={15} /><span>后端采集 {formatBackendDateTime(resource.data?.collectedAt)}</span></div>
    {resource.backgroundError && <span className="sr-only" role="status">后台刷新失败，正在显示上次成功数据</span>}
    <DataTable columns={[
      { key: "name", label: "导出名称", width: "220px", render: (row) => <b>{row.name}</b> },
      { key: "format", label: "格式", render: (row) => <span className="pill blue">{row.format.toUpperCase()}</span> },
      { key: "status", label: "状态", render: (row) => <span className={`pill ${row.status === "ready" ? "green" : "red"}`}>{row.status === "ready" ? "可下载" : "失败"}</span> },
      { key: "rows", label: "记录数", render: (row) => row.rowCount.toLocaleString("zh-CN") },
      { key: "size", label: "大小", render: (row) => formatBytes(row.sizeBytes) },
      { key: "creator", label: "创建人", render: (row) => row.createdBy },
      { key: "created", label: "创建时间", render: (row) => formatBackendDateTime(row.createdAt) },
      { key: "ops", label: "操作", width: "150px", render: (row) => <span className="table-actions export-actions"><button type="button" onClick={() => setSelectedId(row.id)}>详情</button><button type="button" onClick={() => setPending({ kind: row.status === "ready" ? "download" : "retry", record: row })}>{row.status === "ready" ? "下载" : "重试"}</button></span> },
    ]} rows={filtered} emptyText="没有真实审计导出记录" getRowKey={(row) => row.id} mobileCard={(row) => <><div className="module-card-head"><span className="module-card-title"><Download size={15} /><b>{row.name}</b></span><span className={`pill ${row.status === "ready" ? "green" : "red"}`}>{row.status === "ready" ? "可下载" : "失败"}</span></div><code className="module-card-code">{row.traceId}</code><div className="module-card-meta"><span><b>格式</b><em>{row.format.toUpperCase()}</em></span><span><b>记录数</b><em>{row.rowCount.toLocaleString("zh-CN")}</em></span><span><b>大小</b><em>{formatBytes(row.sizeBytes)}</em></span><span><b>创建人</b><em>{row.createdBy}</em></span></div><div className="module-card-footer"><div className="table-actions actions-2"><button type="button" onClick={() => setSelectedId(row.id)}>详情</button><button type="button" onClick={() => setPending({ kind: row.status === "ready" ? "download" : "retry", record: row })}>{row.status === "ready" ? "下载" : "重试"}</button></div></div></>} />
    {selected && <DetailDrawer className="audit-detail-drawer" modal title="导出详情" subtitle={selected.traceId} closeLabel="关闭导出详情" scrimCloseLabel="点击遮罩关闭导出详情" onClose={() => setSelectedId(null)}><div className="detail-kv"><p><span>名称</span><b>{selected.name}</b></p><p><span>格式</span><b>{selected.format.toUpperCase()}</b></p><p><span>记录数</span><b>{selected.rowCount.toLocaleString("zh-CN")}</b></p><p><span>SHA-256</span><b className="audit-export-digest">{selected.sha256 ?? "生成失败"}</b></p><p><span>状态</span><b>{selected.status === "ready" ? "可下载" : "失败"}</b></p><p><span>过期</span><b>{formatBackendDateTime(selected.expiresAt)}</b></p></div></DetailDrawer>}
    {pending && <AuditExportConfirm pending={pending} resource={resource} notify={notify} onClose={() => setPending(null)} />}
  </>;
}

function AuditExportConfirm({ pending, resource, notify, onClose }: { pending: PendingAction; resource: AuditExportsResource; notify: Notify; onClose: () => void }) {
  const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [name, setName] = useState(pending.kind === "create" ? pending.name : ""); const [exportFormat, setExportFormat] = useState(pending.kind === "create" ? pending.format : "csv");
  const submit = async () => { if (!password || busy || (pending.kind === "create" && !name.trim())) return; setBusy(true); setError(""); try { const proof = (await reauthenticate(password)).proof; if (pending.kind === "create") { const record = await createAuditExport({ name: name.trim(), format: exportFormat }, proof); await resource.refresh(); notify(record.status === "ready" ? "真实审计快照已生成" : "审计快照生成失败，可在列表重试", record.status === "ready" ? "success" : "warning"); } else if (pending.kind === "retry") { const record = await retryAuditExport(pending.record.id, proof); await resource.refresh(); notify(record.status === "ready" ? "审计快照已重新生成" : "审计快照重试失败", record.status === "ready" ? "success" : "warning"); } else { await downloadAuditExport(pending.record, proof); notify(`${pending.record.name} 已开始下载`, "success"); } onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "审计导出操作失败"); } finally { setBusy(false); } };
  const create = pending.kind === "create"; const retry = pending.kind === "retry";
  return <ConfirmDialog title={create ? "创建审计快照" : retry ? "重新生成审计快照" : "下载审计快照"} message={create || retry ? "Controller 将校验完整审计链，并同步生成当前全量审计快照。" : "下载文件包含完整审计证据链，请妥善保管。"} detail={create ? undefined : `${pending.record.name}.${pending.record.format}`} confirmLabel={create ? "确认生成" : retry ? "确认重试" : "确认下载"} tone="warning" busy={busy} confirmDisabled={!password || (create && !name.trim())} onClose={onClose} onConfirm={() => void submit()}>{create && <><label><span>导出名称</span><input data-confirm-initial autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} /></label><FieldSelect label="文件格式" value={exportFormat} options={[{ value: "csv", label: "CSV" }, { value: "json", label: "JSON" }]} onChange={(value) => setExportFormat(value as "csv" | "json")} /></>}<label><span>当前密码</span><input data-confirm-initial={!create} autoFocus={!create} type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}</ConfirmDialog>;
}

function formatBytes(bytes: number): string { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / 1024 ** 2).toFixed(1)} MB`; }
