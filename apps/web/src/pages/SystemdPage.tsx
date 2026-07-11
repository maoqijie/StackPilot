import { CheckCircle2, Clock3, RefreshCw, Shield } from "lucide-react";
import { useState } from "react";
import { systemdPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import type { ServiceRecord } from "../features/services/types";
import { initialServiceRecords } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";

function SystemdPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialServiceRecords);
  const servicePreset = systemdPagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [statusByPage, setStatusByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<ServiceRecord | null>(null);
  const search = searchByPage[page] ?? servicePreset.search;
  const statusFilter = statusByPage[page] ?? servicePreset.status;
  const filteredRows = rows.filter((row) => (!search.trim() || `${row.name} ${row.host}`.toLowerCase().includes(search.trim().toLowerCase())) && (statusFilter === "全部" || row.status === statusFilter));
  const updateService = (id: string, patch: Partial<ServiceRecord>) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    setDrawer((current) => current?.id === id ? { ...current, ...patch } : current);
  };
  const startService = (row: ServiceRecord) => {
    updateService(row.id, { status: "active", handled: false, updated: "刚刚" });
    notify(`${row.name} 已启动`);
  };
  const stopService = (row: ServiceRecord) => {
    updateService(row.id, { status: "inactive", updated: "刚刚" });
    notify(`${row.name} 已停止`, "warning");
  };
  const restartService = (row: ServiceRecord) => {
    updateService(row.id, { status: "active", restarts: row.restarts + 1, handled: false, updated: "刚刚" });
    notify(`${row.name} 已重启`);
  };
  const markServiceHandled = (row: ServiceRecord) => {
    updateService(row.id, { handled: true, status: "inactive", updated: "刚刚" });
    notify(`${row.name} 已标记处理`);
  };
  const logRows = servicePreset.mode === "logs" ? rows : drawer ? [drawer] : [];
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={servicePreset.subtitle}
      page={page}
      actions={<button className="ghost" type="button" onClick={() => { setRows((current) => current.map((row) => ({ ...row, updated: "刚刚" }))); notify("服务状态已刷新", "info"); }}><RefreshCw size={15} /> 刷新</button>}
      filters={<><ModuleSearch value={search} placeholder="搜索服务或主机" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="状态" value={statusFilter} options={["全部", "active", "failed", "inactive"]} onChange={(value) => setStatusByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={<><MetricTile icon={CheckCircle2} label="active" value={`${rows.filter((row) => row.status === "active").length}`} tone="green" /><MetricTile icon={Shield} label="failed" value={`${rows.filter((row) => row.status === "failed").length}`} tone="red" /><MetricTile icon={Clock3} label="inactive" value={`${rows.filter((row) => row.status === "inactive").length}`} tone="gray" /></>}
      side={drawer && (
        <DetailDrawer title="服务日志" subtitle={drawer.name} onClose={() => setDrawer(null)} autoFocus={servicePreset.mode !== "logs"}>
          <div className="terminal-log compact-log">
            <p>systemd[1]: {drawer.status === "inactive" ? `Stopped ${drawer.name}` : drawer.status === "failed" ? `${drawer.name} entered failed state` : `Started ${drawer.name}`}</p>
            <p>{drawer.status === "failed" ? "exit-code=1 failed with result 'timeout'" : drawer.status === "inactive" ? "inactive/dead after operator action" : "status=0/SUCCESS"}</p>
            <p>memory current: {drawer.memory}</p>
          </div>
        </DetailDrawer>
      )}
    >
      <div className={`systemd-content ${servicePreset.mode === "logs" ? "logs-mode" : ""}`}>
        {servicePreset.mode === "logs" && (
          <div className="systemd-log-stream">
            {logRows.map((row) => (
              <article key={row.id}>
                <header><StatusLight tone={row.status === "failed" ? "red" : row.status === "active" ? "green" : "gray"} /> <strong>{row.name}</strong><span>{row.host}</span></header>
                <p>systemd[1]: {row.status === "inactive" ? `Stopped ${row.name}` : row.status === "failed" ? "service entered failed state" : `Started ${row.name}`}</p>
                <p>{row.status === "failed" ? "exit-code=1 failed with result 'timeout'" : row.status === "inactive" ? "inactive/dead after operator action" : "status=0/SUCCESS"}</p>
                <p>memory current: {row.memory} · restarts: {row.restarts}</p>
                <button type="button" aria-label={`打开服务 ${row.name} 日志详情`} onClick={() => setDrawer(row)}>打开详情</button>
              </article>
            ))}
          </div>
        )}
        <DataTable
          columns={[
            { key: "service", label: "服务", width: "220px", render: (row) => <><StatusLight tone={row.status === "active" ? "green" : row.status === "failed" ? "red" : "gray"} /> <b>{row.name}</b></> },
            { key: "host", label: "主机", render: (row) => row.host },
            { key: "status", label: "状态", render: (row) => <span className={`pill ${row.status === "active" ? "green" : row.status === "failed" ? "red" : "blue"}`}>{row.handled ? "已处理" : row.status}</span> },
            { key: "restarts", label: "重启次数", render: (row) => row.restarts },
            { key: "memory", label: "内存", render: (row) => row.memory },
            { key: "updated", label: "最近更新", render: (row) => row.updated },
            { key: "ops", label: "操作", width: "280px", render: (row) => <span className="table-actions"><button type="button" aria-label={`启动服务 ${row.name}`} onClick={() => startService(row)}>启动</button><button type="button" aria-label={`停止服务 ${row.name}`} onClick={() => stopService(row)}>停止</button><button type="button" aria-label={`重启服务 ${row.name}`} onClick={() => restartService(row)}>重启</button><button type="button" aria-label={`查看服务 ${row.name} 日志`} onClick={() => setDrawer(row)}>日志</button>{row.status === "failed" && <button type="button" aria-label={`标记服务 ${row.name} 已处理`} onClick={() => markServiceHandled(row)}>处理</button>}</span> },
          ]}
          rows={filteredRows}
          emptyText="没有匹配的服务"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <>
              <div className="module-card-head">
                <span className="module-card-title"><StatusLight tone={row.status === "active" ? "green" : row.status === "failed" ? "red" : "gray"} /><b>{row.name}</b></span>
                <span className={`pill ${row.status === "active" ? "green" : row.status === "failed" ? "red" : "blue"}`}>{row.handled ? "已处理" : row.status}</span>
              </div>
              <code className="module-card-code">{row.host}</code>
              <div className="module-card-meta">
                <span><b>重启</b><em>{row.restarts}</em></span>
                <span><b>内存</b><em>{row.memory}</em></span>
                <span><b>更新</b><em>{row.updated}</em></span>
                <span><b>状态</b><em>{row.handled ? "已处理" : row.status}</em></span>
              </div>
              <div className="module-card-footer">
                <div className={`table-actions ${row.status === "failed" ? "actions-5" : "actions-4"}`}>
                  <button type="button" aria-label={`启动服务 ${row.name}`} onClick={() => startService(row)}>启动</button>
                  <button type="button" aria-label={`停止服务 ${row.name}`} onClick={() => stopService(row)}>停止</button>
                  <button type="button" aria-label={`重启服务 ${row.name}`} onClick={() => restartService(row)}>重启</button>
                  <button type="button" aria-label={`查看服务 ${row.name} 日志`} onClick={() => setDrawer(row)}>日志</button>
                  {row.status === "failed" && <button type="button" aria-label={`标记服务 ${row.name} 已处理`} onClick={() => markServiceHandled(row)}>处理</button>}
                </div>
              </div>
            </>
          )}
        />
      </div>
    </ModulePageShell>
  );
}

export { SystemdPage };
