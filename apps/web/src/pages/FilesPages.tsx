import { Activity, CheckCircle2, Clock3, CloudUpload, FileBox, Folder, Plus, RefreshCw, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch, PanelCard } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine } from "../components/ui/FormControls";
import { fileSizeSortValue, filesPagePreset } from "../features/files/model";
import type { FileRecord, FileUploadRecord, TrashFileRecord } from "../features/files/types";
import { initialFileRecords, initialFileUploads, initialTrashFiles } from "../mocks/demoData";
import type { Notify, PageKey, Tone } from "../types/app";
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
  const [drawer, setDrawer] = useState<{ type: "folder" | "rename"; file?: FileRecord } | null>(null);
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
        <DetailDrawer title="创建文件夹" subtitle={currentPath} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={createFolder}>创建</button></>}>
          <FormLine label="文件夹名" required value={draftName} onChange={setDraftName} />
        </DetailDrawer>
      ) : drawer?.type === "rename" && drawer.file ? (
        <DetailDrawer title="重命名" subtitle={drawer.file.name} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={renameFile}>保存</button></>}>
          <FormLine label="新名称" required value={draftName} onChange={setDraftName} />
        </DetailDrawer>
      ) : null}
    >
      <div className="file-breadcrumbs">
        <button type="button" disabled={currentPath === "/"} onClick={() => setCurrentPath(parentPath)}>上级</button>
        <button type="button" onClick={() => setCurrentPath("/")}>root</button>
        {crumbs.map((crumb, index) => {
          const nextPath = `/${crumbs.slice(0, index + 1).join("/")}`;
          return <button key={nextPath} type="button" className={nextPath === currentPath ? "active" : ""} onClick={() => setCurrentPath(nextPath)}>{crumb}</button>;
        })}
      </div>
      <DataTable
        columns={[
          { key: "name", label: "名称", width: "260px", render: (row) => row.type === "文件夹" ? <button className="file-link" type="button" onClick={() => setCurrentPath(`${currentPath === "/" ? "" : currentPath}/${row.name}`)}><Folder size={15} /> {row.name}</button> : <span><FileBox size={15} /> {row.name}</span> },
          { key: "type", label: "类型", width: "86px", render: (row) => <span className="pill blue">{row.type}</span> },
          { key: "size", label: "大小", sortValue: (row) => fileSizeSortValue(row), render: (row) => row.size },
          { key: "modified", label: "修改时间", render: (row) => row.modified },
          { key: "owner", label: "所有者", render: (row) => row.owner },
          { key: "ops", label: "操作", width: "170px", render: (row) => <span className="table-actions"><button type="button" aria-label={`重命名 ${row.name}`} onClick={() => { setDraftName(row.name); setDrawer({ type: "rename", file: row }); }}>重命名</button><button type="button" aria-label={`删除 ${row.name} 到回收站`} onClick={() => moveToTrash(row)}>删除</button></span> },
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
                <button type="button" aria-label={`重命名 ${row.name}`} onClick={() => { setDraftName(row.name); setDrawer({ type: "rename", file: row }); }}>重命名</button>
                <button type="button" aria-label={`删除 ${row.name} 到回收站`} onClick={() => moveToTrash(row)}>删除</button>
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
  const selected = uploads.find((row) => row.id === selectedId) ?? null;
  const filteredRows = uploads.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.name} ${row.targetPath} ${row.owner}`.toLowerCase().includes(query);
    return matchSearch && (statusFilter === "全部" || row.status === statusFilter);
  });
  const updateUpload = (id: string, patch: Partial<FileUploadRecord>) => {
    setUploads((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  };
  const addUpload = () => {
    const next: FileUploadRecord = {
      id: `upload-${Date.now()}`,
      name: `manual-upload-${uploads.length + 1}.zip`,
      targetPath: "/var/www/html/uploads",
      size: "24 MB",
      progress: 0,
      status: "等待",
      speed: "-",
      owner: "admin",
      startedAt: currentClock(),
    };
    setUploads((current) => [next, ...current]);
    setSelectedId(next.id);
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
  const statusTone = (status: FileUploadRecord["status"]): Tone => {
    if (status === "已完成") return "green";
    if (status === "失败") return "red";
    if (status === "上传中") return "blue";
    return "orange";
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle="独立上传队列视图，支持暂停、继续、重试、完成和取消本地上传任务。"
      page={page}
      viewContext={{
        eyebrow: "文件 / 上传队列",
        title: "上传队列",
        chips: [`任务 ${uploads.length}`, `上传中 ${uploads.filter((row) => row.status === "上传中").length}`, `失败 ${uploads.filter((row) => row.status === "失败").length}`],
      }}
      actions={<><button className="ghost" type="button" onClick={() => { setUploads((current) => current.filter((row) => row.status !== "已完成")); notify("已清理完成的上传记录", "info"); }}><Trash2 size={15} /> 清理完成</button><button className="primary" type="button" onClick={addUpload}><CloudUpload size={15} /> 添加上传</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索文件名、目标路径或上传人" onChange={setSearch} /><FieldSelect label="状态" value={statusFilter} options={["全部", "上传中", "等待", "已完成", "失败"]} onChange={setStatusFilter} /></>}
      metrics={<><MetricTile icon={CloudUpload} label="队列任务" value={`${uploads.length}`} tone="blue" /><MetricTile icon={Activity} label="上传中" value={`${uploads.filter((row) => row.status === "上传中").length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="已完成" value={`${uploads.filter((row) => row.status === "已完成").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${uploads.filter((row) => row.status === "失败").length}`} tone="red" /></>}
      side={selected && (
        <DetailDrawer
          title="上传详情"
          subtitle={selected.name}
          onClose={() => setSelectedId("")}
          autoFocus={false}
          actions={selected.status === "已完成"
            ? <button className="ghost" type="button" onClick={() => setSelectedId("")}>关闭</button>
            : <><button className="ghost" type="button" aria-label={`取消上传 ${selected.name}`} onClick={() => cancelUpload(selected)}>取消上传</button><button className="primary" type="button" aria-label={`完成上传 ${selected.name}`} onClick={() => completeUpload(selected)}>完成</button></>}
        >
          <div className="detail-kv upload-detail">
            <p><span>目标路径</span><b>{selected.targetPath}</b></p>
            <p><span>大小</span><b>{selected.size}</b></p>
            <p><span>状态</span><b>{selected.status}</b></p>
            <p><span>速度</span><b>{selected.speed}</b></p>
            <p><span>上传人</span><b>{selected.owner}</b></p>
            <p><span>开始时间</span><b>{selected.startedAt}</b></p>
            <div className="upload-progress-card"><span style={{ width: `${selected.progress}%` }} /><b>{selected.progress}%</b></div>
          </div>
        </DetailDrawer>
      )}
    >
      <div className="file-upload-workspace">
        <DataTable
          columns={[
            { key: "name", label: "文件", width: "230px", render: (row) => <button className="module-row-link" type="button" onClick={() => setSelectedId(row.id)}><FileBox size={15} /><b>{row.name}</b></button> },
            { key: "target", label: "目标路径", render: (row) => <code>{row.targetPath}</code> },
            { key: "size", label: "大小", width: "82px", render: (row) => row.size },
            { key: "progress", label: "进度", width: "150px", sortValue: (row) => row.progress, render: (row) => <span className="upload-progress-inline"><i style={{ width: `${row.progress}%` }} /><b>{row.progress}%</b></span> },
            { key: "status", label: "状态", width: "86px", render: (row) => <span className={`pill ${statusTone(row.status)}`}>{row.status}</span> },
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
              <div className="module-card-head">
                <button className="module-row-link" type="button" onClick={() => setSelectedId(row.id)}><FileBox size={15} /><b>{row.name}</b></button>
                <span className={`pill ${statusTone(row.status)}`}>{row.status}</span>
              </div>
              <code className="module-card-code">{row.targetPath}</code>
              <div className="module-card-meta">
                <span><b>大小</b><em>{row.size}</em></span>
                <span><b>进度</b><em>{row.progress}%</em></span>
                <span><b>速度</b><em>{row.speed}</em></span>
                <span><b>上传人</b><em>{row.owner}</em></span>
              </div>
              <div className="module-card-footer">
                <span className="upload-progress-inline"><i style={{ width: `${row.progress}%` }} /><b>{row.progress}%</b></span>
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
        <section className="upload-lane-list">
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
  const purgeFile = (row: TrashFileRecord) => {
    setTrashRows((current) => current.filter((item) => item.id !== row.id));
    if (selectedId === row.id) setSelectedId("");
    notify(`${row.name} 已永久删除`, "warning");
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle="独立回收站视图，支持按所有者筛选、查看删除原因、恢复文件和永久删除。"
      page={page}
      viewContext={{
        eyebrow: "文件 / 回收站",
        title: "回收站",
        chips: [`待清理 ${trashRows.length}`, `已恢复 ${restoredRows.length}`, "保留 7 天"],
      }}
      actions={<><button className="ghost" type="button" onClick={() => { setTrashRows([]); setSelectedId(""); notify("回收站已清空", "warning"); }}><Trash2 size={15} /> 清空回收站</button><button className="ghost" type="button" onClick={() => notify(`最近恢复记录：${restoredRows.length} 个`, "info")}><RefreshCw size={15} /> 查看恢复记录</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索文件、原路径、删除原因" onChange={setSearch} /><FieldSelect label="所有者" value={ownerFilter} options={ownerOptions} onChange={setOwnerFilter} /></>}
      metrics={<><MetricTile icon={Trash2} label="回收站文件" value={`${trashRows.length}`} tone="orange" /><MetricTile icon={RefreshCw} label="已恢复" value={`${restoredRows.length}`} tone="green" /><MetricTile icon={Clock3} label="保留策略" value="7天" tone="blue" /></>}
      side={selected && (
        <DetailDrawer title="删除详情" subtitle={selected.name} onClose={() => setSelectedId("")} autoFocus={false} actions={<><button className="ghost" type="button" aria-label={`永久删除 ${selected.name}`} onClick={() => purgeFile(selected)}>永久删除</button><button className="primary" type="button" aria-label={`恢复 ${selected.name}`} onClick={() => restoreFile(selected)}>恢复</button></>}>
          <div className="detail-kv">
            <p><span>原路径</span><b>{selected.originalPath}</b></p>
            <p><span>大小</span><b>{selected.size}</b></p>
            <p><span>删除时间</span><b>{selected.deletedAt}</b></p>
            <p><span>剩余保留</span><b>{selected.expiresIn}</b></p>
            <p><span>所有者</span><b>{selected.owner}</b></p>
            <p><span>删除原因</span><b>{selected.reason}</b></p>
          </div>
        </DetailDrawer>
      )}
    >
      <div className="file-trash-workspace">
        <DataTable
          columns={[
            { key: "name", label: "文件", width: "220px", render: (row) => <button className="module-row-link" type="button" onClick={() => setSelectedId(row.id)}><Trash2 size={15} /><b>{row.name}</b></button> },
            { key: "path", label: "原路径", render: (row) => <code>{row.originalPath}</code> },
            { key: "size", label: "大小", width: "84px", render: (row) => row.size },
            { key: "deleted", label: "删除时间", render: (row) => row.deletedAt },
            { key: "expires", label: "剩余保留", width: "92px", render: (row) => <span className="pill orange">{row.expiresIn}</span> },
            { key: "owner", label: "所有者", width: "84px", render: (row) => row.owner },
            { key: "ops", label: "操作", width: "170px", render: (row) => <span className="table-actions"><button type="button" aria-label={`恢复 ${row.name}`} onClick={() => restoreFile(row)}>恢复</button><button type="button" aria-label={`永久删除 ${row.name}`} onClick={() => purgeFile(row)}>永久删除</button></span> },
          ]}
          rows={filteredRows}
          emptyText="回收站没有匹配文件"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <>
              <div className="module-card-head">
                <button className="module-row-link" type="button" onClick={() => setSelectedId(row.id)}><Trash2 size={15} /><b>{row.name}</b></button>
                <span className="pill orange">{row.expiresIn}</span>
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
                  <button type="button" aria-label={`永久删除 ${row.name}`} onClick={() => purgeFile(row)}>永久删除</button>
                </div>
              </div>
            </>
          )}
        />
        <section className="trash-restore-panel">
          <PanelCard title="最近恢复">
            <div className="restore-mini-list">
              {restoredRows.map((row) => <p key={row.id}><FileBox size={14} /><span>{row.name}</span><em>{row.path}</em></p>)}
              {restoredRows.length === 0 && <p className="module-empty-card">还没有恢复记录</p>}
            </div>
          </PanelCard>
        </section>
      </div>
    </ModulePageShell>
  );
}

export { FilesModule, FilesPage, FileUploadQueuePage, FileTrashPage };
