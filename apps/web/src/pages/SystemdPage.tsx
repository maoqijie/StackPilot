import {
  CheckCircle2,
  CircleOff,
  CirclePause,
  CircleX,
  Clock3,
  MemoryStick,
  Play,
  RotateCcw,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Square,
  TriangleAlert,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { systemdPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import type { ServiceRecord } from "../features/services/types";
import { initialServiceRecords } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";

type ServiceAction = "start" | "stop" | "restart" | "handle";

type PendingServiceAction = {
  action: ServiceAction;
  serviceId: string;
};

const serviceActionCopy: Record<ServiceAction, { title: string; confirm: string; verb: string }> = {
  start: { title: "确认启动服务", confirm: "确认启动", verb: "启动" },
  stop: { title: "确认停止服务", confirm: "确认停止", verb: "停止" },
  restart: { title: "确认重启服务", confirm: "确认重启", verb: "重启" },
  handle: { title: "确认标记已处理", confirm: "确认标记", verb: "标记" },
};

function serviceStatusMeta(row: ServiceRecord) {
  if (row.status === "active") return { label: "运行中", tone: "green", icon: CheckCircle2 };
  if (row.status === "failed") return { label: row.handled ? "故障 · 已处理" : "故障", tone: "red", icon: CircleX };
  return { label: "未运行", tone: "gray", icon: CirclePause };
}

function ServiceStatus({ row, nativeLabel = false }: { row: ServiceRecord; nativeLabel?: boolean }) {
  const status = serviceStatusMeta(row);
  const Icon = status.icon;
  return <span className={`systemd-status ${status.tone}`}><Icon size={14} /><span>{nativeLabel ? row.status : status.label}</span></span>;
}

function ServiceIdentity({ row }: { row: ServiceRecord }) {
  return <span className="systemd-service-identity"><ServerCog size={16} /><b className="systemd-service-name" title={row.name}>{row.name}</b></span>;
}

function ServiceActions({ row, onAction, onLogs }: { row: ServiceRecord; onAction: (row: ServiceRecord, action: ServiceAction) => void; onLogs?: (row: ServiceRecord, trigger: HTMLButtonElement) => void }) {
  return (
    <span className="systemd-row-actions">
      {row.status === "inactive" && <button type="button" title="启动" aria-label={`启动服务 ${row.name}`} onClick={() => onAction(row, "start")}><Play size={15} /><span>启动</span></button>}
      {row.status === "active" && <button type="button" title="停止" aria-label={`停止服务 ${row.name}`} onClick={() => onAction(row, "stop")}><Square size={14} /><span>停止</span></button>}
      {row.status !== "inactive" && <button type="button" title="重启" aria-label={`重启服务 ${row.name}`} onClick={() => onAction(row, "restart")}><RotateCcw size={15} /><span>重启</span></button>}
      {onLogs && <button type="button" title="日志详情" aria-label={`查看服务 ${row.name} 日志`} onClick={(event) => onLogs(row, event.currentTarget)}><ScrollText size={15} /><span>日志</span></button>}
      {row.status === "failed" && !row.handled && <button type="button" title="标记已处理" aria-label={`标记服务 ${row.name} 已处理`} onClick={() => onAction(row, "handle")}><ShieldCheck size={15} /><span>处理</span></button>}
    </span>
  );
}

function ServiceJournal({ row }: { row: ServiceRecord }) {
  return (
    <div className="systemd-journal" role="log" aria-label={`${row.name} journal 摘要`}>
      <p><time>{row.updated}</time><span>systemd[1]: {row.status === "inactive" ? `Stopped ${row.name}` : row.status === "failed" ? `${row.name} entered failed state` : `Started ${row.name}`}</span></p>
      <p><time>{row.updated}</time><span>{row.status === "failed" ? "exit-code=1 failed with result 'timeout'" : row.status === "inactive" ? "inactive/dead after operator action" : "status=0/SUCCESS"}</span></p>
      <p><time>{row.updated}</time><span>memory current: {row.memory} · restarts: {row.restarts}</span></p>
    </div>
  );
}

function SystemdPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialServiceRecords);
  const servicePreset = systemdPagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [statusByPage, setStatusByPage] = useState<Record<string, string>>({});
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingServiceAction | null>(null);
  const logTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previousDrawerIdRef = useRef<string | null>(null);
  const search = searchByPage[page] ?? servicePreset.search;
  const statusFilter = statusByPage[page] ?? servicePreset.status;
  const drawer = drawerId ? rows.find((row) => row.id === drawerId) ?? null : null;
  const pendingService = pendingAction ? rows.find((row) => row.id === pendingAction.serviceId) ?? null : null;
  const filteredRows = rows.filter((row) => (!search.trim() || `${row.name} ${row.host}`.toLowerCase().includes(search.trim().toLowerCase())) && (statusFilter === "全部" || row.status === statusFilter));

  const updateService = (id: string, patch: Partial<ServiceRecord>) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const requestServiceAction = (row: ServiceRecord, action: ServiceAction) => {
    if (drawerId === row.id) setDrawerId(null);
    setPendingAction({ action, serviceId: row.id });
  };

  const confirmServiceAction = () => {
    if (!pendingAction || !pendingService) return;
    const { action } = pendingAction;
    if (action === "start") updateService(pendingService.id, { status: "active", handled: false, updated: "刚刚" });
    if (action === "stop") updateService(pendingService.id, { status: "inactive", handled: false, updated: "刚刚" });
    if (action === "restart") updateService(pendingService.id, { status: "active", restarts: pendingService.restarts + 1, handled: false, updated: "刚刚" });
    if (action === "handle") updateService(pendingService.id, { handled: true, updated: "刚刚" });
    const copy = serviceActionCopy[action];
    notify(action === "handle" ? `${pendingService.name} 已标记处理` : `${pendingService.name} 已${copy.verb}`, action === "stop" ? "warning" : "success");
    setPendingAction(null);
  };

  const openLogs = (row: ServiceRecord, trigger: HTMLButtonElement) => {
    logTriggerRef.current = trigger;
    setDrawerId(row.id);
  };
  useLayoutEffect(() => {
    const previousDrawerId = previousDrawerIdRef.current;
    previousDrawerIdRef.current = drawerId;
    if (!previousDrawerId || drawerId) return;
    if (pendingAction) {
      logTriggerRef.current = null;
      return;
    }
    const trigger = logTriggerRef.current;
    logTriggerRef.current = null;
    if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
  }, [drawerId, pendingAction]);
  const logRows = servicePreset.mode === "logs" ? filteredRows : drawer ? [drawer] : [];
  const drawerActions = drawer ? <ServiceActions row={drawer} onAction={requestServiceAction} /> : undefined;
  const pendingCopy = pendingAction ? serviceActionCopy[pendingAction.action] : null;

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={servicePreset.subtitle}
      page={page}
      className="systemd-page"
      sideModal
      filters={<><ModuleSearch value={search} placeholder="搜索服务或主机" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="状态" value={statusFilter} options={["全部", "active", "failed", "inactive"]} onChange={(value) => setStatusByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={<><MetricTile icon={CheckCircle2} label="运行中" value={`${rows.filter((row) => row.status === "active").length}`} tone="green" /><MetricTile icon={TriangleAlert} label="故障" value={`${rows.filter((row) => row.status === "failed").length}`} tone="red" /><MetricTile icon={CircleOff} label="未运行" value={`${rows.filter((row) => row.status === "inactive").length}`} tone="gray" /></>}
      side={drawer && (
        <DetailDrawer title={servicePreset.mode === "logs" ? "服务日志详情" : drawer.name} subtitle={`${drawer.name} · ${drawer.host} · ${serviceStatusMeta(drawer).label}`} className={`systemd-service-drawer ${servicePreset.mode === "logs" ? "systemd-log-drawer" : ""}`} modal onClose={() => setDrawerId(null)} actions={drawerActions}>
          <div className="systemd-drawer-content">
            <section className={`systemd-detail-summary ${serviceStatusMeta(drawer).tone}`} aria-label="服务当前状态">
              <ServiceStatus row={drawer} />
              <p>{drawer.status === "failed" ? "服务启动失败，请先检查 journal 摘要和重启次数。" : drawer.status === "inactive" ? "服务当前未运行，可确认影响后重新启动。" : "服务正在运行，当前状态正常。"}</p>
            </section>
            <dl className="systemd-detail-grid">
              <div><dt><ServerCog size={15} />主机</dt><dd title={drawer.host}>{drawer.host}</dd></div>
              <div><dt><MemoryStick size={15} />内存</dt><dd>{drawer.memory}</dd></div>
              <div><dt><RotateCcw size={15} />重启次数</dt><dd>{drawer.restarts}</dd></div>
              <div><dt><Clock3 size={15} />最近更新</dt><dd>{drawer.updated}</dd></div>
            </dl>
            <section className="systemd-drawer-journal">
              <header><span><ScrollText size={17} />journal 摘要</span><time>{drawer.updated}</time></header>
              <ServiceJournal row={drawer} />
            </section>
          </div>
        </DetailDrawer>
      )}
    >
      <div className={`systemd-content ${servicePreset.mode === "logs" ? "logs-mode" : ""}`}>
        {servicePreset.mode === "logs" && (
          <section className="systemd-log-stream" aria-label="服务日志流">
            <header className="systemd-log-head">
              <span><ScrollText size={18} /><span><h2>服务日志流</h2><em>{logRows.length} 个服务</em></span></span>
              <time role="status" aria-label={`最新采集 ${logRows[0]?.updated ?? "等待采集"}`}><Clock3 size={14} />最新采集 {logRows[0]?.updated ?? "等待采集"}</time>
            </header>
            <div className="systemd-log-list">
              {logRows.map((row) => (
                <article key={row.id}>
                  <header><ServiceStatus row={row} nativeLabel /><strong title={row.name}>{row.name}</strong><code title={row.host}>{row.host}</code></header>
                  <ServiceJournal row={row} />
                  <button type="button" aria-label={`打开服务 ${row.name} 日志详情`} onClick={(event) => openLogs(row, event.currentTarget)}><ScrollText size={14} />打开详情</button>
                </article>
              ))}
              {logRows.length === 0 && <p className="systemd-log-empty">没有匹配的服务日志</p>}
            </div>
          </section>
        )}
        {servicePreset.mode !== "logs" && <DataTable
          columns={[
            { key: "service", label: "服务", width: "126px", render: (row) => <ServiceIdentity row={row} /> },
            { key: "host", label: "主机", width: "84px", render: (row) => <code className="systemd-hostname" title={row.host}>{row.host}</code> },
            { key: "status", label: "状态", width: "80px", render: (row) => <ServiceStatus row={row} /> },
            { key: "restarts", label: "重启次数", width: "62px", render: (row) => row.restarts },
            { key: "memory", label: "内存", width: "60px", render: (row) => row.memory },
            { key: "updated", label: "最近更新", width: "70px", render: (row) => <time>{row.updated}</time> },
            { key: "ops", label: "操作", width: "138px", render: (row) => <ServiceActions row={row} onAction={requestServiceAction} onLogs={openLogs} /> },
          ]}
          rows={filteredRows}
          emptyText="没有匹配的服务"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <>
              <div className="module-card-head">
                <ServiceIdentity row={row} />
                <ServiceStatus row={row} />
              </div>
              <code className="module-card-code" title={row.host}>{row.host}</code>
              <div className="module-card-meta">
                <span><b>重启</b><em>{row.restarts}</em></span>
                <span><b>内存</b><em>{row.memory}</em></span>
                <span><b>更新</b><em>{row.updated}</em></span>
              </div>
              <div className="module-card-footer"><ServiceActions row={row} onAction={requestServiceAction} onLogs={openLogs} /></div>
            </>
          )}
        />}
      </div>
      {pendingAction && pendingService && pendingCopy && (
        <ConfirmDialog
          className="systemd-action-confirm"
          title={pendingCopy.title}
          message={pendingAction.action === "stop" ? `停止 ${pendingService.name} 可能中断 ${pendingService.host} 上依赖该单元的请求。` : pendingAction.action === "restart" ? `将重启 ${pendingService.host} 上的 ${pendingService.name}，服务会短暂不可用。` : pendingAction.action === "handle" ? `将保留 ${pendingService.name} 的故障状态和日志，并把本次告警标记为已处理。` : `将在 ${pendingService.host} 上启动 ${pendingService.name}。`}
          detail={pendingAction.action === "handle" ? `${pendingService.host} · ${pendingService.name}` : `systemctl ${pendingAction.action} ${pendingService.name}`}
          confirmLabel={pendingCopy.confirm}
          tone="warning"
          onClose={() => setPendingAction(null)}
          onConfirm={confirmServiceAction}
        />
      )}
    </ModulePageShell>
  );
}

export { SystemdPage };
