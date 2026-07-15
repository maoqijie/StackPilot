import type { FirewallRule, Permission } from "@stackpilot/contracts";
import { CheckCircle2, Clock3, CloudOff, Lock, Plus, Shield } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFirewallRule, deleteFirewallRule } from "../api/firewallApi";
import { reauthenticate } from "../api/identityApi";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine, FormSelectLine } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import { FirewallOpenPortsPage } from "../features/firewall/FirewallOpenPortsPage";
import { useFirewallRules } from "../features/firewall/useFirewallRules";
import { firewallPagePreset, isValidFirewallSource } from "../features/firewall/validation";
import type { Notify, PageKey } from "../types/app";
import { formatBackendDateTime } from "../utils/time";
import { FirewallDenyPage } from "./FirewallDenyPage";

type Drawer = { type: "create" } | { type: "detail" | "delete"; ruleId: string } | null;
type Props = { page: PageKey; notify: Notify; permissions?: Permission[] };

function FirewallRulesPage({ page, notify, permissions = [] }: Props) {
  const preset = firewallPagePreset(page); const resource = useFirewallRules(); const rows = useMemo(() => resource.data?.rules ?? [], [resource.data]);
  const canOperate = permissions.includes("firewall:operate"); const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [protocolByPage, setProtocolByPage] = useState<Record<string, string>>({}); const [sourceByPage, setSourceByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<Drawer>(null); const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const [password, setPassword] = useState(""); const [submitting, setSubmitting] = useState(false); const [mutationError, setMutationError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "临时调试端口", port: "", protocol: "TCP", source: "10.0.0.0/8" });
  const [draftErrors, setDraftErrors] = useState<{ port?: string; source?: string }>({}); const portInputRef = useRef<HTMLInputElement>(null); const sourceInputRef = useRef<HTMLInputElement>(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const search = searchByPage[page] ?? preset.search; const protocolFilter = protocolByPage[page] ?? preset.protocol; const sourceFilter = sourceByPage[page] ?? preset.source;
  const selectedRule = drawer && drawer.type !== "create" ? rows.find((row) => row.id === drawer.ruleId) ?? null : null;
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase(); const protocol = row.protocol?.toUpperCase() ?? "ANY";
    return (!query || `${row.name} ${row.port} ${row.source} ${resource.data?.host ?? ""}`.toLowerCase().includes(query))
      && (protocolFilter === "全部" || protocol === protocolFilter) && (sourceFilter === "全部" || row.source === sourceFilter);
  });
  const open = (next: Exclude<Drawer, null>, trigger: HTMLElement) => { idempotencyKeyRef.current = crypto.randomUUID(); setDrawerTrigger(trigger); setMutationError(null); setPassword(""); setDrawer(next); };
  useEffect(() => { if (drawer && drawer.type !== "create" && resource.data && !rows.some((row) => row.id === drawer.ruleId)) queueMicrotask(() => setDrawer(null)); }, [drawer, resource.data, rows]);

  const validate = () => {
    const port = Number(draft.port.trim()); const source = draft.source.trim();
    const errors = { port: Number.isInteger(port) && port >= 1 && port <= 65_535 ? undefined : "端口必须是 1-65535 的整数", source: isValidFirewallSource(source) ? undefined : "来源需填写 IP 地址或 CIDR" };
    setDraftErrors(errors); return errors;
  };
  const submitCreate = async () => {
    const errors = validate(); if (errors.port || errors.source) { notify("请修正防火墙规则表单", "danger"); window.requestAnimationFrame(() => (errors.port ? portInputRef : sourceInputRef).current?.focus()); return; }
    setSubmitting(true); setMutationError(null);
    try {
      const proof = (await reauthenticate(password)).proof;
      const result = await createFirewallRule({ name: draft.name.trim() || `端口 ${draft.port}`, port: Number(draft.port), protocol: draft.protocol.toLowerCase() as "tcp" | "udp", source: draft.source.trim(), idempotencyKey: idempotencyKeyRef.current }, proof);
      setDrawer(null); setPassword(""); notify(result.message, result.tone); await resource.refresh();
    } catch (error) { setMutationError(error instanceof Error ? error.message : "防火墙规则创建失败"); } finally { setSubmitting(false); }
  };
  const submitDelete = async (rule: FirewallRule) => {
    setSubmitting(true); setMutationError(null);
    try {
      const proof = (await reauthenticate(password)).proof;
      const result = await deleteFirewallRule(rule.id, { version: rule.version, idempotencyKey: idempotencyKeyRef.current }, proof);
      setDrawer(null); setPassword(""); notify(result.message, result.tone); await resource.refresh();
    } catch (error) { setMutationError(error instanceof Error ? error.message : "防火墙规则删除失败"); } finally { setSubmitting(false); }
  };

  const collectionMessage = resource.backgroundError ? `后台刷新失败，保留上次数据：${resource.backgroundError}` : resource.data?.warnings[0] ?? "数据来自本机 UFW 实际规则";
  return <ModulePageShell title={resolvePageMeta(page).title} subtitle={preset.subtitle} page={page} sideModal
    actions={canOperate && <button className="primary" type="button" disabled={!resource.data?.active} title={resource.data?.active ? undefined : "UFW 未启用"} onClick={(event) => { setDraftErrors({}); open({ type: "create" }, event.currentTarget); }}><Plus size={15} />新增规则</button>}
    filters={<><ModuleSearch value={search} placeholder="搜索规则、端口、来源或主机" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="协议" value={protocolFilter} options={["全部", "TCP", "UDP", "ANY"]} onChange={(value) => setProtocolByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="来源" value={sourceFilter} options={["全部", ...Array.from(new Set(rows.map((row) => row.source)))]} onChange={(value) => setSourceByPage((current) => ({ ...current, [page]: value }))} /></>}
    metrics={<><MetricTile icon={Shield} label="规则数" value={`${rows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="受管规则" value={`${rows.filter((row) => row.managed).length}`} tone="green" /><MetricTile icon={Lock} label="UFW 状态" value={resource.data?.active ? "已启用" : "未启用"} tone={resource.data?.active ? "green" : "orange"} /></>}
    side={drawer?.type === "create" ? <DetailDrawer className="firewall-rule-modal" modal restoreFocusTarget={drawerTrigger} title="新增放行规则" subtitle="规则将写入本机 UFW，且只允许删除 StackPilot 受管规则" closeLabel="关闭新增规则" onClose={() => { if (!submitting) setDrawer(null); }} actions={<><button className="ghost" type="button" disabled={submitting} onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" disabled={!password || submitting} onClick={() => void submitCreate()}>{submitting ? "提交中" : "保存规则"}</button></>}>
      <FormLine label="规则名" value={draft.name} disabled={submitting} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} /><FormLine label="端口" required value={draft.port} inputRef={portInputRef} error={draftErrors.port} inputType="number" disabled={submitting} onChange={(value) => { setDraft((current) => ({ ...current, port: value })); setDraftErrors((current) => ({ ...current, port: undefined })); }} /><FormSelectLine label="协议" value={draft.protocol} options={["TCP", "UDP"]} disabled={submitting} onChange={(value) => setDraft((current) => ({ ...current, protocol: value }))} /><FormLine label="来源" required value={draft.source} inputRef={sourceInputRef} error={draftErrors.source} disabled={submitting} onChange={(value) => { setDraft((current) => ({ ...current, source: value })); setDraftErrors((current) => ({ ...current, source: undefined })); }} /><FormLine label="当前密码" value={password} inputType="password" disabled={submitting} onChange={setPassword} />{mutationError && <p className="form-error" role="alert">{mutationError}</p>}
    </DetailDrawer> : drawer?.type === "detail" && selectedRule ? <DetailDrawer className="firewall-rule-drawer" modal restoreFocusTarget={drawerTrigger} title="规则详情" subtitle={`${selectedRule.port}/${selectedRule.protocol?.toUpperCase() ?? "ANY"}`} closeLabel="关闭规则详情" onClose={() => setDrawer(null)}><div className="detail-kv"><p><span>规则名</span><b>{selectedRule.name}</b></p><p><span>来源</span><b>{selectedRule.source}</b></p><p><span>目标</span><b>{selectedRule.destination}</b></p><p><span>动作</span><b>{selectedRule.action.toUpperCase()} {selectedRule.direction.toUpperCase()}</b></p><p><span>归属</span><b>{selectedRule.managed ? "StackPilot 受管" : "外部规则（只读）"}</b></p></div></DetailDrawer>
      : drawer?.type === "delete" && selectedRule ? <ConfirmDialog className="firewall-rule-delete-confirm" title="删除规则" message={`确定从 UFW 删除“${selectedRule.name}”吗？`} detail={`${selectedRule.source} -> ${selectedRule.destination} · ${selectedRule.port}/${selectedRule.protocol?.toUpperCase() ?? "ANY"}`} confirmLabel="确认删除" busy={submitting} confirmDisabled={!password} onConfirm={() => void submitDelete(selectedRule)} onClose={() => { if (!submitting) setDrawer(null); }} restoreFocusTarget={drawerTrigger}><label className="cert-reauth-field"><span>当前密码</span><input autoFocus type="password" autoComplete="current-password" value={password} disabled={submitting} onChange={(event) => setPassword(event.target.value)} /></label>{mutationError && <p className="form-error" role="alert">{mutationError}</p>}</ConfirmDialog> : null}>
    {resource.loading && !resource.data && <span className="sr-only" role="status">正在读取真实 UFW 规则</span>}{resource.error && !resource.data && <div className="overview-error-state"><CloudOff size={18} /><span>{resource.error}</span><button type="button" onClick={() => void resource.retry()}>重试</button></div>}
    <div className="firewall-freshness"><Clock3 size={18} /><div><strong>{resource.data?.host ?? "本机"} · 采集时间 {formatBackendDateTime(resource.data?.collectedAt)}</strong><span>{collectionMessage}</span></div></div>
    <DataTable pageSize={100} columns={[{ key: "name", label: "规则", width: "220px", render: (row) => <button className="module-row-link" type="button" aria-label={`查看防火墙规则 ${row.name}`} onClick={(event) => open({ type: "detail", ruleId: row.id }, event.currentTarget)}><StatusLight tone={resource.data?.active ? "green" : "gray"} /><b title={row.name}>{row.name}</b></button> }, { key: "port", label: "端口", render: (row) => row.port }, { key: "protocol", label: "协议", render: (row) => <span className="pill blue">{row.protocol?.toUpperCase() ?? "ANY"}</span> }, { key: "source", label: "来源", render: (row) => <code className="firewall-rule-value" title={row.source}>{row.source}</code> }, { key: "target", label: "主机", render: () => <span className="firewall-rule-value" title={resource.data?.host}>{resource.data?.host ?? "-"}</span> }, { key: "managed", label: "归属", render: (row) => <span className={`pill ${row.managed ? "green" : "blue"}`}>{row.managed ? "受管" : "外部"}</span> }, { key: "ops", label: "操作", width: "130px", render: (row) => <span className="table-actions firewall-rule-actions"><button type="button" onClick={(event) => open({ type: "detail", ruleId: row.id }, event.currentTarget)}>详情</button>{canOperate && <button className="firewall-rule-delete" type="button" disabled={!row.managed || !resource.data?.active} title={!row.managed ? "外部规则只能查看" : undefined} onClick={(event) => open({ type: "delete", ruleId: row.id }, event.currentTarget)}>删除</button>}</span> }]} rows={filteredRows} emptyText={resource.data?.collectionStatus === "unavailable" ? "UFW 数据暂不可用" : rows.length ? "没有匹配的防火墙规则" : "未发现 UFW 规则，系统将继续自动采集"} getRowKey={(row) => row.id} mobileCard={(row) => <><div className="module-card-head"><button className="module-row-link" type="button" onClick={(event) => open({ type: "detail", ruleId: row.id }, event.currentTarget)}><StatusLight tone={resource.data?.active ? "green" : "gray"} /><b>{row.name}</b></button><span className={`pill ${row.managed ? "green" : "blue"}`}>{row.managed ? "受管" : "外部"}</span></div><code className="module-card-code">{`${row.source} -> ${resource.data?.host ?? "本机"}`}</code><div className="module-card-meta"><span><b>端口</b><em>{row.port}</em></span><span><b>协议</b><em>{row.protocol?.toUpperCase() ?? "ANY"}</em></span><span><b>动作</b><em>{row.action.toUpperCase()}</em></span><span><b>IP</b><em>{row.ipVersion.toUpperCase()}</em></span></div><div className="module-card-footer"><div className="table-actions firewall-rule-actions"><button type="button" onClick={(event) => open({ type: "detail", ruleId: row.id }, event.currentTarget)}>详情</button>{canOperate && <button className="firewall-rule-delete" type="button" disabled={!row.managed || !resource.data?.active} onClick={(event) => open({ type: "delete", ruleId: row.id }, event.currentTarget)}>删除</button>}</div></div></>} />
  </ModulePageShell>;
}

function FirewallPage(props: Props) {
  return props.page === "firewall-open"
    ? <FirewallOpenPortsPage permissions={props.permissions ?? []} />
    : props.page === "firewall-deny"
      ? <FirewallDenyPage page={props.page} />
      : <FirewallRulesPage {...props} />;
}

export { FirewallPage };
