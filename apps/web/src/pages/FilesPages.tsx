import { Activity, CheckCircle2, ChevronRight, CloudUpload, FileBox, Folder, Pencil, Plus, Shield, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine } from "../components/ui/FormControls";
import { fileSizeSortValue, filesPagePreset } from "../features/files/model";
import { FileTrashPage } from "../features/files/FileTrashPage";
import { UploadProgress, UploadStatus } from "../features/files/UploadIndicators";
import { formatUploadSize } from "../features/files/format";
import type { FileRecord, FileUploadRecord, TrashFileRecord } from "../features/files/types";
import { initialFileRecords, initialFileUploads } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import { currentClock } from "../utils/time";

function FilesModule({ page, notify }: { page: PageKey; notify: Notify }) {
  const [files, setFiles] = useState(initialFileRecords);
  const [, setTrashRows] = useState<TrashFileRecord[]>([]);

  if (page === "files-upload") {
    return <FileUploadQueuePage page={page} notify={notify} />;
  }
  if (page === "files-trash") {
    return <FileTrashPage page={page} notify={notify} />;
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

function FileUploadQueuePage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [uploads, setUploads] = useState(initialFileUploads);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [targetPath, setTargetPath] = useState("/var/www/html/uploads");
  const [createError, setCreateError] = useState("");
  const selected = uploads.find((row) => row.id === selectedId) ?? null;
  const filteredRows = uploads.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.name} ${row.targetPath} ${row.owner}`.toLowerCase().includes(query);
    return matchSearch && (statusFilter === "全部" || row.status === statusFilter);
  });
  const updateUpload = (id: string, patch: Partial<FileUploadRecord>) => {
    setUploads((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  };
  const openCreateUpload = () => {
    setUploadFile(null);
    setTargetPath("/var/www/html/uploads");
    setCreateError("");
    setCreateOpen(true);
  };
  const addUpload = () => {
    if (!uploadFile) {
      setCreateError("请选择需要上传的文件");
      return;
    }
    const normalizedTargetPath = targetPath.trim();
    if (!normalizedTargetPath.startsWith("/")) {
      setCreateError("目标路径必须以 / 开头");
      return;
    }
    const next: FileUploadRecord = {
      id: `upload-${Date.now()}`,
      name: uploadFile.name,
      targetPath: normalizedTargetPath,
      size: formatUploadSize(uploadFile.size),
      progress: 0,
      status: "等待",
      speed: "-",
      owner: "admin",
      startedAt: currentClock(),
    };
    setUploads((current) => [next, ...current]);
    setSelectedId(next.id);
    setCreateOpen(false);
    notify(`${next.name} 已加入上传队列`, "info");
  };
  const cancelUpload = (row: FileUploadRecord) => {
    setUploads((current) => current.filter((item) => item.id !== row.id));
    if (selectedId === row.id) setSelectedId("");
    notify(`${row.name} 已从上传队列移除`, "warning");
  };
  const resumeUpload = (row: FileUploadRecord) => {
    if (row.status === "已完成") {
      notify(`${row.name} 已完成，无需继续上传`, "info");
      return;
    }
    updateUpload(row.id, { status: "上传中", speed: "18 MB/s", progress: Math.max(row.progress, 12) });
    notify(`${row.name} 已继续上传`);
  };
  const retryUpload = (row: FileUploadRecord) => {
    updateUpload(row.id, { status: "上传中", progress: Math.max(row.progress, 12), speed: "16 MB/s" });
    notify(`${row.name} 已重试`, "info");
  };
  const pauseUpload = (row: FileUploadRecord) => {
    updateUpload(row.id, { status: "等待", speed: "-" });
    notify(`${row.name} 已暂停`);
  };
  const completeUpload = (row: FileUploadRecord) => {
    updateUpload(row.id, { status: "已完成", progress: 100, speed: "完成" });
    notify(`${row.name} 已完成`);
  };
  return (
    <>
      <div className="upload-page-layer" inert={Boolean(createOpen || selected)} aria-hidden={createOpen || selected ? "true" : undefined}>
        <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle="独立上传队列视图，支持暂停、继续、重试、完成和取消本地上传任务。"
      page={page}
      viewContext={{
        eyebrow: "文件 / 上传队列",
        title: "上传队列",
        chips: [`任务 ${uploads.length}`, `上传中 ${uploads.filter((row) => row.status === "上传中").length}`, `失败 ${uploads.filter((row) => row.status === "失败").length}`],
      }}
      actions={<><button className="ghost" type="button" onClick={() => { setUploads((current) => current.filter((row) => row.status !== "已完成")); notify("已清理完成的上传记录", "info"); }}><Trash2 size={15} /> 清理完成</button><button className="primary" type="button" onClick={openCreateUpload}><CloudUpload size={15} /> 添加上传</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索文件名、目标路径或上传人" onChange={setSearch} /><FieldSelect label="状态" value={statusFilter} options={["全部", "上传中", "等待", "已完成", "失败"]} onChange={setStatusFilter} /></>}
      metrics={<><MetricTile icon={CloudUpload} label="队列任务" value={`${uploads.length}`} tone="blue" /><MetricTile icon={Activity} label="上传中" value={`${uploads.filter((row) => row.status === "上传中").length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="已完成" value={`${uploads.filter((row) => row.status === "已完成").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${uploads.filter((row) => row.status === "失败").length}`} tone="red" /></>}
    >
      <div className="file-upload-workspace">
        <DataTable
          columns={[
            { key: "name", label: "文件", width: "230px", render: (row) => <button className="module-row-link" type="button" title={row.name} onClick={() => setSelectedId(row.id)}><FileBox size={15} /><b>{row.name}</b></button> },
            { key: "target", label: "目标路径", render: (row) => <code title={row.targetPath}>{row.targetPath}</code> },
            { key: "size", label: "大小", width: "82px", render: (row) => row.size },
            { key: "progress", label: "进度", width: "150px", sortValue: (row) => row.progress, render: (row) => <UploadProgress value={row.progress} /> },
            { key: "status", label: "状态", width: "110px", render: (row) => <UploadStatus status={row.status} /> },
            { key: "speed", label: "速度", width: "86px", render: (row) => row.speed },
            { key: "owner", label: "上传人", width: "80px", render: (row) => row.owner },
            { key: "ops", label: "操作", width: "260px", render: (row) => (
              <span className="table-actions">
                {row.status === "上传中" && <button type="button" aria-label={`暂停上传 ${row.name}`} onClick={() => pauseUpload(row)}>暂停</button>}
                {row.status === "等待" && <button type="button" aria-label={`继续上传 ${row.name}`} onClick={() => resumeUpload(row)}>继续</button>}
                {row.status === "失败" && <button type="button" aria-label={`重试上传 ${row.name}`} onClick={() => retryUpload(row)}>重试</button>}
                {row.status !== "已完成" && <button type="button" aria-label={`完成上传 ${row.name}`} onClick={() => completeUpload(row)}>完成</button>}
                {row.status !== "已完成" ? <button type="button" aria-label={`取消上传 ${row.name}`} onClick={() => cancelUpload(row)}>取消</button> : <span className="green-text">已完成</span>}
              </span>
            ) },
          ]}
          rows={filteredRows}
          emptyText="没有匹配的上传任务"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <>
              <div className="module-card-head upload-mobile-head">
                <button className="module-row-link" type="button" title={row.name} onClick={() => setSelectedId(row.id)}><FileBox size={15} /><b>{row.name}</b></button>
                <UploadStatus status={row.status} />
              </div>
              <code className="module-card-code">{row.targetPath}</code>
              <div className="module-card-meta">
                <span><b>大小</b><em>{row.size}</em></span>
                <span><b>进度</b><em>{row.progress}%</em></span>
                <span><b>速度</b><em>{row.speed}</em></span>
                <span><b>上传人</b><em>{row.owner}</em></span>
              </div>
              <div className="module-card-footer upload-mobile-footer">
                <UploadProgress value={row.progress} />
                <div className={`table-actions ${row.status === "已完成" ? "actions-1" : "actions-3"}`}>
                  {row.status === "上传中" && <button type="button" aria-label={`暂停上传 ${row.name}`} onClick={() => pauseUpload(row)}>暂停</button>}
                  {row.status === "等待" && <button type="button" aria-label={`继续上传 ${row.name}`} onClick={() => resumeUpload(row)}>继续</button>}
                  {row.status === "失败" && <button type="button" aria-label={`重试上传 ${row.name}`} onClick={() => retryUpload(row)}>重试</button>}
                  {row.status !== "已完成" && <button type="button" aria-label={`完成上传 ${row.name}`} onClick={() => completeUpload(row)}>完成</button>}
                  {row.status !== "已完成" ? <button type="button" aria-label={`取消上传 ${row.name}`} onClick={() => cancelUpload(row)}>取消</button> : <span className="green-text">已完成</span>}
                </div>
              </div>
            </>
          )}
        />
        <section className="upload-lane-list" aria-label="上传阶段概览">
          {["准备上传", "传输中", "收尾校验"].map((label, index) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{index === 0 ? uploads.filter((row) => row.status === "等待").length : index === 1 ? uploads.filter((row) => row.status === "上传中").length : uploads.filter((row) => row.status === "已完成").length}</strong>
              <em>{index === 0 ? "等待资源" : index === 1 ? "网络传输" : "落盘完成"}</em>
            </article>
          ))}
        </section>
      </div>
        </ModulePageShell>
      </div>
      {createOpen && (
        <DetailDrawer
          title="添加上传"
          subtitle="选择本地文件并确认服务器目标路径"
          onClose={() => setCreateOpen(false)}
          className="upload-create-modal"
          modal
          actions={<><button className="ghost" type="button" onClick={() => setCreateOpen(false)}>取消</button><button className="primary" type="button" onClick={addUpload}><Upload size={15} /> 加入队列</button></>}
        >
          <div className="upload-create-form">
            <label className={`upload-file-field ${createError && !uploadFile ? "has-error" : ""}`} htmlFor="upload-local-file">
              <span>本地文件</span>
              <input
                id="upload-local-file"
                type="file"
                aria-label="本地文件"
                aria-invalid={Boolean(createError && !uploadFile)}
                aria-describedby={createError ? "upload-create-error" : undefined}
                onChange={(event) => {
                  setUploadFile(event.target.files?.[0] ?? null);
                  setCreateError("");
                }}
              />
              <small>{uploadFile ? `${uploadFile.name} · ${formatUploadSize(uploadFile.size)}` : "尚未选择文件"}</small>
            </label>
            <label className={`upload-target-field ${createError && uploadFile ? "has-error" : ""}`} htmlFor="upload-target-path">
              <span>目标路径</span>
              <input
                id="upload-target-path"
                value={targetPath}
                aria-label="目标路径"
                aria-invalid={Boolean(createError && uploadFile)}
                aria-describedby={createError ? "upload-create-error" : undefined}
                onChange={(event) => {
                  setTargetPath(event.target.value);
                  setCreateError("");
                }}
              />
              <small>使用服务器上的绝对路径</small>
            </label>
            {createError && <p className="upload-create-error" id="upload-create-error" role="alert">{createError}</p>}
          </div>
        </DetailDrawer>
      )}
      {selected && (
        <DetailDrawer
          title="上传详情"
          subtitle={selected.name}
          onClose={() => setSelectedId("")}
          className="upload-detail-drawer"
          modal
          actions={selected.status === "已完成"
            ? <button className="ghost" type="button" onClick={() => setSelectedId("")}>关闭</button>
            : <><button className="ghost" type="button" aria-label={`取消上传 ${selected.name}`} onClick={() => cancelUpload(selected)}>取消上传</button><button className="primary" type="button" aria-label={`完成上传 ${selected.name}`} onClick={() => completeUpload(selected)}>完成</button></>}
        >
          <div className="detail-kv upload-detail">
            <p><span>目标路径</span><b>{selected.targetPath}</b></p>
            <p><span>大小</span><b>{selected.size}</b></p>
            <p><span>状态</span><b><UploadStatus status={selected.status} /></b></p>
            <p><span>速度</span><b>{selected.speed}</b></p>
            <p><span>上传人</span><b>{selected.owner}</b></p>
            <p><span>开始时间</span><b>{selected.startedAt}</b></p>
            <UploadProgress value={selected.progress} detail />
          </div>
        </DetailDrawer>
      )}
    </>
  );
}

export { FilesModule, FilesPage, FileUploadQueuePage, FileTrashPage };
