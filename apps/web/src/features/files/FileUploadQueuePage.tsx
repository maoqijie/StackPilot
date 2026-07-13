import type { FileUploadRecord } from "@stackpilot/contracts";
import { Activity, CheckCircle2, CircleAlert, Clock3, CloudUpload, FileBox, LoaderCircle, Shield, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { cancelFileUpload, clearCompletedFileUploads, completeFileUpload, createFileUpload, listFileUploads, uploadFileChunk } from "../../api/filesApi";
import { resolvePageMeta } from "../../app/navigation";
import { ModulePageShell } from "../../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../../components/ui/Cards";
import { DataTable } from "../../components/ui/DataTable";
import { DetailDrawer } from "../../components/ui/DetailDrawer";
import { FieldSelect } from "../../components/ui/FormControls";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import type { Notify, PageKey, Tone } from "../../types/app";

const statusLabels: Record<FileUploadRecord["status"], string> = { waiting: "等待", uploading: "上传中", completed: "已完成", failed: "失败", cancelled: "已取消" };
function percent(row: FileUploadRecord) { return row.sizeBytes ? Math.round(row.receivedBytes / row.sizeBytes * 100) : 0; }
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}
function formatTime(value: string) { return new Date(value).toLocaleString("zh-CN", { hour12: false }); }

export function FileUploadQueuePage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [uploads, setUploads] = useState<FileUploadRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [targetDirectory, setTargetDirectory] = useState("incoming");
  const [createError, setCreateError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [chunkBytes, setChunkBytes] = useState(8 * 1024 * 1024);
  const aborts = useRef(new Map<string, AbortController>());
  const files = useRef(new Map<string, File>());
  const transfers = useRef(new Map<string, Promise<void>>());

  const load = async (signal?: AbortSignal, initial = false) => {
    try {
      const payload = await listFileUploads(signal);
      setUploads(payload.uploads); setChunkBytes(payload.chunkBytes); setLoadError("");
      setSelectedId((current) => current && payload.uploads.some((row) => row.id === current) ? current : "");
    } catch (error) {
      if (initial && !(error instanceof DOMException && error.name === "AbortError")) setLoadError(error instanceof Error ? error.message : "上传队列加载失败");
    } finally { if (initial) setLoading(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    const activeAborts = aborts.current, activeFiles = files.current, activeTransfers = transfers.current;
    queueMicrotask(() => void load(controller.signal, true));
    return () => { controller.abort(); activeAborts.forEach((item) => item.abort()); activeFiles.clear(); activeTransfers.clear(); };
  }, []);
  useAutoRefresh(async (signal) => load(signal), 10_000, !loading);

  const selected = uploads.find((row) => row.id === selectedId) ?? null;
  const filteredRows = useMemo(() => uploads.filter((row) => {
    const query = search.trim().toLowerCase();
    return (!query || `${row.fileName} ${row.targetPath} ${row.owner}`.toLowerCase().includes(query)) && (statusFilter === "全部" || statusLabels[row.status] === statusFilter);
  }), [uploads, search, statusFilter]);

  const transfer = async (record: FileUploadRecord, file: File) => {
    const controller = new AbortController(); aborts.current.set(record.id, controller);
    try {
      const sendNext = async (current: FileUploadRecord): Promise<FileUploadRecord> => {
        if (current.receivedBytes >= current.sizeBytes) return completeFileUpload(current.id, controller.signal);
        const end = Math.min(current.receivedBytes + chunkBytes, file.size);
        const next = await uploadFileChunk(current.id, current.receivedBytes, file.slice(current.receivedBytes, end), controller.signal);
        setUploads((rows) => rows.map((row) => row.id === next.id ? next : row));
        return sendNext(next);
      };
      const completed = await sendNext(record);
      setUploads((rows) => rows.map((row) => row.id === completed.id ? completed : row));
      files.current.delete(completed.id); notify(`${completed.fileName} 已上传并校验完成`);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) notify(error instanceof Error ? error.message : "文件上传失败", "danger");
      await load();
    } finally { aborts.current.delete(record.id); }
  };
  const startTransfer = (record: FileUploadRecord, file: File) => {
    if (transfers.current.has(record.id)) return;
    const promise = transfer(record, file);
    transfers.current.set(record.id, promise);
    void promise.finally(() => { if (transfers.current.get(record.id) === promise) transfers.current.delete(record.id); });
  };
  const addUpload = async () => {
    if (!uploadFile) { setCreateError("请选择需要上传的文件"); return; }
    const normalized = targetDirectory.trim().replace(/^\/+|\/+$/g, "");
    if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) { setCreateError("目标目录必须是上传根目录下的安全相对路径"); return; }
    setBusy(true); setCreateError("");
    try {
      const created = await createFileUpload({ fileName: uploadFile.name, targetDirectory: normalized, sizeBytes: uploadFile.size, contentType: uploadFile.type || "application/octet-stream", idempotencyKey: `web_${crypto.randomUUID().replaceAll("-", "")}` });
      files.current.set(created.id, uploadFile); setUploads((rows) => [created, ...rows.filter((row) => row.id !== created.id)]); setSelectedId(created.id); setCreateOpen(false);
      notify(`${created.fileName} 已开始上传`, "info"); startTransfer(created, uploadFile);
    } catch (error) { setCreateError(error instanceof Error ? error.message : "创建上传任务失败"); } finally { setBusy(false); }
  };
  const cancel = async (row: FileUploadRecord) => { aborts.current.get(row.id)?.abort(); await transfers.current.get(row.id)?.catch(() => undefined); try { const next = await cancelFileUpload(row.id); setUploads((rows) => rows.map((item) => item.id === next.id ? next : item)); files.current.delete(row.id); notify(`${row.fileName} 已取消`, "warning"); } catch (error) { notify(error instanceof Error ? error.message : "取消失败", "danger"); } };
  const resume = (row: FileUploadRecord) => {
    const known = files.current.get(row.id);
    if (known) { startTransfer(row, known); return; }
    const input = document.createElement("input"); input.type = "file"; input.onchange = () => {
      const file = input.files?.[0];
      if (!file || file.name !== row.fileName || file.size !== row.sizeBytes) { notify("请选择名称和大小均与原任务一致的文件", "danger"); return; }
      files.current.set(row.id, file); startTransfer(row, file);
    }; input.click();
  };
  const clearCompleted = async () => { try { const removed = await clearCompletedFileUploads(); await load(); notify(`已清理 ${removed} 条完成记录`, "info"); } catch (error) { notify(error instanceof Error ? error.message : "清理失败", "danger"); } };

  if (loading) return <ModulePageShell title={resolvePageMeta(page).title} subtitle="正在读取服务器上传记录" page={page}><div role="status">正在加载上传队列</div></ModulePageShell>;
  if (loadError) return <ModulePageShell title={resolvePageMeta(page).title} subtitle="服务器上传记录暂不可用" page={page}><div role="alert">{loadError}<button type="button" onClick={() => { setLoading(true); void load(undefined, true); }}>重试</button></div></ModulePageShell>;
  return <>
    <div className="upload-page-layer" inert={Boolean(createOpen || selected)} aria-hidden={createOpen || selected ? "true" : undefined}>
      <ModulePageShell title={resolvePageMeta(page).title} subtitle="文件分片传输到 Controller 受限上传目录，完成后由服务端校验并原子落盘。" page={page}
        viewContext={{ eyebrow: "文件 / 上传队列", title: "上传队列", chips: [`任务 ${uploads.length}`, `上传中 ${uploads.filter((row) => row.status === "uploading").length}`, `失败 ${uploads.filter((row) => row.status === "failed").length}`] }}
        actions={<><button className="ghost" type="button" onClick={() => void clearCompleted()}><Trash2 size={15} /> 清理完成</button><button className="primary" type="button" onClick={() => { setUploadFile(null); setTargetDirectory("incoming"); setCreateError(""); setCreateOpen(true); }}><CloudUpload size={15} /> 添加上传</button></>}
        filters={<><ModuleSearch value={search} placeholder="搜索文件名、目标路径或上传人" onChange={setSearch} /><FieldSelect label="状态" value={statusFilter} options={["全部", "上传中", "等待", "已完成", "失败", "已取消"]} onChange={setStatusFilter} /></>}
        metrics={<><MetricTile icon={CloudUpload} label="队列任务" value={`${uploads.length}`} tone="blue" /><MetricTile icon={Activity} label="上传中" value={`${uploads.filter((row) => row.status === "uploading").length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="已完成" value={`${uploads.filter((row) => row.status === "completed").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${uploads.filter((row) => row.status === "failed").length}`} tone="red" /></>}>
        <div className="file-upload-workspace"><DataTable columns={[
          { key: "name", label: "文件", width: "230px", render: (row) => <button className="module-row-link" type="button" title={row.fileName} onClick={() => setSelectedId(row.id)}><FileBox size={15} /><b>{row.fileName}</b></button> },
          { key: "target", label: "目标路径", render: (row) => <code title={row.targetPath}>{row.targetPath}</code> },
          { key: "size", label: "大小", width: "82px", render: (row) => formatSize(row.sizeBytes) },
          { key: "progress", label: "进度", width: "150px", sortValue: percent, render: (row) => <UploadProgress value={percent(row)} /> },
          { key: "status", label: "状态", width: "110px", render: (row) => <UploadStatus status={row.status} /> },
          { key: "owner", label: "上传人", width: "100px", render: (row) => row.owner },
          { key: "ops", label: "操作", width: "160px", render: (row) => <span className="table-actions">{["waiting", "failed"].includes(row.status) && <button type="button" onClick={() => resume(row)}>继续</button>}{!["completed", "cancelled"].includes(row.status) && <button type="button" onClick={() => void cancel(row)}>取消</button>}{row.status === "completed" && <span className="green-text">已完成</span>}</span> },
        ]} rows={filteredRows} emptyText="没有真实上传任务" getRowKey={(row) => row.id} mobileCard={(row) => <UploadMobileCard row={row} open={() => setSelectedId(row.id)} resume={() => resume(row)} cancel={() => void cancel(row)} />} />
          <section className="upload-lane-list" aria-label="上传阶段概览">{[["准备上传", "等待资源", "waiting"], ["传输中", "网络传输", "uploading"], ["收尾校验", "落盘完成", "completed"]].map(([label, note, status]) => <article key={label}><span>{label}</span><strong>{uploads.filter((row) => row.status === status).length}</strong><em>{note}</em></article>)}</section>
        </div>
      </ModulePageShell>
    </div>
    {createOpen && <DetailDrawer title="添加上传" subtitle="选择本地文件和上传根目录下的目标目录" onClose={() => setCreateOpen(false)} className="upload-create-modal" modal actions={<><button className="ghost" type="button" onClick={() => setCreateOpen(false)}>取消</button><button className="primary" type="button" disabled={busy} onClick={() => void addUpload()}><Upload size={15} /> {busy ? "正在创建" : "开始上传"}</button></>}><div className="upload-create-form"><label htmlFor="upload-local-file"><span>本地文件</span><input id="upload-local-file" type="file" aria-label="本地文件" onChange={(event) => { setUploadFile(event.target.files?.[0] ?? null); setCreateError(""); }} /><small>{uploadFile ? `${uploadFile.name} · ${formatSize(uploadFile.size)}` : "尚未选择文件"}</small></label><label htmlFor="upload-target-path"><span>目标目录</span><input id="upload-target-path" value={targetDirectory} aria-label="目标目录" onChange={(event) => { setTargetDirectory(event.target.value); setCreateError(""); }} /><small>相对于 Controller 受限上传根目录</small></label>{createError && <p className="upload-create-error" role="alert">{createError}</p>}</div></DetailDrawer>}
    {selected && <DetailDrawer title="上传详情" subtitle={selected.fileName} onClose={() => setSelectedId("")} className="upload-detail-drawer" modal actions={selected.status === "completed" || selected.status === "cancelled" ? <button className="ghost" type="button" onClick={() => setSelectedId("")}>关闭</button> : <><button className="ghost" type="button" onClick={() => void cancel(selected)}>取消上传</button><button className="primary" type="button" onClick={() => resume(selected)}>继续上传</button></>}><div className="detail-kv upload-detail"><p><span>目标路径</span><b>{selected.targetPath}</b></p><p><span>大小</span><b>{formatSize(selected.sizeBytes)}</b></p><p><span>状态</span><b><UploadStatus status={selected.status} /></b></p><p><span>上传人</span><b>{selected.owner}</b></p><p><span>开始时间</span><b>{formatTime(selected.createdAt)}</b></p>{selected.sha256 && <p><span>SHA-256</span><b>{selected.sha256}</b></p>}<UploadProgress value={percent(selected)} detail /></div></DetailDrawer>}
  </>;
}

function UploadStatus({ status }: { status: FileUploadRecord["status"] }) { const tone: Tone = status === "completed" ? "green" : status === "failed" ? "red" : status === "uploading" ? "blue" : "orange"; const Icon = status === "completed" ? CheckCircle2 : status === "failed" ? CircleAlert : status === "uploading" ? LoaderCircle : Clock3; return <span className={`pill file-upload-status ${tone}`}><Icon size={14} aria-hidden="true" />{statusLabels[status]}</span>; }
function UploadProgress({ value, detail = false }: { value: number; detail?: boolean }) { if (detail) { const radius = 28, circumference = 2 * Math.PI * radius; return <span className="upload-progress-card" role="progressbar" aria-label={`上传进度 ${value}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><svg viewBox="0 0 64 64" aria-hidden="true"><circle className="upload-progress-track" cx="32" cy="32" r={radius} /><circle className="upload-progress-value" cx="32" cy="32" r={radius} strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} /></svg><span><strong>{value}</strong><em>%</em></span></span>; } return <span className="upload-progress-inline" role="progressbar" aria-label={`上传进度 ${value}%`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}><i><span style={{ width: `${value}%` }} /></i><b>{value}%</b></span>; }
function UploadMobileCard({ row, open, resume, cancel }: { row: FileUploadRecord; open: () => void; resume: () => void; cancel: () => void }) { return <><div className="module-card-head upload-mobile-head"><button className="module-row-link" type="button" onClick={open}><FileBox size={15} /><b>{row.fileName}</b></button><UploadStatus status={row.status} /></div><code className="module-card-code">{row.targetPath}</code><div className="module-card-meta"><span><b>大小</b><em>{formatSize(row.sizeBytes)}</em></span><span><b>进度</b><em>{percent(row)}%</em></span><span><b>上传人</b><em>{row.owner}</em></span></div><div className="module-card-footer upload-mobile-footer"><UploadProgress value={percent(row)} /><div className="table-actions">{["waiting", "failed"].includes(row.status) && <button type="button" onClick={resume}>继续</button>}{!["completed", "cancelled"].includes(row.status) && <button type="button" onClick={cancel}>取消</button>}</div></div></>; }
