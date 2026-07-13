import { ChevronRight, Clock3, CloudUpload, FileBox, Folder, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine } from "../components/ui/FormControls";
import { fileSizeSortValue, filesPagePreset } from "../features/files/model";
import { FileUploadQueuePage } from "../features/files/FileUploadQueuePage";
import type { FileRecord, TrashFileRecord } from "../features/files/types";
import { initialFileRecords, initialTrashFiles } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import { currentClock } from "../utils/time";

function FilesModule({ page, notify }: { page: PageKey; notify: Notify }) {
  const [files, setFiles] = useState(initialFileRecords);
  const [trashRows, setTrashRows] = useState(initialTrashFiles);
  const [restoredRows, setRestoredRows] = useState<FileRecord[]>([]);

  if (page === "files-upload") {
    return <FileUploadQueuePage page={page} notify={notify} />;
  }
  if (page === "files-trash") {
    return <FileTrashPage page={page} notify={notify} trashRows={trashRows} setTrashRows={setTrashRows} restoredRows={restoredRows} setRestoredRows={setRestoredRows} setFiles={setFiles} />;
  }
  return <FilesPage page={page} notify={notify} rows={files} setRows={setFiles} setTrashRows={setTrashRows} />;
}

function FilesPage({
  page,
  notify,
  rows,
  setRows,
  setTrashRows,
}: {
  page: PageKey;
  notify: Notify;
  rows: FileRecord[];
  setRows: React.Dispatch<React.SetStateAction<FileRecord[]>>;
  setTrashRows: React.Dispatch<React.SetStateAction<TrashFileRecord[]>>;
}) {
  const filePreset = filesPagePreset(page);
  const [currentPath, setCurrentPath] = useState(filePreset.path);
  const [search, setSearch] = useState(filePreset.search);
  const [typeFilter, setTypeFilter] = useState(filePreset.type);
  const [drawer, setDrawer] = useState<{ type: "folder" | "rename" | "delete"; file?: FileRecord } | null>(null);
  const [draftName, setDraftName] = useState("new-folder");
  const crumbs = currentPath.split("/").filter(Boolean);
  const visibleRows = rows.filter((row) => row.path === currentPath && (typeFilter === "全部" || row.type === typeFilter) && (!search.trim() || row.name.toLowerCase().includes(search.trim().toLowerCase())));
  const parentPath = crumbs.length > 1 ? `/${crumbs.slice(0, -1).join("/")}` : "/";
  const createFolder = () => {
    if (!draftName.trim()) {
      notify("文件夹名称不能为空", "danger");
      return;
    }
    setRows((current) => [{ id: `file-${Date.now()}`, name: draftName.trim(), type: "文件夹", path: currentPath, size: "-", modified: currentClock(), owner: "admin" }, ...current]);
    setDrawer(null);
    notify(`文件夹 ${draftName.trim()} 已创建`);
  };
  const renameFile = () => {
    if (!drawer?.file || !draftName.trim()) return;
    setRows((current) => current.map((row) => row.id === drawer.file?.id ? { ...row, name: draftName.trim(), modified: currentClock() } : row));
    setDrawer(null);
    notify("已重命名文件项");
  };
  const moveToTrash = (row: FileRecord) => {
    if (row.type === "文件夹") {
      notify("文件夹删除已加入回收站，请在回收站确认恢复或清理", "warning");
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    setTrashRows((current) => [{
      id: `trash-${Date.now()}`,
      name: row.name,
      originalPath: `${row.path === "/" ? "" : row.path}/${row.name}`,
      size: row.size,
      deletedAt: currentClock(),
      expiresIn: "7 天",
      owner: row.owner,
      reason: "从文件管理删除",
    }, ...current]);
    setDrawer(null);
    notify(`${row.name} 已移入回收站`, "warning");
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={filePreset.subtitle}
      page={page}
      actions={<><button className="ghost" type="button" onClick={() => { setRows((current) => [{ id: `file-${Date.now()}`, name: `upload-${current.length + 1}.log`, type: "文件", path: currentPath, size: "12 KB", modified: currentClock(), owner: "admin" }, ...current]); notify("文件已上传到当前路径"); }}><CloudUpload size={15} /> 上传</button><button className="primary" type="button" onClick={() => { setDraftName("new-folder"); setDrawer({ type: "folder" }); }}><Plus size={15} /> 创建文件夹</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索文件名" onChange={setSearch} /><FieldSelect label="类型" value={typeFilter} options={["全部", "文件夹", "文件"]} onChange={setTypeFilter} /></>}
      side={drawer?.type === "folder" ? (
        <DetailDrawer title="创建文件夹" subtitle={currentPath} className="file-editor-drawer" modal onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={createFolder}>创建</button></>}>
          <FormLine label="文件夹名" required value={draftName} onChange={setDraftName} />
        </DetailDrawer>
      ) : drawer?.type === "rename" && drawer.file ? (
        <DetailDrawer title="重命名" subtitle={drawer.file.name} className="file-editor-drawer" modal onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={renameFile}>保存</button></>}>
          <FormLine label="新名称" required value={draftName} onChange={setDraftName} />
        </DetailDrawer>
      ) : drawer?.type === "delete" && drawer.file ? (
        <DetailDrawer
          title="移入回收站"
          subtitle={drawer.file.name}
          className="file-delete-dialog"
          modal
          onClose={() => setDrawer(null)}
          actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="files-destructive" type="button" aria-label={`确认将 ${drawer.file.name} 移入回收站`} onClick={() => moveToTrash(drawer.file!)}><Trash2 size={15} /> 确认移入</button></>}
        >
          <div className="file-delete-summary">
            <Trash2 size={20} />
            <div>
              <strong>确认移动这个{drawer.file.type === "文件夹" ? "文件夹" : "文件"}？</strong>
              <p>项目将保留在回收站 7 天，期间仍可恢复。</p>
            </div>
          </div>
          <dl className="file-delete-facts">
            <div><dt>名称</dt><dd>{drawer.file.name}</dd></div>
            <div><dt>原路径</dt><dd><code>{`${drawer.file.path === "/" ? "" : drawer.file.path}/${drawer.file.name}`}</code></dd></div>
          </dl>
        </DetailDrawer>
      ) : null}
      sideModal={Boolean(drawer)}
    >
      <div className="file-breadcrumbs">
        <button className="file-parent-button" type="button" disabled={currentPath === "/"} onClick={() => setCurrentPath(parentPath)}>上级</button>
        <span aria-hidden="true"><ChevronRight size={14} /></span>
        <button type="button" className={currentPath === "/" ? "active" : ""} aria-current={currentPath === "/" ? "page" : undefined} onClick={() => setCurrentPath("/")}>root</button>
        {crumbs.map((crumb, index) => {
          const nextPath = `/${crumbs.slice(0, index + 1).join("/")}`;
          const isCurrent = nextPath === currentPath;
          return <span className="file-breadcrumb-item" key={nextPath}><ChevronRight size={14} aria-hidden="true" /><button type="button" className={isCurrent ? "active" : ""} aria-current={isCurrent ? "page" : undefined} onClick={() => setCurrentPath(nextPath)}>{crumb}</button></span>;
        })}
      </div>
      <DataTable
        columns={[
          { key: "name", label: "名称", width: "260px", render: (row) => row.type === "文件夹" ? <button className="file-link file-name" type="button" title={row.name} onClick={() => setCurrentPath(`${currentPath === "/" ? "" : currentPath}/${row.name}`)}><Folder size={15} /> <b>{row.name}</b></button> : <span className="file-name" title={row.name}><FileBox size={15} /> <b>{row.name}</b></span> },
          { key: "type", label: "类型", width: "86px", render: (row) => <span className="pill blue">{row.type}</span> },
          { key: "size", label: "大小", sortValue: (row) => fileSizeSortValue(row), render: (row) => row.size },
          { key: "modified", label: "修改时间", render: (row) => row.modified },
          { key: "owner", label: "所有者", render: (row) => row.owner },
          { key: "ops", label: "操作", width: "170px", render: (row) => <span className="table-actions file-row-actions"><button type="button" aria-label={`重命名 ${row.name}`} onClick={() => { setDraftName(row.name); setDrawer({ type: "rename", file: row }); }}><Pencil size={14} /> 重命名</button><button type="button" aria-label={`删除 ${row.name} 到回收站`} onClick={() => setDrawer({ type: "delete", file: row })}><Trash2 size={14} /> 删除</button></span> },
        ]}
        rows={visibleRows}
        emptyText="当前路径没有匹配文件"
        getRowKey={(row) => row.id}
        mobileCard={(row) => (
          <>
            <div className="module-card-head">
              {row.type === "文件夹" ? (
                <button className="module-row-link" type="button" onClick={() => setCurrentPath(`${currentPath === "/" ? "" : currentPath}/${row.name}`)}><Folder size={15} /> <b>{row.name}</b></button>
              ) : (
                <span className="module-card-title"><FileBox size={15} /><b>{row.name}</b></span>
              )}
              <span className="pill blue">{row.type}</span>
            </div>
            <code className="module-card-code">{currentPath}</code>
            <div className="module-card-meta">
              <span><b>大小</b><em>{row.size}</em></span>
              <span><b>修改</b><em>{row.modified}</em></span>
              <span><b>所有者</b><em>{row.owner}</em></span>
              <span><b>路径</b><em>{row.path}</em></span>
            </div>
            <div className="module-card-footer">
              <div className="table-actions actions-2">
                <button type="button" aria-label={`重命名 ${row.name}`} onClick={() => { setDraftName(row.name); setDrawer({ type: "rename", file: row }); }}><Pencil size={14} /> 重命名</button>
                <button type="button" aria-label={`删除 ${row.name} 到回收站`} onClick={() => setDrawer({ type: "delete", file: row })}><Trash2 size={14} /> 删除</button>
              </div>
            </div>
          </>
        )}
      />
    </ModulePageShell>
  );
}

function FileTrashPage({
  page,
  notify,
  trashRows,
  setTrashRows,
  restoredRows,
  setRestoredRows,
  setFiles,
}: {
  page: PageKey;
  notify: Notify;
  trashRows: TrashFileRecord[];
  setTrashRows: React.Dispatch<React.SetStateAction<TrashFileRecord[]>>;
  restoredRows: FileRecord[];
  setRestoredRows: React.Dispatch<React.SetStateAction<FileRecord[]>>;
  setFiles: React.Dispatch<React.SetStateAction<FileRecord[]>>;
}) {
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState("");
  const [confirmation, setConfirmation] = useState<
    | { type: "file"; row: TrashFileRecord; returnToDetail: boolean }
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
  const restoreFile = (row: TrashFileRecord) => {
    const originalPathParts = row.originalPath.split("/");
    const fileName = originalPathParts.pop() ?? row.name;
    const parentPath = originalPathParts.join("/") || "/";
    const restoredFile: FileRecord = { id: `restore-${Date.now()}`, name: fileName, type: "文件", path: parentPath, size: row.size, modified: currentClock(), owner: row.owner };
    setRestoredRows((current) => [restoredFile, ...current]);
    setFiles((current) => [restoredFile, ...current]);
    setTrashRows((current) => current.filter((item) => item.id !== row.id));
    if (selectedId === row.id) setSelectedId("");
    notify(`${row.name} 已恢复到 ${parentPath}`);
  };
  const requestPurge = (row: TrashFileRecord, returnToDetail = false) => {
    if (returnToDetail) setSelectedId("");
    setConfirmation({ type: "file", row, returnToDetail });
  };
  const closeConfirmation = () => {
    if (confirmation?.type === "file" && confirmation.returnToDetail && trashRows.some((row) => row.id === confirmation.row.id)) {
      setSelectedId(confirmation.row.id);
    }
    setConfirmation(null);
  };
  const confirmPurge = () => {
    if (!confirmation) return;
    if (confirmation.type === "all") {
      setTrashRows([]);
      setSelectedId("");
      notify(`已永久删除回收站中的 ${confirmation.count} 个文件`, "danger");
      setConfirmation(null);
      return;
    }
    const row = confirmation.row;
    setTrashRows((current) => current.filter((item) => item.id !== row.id));
    if (selectedId === row.id) setSelectedId("");
    notify(`${row.name} 已永久删除`, "danger");
    setConfirmation(null);
  };

  return (
    <>
      <div className="trash-page-layer" inert={Boolean(selected || confirmation)} aria-hidden={selected || confirmation ? "true" : undefined}>
        <ModulePageShell
          title={resolvePageMeta(page).title}
          subtitle="独立回收站视图，支持按所有者筛选、查看删除原因、恢复文件和永久删除。"
          page={page}
          viewContext={{
            eyebrow: "文件 / 回收站",
            title: "回收站",
            chips: [`待清理 ${trashRows.length}`, `已恢复 ${restoredRows.length}`, "保留 7 天"],
          }}
          actions={<><button className="ghost" type="button" onClick={() => { restorePanelRef.current?.scrollIntoView({ block: "start" }); restorePanelRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true }); }}><RefreshCw size={15} /> 查看恢复记录</button><button className="trash-destructive" type="button" disabled={trashRows.length === 0} onClick={() => setConfirmation({ type: "all", count: trashRows.length })}><Trash2 size={15} /> 清空回收站</button></>}
          filters={<><ModuleSearch value={search} placeholder="搜索文件、原路径、删除原因" onChange={setSearch} /><FieldSelect label="所有者" value={ownerFilter} options={ownerOptions} onChange={setOwnerFilter} /></>}
          metrics={<><MetricTile icon={Trash2} label="回收站文件" value={`${trashRows.length}`} tone="orange" /><MetricTile icon={RefreshCw} label="已恢复" value={`${restoredRows.length}`} tone="green" /><MetricTile icon={Clock3} label="保留策略" value="7 天" tone="blue" /></>}
          side={selected && (
            <DetailDrawer
              title="删除详情"
              subtitle={selected.name}
              onClose={() => setSelectedId("")}
              className="trash-detail-drawer"
              modal
              actions={<><button className="trash-destructive" type="button" aria-label={`永久删除 ${selected.name}`} onClick={() => requestPurge(selected, true)}>永久删除</button><button className="primary" type="button" aria-label={`恢复 ${selected.name}`} onClick={() => restoreFile(selected)}>恢复</button></>}
            >
              <dl className="trash-detail-list">
                <div><dt>原路径</dt><dd>{selected.originalPath}</dd></div>
                <div><dt>大小</dt><dd>{selected.size}</dd></div>
                <div><dt>删除时间</dt><dd>{selected.deletedAt}</dd></div>
                <div><dt>剩余保留</dt><dd>{selected.expiresIn}</dd></div>
                <div><dt>所有者</dt><dd>{selected.owner}</dd></div>
                <div><dt>删除原因</dt><dd>{selected.reason}</dd></div>
              </dl>
            </DetailDrawer>
          )}
          sideModal={Boolean(selected)}
        >
          <div className="file-trash-workspace">
            <DataTable
              columns={[
                { key: "name", label: "文件", width: "220px", render: (row) => <button className="module-row-link trash-file-link" type="button" title={row.name} onClick={() => setSelectedId(row.id)}><Trash2 size={15} /><b>{row.name}</b></button> },
                { key: "path", label: "原路径", render: (row) => <code className="trash-path" title={row.originalPath}>{row.originalPath}</code> },
                { key: "size", label: "大小", width: "84px", render: (row) => row.size },
                { key: "deleted", label: "删除时间", render: (row) => row.deletedAt },
                { key: "expires", label: "剩余保留", width: "92px", render: (row) => <span className="pill orange"><Clock3 size={12} />{row.expiresIn}</span> },
                { key: "owner", label: "所有者", width: "84px", render: (row) => row.owner },
                { key: "ops", label: "操作", width: "184px", render: (row) => <span className="table-actions"><button type="button" aria-label={`恢复 ${row.name}`} onClick={() => restoreFile(row)}>恢复</button><button className="trash-destructive small" type="button" aria-label={`永久删除 ${row.name}`} onClick={() => requestPurge(row)}>永久删除</button></span> },
              ]}
              rows={filteredRows}
              emptyText="回收站没有匹配文件"
              getRowKey={(row) => row.id}
              mobileCard={(row) => (
                <>
                  <div className="module-card-head trash-mobile-head">
                    <button className="module-row-link trash-file-link" type="button" title={row.name} onClick={() => setSelectedId(row.id)}><Trash2 size={15} /><b>{row.name}</b></button>
                    <span className="pill orange"><Clock3 size={12} />{row.expiresIn}</span>
                  </div>
                  <code className="module-card-code">{row.originalPath}</code>
                  <div className="module-card-meta">
                    <span><b>大小</b><em>{row.size}</em></span>
                    <span><b>删除</b><em>{row.deletedAt}</em></span>
                    <span><b>所有者</b><em>{row.owner}</em></span>
                    <span className="module-card-span-2"><b>原因</b><em>{row.reason}</em></span>
                  </div>
                  <div className="module-card-footer">
                    <div className="table-actions actions-2">
                      <button type="button" aria-label={`恢复 ${row.name}`} onClick={() => restoreFile(row)}>恢复</button>
                      <button className="trash-destructive small" type="button" aria-label={`永久删除 ${row.name}`} onClick={() => requestPurge(row)}>永久删除</button>
                    </div>
                  </div>
                </>
              )}
            />
            <section ref={restorePanelRef} className="trash-restore-panel" aria-labelledby="trash-restore-title">
              <header className="trash-section-head">
                <span><RefreshCw size={18} /></span>
                <div><h2 id="trash-restore-title" tabIndex={-1}>最近恢复</h2><p>{restoredRows.length > 0 ? `${restoredRows.length} 个文件已恢复到原目录` : "恢复后的文件会显示在这里"}</p></div>
              </header>
              <div className="restore-mini-list">
                {restoredRows.map((row) => <p key={row.id}><span className="restore-file-icon"><FileBox size={16} /></span><span><b>{row.name}</b><em>{row.path}</em></span><time>{row.modified}</time></p>)}
                {restoredRows.length === 0 && <div className="trash-empty-state" role="status"><FileBox size={20} /><span>还没有恢复记录</span></div>}
              </div>
            </section>
          </div>
        </ModulePageShell>
      </div>
      {confirmation && (
        <ConfirmDialog
          title={confirmation.type === "all" ? "清空回收站" : "永久删除文件"}
          message={confirmation.type === "all" ? `将永久删除回收站中的 ${confirmation.count} 个文件，此操作无法撤销。` : `将永久删除 ${confirmation.row.name}，此操作无法撤销。`}
          detail={confirmation.type === "file" ? confirmation.row.originalPath : undefined}
          confirmLabel={confirmation.type === "all" ? "确认清空" : "永久删除"}
          onClose={closeConfirmation}
          onConfirm={confirmPurge}
        />
      )}
    </>
  );
}

export { FilesModule, FilesPage, FileUploadQueuePage, FileTrashPage };
