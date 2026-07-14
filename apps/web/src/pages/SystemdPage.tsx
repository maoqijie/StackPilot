import type { SystemdJournalPayload, SystemdUnit, SystemdUnitAction } from "@stackpilot/contracts";
import {
  CheckCircle2, CircleAlert, CircleOff, CirclePause, CircleX, Clock3, KeyRound,
  MemoryStick, Play, RotateCcw, ScrollText, ServerCog, Square, TriangleAlert,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchSystemdJournal, fetchSystemdUnits, mutateSystemdUnit } from "../api/systemdApi";
import { reauthenticate } from "../api/identityApi";
import { systemdPagePreset } from "../app/pagePresets";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { formatBytes, systemdStatusMeta } from "../features/services/model";
import { usePollingResource } from "../hooks/usePollingResource";
import type { Notify, PageKey } from "../types/app";
import { formatBackendDateTime } from "../utils/time";

type PendingServiceAction = { action: SystemdUnitAction; serviceId: string; idempotencyKey: string };

const serviceActionCopy: Record<SystemdUnitAction, { title: string; confirm: string }> = {
  start: { title: "确认启动服务", confirm: "确认启动" },
  stop: { title: "确认停止服务", confirm: "确认停止" },
  restart: { title: "确认重启服务", confirm: "确认重启" },
};

function ServiceStatus({ row, nativeLabel = false }: { row: SystemdUnit; nativeLabel?: boolean }) {
  const status = systemdStatusMeta(row);
  return <span className={`systemd-status ${status.tone}`}>{row.state === "active" ? <CheckCircle2 size={14} /> : row.state === "failed" ? <CircleX size={14} /> : <CirclePause size={14} />}<span>{nativeLabel ? row.activeState : status.label}</span></span>;
}

function ServiceIdentity({ row }: { row: SystemdUnit }) {
  return <span className="systemd-service-identity"><ServerCog size={16} /><b className="systemd-service-name" title={row.name}>{row.name}</b></span>;
}

function ServiceActions({ row, canOperate, disabled, onAction, onLogs }: {
  row: SystemdUnit; canOperate: boolean; disabled?: boolean;
  onAction: (row: SystemdUnit, action: SystemdUnitAction) => void;
  onLogs?: (row: SystemdUnit, trigger: HTMLButtonElement) => void;
}) {
  const allowed = (action: SystemdUnitAction) => canOperate && row.availableActions.includes(action);
  return <span className="systemd-row-actions">
    {row.state !== "active" && allowed("start") && <button type="button" disabled={disabled} title="启动" aria-label={`启动服务 ${row.name}`} onClick={() => onAction(row, "start")}><Play size={15} /><span>启动</span></button>}
    {row.state === "active" && allowed("stop") && <button type="button" disabled={disabled} title="停止" aria-label={`停止服务 ${row.name}`} onClick={() => onAction(row, "stop")}><Square size={14} /><span>停止</span></button>}
    {allowed("restart") && <button type="button" disabled={disabled} title="重启" aria-label={`重启服务 ${row.name}`} onClick={() => onAction(row, "restart")}><RotateCcw size={15} /><span>重启</span></button>}
    {onLogs && <button type="button" disabled={disabled} title="日志详情" aria-label={`查看服务 ${row.name} 日志`} onClick={(event) => onLogs(row, event.currentTarget)}><ScrollText size={15} /><span>日志</span></button>}
  </span>;
}

function ServiceJournal({ row, journal, loading, error }: { row: SystemdUnit; journal: SystemdJournalPayload | null; loading: boolean; error: string | null }) {
  return <div className="systemd-journal" role="log" aria-label={`${row.name} journal 摘要`}>
    {loading && <p><span>正在读取服务日志...</span></p>}
    {error && <p><span>{error}</span></p>}
    {!loading && !error && !journal?.entries.length && <p><span>当前没有可展示的服务日志</span></p>}
    {journal?.entries.map((entry, index) => <p key={`${entry.timestamp}-${index}`}><time title={formatBackendDateTime(entry.timestamp)}>{new Date(entry.timestamp).toLocaleTimeString("zh-CN", { hour12: false })}</time><span>{entry.message}</span></p>)}
  </div>;
}

function SystemdPage({ page, notify, canOperate = true }: { page: PageKey; notify: Notify; canOperate?: boolean }) {
  const preset = systemdPagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [statusByPage, setStatusByPage] = useState<Record<string, string>>({});
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [journal, setJournal] = useState<SystemdJournalPayload | null>(null);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalError, setJournalError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingServiceAction | null>(null);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const logTriggerRef = useRef<HTMLButtonElement | null>(null);
  const journalRequestRef = useRef<AbortController | null>(null);
  const previousDrawerIdRef = useRef<string | null>(null);
  const { data, loading, error, backgroundError, retry, refresh } = usePollingResource(async (signal) => {
    const payload = await fetchSystemdUnits(signal);
    setDrawerId((current) => current && !payload.units.some((row) => row.id === current) ? null : current);
    return payload;
  });
  const rows = data?.units ?? [];
  const search = searchByPage[page] ?? preset.search;
  const statusFilter = statusByPage[page] ?? preset.status;
  const drawer = drawerId ? rows.find((row) => row.id === drawerId) ?? null : null;
  const pendingService = pendingAction ? rows.find((row) => row.id === pendingAction.serviceId) ?? null : null;
  const filteredRows = rows.filter((row) => (!search.trim() || `${row.name} ${row.description} ${row.host}`.toLowerCase().includes(search.trim().toLowerCase())) && (statusFilter === "全部" || row.state === statusFilter));

  useEffect(() => () => journalRequestRef.current?.abort(), []);

  useLayoutEffect(() => {
    const previousDrawerId = previousDrawerIdRef.current; previousDrawerIdRef.current = drawerId;
    if (!previousDrawerId || drawerId || pendingAction) return;
    const trigger = logTriggerRef.current; logTriggerRef.current = null;
    if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
  }, [drawerId, pendingAction]);

  const openLogs = (row: SystemdUnit, trigger: HTMLButtonElement) => {
    journalRequestRef.current?.abort();
    const controller = new AbortController(); journalRequestRef.current = controller;
    logTriggerRef.current = trigger; setDrawerId(row.id); setJournal(null); setJournalError(null); setJournalLoading(true);
    void fetchSystemdJournal(row.name, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setJournal(value); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setJournalError(caught instanceof Error ? caught.message : "日志读取失败"); })
      .finally(() => { if (journalRequestRef.current === controller) { journalRequestRef.current = null; setJournalLoading(false); } });
  };
  const closeLogs = () => { journalRequestRef.current?.abort(); journalRequestRef.current = null; setJournalLoading(false); setDrawerId(null); };
  const requestServiceAction = (row: SystemdUnit, action: SystemdUnitAction) => {
    if (!row.availableActions.includes(action)) return;
    if (drawerId === row.id) setDrawerId(null);
    setPendingAction({ action, serviceId: row.id, idempotencyKey: crypto.randomUUID() }); setPassword(""); setMutationError(null);
  };
  const confirmServiceAction = async () => {
    if (!pendingAction || !pendingService || !password) return;
    setSubmitting(true); setMutationError(null);
    try {
      const proof = await reauthenticate(password);
      const result = await mutateSystemdUnit(pendingService.name, pendingAction.action, proof.proof, pendingAction.idempotencyKey);
      notify(result.message, result.tone); setPendingAction(null); setPassword(""); await refresh();
    } catch (caught) { setMutationError(caught instanceof Error ? caught.message : "systemd 操作失败"); }
    finally { setSubmitting(false); }
  };
  const drawerActions = drawer ? <ServiceActions row={drawer} canOperate={canOperate} disabled={submitting} onAction={requestServiceAction} /> : undefined;
  const pendingCopy = pendingAction ? serviceActionCopy[pendingAction.action] : null;
  const collectedAt = data ? formatBackendDateTime(data.collectedAt) : "等待采集";

  return <ModulePageShell title={resolvePageMeta(page).title} subtitle={`${preset.subtitle} · ${data ? `采集于 ${collectedAt}` : "正在连接服务管理后端"}`} page={page} className="systemd-page" sideModal
    filters={<><ModuleSearch value={search} placeholder="搜索服务或主机" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="状态" value={statusFilter} options={["全部", "active", "failed", "inactive"]} onChange={(value) => setStatusByPage((current) => ({ ...current, [page]: value }))} /></>}
    metrics={<><MetricTile icon={CheckCircle2} label="运行中" value={data ? `${rows.filter((row) => row.state === "active").length}` : "暂不可用"} tone="green" /><MetricTile icon={TriangleAlert} label="故障" value={data ? `${rows.filter((row) => row.state === "failed").length}` : "暂不可用"} tone="red" /><MetricTile icon={CircleOff} label="未运行" value={data ? `${rows.filter((row) => row.state === "inactive").length}` : "暂不可用"} tone="gray" /></>}
    side={drawer && <DetailDrawer title={preset.mode === "logs" ? "服务日志详情" : drawer.name} subtitle={`${drawer.name} · ${drawer.host} · ${systemdStatusMeta(drawer).label}`} className={`systemd-service-drawer ${preset.mode === "logs" ? "systemd-log-drawer" : ""}`} modal onClose={closeLogs} actions={drawerActions}>
      <div className="systemd-drawer-content"><section className={`systemd-detail-summary ${systemdStatusMeta(drawer).tone}`} aria-label="服务当前状态"><ServiceStatus row={drawer} /><p>{drawer.description} · {drawer.activeState}/{drawer.subState}</p></section>
        <dl className="systemd-detail-grid"><div><dt><ServerCog size={15} />主机</dt><dd title={drawer.host}>{drawer.host}</dd></div><div><dt><MemoryStick size={15} />内存</dt><dd>{formatBytes(drawer.memoryBytes)}</dd></div><div><dt><RotateCcw size={15} />重启次数</dt><dd>{drawer.restarts}</dd></div><div><dt><Clock3 size={15} />状态变更</dt><dd>{formatBackendDateTime(drawer.stateChangedAt)}</dd></div></dl>
        <section className="systemd-drawer-journal"><header><span><ScrollText size={17} />journal 摘要</span><time>{journal ? formatBackendDateTime(journal.collectedAt) : "读取中"}</time></header><ServiceJournal row={drawer} journal={journal} loading={journalLoading} error={journalError} /></section>
      </div></DetailDrawer>}>
    {loading && !data && <span className="sr-only" role="status">正在读取 systemd 服务</span>}
    {error && !data && <div className="overview-error-state"><CircleAlert size={18} /><span>{error}</span><button type="button" onClick={() => void retry()}>重试</button></div>}
    {data && <p className="systemd-collection-note"><Clock3 size={15} />采集时间 {collectedAt}{backgroundError ? ` · 后台刷新失败，保留上次数据：${backgroundError}` : data.warnings[0] ? ` · ${data.warnings[0]}` : ""}</p>}
    <div className={`systemd-content ${preset.mode === "logs" ? "logs-mode" : ""}`}>
      {preset.mode === "logs" ? <section className="systemd-log-stream" aria-label="服务日志流"><header className="systemd-log-head"><span><ScrollText size={18} /><span><h2>服务日志索引</h2><em>{filteredRows.length} 个服务单元</em></span></span><time role="status" aria-label={`最新采集 ${collectedAt}`}><Clock3 size={14} />最新采集 {collectedAt}</time></header><div className="systemd-log-list">{filteredRows.map((row) => <article key={row.id}><header><ServiceStatus row={row} nativeLabel /><strong title={row.name}>{row.name}</strong><code title={row.host}>{row.host}</code></header><p className="systemd-log-hint">{row.description} · {row.activeState}/{row.subState}</p><button type="button" aria-label={`打开服务 ${row.name} 日志详情`} onClick={(event) => openLogs(row, event.currentTarget)}><ScrollText size={14} />查看日志</button></article>)}{!filteredRows.length && <p className="systemd-log-empty">{data ? "没有匹配的服务" : "正在连接服务管理后端"}</p>}</div></section> : <DataTable columns={[
        { key: "service", label: "服务", width: "160px", render: (row) => <ServiceIdentity row={row} /> }, { key: "host", label: "主机", width: "100px", render: (row) => <code className="systemd-hostname" title={row.host}>{row.host}</code> }, { key: "status", label: "状态", width: "90px", render: (row) => <ServiceStatus row={row} /> }, { key: "restarts", label: "重启次数", width: "72px", render: (row) => row.restarts }, { key: "memory", label: "内存", width: "82px", render: (row) => formatBytes(row.memoryBytes) }, { key: "updated", label: "状态变更", width: "132px", render: (row) => <time>{formatBackendDateTime(row.stateChangedAt)}</time> }, { key: "ops", label: "操作", width: "138px", render: (row) => <ServiceActions row={row} canOperate={canOperate} disabled={submitting} onAction={requestServiceAction} onLogs={openLogs} /> },
      ]} rows={filteredRows} emptyText={error ? "服务管理后端加载失败" : loading ? "正在读取 systemd 服务" : "没有匹配的服务，系统将继续自动采集"} getRowKey={(row) => row.id} mobileCard={(row) => <><div className="module-card-head"><ServiceIdentity row={row} /><ServiceStatus row={row} /></div><code className="module-card-code" title={row.host}>{row.host}</code><div className="module-card-meta"><span><b>重启</b><em>{row.restarts}</em></span><span><b>内存</b><em>{formatBytes(row.memoryBytes)}</em></span><span><b>变更</b><em>{formatBackendDateTime(row.stateChangedAt)}</em></span></div><div className="module-card-footer"><ServiceActions row={row} canOperate={canOperate} disabled={submitting} onAction={requestServiceAction} onLogs={openLogs} /></div></>} />}
    </div>
    {pendingAction && pendingService && pendingCopy && <ConfirmDialog className="systemd-action-confirm" title={pendingCopy.title} message={pendingAction.action === "stop" ? `停止 ${pendingService.name} 可能中断 ${pendingService.host} 上依赖该单元的请求。` : pendingAction.action === "restart" ? `将重启 ${pendingService.host} 上的 ${pendingService.name}，服务会短暂不可用。` : `将在 ${pendingService.host} 上启动 ${pendingService.name}。`} detail={`systemctl ${pendingAction.action} ${pendingService.name}`} confirmLabel={submitting ? "执行中..." : pendingCopy.confirm} confirmDisabled={!password || submitting} tone="warning" onClose={() => !submitting && setPendingAction(null)} onConfirm={() => void confirmServiceAction()}><label className="systemd-reauth-field"><span><KeyRound size={15} />当前密码</span><input data-confirm-initial autoFocus type="password" autoComplete="current-password" value={password} disabled={submitting} onChange={(event) => setPassword(event.target.value)} /></label>{mutationError && <p className="form-error" role="alert">{mutationError}</p>}</ConfirmDialog>}
  </ModulePageShell>;
}

export { SystemdPage };
