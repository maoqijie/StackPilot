import { CheckCircle2, Clock3, CloudOff, KeyRound, Lock, Plus, Shield } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { CreateFirewallRuleRequest, FirewallRule, Permission } from "@stackpilot/contracts";
import { createFirewallRule, deleteFirewallRule } from "../api/firewallApi";
import { reauthenticate } from "../api/identityApi";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine, FormSelectLine } from "../components/ui/FormControls";
import { FirewallOpenPortsPage } from "../features/firewall/FirewallOpenPortsPage";
import { useFirewallData } from "../features/firewall/useFirewallData";
import { firewallPagePreset, isValidFirewallSource } from "../features/firewall/validation";
import type { Notify, PageKey } from "../types/app";
import { formatBackendDateTime } from "../utils/time";
import { FirewallDenyPage } from "./FirewallDenyPage";

type FirewallDrawer =
  | { type: "create" }
  | { type: "detail"; ruleId: string }
  | { type: "delete"; ruleId: string }
  | null;

function FirewallRulesPage({ page, notify, permissions }: { page: PageKey; notify: Notify; permissions: Permission[] }) {
  const canRead = permissions.includes("firewall:read");
  const canOperate = permissions.includes("firewall:operate");
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [protocolByPage, setProtocolByPage] = useState<Record<string, string>>({});
  const [sourceByPage, setSourceByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<FirewallDrawer>(null);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const mutationKeyRef = useRef<string | null>(null);
  const [createAttempt, setCreateAttempt] = useState<CreateFirewallRuleRequest | null>(null);
  const [draft, setDraft] = useState({ name: "临时调试端口", port: "", protocol: "TCP", source: "10.0.0.0/8" });
  const [draftErrors, setDraftErrors] = useState<{ port?: string; source?: string }>({});
  const portInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);

  const reconcile = useCallback((payload: { rules: FirewallRule[] }) => {
    setDrawer((current) => {
      if (current?.type === "detail" || current?.type === "delete") {
        return payload.rules.some((row) => row.id === current.ruleId) ? current : null;
      }
      return current;
    });
  }, []);
  const { data, loading, error, backgroundError, retry, replaceData } = useFirewallData(canRead, reconcile);
  const rows = data?.rules ?? [];
  const preset = firewallPagePreset(page);
  const search = searchByPage[page] ?? preset.search;
  const protocolFilter = protocolByPage[page] ?? preset.protocol;
  const sourceFilter = sourceByPage[page] ?? preset.source;
  const selectedRule = drawer?.type === "detail" || drawer?.type === "delete"
    ? rows.find((row) => row.id === drawer.ruleId) ?? null
    : null;
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return (!query || `${row.name} ${row.port} ${row.source} ${row.action}`.toLowerCase().includes(query))
      && (protocolFilter === "全部" || row.protocol === protocolFilter)
      && (sourceFilter === "全部" || row.source === sourceFilter);
  });

  const openDrawer = (next: Exclude<FirewallDrawer, null>, trigger: HTMLElement) => {
    setDrawerTrigger(trigger);
    setMutationError(null);
    setPassword("");
    setCreateAttempt(null);
    mutationKeyRef.current = next.type === "create" || next.type === "delete" ? crypto.randomUUID() : null;
    setDrawer(next);
  };
  const closeDrawer = () => {
    if (busy) return;
    setDrawer(null);
    setPassword("");
    setMutationError(null);
    mutationKeyRef.current = null;
    setCreateAttempt(null);
  };
  const validateDraft = () => {
    const port = Number(draft.port.trim());
    const source = draft.source.trim();
    const next = {
      port: Number.isInteger(port) && port >= 1 && port <= 65_535 ? undefined : "端口必须是 1-65535 的整数",
      source: isValidFirewallSource(source) ? undefined : "来源需填写 IPv4、CIDR 或 0.0.0.0/0",
    };
    setDraftErrors(next);
    return next;
  };
  const addRule = async () => {
    const next = validateDraft();
    if (next.port || next.source) {
      notify("请修正防火墙规则表单", "danger");
      window.requestAnimationFrame(() => (next.port ? portInputRef : sourceInputRef).current?.focus());
      return;
    }
    setBusy(true);
    setMutationError(null);
    try {
      const proof = await reauthenticate(password);
      const idempotencyKey = mutationKeyRef.current ??= crypto.randomUUID();
      const request = createAttempt ?? {
        name: draft.name.trim() || `端口 ${draft.port}`,
        port: Number(draft.port),
        protocol: draft.protocol as "TCP" | "UDP",
        source: draft.source.trim(),
        idempotencyKey,
      };
      if (!createAttempt) setCreateAttempt(request);
      const result = await createFirewallRule(request, proof.proof);
      replaceData(result);
      notify(result.message, result.tone);
      setDrawer(null);
      setPassword("");
      mutationKeyRef.current = null;
      setCreateAttempt(null);
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : "新增防火墙规则失败");
    } finally {
      setBusy(false);
    }
  };
  const removeRule = async (row: FirewallRule) => {
    setBusy(true);
    setMutationError(null);
    try {
      const proof = await reauthenticate(password);
      const idempotencyKey = mutationKeyRef.current ??= crypto.randomUUID();
      const result = await deleteFirewallRule(row.id, idempotencyKey, proof.proof);
      replaceData(result);
      notify(result.message, result.tone);
      setDrawer(null);
      setPassword("");
      mutationKeyRef.current = null;
    } catch (caught) {
      setMutationError(caught instanceof Error ? caught.message : "删除防火墙规则失败");
    } finally {
      setBusy(false);
    }
  };

  if (!canRead) {
    return <ModulePageShell title={resolvePageMeta(page).title} subtitle="当前账号没有防火墙读取权限" page={page}>
      <div className="overview-error-state"><Lock size={18} /><span>无权读取主机防火墙数据</span></div>
    </ModulePageShell>;
  }

  const subtitle = loading ? "正在读取主机防火墙" : `${preset.subtitle} · ${data?.host ?? "本机"} · 后端采集于 ${formatBackendDateTime(data?.collectedAt)}`;
  const warningItems = [...(backgroundError ? [`后台刷新失败，保留上次数据：${backgroundError}`] : []), ...(data?.warnings ?? [])];
  const visibleWarnings = warningItems.length > 3 ? [...warningItems.slice(0, 2), `另有 ${warningItems.length - 2} 条防火墙提示`] : warningItems;
  const sourceOptions = [...new Set(["全部", ...(sourceFilter !== "全部" ? [sourceFilter] : []), ...rows.map((row) => row.source)])];
  const canChange = canOperate && data?.backendStatus === "active";
  const createLocked = createAttempt !== null;

  return <ModulePageShell
    title={resolvePageMeta(page).title}
    subtitle={subtitle}
    page={page}
    sideModal
    actions={canOperate ? <button className="primary" type="button" disabled={!canChange} title={!canChange ? "UFW 未启用，规则变更已锁定" : undefined} onClick={(event) => { setDraftErrors({}); openDrawer({ type: "create" }, event.currentTarget); }}><Plus size={15} /> 新增规则</button> : null}
    filters={<><ModuleSearch value={search} placeholder="搜索规则名、端口或来源" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="协议" value={protocolFilter} options={["全部", "TCP", "UDP", "ALL"]} onChange={(value) => setProtocolByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="来源" value={sourceFilter} options={sourceOptions} onChange={(value) => setSourceByPage((current) => ({ ...current, [page]: value }))} /></>}
    metrics={<><MetricTile icon={Shield} label="规则数" value={data ? `${rows.length}` : "暂不可用"} tone="blue" /><MetricTile icon={CheckCircle2} label="受管规则" value={data ? `${rows.filter((row) => row.managed).length}` : "暂不可用"} tone="green" /><MetricTile icon={Lock} label="UFW 状态" value={data?.backendStatus === "active" ? "已启用" : data?.backendStatus === "inactive" ? "未启用" : "不可用"} tone="orange" /></>}
    side={drawer?.type === "create" ? <DetailDrawer className="firewall-rule-modal" modal restoreFocusTarget={drawerTrigger} title="新增规则" subtitle="规则将写入当前主机 UFW" closeLabel="关闭新增规则" onClose={closeDrawer} actions={<><button className="ghost" type="button" disabled={busy} onClick={closeDrawer}>取消</button><button className="primary" type="button" disabled={busy || !password || !canChange} onClick={() => void addRule()}>{busy ? "提交中..." : "保存规则"}</button></>}>
      <FormLine label="规则名" value={draft.name} disabled={busy || createLocked} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
      <FormLine label="端口" required value={draft.port} inputRef={portInputRef} error={draftErrors.port} inputType="number" disabled={busy || createLocked} onChange={(value) => { setDraft((current) => ({ ...current, port: value })); setDraftErrors((current) => ({ ...current, port: undefined })); }} />
      <FormSelectLine label="协议" value={draft.protocol} options={["TCP", "UDP"]} disabled={busy || createLocked} onChange={(value) => setDraft((current) => ({ ...current, protocol: value }))} />
      <FormLine label="来源" required value={draft.source} inputRef={sourceInputRef} error={draftErrors.source} disabled={busy || createLocked} onChange={(value) => { setDraft((current) => ({ ...current, source: value })); setDraftErrors((current) => ({ ...current, source: undefined })); }} />
      <FormLine label="当前密码" required value={password} inputType="password" disabled={busy} onChange={setPassword} />
      {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
    </DetailDrawer> : drawer?.type === "detail" && selectedRule ? <DetailDrawer className="firewall-rule-drawer" modal restoreFocusTarget={drawerTrigger} title="规则详情" subtitle={`${selectedRule.port}/${selectedRule.protocol}`} closeLabel="关闭规则详情" onClose={closeDrawer}>
      <div className="detail-kv"><p><span>规则名</span><b>{selectedRule.name}</b></p><p><span>来源</span><b>{selectedRule.source}</b></p><p><span>目标</span><b>{selectedRule.target}</b></p><p><span>动作</span><b>{selectedRule.action} {selectedRule.direction}</b></p><p><span>归属</span><b>{selectedRule.managed ? "StackPilot 受管" : "系统规则（只读）"}</b></p></div>
    </DetailDrawer> : drawer?.type === "delete" && selectedRule ? <ConfirmDialog className="firewall-rule-delete-confirm" title="删除规则" message={`确定删除“${selectedRule.name}”吗？主机 UFW 将立即应用变更。`} detail={`${selectedRule.source} -> ${selectedRule.target} · ${selectedRule.port}/${selectedRule.protocol}`} confirmLabel={busy ? "删除中..." : "确认删除"} busy={busy} confirmDisabled={busy || !password || !canChange} onConfirm={() => void removeRule(selectedRule)} onClose={closeDrawer} restoreFocusTarget={drawerTrigger}>
      <label className="cert-reauth-field"><span><KeyRound size={15} />当前密码</span><input autoFocus type="password" autoComplete="current-password" disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {mutationError && <p className="form-error" role="alert">{mutationError}</p>}
    </ConfirmDialog> : null}
  >
    {error && !data && <div className="overview-error-state"><CloudOff size={18} /><span>{error}</span><button type="button" onClick={() => void retry()}>重试</button></div>}
    {visibleWarnings.map((warning) => <p className="database-collection-note" key={warning}><Clock3 size={15} />{warning}</p>)}
    <DataTable columns={[
      { key: "name", label: "规则", width: "190px", render: (row) => <button className="module-row-link" type="button" aria-label={`查看防火墙规则 ${row.name}`} onClick={(event) => openDrawer({ type: "detail", ruleId: row.id }, event.currentTarget)}><b>{row.name}</b></button> },
      { key: "port", label: "端口", width: "72px", render: (row) => row.port },
      { key: "protocol", label: "协议", width: "74px", render: (row) => <span className="pill blue">{row.protocol}</span> },
      { key: "action", label: "动作", width: "110px", render: (row) => <span className={`pill ${row.action === "ALLOW" ? "green" : row.action === "LIMIT" ? "orange" : "red"}`}>{row.action} {row.direction}</span> },
      { key: "source", label: "来源", render: (row) => row.source },
      { key: "target", label: "目标", render: (row) => row.target },
      { key: "managed", label: "归属", width: "72px", render: (row) => <span className={`pill ${row.managed ? "green" : "blue"}`}>{row.managed ? "受管" : "系统"}</span> },
      { key: "ops", label: "操作", width: "112px", render: (row) => <span className="table-actions firewall-rule-actions"><button type="button" aria-label={`查看防火墙规则 ${row.name} 详情`} onClick={(event) => openDrawer({ type: "detail", ruleId: row.id }, event.currentTarget)}>详情</button>{canChange && row.managed && <button className="firewall-rule-delete" type="button" aria-label={`删除防火墙规则 ${row.name}`} onClick={(event) => openDrawer({ type: "delete", ruleId: row.id }, event.currentTarget)}>删除</button>}</span> },
    ]} rows={filteredRows} emptyText={loading ? "正在读取真实防火墙规则" : error && !data ? "防火墙规则读取失败" : data?.backendStatus === "inactive" ? "UFW 当前未启用，没有生效规则" : data?.collectionStatus === "unavailable" ? "防火墙规则暂不可用" : "没有匹配的防火墙规则"} getRowKey={(row) => row.id} />
  </ModulePageShell>;
}

function FirewallPage({ page, notify, permissions = [] }: { page: PageKey; notify: Notify; permissions?: Permission[] }) {
  if (page === "firewall-open") return <FirewallOpenPortsPage permissions={permissions} />;
  if (page === "firewall-deny") return <FirewallDenyPage page={page} />;
  return <FirewallRulesPage page={page} notify={notify} permissions={permissions} />;
}

export { FirewallPage };
