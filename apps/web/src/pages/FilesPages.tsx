import { ChevronRight, CloudUpload, FileBox, Folder, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine } from "../components/ui/FormControls";
import { FileTrashPage } from "../features/files/FileTrashPage";
import { FileUploadQueuePage } from "../features/files/FileUploadQueuePage";
import { fileSizeSortValue, filesPagePreset } from "../features/files/model";
import type { FileRecord, TrashFileRecord } from "../features/files/types";
import { initialFileRecords } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import { currentClock } from "../utils/time";

function FilesModule({ page, notify, canManageTrash = true }: { page: PageKey; notify: Notify; canManageTrash?: boolean }) {
  const [files, setFiles] = useState(initialFileRecords);
  const [, setTrashRows] = useState<TrashFileRecord[]>([]);

  if (page === "files-upload") return <FileUploadQueuePage page={page} notify={notify} />;
  if (page === "files-trash") return <FileTrashPage page={page} notify={notify} canManage={canManageTrash} />;
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
    if (row.type === "文件夹") notify("文件夹删除已加入回收站，请在回收站确认恢复或清理", "warning");
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
            <div><strong>确认移动这个{drawer.file.type === "文件夹" ? "文件夹" : "文件"}？</strong><p>项目将保留在回收站 7 天，期间仍可恢复。</p></div>
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
              {row.type === "文件夹" ? <button className="module-row-link" type="button" onClick={() => setCurrentPath(`${currentPath === "/" ? "" : currentPath}/${row.name}`)}><Folder size={15} /> <b>{row.name}</b></button> : <span className="module-card-title"><FileBox size={15} /><b>{row.name}</b></span>}
              <span className="pill blue">{row.type}</span>
            </div>
            <code className="module-card-code">{currentPath}</code>
            <div className="module-card-meta"><span><b>大小</b><em>{row.size}</em></span><span><b>修改</b><em>{row.modified}</em></span><span><b>所有者</b><em>{row.owner}</em></span><span><b>路径</b><em>{row.path}</em></span></div>
            <div className="module-card-footer"><div className="table-actions actions-2"><button type="button" aria-label={`重命名 ${row.name}`} onClick={() => { setDraftName(row.name); setDrawer({ type: "rename", file: row }); }}><Pencil size={14} /> 重命名</button><button type="button" aria-label={`删除 ${row.name} 到回收站`} onClick={() => setDrawer({ type: "delete", file: row })}><Trash2 size={14} /> 删除</button></div></div>
          </>
        )}
      />
    </ModulePageShell>
  );
}

export { FileTrashPage, FileUploadQueuePage, FilesModule, FilesPage };
