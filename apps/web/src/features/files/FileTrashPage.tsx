import type { TrashEntry } from "@stackpilot/contracts";
import { Clock3, FileBox, LoaderCircle, RefreshCw, Shield, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { purgeFileTrash, purgeTrashEntry, restoreTrashEntry } from "../../api/filesApi";
import { reauthenticate } from "../../api/identityApi";
import { resolvePageMeta } from "../../app/navigation";
import { ModulePageShell } from "../../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../../components/ui/Cards";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DataTable } from "../../components/ui/DataTable";
import { DetailDrawer } from "../../components/ui/DetailDrawer";
import { FieldSelect } from "../../components/ui/FormControls";
import type { Notify, PageKey } from "../../types/app";
import { useFileTrash } from "./useFileTrash";

function formatSizeBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function FileTrashPage({ page, notify, canManage = true }: { page: PageKey; notify: Notify; canManage?: boolean }) {
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState("");
  const [password, setPassword] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const { payload, loading, error, mutating, retry, mutate } = useFileTrash();
  const trashRows = payload?.entries ?? [];
  const restoredRows = payload?.recentlyRestored ?? [];
  const [confirmation, setConfirmation] = useState<
    | { type: "file"; row: TrashEntry; returnToDetail: boolean }
    | { type: "all"; count: number }
    | null
  >(null);
  const restorePanelRef = useRef<HTMLElement>(null);
  const selected = trashRows.find((row) => row.id === selectedId) ?? null;
  const ownerOptions = ["全部", ...Array.from(new Set(trashRows.map((row) => row.owner)))];
  const filteredRows = trashRows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.name} ${row.originalPath} ${row.reason} ${row.owner}`.toLowerCase().includes(query);
    return matchSearch && (ownerFilter === "全部" || row.owner === ownerFilter);
  });

  const restoreFile = async (row: TrashEntry) => {
    if (mutating) return;
    try {
      const result = await mutate(() => restoreTrashEntry(row.id));
      if (selectedId === row.id) setSelectedId("");
      notify(result.message);
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "恢复失败", "danger");
    }
  };
  const requestPurge = (row: TrashEntry, returnToDetail = false) => {
    if (returnToDetail) setSelectedId("");
    setPassword("");
    setMutationError(null);
    setConfirmation({ type: "file", row, returnToDetail });
  };
  const closeConfirmation = () => {
    if (mutating) return;
    if (confirmation?.type === "file" && confirmation.returnToDetail && trashRows.some((row) => row.id === confirmation.row.id)) setSelectedId(confirmation.row.id);
    setPassword("");
    setMutationError(null);
    setConfirmation(null);
  };
  const confirmPurge = async () => {
    if (!confirmation || !password || mutating) return;
    setMutationError(null);
    try {
      const result = await mutate(async () => {
        const proof = await reauthenticate(password);
        return confirmation.type === "all" ? purgeFileTrash(proof.proof) : purgeTrashEntry(confirmation.row.id, proof.proof);
      });
      setSelectedId("");
      setConfirmation(null);
      setPassword("");
      notify(result.message, "danger");
    } catch (reason) {
      setMutationError(reason instanceof Error ? reason.message : "永久删除失败");
    }
  };

  const formatDate = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });
  const formatSize = (row: TrashEntry) => row.kind === "directory" ? "文件夹" : row.sizeBytes === null ? "暂不可用" : formatSizeBytes(row.sizeBytes);
  const expiresIn = (value: string) => `${Math.max(0, Math.ceil((Date.parse(value) - Date.parse(payload?.collectedAt ?? value)) / 86_400_000))} 天`;

  return (
    <>
      <div className="trash-page-layer" inert={Boolean(selected || confirmation)} aria-hidden={selected || confirmation ? "true" : undefined}>
        <ModulePageShell
          title={resolvePageMeta(page).title}
          subtitle="独立回收站视图，支持按所有者筛选、查看删除原因、恢复文件和永久删除。"
          page={page}
          viewContext={{ eyebrow: "文件 / 回收站", title: "回收站", chips: [`待清理 ${trashRows.length}`, `已恢复 ${restoredRows.length}`, `保留 ${payload?.retentionDays ?? 7} 天`] }}
          actions={<><button className="ghost" type="button" onClick={() => { restorePanelRef.current?.scrollIntoView({ block: "start" }); restorePanelRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true }); }}><RefreshCw size={15} /> 查看恢复记录</button>{canManage && <button className="trash-destructive" type="button" disabled={trashRows.length === 0 || mutating} onClick={() => { setPassword(""); setMutationError(null); setConfirmation({ type: "all", count: trashRows.length }); }}><Trash2 size={15} /> 清空回收站</button>}</>}
          filters={<><ModuleSearch value={search} placeholder="搜索文件、原路径、删除原因" onChange={setSearch} /><FieldSelect label="所有者" value={ownerFilter} options={ownerOptions} onChange={setOwnerFilter} /></>}
          metrics={<><MetricTile icon={Trash2} label="回收站项目" value={`${trashRows.length}`} tone="orange" /><MetricTile icon={RefreshCw} label="已恢复" value={`${restoredRows.length}`} tone="green" /><MetricTile icon={Clock3} label="保留策略" value={`${payload?.retentionDays ?? 7} 天`} tone="blue" /></>}
          side={selected && (
            <DetailDrawer title="删除详情" subtitle={selected.name} onClose={() => setSelectedId("")} className="trash-detail-drawer" modal actions={canManage ? <><button className="trash-destructive" type="button" disabled={mutating} aria-label={`永久删除 ${selected.name}`} onClick={() => requestPurge(selected, true)}>永久删除</button><button className="primary" type="button" disabled={mutating} aria-label={`恢复 ${selected.name}`} onClick={() => void restoreFile(selected)}>恢复</button></> : undefined}>
              <dl className="trash-detail-list">
                <div><dt>原路径</dt><dd>{selected.originalPath}</dd></div>
                <div><dt>大小</dt><dd>{formatSize(selected)}</dd></div>
                <div><dt>删除时间</dt><dd>{formatDate(selected.deletedAt)}</dd></div>
                <div><dt>剩余保留</dt><dd>{expiresIn(selected.expiresAt)}</dd></div>
                <div><dt>所有者</dt><dd>{selected.owner}</dd></div>
                <div><dt>删除原因</dt><dd>{selected.reason}</dd></div>
              </dl>
            </DetailDrawer>
          )}
          sideModal={Boolean(selected)}
        >
          <div className="file-trash-workspace">
            {loading && !payload && <div className="overview-loading-state" role="status"><LoaderCircle size={18} /> 正在加载回收站</div>}
            {error && !payload && <div className="overview-error-state" role="alert"><Shield size={18} /><span>{error}</span><button type="button" disabled={loading} onClick={() => void retry()}>重试</button></div>}
            {payload && <p className="trash-freshness">后端采集时间 {formatDate(payload.collectedAt)}</p>}
            {payload && (
              <DataTable
                columns={[
                  { key: "name", label: "文件", width: "220px", render: (row) => <button className="module-row-link trash-file-link" type="button" title={row.name} onClick={() => setSelectedId(row.id)}><Trash2 size={15} /><b>{row.name}</b></button> },
                  { key: "path", label: "原路径", render: (row) => <code className="trash-path" title={row.originalPath}>{row.originalPath}</code> },
                  { key: "size", label: "大小", width: "84px", render: formatSize },
                  { key: "deleted", label: "删除时间", render: (row) => formatDate(row.deletedAt) },
                  { key: "expires", label: "剩余保留", width: "92px", render: (row) => <span className="pill orange"><Clock3 size={12} />{expiresIn(row.expiresAt)}</span> },
                  { key: "owner", label: "所有者", width: "84px", render: (row) => row.owner },
                  { key: "ops", label: "操作", width: "184px", render: (row) => canManage ? <span className="table-actions"><button type="button" disabled={mutating} aria-label={`恢复 ${row.name}`} onClick={() => void restoreFile(row)}>恢复</button><button className="trash-destructive small" type="button" disabled={mutating} aria-label={`永久删除 ${row.name}`} onClick={() => requestPurge(row)}>永久删除</button></span> : <span>只读</span> },
                ]}
                rows={filteredRows}
                emptyText="回收站没有匹配文件"
                getRowKey={(row) => row.id}
                mobileCard={(row) => (
                  <>
                    <div className="module-card-head trash-mobile-head"><button className="module-row-link trash-file-link" type="button" title={row.name} onClick={() => setSelectedId(row.id)}><Trash2 size={15} /><b>{row.name}</b></button><span className="pill orange"><Clock3 size={12} />{expiresIn(row.expiresAt)}</span></div>
                    <code className="module-card-code">{row.originalPath}</code>
                    <div className="module-card-meta"><span><b>大小</b><em>{formatSize(row)}</em></span><span><b>删除</b><em>{formatDate(row.deletedAt)}</em></span><span><b>所有者</b><em>{row.owner}</em></span><span className="module-card-span-2"><b>原因</b><em>{row.reason}</em></span></div>
                    {canManage && <div className="module-card-footer"><div className="table-actions actions-2"><button type="button" disabled={mutating} aria-label={`恢复 ${row.name}`} onClick={() => void restoreFile(row)}>恢复</button><button className="trash-destructive small" type="button" disabled={mutating} aria-label={`永久删除 ${row.name}`} onClick={() => requestPurge(row)}>永久删除</button></div></div>}
                  </>
                )}
              />
            )}
            <section ref={restorePanelRef} className="trash-restore-panel" aria-labelledby="trash-restore-title">
              <header className="trash-section-head"><span><RefreshCw size={18} /></span><div><h2 id="trash-restore-title" tabIndex={-1}>最近恢复</h2><p>{restoredRows.length > 0 ? `${restoredRows.length} 个文件已恢复到原目录` : "恢复后的文件会显示在这里"}</p></div></header>
              <div className="restore-mini-list">
                {restoredRows.map((row) => <p key={row.id}><span className="restore-file-icon"><FileBox size={16} /></span><span><b>{row.name}</b><em>{row.originalPath}</em></span><time>{formatDate(row.restoredAt)}</time></p>)}
                {restoredRows.length === 0 && <div className="trash-empty-state" role="status"><FileBox size={20} /><span>还没有恢复记录</span></div>}
              </div>
            </section>
          </div>
        </ModulePageShell>
      </div>
      {confirmation && <ConfirmDialog title={confirmation.type === "all" ? "清空回收站" : "永久删除文件"} message={confirmation.type === "all" ? `将永久删除回收站中的 ${confirmation.count} 个文件，此操作无法撤销。` : `将永久删除 ${confirmation.row.name}，此操作无法撤销。`} detail={confirmation.type === "file" ? confirmation.row.originalPath : undefined} confirmLabel={mutating ? "处理中..." : confirmation.type === "all" ? "确认清空" : "永久删除"} confirmDisabled={!password || mutating} onClose={closeConfirmation} onConfirm={() => void confirmPurge()}>
        <label className="cert-reauth-field"><span>当前密码</span><input data-confirm-initial type="password" autoComplete="current-password" value={password} disabled={mutating} onChange={(event) => setPassword(event.target.value)} /></label>
        {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
      </ConfirmDialog>}
    </>
  );
}

export { FileTrashPage };
