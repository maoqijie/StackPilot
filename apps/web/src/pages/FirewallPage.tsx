import { CheckCircle2, Lock, Plus, Shield } from "lucide-react";
import { useRef, useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine, FormSelectLine } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import type { FirewallRule } from "../features/firewall/types";
import { firewallPagePreset, isValidFirewallSource } from "../features/firewall/validation";
import { initialFirewallRules } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import { FirewallDenyPage } from "./FirewallDenyPage";

type FirewallDrawer =
  | { type: "create" }
  | { type: "detail"; ruleId: string }
  | { type: "delete"; ruleId: string }
  | null;

function FirewallRulesPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialFirewallRules);
  const firewallPreset = firewallPagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [protocolByPage, setProtocolByPage] = useState<Record<string, string>>({});
  const [sourceByPage, setSourceByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<FirewallDrawer>(null);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const [confirmTrigger, setConfirmTrigger] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState({ name: "临时调试端口", port: "", protocol: "TCP", source: "10.0.0.0/8" });
  const [draftErrors, setDraftErrors] = useState<{ port?: string; source?: string }>({});
  const portInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const search = searchByPage[page] ?? firewallPreset.search;
  const protocolFilter = protocolByPage[page] ?? firewallPreset.protocol;
  const sourceFilter = sourceByPage[page] ?? firewallPreset.source;
  const selectedRule = drawer?.type === "detail" || drawer?.type === "delete"
    ? rows.find((row) => row.id === drawer.ruleId) ?? null
    : null;

  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return (!query || `${row.name} ${row.port}`.toLowerCase().includes(query)) && (protocolFilter === "全部" || row.protocol === protocolFilter) && (sourceFilter === "全部" || row.source === sourceFilter);
  });
  const openDrawer = (next: Exclude<FirewallDrawer, null>, trigger: HTMLElement) => {
    setDrawerTrigger(trigger);
    setDrawer(next);
  };
  const validateFirewallDraft = () => {
    const port = Number(draft.port.trim());
    const source = draft.source.trim();
    const nextErrors = {
      port: Number.isInteger(port) && port >= 1 && port <= 65535 ? undefined : "端口必须是 1-65535 的整数",
      source: isValidFirewallSource(source) ? undefined : "来源需填写 IPv4、CIDR 或 0.0.0.0/0",
    };
    setDraftErrors(nextErrors);
    return nextErrors;
  };
  const addRule = () => {
    const nextErrors = validateFirewallDraft();
    if (nextErrors.port || nextErrors.source) {
      notify("请修正防火墙规则表单", "danger");
      window.requestAnimationFrame(() => (nextErrors.port ? portInputRef : sourceInputRef).current?.focus());
      return;
    }
    setRows((current) => [{ id: `fw-${Date.now()}`, name: draft.name.trim() || `端口 ${draft.port.trim()}`, port: draft.port.trim(), protocol: draft.protocol, source: draft.source.trim(), target: "全部主机", enabled: true }, ...current]);
    setDrawer(null);
    notify(`防火墙规则 ${draft.port}/${draft.protocol} 已新增`);
  };
  const toggleRule = (row: FirewallRule) => {
    setRows((current) => current.map((item) => item.id === row.id ? { ...item, enabled: !item.enabled } : item));
    notify(`${row.name} 已${row.enabled ? "禁用" : "启用"}`);
  };
  const deleteRule = (row: FirewallRule) => {
    setRows((current) => current.filter((item) => item.id !== row.id));
    setDrawer(null);
    notify(`${row.name} 已删除`, "warning");
  };
  const requestDeleteRule = (row: FirewallRule, trigger: HTMLElement) => {
    setConfirmTrigger(trigger);
    setDrawer({ type: "delete", ruleId: row.id });
  };
  const closeDeleteConfirmation = () => {
    setDrawer(null);
  };
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={firewallPreset.subtitle}
      page={page}
      sideModal
      actions={<button className="primary" type="button" onClick={(event) => { setDraftErrors({}); openDrawer({ type: "create" }, event.currentTarget); }}><Plus size={15} /> 新增规则</button>}
      filters={<><ModuleSearch value={search} placeholder="搜索规则名或端口" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="协议" value={protocolFilter} options={["全部", "TCP", "UDP"]} onChange={(value) => setProtocolByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="来源" value={sourceFilter} options={["全部", ...Array.from(new Set(rows.map((row) => row.source)))]} onChange={(value) => setSourceByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={<><MetricTile icon={Shield} label="规则数" value={`${rows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="启用" value={`${rows.filter((row) => row.enabled).length}`} tone="green" /><MetricTile icon={Lock} label="停用" value={`${rows.filter((row) => !row.enabled).length}`} tone="orange" /></>}
      side={drawer?.type === "create" ? (
        <DetailDrawer className="firewall-rule-modal" modal restoreFocusTarget={drawerTrigger} title="新增规则" subtitle="端口和来源会先在本地校验" closeLabel="关闭新增规则" onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={addRule}>保存规则</button></>}>
          <FormLine label="规则名" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
          <FormLine label="端口" required value={draft.port} inputRef={portInputRef} error={draftErrors.port} inputType="number" onChange={(value) => { setDraft((current) => ({ ...current, port: value })); setDraftErrors((current) => ({ ...current, port: undefined })); }} />
          <FormSelectLine label="协议" value={draft.protocol} options={["TCP", "UDP"]} onChange={(value) => setDraft((current) => ({ ...current, protocol: value }))} />
          <FormLine label="来源" required value={draft.source} inputRef={sourceInputRef} error={draftErrors.source} onChange={(value) => { setDraft((current) => ({ ...current, source: value })); setDraftErrors((current) => ({ ...current, source: undefined })); }} />
        </DetailDrawer>
      ) : drawer?.type === "detail" && selectedRule ? (
        <DetailDrawer className="firewall-rule-drawer" modal restoreFocusTarget={drawerTrigger} title="规则详情" subtitle={`${selectedRule.port}/${selectedRule.protocol}`} closeLabel="关闭规则详情" onClose={() => setDrawer(null)}>
          <div className="detail-kv">
            <p><span>规则名</span><b>{selectedRule.name}</b></p>
            <p><span>来源</span><b>{selectedRule.source}</b></p>
            <p><span>目标</span><b>{selectedRule.target}</b></p>
            <p><span>状态</span><b>{selectedRule.enabled ? "启用" : "停用"}</b></p>
          </div>
        </DetailDrawer>
      ) : drawer?.type === "delete" && selectedRule ? (
        <ConfirmDialog
          className="firewall-rule-delete-confirm"
          title="删除规则"
          message={`确定删除“${selectedRule.name}”吗？删除后该规则会立即从列表移除。`}
          detail={`${selectedRule.source} -> ${selectedRule.target} · ${selectedRule.port}/${selectedRule.protocol}`}
          confirmLabel="确认删除"
          onConfirm={() => deleteRule(selectedRule)}
          onClose={closeDeleteConfirmation}
          restoreFocusTarget={confirmTrigger}
        />
      ) : null}
    >
      <DataTable
        columns={[
          { key: "name", label: "规则", width: "220px", render: (row) => <button className="module-row-link" type="button" aria-label={`查看防火墙规则 ${row.name}`} onClick={(event) => openDrawer({ type: "detail", ruleId: row.id }, event.currentTarget)}><StatusLight tone={row.enabled ? "green" : "gray"} /> <b>{row.name}</b></button> },
          { key: "port", label: "端口", render: (row) => row.port },
          { key: "protocol", label: "协议", render: (row) => <span className="pill blue">{row.protocol}</span> },
          { key: "source", label: "来源", render: (row) => row.source },
          { key: "target", label: "目标", render: (row) => row.target },
          { key: "enabled", label: "状态", render: (row) => <span className={`pill ${row.enabled ? "green" : "blue"}`}>{row.enabled ? "启用" : "停用"}</span> },
          { key: "ops", label: "操作", width: "150px", render: (row) => <span className="table-actions firewall-rule-actions"><button type="button" aria-label={`${row.enabled ? "禁用" : "启用"}防火墙规则 ${row.name}`} onClick={() => toggleRule(row)}>{row.enabled ? "禁用" : "启用"}</button><button type="button" aria-label={`查看防火墙规则 ${row.name} 详情`} onClick={(event) => openDrawer({ type: "detail", ruleId: row.id }, event.currentTarget)}>详情</button><button className="firewall-rule-delete" type="button" aria-label={`删除防火墙规则 ${row.name}`} onClick={(event) => requestDeleteRule(row, event.currentTarget)}>删除</button></span> },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的防火墙规则"
        getRowKey={(row) => row.id}
        mobileCard={(row) => (
          <>
            <div className="module-card-head">
              <button className="module-row-link" type="button" aria-label={`查看防火墙规则 ${row.name}`} onClick={(event) => openDrawer({ type: "detail", ruleId: row.id }, event.currentTarget)}><StatusLight tone={row.enabled ? "green" : "gray"} /><b>{row.name}</b></button>
              <span className={`pill ${row.enabled ? "green" : "blue"}`}>{row.enabled ? "启用" : "停用"}</span>
            </div>
            <code className="module-card-code">{`${row.source} -> ${row.target}`}</code>
            <div className="module-card-meta">
              <span><b>端口</b><em>{row.port}</em></span>
              <span><b>协议</b><em>{row.protocol}</em></span>
              <span><b>来源</b><em>{row.source}</em></span>
              <span><b>目标</b><em>{row.target}</em></span>
            </div>
            <div className="module-card-footer">
              <div className="table-actions actions-3 firewall-rule-actions">
                <button type="button" aria-label={`${row.enabled ? "禁用" : "启用"}防火墙规则 ${row.name}`} onClick={() => toggleRule(row)}>{row.enabled ? "禁用" : "启用"}</button>
                <button type="button" aria-label={`查看防火墙规则 ${row.name} 详情`} onClick={(event) => openDrawer({ type: "detail", ruleId: row.id }, event.currentTarget)}>详情</button>
                <button className="firewall-rule-delete" type="button" aria-label={`删除防火墙规则 ${row.name}`} onClick={(event) => requestDeleteRule(row, event.currentTarget)}>删除</button>
              </div>
            </div>
          </>
        )}
      />
    </ModulePageShell>
  );
}

function FirewallPage(props: { page: PageKey; notify: Notify }) {
  return props.page === "firewall-deny" ? <FirewallDenyPage page={props.page} /> : <FirewallRulesPage {...props} />;
}

export { FirewallPage };
