import { FileClock, PauseCircle, PlayCircle, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { querySiteLogs, updateSiteLifecycle } from "../../api/sitesApi";
import { reauthenticate } from "../../api/identityApi";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { DetailDrawer } from "../../components/ui/DetailDrawer";
import { formatBackendDateTime } from "../../utils/time";
import type { SiteRuntimeView } from "./types";
import { SiteOperationStatus } from "./SiteOperationStatus";
import { useSiteOperation } from "./useSiteOperation";

type LifecycleAction = "running" | "stopped" | "deleted" | "restored";
type Pending = { action: LifecycleAction; title: string; label: string; tone: "danger" | "warning" };

function SiteOperationsDrawer({ site, onClose, onChanged, canReadLogs, canOperate }: { site: SiteRuntimeView; onClose: () => void; onChanged: () => void; canReadLogs: boolean; canOperate: boolean }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [logConfirmation, setLogConfirmation] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const operationState = useSiteOperation();
  const managed = site.manageability === "managed" && !site.protected;

  const lifecycle = async () => {
    if (!pending) return; setSubmitting(true); setError(null);
    try {
      const proof = await reauthenticate(password);
      operationState.watch(await updateSiteLifecycle(site.id, { action: pending.action, version: site.version, idempotencyKey: crypto.randomUUID() }, proof.proof));
      setPending(null); setPassword(""); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "站点操作失败"); }
    finally { setSubmitting(false); }
  };

  const logs = async () => {
    setSubmitting(true); setError(null);
    try {
      const proof = await reauthenticate(password);
      operationState.watch(await querySiteLogs(site.id, { version: site.version, since: null, limit: 100, idempotencyKey: crypto.randomUUID() }, proof.proof));
      setLogConfirmation(false); setPassword("");
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "日志查询失败"); }
    finally { setSubmitting(false); }
  };

  const actions = site.desiredState === "deleted"
    ? [{ action: "restored" as const, title: "恢复站点", label: "恢复", tone: "warning" as const, Icon: RotateCcw }]
    : [
      site.desiredState === "stopped" ? { action: "running" as const, title: "启动站点", label: "启动", tone: "warning" as const, Icon: PlayCircle } : { action: "stopped" as const, title: "停止站点", label: "停止", tone: "warning" as const, Icon: PauseCircle },
      { action: "deleted" as const, title: "软删除站点", label: "软删除", tone: "danger" as const, Icon: Trash2 },
    ];

  return <>
    <DetailDrawer className="site-operations-drawer" title={site.domain} subtitle={`${site.host} · ${site.nodeId}`} onClose={onClose} actions={<>{canReadLogs && <button className="ghost" type="button" disabled={submitting} onClick={() => { setPassword(""); setError(null); setLogConfirmation(true); }}><FileClock size={15} /> 日志</button>}{canOperate && actions.map(({ Icon, ...action }) => <button className={action.tone === "danger" ? "trash-destructive" : "primary"} type="button" key={action.action} disabled={!managed || submitting} title={!managed ? site.protected ? "受保护站点不可操作" : site.managementReason ?? "站点不可纳管" : undefined} onClick={() => setPending(action)}><Icon size={15} /> {action.label}</button>)}</>}>
      <section className="runtime-detail-section"><header><FileClock size={17} /><strong>管理状态</strong></header><div className="detail-kv"><p><span>纳管状态</span><b>{site.manageability === "managed" ? "已纳管" : site.manageability === "unmanageable" ? "不可纳管" : "仅监控"}</b></p><p><span>期望状态</span><b>{site.desiredState ?? "未设置"}</b></p><p><span>资源版本</span><b>{site.version}</b></p><p><span>保护名单</span><b>{site.protected ? "是" : "否"}</b></p></div></section>
      {!managed && <p className="site-management-note">{site.protected ? "该站点位于运行时保护名单，仅允许监控。" : site.managementReason ?? "当前 Nginx 配置仅支持监控。"}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {operationState.operation && <><SiteOperationStatus operation={operationState.operation} error={operationState.error} />{operationState.operation.result?.logs.length ? <div className="site-log-list">{operationState.operation.result.logs.map((entry, index) => <code key={`${entry.timestamp}-${index}`}><span>{formatBackendDateTime(entry.timestamp)}</span><b>{entry.status}</b><em>{entry.method} {entry.path}</em><small>{entry.clientAddressMasked} · {entry.bytesSent} B</small></code>)}</div> : null}</>}
    </DetailDrawer>
    {logConfirmation && <ConfirmDialog title="查询站点日志" message="日志查询将由目标节点执行受控读取，并返回脱敏后的结构化记录。" confirmLabel={submitting ? "查询中..." : "确认查询"} tone="warning" confirmDisabled={!password || submitting} onClose={() => { setLogConfirmation(false); setError(null); setPassword(""); }} onConfirm={() => void logs()}><label className="cert-reauth-field"><span>当前密码</span><input data-confirm-initial autoFocus type="password" autoComplete="current-password" value={password} disabled={submitting} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}</ConfirmDialog>}
    {pending && <ConfirmDialog title={pending.title} message={pending.action === "deleted" ? "站点将返回 410，发布版本永久保留并可恢复。" : pending.action === "stopped" ? "站点停止后将返回 503。" : "确认提交该站点生命周期变更。"} confirmLabel={submitting ? "提交中..." : pending.label} tone={pending.tone} confirmDisabled={!password || submitting} onClose={() => { setPending(null); setError(null); }} onConfirm={() => void lifecycle()}><label className="cert-reauth-field"><span>当前密码</span><input autoFocus type="password" autoComplete="current-password" value={password} disabled={submitting} onChange={(event) => setPassword(event.target.value)} /></label></ConfirmDialog>}
  </>;
}

export { SiteOperationsDrawer };
