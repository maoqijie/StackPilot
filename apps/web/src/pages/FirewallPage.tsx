import { CheckCircle2, CircleCheck, Download, Eye, FilePlus2, Lock, Plus, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine, FormSelectLine } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import type { FirewallDenyRecord, FirewallRule } from "../features/firewall/types";
import { firewallPagePreset, isValidFirewallSource } from "../features/firewall/validation";
import { initialFirewallDenyRecords, initialFirewallRules } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";
import type { Permission } from "@stackpilot/contracts";
import { FirewallOpenPortsPage } from "../features/firewall/FirewallOpenPortsPage";

type FirewallDrawer =
  | { type: "create" }
  | { type: "detail"; ruleId: string }
  | { type: "delete"; ruleId: string }
  | { type: "deny-detail"; recordId: string }
  | null;

function FirewallRulesPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialFirewallRules);
  const [denyRows, setDenyRows] = useState(initialFirewallDenyRecords);
  const firewallPreset = firewallPagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [protocolByPage, setProtocolByPage] = useState<Record<string, string>>({});
  const [sourceByPage, setSourceByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<FirewallDrawer>(null);
  const [pendingAllowId, setPendingAllowId] = useState<string | null>(null);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const [confirmTrigger, setConfirmTrigger] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState({ name: "临时调试端口", port: "", protocol: "TCP", source: "10.0.0.0/8" });
  const [draftErrors, setDraftErrors] = useState<{ port?: string; source?: string }>({});
  const portInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const search = searchByPage[page] ?? firewallPreset.search;
  const protocolFilter = protocolByPage[page] ?? firewallPreset.protocol;
  const sourceFilter = sourceByPage[page] ?? firewallPreset.source;
  const isDenyPage = page === "firewall-deny";
  const selectedRule = drawer?.type === "detail" || drawer?.type === "delete"
    ? rows.find((row) => row.id === drawer.ruleId) ?? null
    : null;
  const selectedDenyRecord = drawer?.type === "deny-detail"
    ? denyRows.find((row) => row.id === drawer.recordId) ?? null
    : null;
  const pendingAllowRecord = pendingAllowId
    ? denyRows.find((row) => row.id === pendingAllowId) ?? null
    : null;

  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return (!query || `${row.name} ${row.port}`.toLowerCase().includes(query)) && (protocolFilter === "全部" || row.protocol === protocolFilter) && (sourceFilter === "全部" || row.source === sourceFilter);
  });
  const filteredDenyRows = denyRows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.source} ${row.target} ${row.rule} ${row.reason} ${row.port}`.toLowerCase().includes(query);
    const matchProtocol = protocolFilter === "全部" || row.protocol === protocolFilter;
    const matchSource = sourceFilter === "全部" || row.source === sourceFilter;
    return matchSearch && matchProtocol && matchSource;
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
  const allowDenyRecord = (row: FirewallDenyRecord) => {
    setDenyRows((current) => current.map((item) => item.id === row.id ? { ...item, result: "放行", status: "已生效", reason: "已从拦截记录放行" } : item));
    setPendingAllowId(null);
    notify(`${row.source} 已放行`, "info");
  };
  const requestAllowDenyRecord = (row: FirewallDenyRecord) => {
    setDrawer(null);
    setPendingAllowId(row.id);
  };
  const requestDeleteRule = (row: FirewallRule, trigger: HTMLElement) => {
    setConfirmTrigger(trigger);
    setDrawer({ type: "delete", ruleId: row.id });
  };
  const closeDeleteConfirmation = () => {
    setDrawer(null);
  };
  const promoteDenyRecord = (row: FirewallDenyRecord) => {
    const nextRule: FirewallRule = {
      id: `fw-${Date.now()}`,
      name: `${row.source} 临时放行`,
      port: row.port,
      protocol: row.protocol,
      source: row.source,
      target: row.target,
      enabled: true,
    };
    setRows((current) => [nextRule, ...current]);
    setDenyRows((current) => current.map((item) => item.id === row.id ? { ...item, result: "放行", status: "已生效", reason: "已加入规则列表" } : item));
    notify(`${row.source} 已加入防火墙规则`, "info");
  };

  if (isDenyPage) {
    return (
      <ModulePageShell
        title={resolvePageMeta(page).title}
        subtitle={firewallPreset.subtitle}
        page={page}
        actions={<button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredDenyRows.length} 条拦截记录`, "info")}><Download size={15} /> 导出记录</button>}
        filters={<><ModuleSearch value={search} placeholder="搜索来源、目标、规则或原因" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="协议" value={protocolFilter} options={["全部", "TCP", "UDP"]} onChange={(value) => setProtocolByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="来源" value={sourceFilter} options={["全部", ...Array.from(new Set(denyRows.map((row) => row.source)))]} onChange={(value) => setSourceByPage((current) => ({ ...current, [page]: value }))} /></>}
        metrics={<><MetricTile icon={Shield} label="拦截记录" value={`${denyRows.length}`} tone="orange" /><MetricTile icon={Lock} label="待处理" value={`${denyRows.filter((row) => row.status === "待处理").length}`} tone="red" /><MetricTile icon={CheckCircle2} label="已生效" value={`${denyRows.filter((row) => row.status === "已生效").length}`} tone="green" /></>}
        sideModal
        side={selectedDenyRecord ? (
          <DetailDrawer
            title="拦截详情"
            subtitle={`${selectedDenyRecord.source} -> ${selectedDenyRecord.target}`}
            className="firewall-deny-drawer"
            modal
            restoreFocusTarget={drawerTrigger}
            onClose={() => setDrawer(null)}
            actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>关闭</button><button className="primary" type="button" disabled={selectedDenyRecord.result === "放行"} onClick={() => requestAllowDenyRecord(selectedDenyRecord)}><ShieldCheck size={15} />放行来源</button></>}
          >
            <div className={`firewall-deny-detail-status is-${selectedDenyRecord.result === "拒绝" ? "denied" : "allowed"}`}>
              {selectedDenyRecord.result === "拒绝" ? <ShieldAlert size={20} /> : <CircleCheck size={20} />}
              <span><strong>{selectedDenyRecord.result === "拒绝" ? "访问已拦截" : "来源已放行"}</strong><small>{selectedDenyRecord.status} · {selectedDenyRecord.time}</small></span>
            </div>
            <dl className="firewall-deny-detail-list">
              <div><dt>来源</dt><dd><code>{selectedDenyRecord.source}</code></dd></div>
              <div><dt>目标</dt><dd title={selectedDenyRecord.target}>{selectedDenyRecord.target}</dd></div>
              <div><dt>端口 / 协议</dt><dd><code>{selectedDenyRecord.port}/{selectedDenyRecord.protocol}</code></dd></div>
              <div><dt>命中规则</dt><dd>{selectedDenyRecord.rule}</dd></div>
              <div><dt>处理结果</dt><dd>{selectedDenyRecord.result} · {selectedDenyRecord.status}</dd></div>
              <div><dt>原因</dt><dd>{selectedDenyRecord.reason}</dd></div>
            </dl>
          </DetailDrawer>
        ) : pendingAllowRecord ? (
          <ConfirmDialog
            className="firewall-deny-confirm"
            title="确认放行来源"
            message={`放行后，来自 ${pendingAllowRecord.source} 的匹配访问将不再被当前拦截策略阻止。`}
            detail={`${pendingAllowRecord.source} -> ${pendingAllowRecord.target} · ${pendingAllowRecord.port}/${pendingAllowRecord.protocol}`}
            confirmLabel="确认放行"
            tone="warning"
            onClose={() => setPendingAllowId(null)}
            onConfirm={() => allowDenyRecord(pendingAllowRecord)}
          />
        ) : null}
      >
        <DataTable
          columns={[
            { key: "time", label: "时间", width: "90px", render: (row) => row.time },
            { key: "source", label: "来源", width: "142px", render: (row) => <code className="firewall-deny-source" title={row.source}>{row.source}</code> },
            { key: "target", label: "目标", render: (row) => <span className="firewall-deny-target" title={row.target}>{row.target}</span> },
            { key: "port", label: "端口", width: "76px", render: (row) => `${row.port}/${row.protocol}` },
            { key: "result", label: "结果", width: "86px", render: (row) => <span className={`pill ${row.result === "拒绝" ? "red" : "green"}`}>{row.result}</span> },
            { key: "status", label: "状态", width: "96px", render: (row) => <span className={`pill ${row.status === "待处理" ? "orange" : "green"}`}>{row.status}</span> },
            { key: "ops", label: "操作", width: "150px", render: (row) => <span className="table-icon-actions firewall-deny-actions"><button type="button" aria-label={`放行拦截来源 ${row.source}`} disabled={row.result === "放行"} onClick={() => requestAllowDenyRecord(row)}><ShieldCheck size={15} /><span className="firewall-deny-tooltip" aria-hidden="true">放行来源</span></button><button type="button" aria-label={`将拦截来源 ${row.source} 加入规则`} disabled={row.result === "放行"} onClick={() => promoteDenyRecord(row)}><FilePlus2 size={15} /><span className="firewall-deny-tooltip" aria-hidden="true">加入规则</span></button><button type="button" aria-label={`查看拦截记录 ${row.source} 详情`} onClick={(event) => openDrawer({ type: "deny-detail", recordId: row.id }, event.currentTarget)}><Eye size={15} /><span className="firewall-deny-tooltip" aria-hidden="true">查看详情</span></button></span> },
          ]}
          rows={filteredDenyRows}
          emptyText="没有匹配的拦截记录"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <>
              <div className="module-card-head">
                <span className={`module-card-title firewall-deny-mobile-source is-${row.result === "拒绝" ? "denied" : "allowed"}`}>{row.result === "拒绝" ? <ShieldAlert size={18} /> : <CircleCheck size={18} />}<b>{row.source}</b></span>
                <span className={`pill ${row.status === "待处理" ? "orange" : "green"}`}>{row.status}</span>
              </div>
              <code className="module-card-code">{`${row.source} -> ${row.target} · ${row.port}/${row.protocol}`}</code>
              <div className="module-card-meta">
                <span><b>规则</b><em>{row.rule}</em></span>
                <span><b>结果</b><em>{row.result}</em></span>
                <span><b>时间</b><em>{row.time}</em></span>
                <span><b>原因</b><em>{row.reason}</em></span>
              </div>
              <div className="module-card-footer">
                <div className="table-actions actions-3 firewall-deny-mobile-actions">
                  <button type="button" disabled={row.result === "放行"} aria-label={`放行拦截来源 ${row.source}`} onClick={() => requestAllowDenyRecord(row)}><ShieldCheck size={15} />放行</button>
                  <button type="button" disabled={row.result === "放行"} aria-label={`将拦截来源 ${row.source} 加入规则`} onClick={() => promoteDenyRecord(row)}><FilePlus2 size={15} />加入规则</button>
                  <button type="button" aria-label={`查看拦截记录 ${row.source} 详情`} onClick={(event) => openDrawer({ type: "deny-detail", recordId: row.id }, event.currentTarget)}><Eye size={15} />详情</button>
                </div>
              </div>
            </>
          )}
        />
      </ModulePageShell>
    );
  }

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

function FirewallPage({ page, notify, permissions = [] }: { page: PageKey; notify: Notify; permissions?: Permission[] }) {
  return page === "firewall-open"
    ? <FirewallOpenPortsPage permissions={permissions} />
    : <FirewallRulesPage page={page} notify={notify} />;
}

export { FirewallPage };
