import { CheckCircle2, Download, Lock, Plus, Shield } from "lucide-react";
import { useRef, useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect, FormLine, FormSelectLine } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import type { FirewallDenyRecord, FirewallRule } from "../features/firewall/types";
import { firewallPagePreset, isValidFirewallSource } from "../features/firewall/validation";
import { initialFirewallDenyRecords, initialFirewallRules } from "../mocks/demoData";
import type { Notify, PageKey } from "../types/app";

function FirewallPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialFirewallRules);
  const [denyRows, setDenyRows] = useState(initialFirewallDenyRecords);
  const firewallPreset = firewallPagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [protocolByPage, setProtocolByPage] = useState<Record<string, string>>({});
  const [sourceByPage, setSourceByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<
    | { type: "create" }
    | { type: "detail"; ruleId: string }
    | { type: "delete"; ruleId: string }
    | { type: "deny-detail"; recordId: string }
    | null
  >(null);
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
    notify(`${row.source} 已放行`, "info");
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
        side={selectedDenyRecord ? (
          <DetailDrawer title="拦截详情" subtitle={`${selectedDenyRecord.source} -> ${selectedDenyRecord.target}`} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>关闭</button><button className="primary" type="button" disabled={selectedDenyRecord.result === "放行"} onClick={() => allowDenyRecord(selectedDenyRecord)}>放行来源</button></>}>
            <div className="detail-kv">
              <p><span>时间</span><b>{selectedDenyRecord.time}</b></p>
              <p><span>来源</span><b>{selectedDenyRecord.source}</b></p>
              <p><span>目标</span><b>{selectedDenyRecord.target}</b></p>
              <p><span>端口</span><b>{selectedDenyRecord.port}/{selectedDenyRecord.protocol}</b></p>
              <p><span>命中规则</span><b>{selectedDenyRecord.rule}</b></p>
              <p><span>处理状态</span><b>{selectedDenyRecord.result} · {selectedDenyRecord.status}</b></p>
              <p><span>原因</span><b>{selectedDenyRecord.reason}</b></p>
            </div>
          </DetailDrawer>
        ) : null}
      >
        <DataTable
          columns={[
            { key: "time", label: "时间", width: "90px", render: (row) => row.time },
            { key: "source", label: "来源", width: "142px", render: (row) => <code>{row.source}</code> },
            { key: "target", label: "目标", render: (row) => row.target },
            { key: "port", label: "端口", width: "76px", render: (row) => `${row.port}/${row.protocol}` },
            { key: "result", label: "结果", width: "86px", render: (row) => <span className={`pill ${row.result === "拒绝" ? "red" : "green"}`}>{row.result}</span> },
            { key: "status", label: "状态", width: "96px", render: (row) => <span className={`pill ${row.status === "待处理" ? "orange" : "green"}`}>{row.status}</span> },
            { key: "ops", label: "操作", width: "230px", render: (row) => <span className="table-actions"><button type="button" aria-label={`放行拦截来源 ${row.source}`} disabled={row.result === "放行"} onClick={() => allowDenyRecord(row)}>放行</button><button type="button" aria-label={`将拦截来源 ${row.source} 加入规则`} onClick={() => promoteDenyRecord(row)}>加入规则</button><button type="button" aria-label={`查看拦截记录 ${row.source} 详情`} onClick={() => setDrawer({ type: "deny-detail", recordId: row.id })}>详情</button></span> },
          ]}
          rows={filteredDenyRows}
          emptyText="没有匹配的拦截记录"
          getRowKey={(row) => row.id}
          mobileCard={(row) => (
            <>
              <div className="module-card-head">
                <span className="module-card-title"><StatusLight tone={row.result === "拒绝" ? "red" : "green"} /><b>{row.source}</b></span>
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
                <div className="table-actions actions-3">
                  <button type="button" disabled={row.result === "放行"} aria-label={`放行拦截来源 ${row.source}`} onClick={() => allowDenyRecord(row)}>放行</button>
                  <button type="button" aria-label={`将拦截来源 ${row.source} 加入规则`} onClick={() => promoteDenyRecord(row)}>加入规则</button>
                  <button type="button" aria-label={`查看拦截记录 ${row.source} 详情`} onClick={() => setDrawer({ type: "deny-detail", recordId: row.id })}>详情</button>
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
      actions={<button className="primary" type="button" onClick={() => { setDraftErrors({}); setDrawer({ type: "create" }); }}><Plus size={15} /> 新增规则</button>}
      filters={<><ModuleSearch value={search} placeholder="搜索规则名或端口" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="协议" value={protocolFilter} options={["全部", "TCP", "UDP"]} onChange={(value) => setProtocolByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="来源" value={sourceFilter} options={["全部", ...Array.from(new Set(rows.map((row) => row.source)))]} onChange={(value) => setSourceByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={<><MetricTile icon={Shield} label="规则数" value={`${rows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="启用" value={`${rows.filter((row) => row.enabled).length}`} tone="green" /><MetricTile icon={Lock} label="停用" value={`${rows.filter((row) => !row.enabled).length}`} tone="orange" /></>}
      side={drawer?.type === "create" ? (
        <DetailDrawer title="新增规则" subtitle="端口和来源会先在本地校验" onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={addRule}>保存规则</button></>}>
          <FormLine label="规则名" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
          <FormLine label="端口" required value={draft.port} inputRef={portInputRef} error={draftErrors.port} inputType="number" onChange={(value) => { setDraft((current) => ({ ...current, port: value })); setDraftErrors((current) => ({ ...current, port: undefined })); }} />
          <FormSelectLine label="协议" value={draft.protocol} options={["TCP", "UDP"]} onChange={(value) => setDraft((current) => ({ ...current, protocol: value }))} />
          <FormLine label="来源" required value={draft.source} inputRef={sourceInputRef} error={draftErrors.source} onChange={(value) => { setDraft((current) => ({ ...current, source: value })); setDraftErrors((current) => ({ ...current, source: undefined })); }} />
        </DetailDrawer>
      ) : drawer?.type === "detail" && selectedRule ? (
        <DetailDrawer title="规则详情" subtitle={`${selectedRule.port}/${selectedRule.protocol}`} onClose={() => setDrawer(null)}>
          <div className="detail-kv">
            <p><span>规则名</span><b>{selectedRule.name}</b></p>
            <p><span>来源</span><b>{selectedRule.source}</b></p>
            <p><span>目标</span><b>{selectedRule.target}</b></p>
            <p><span>状态</span><b>{selectedRule.enabled ? "启用" : "停用"}</b></p>
          </div>
        </DetailDrawer>
      ) : drawer?.type === "delete" && selectedRule ? (
        <DetailDrawer title="删除规则" subtitle={selectedRule.name} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="danger-soft" type="button" onClick={() => deleteRule(selectedRule)}>确认删除</button></>}>
          <div className="delete-confirm">
            <StatusLight tone="red" />
            <p>删除后该本地原型列表会立即移除这条规则。</p>
            <code>{selectedRule.source}{" -> "}{selectedRule.target} · {selectedRule.port}/{selectedRule.protocol}</code>
          </div>
        </DetailDrawer>
      ) : null}
    >
      <DataTable
        columns={[
          { key: "name", label: "规则", width: "220px", render: (row) => <button className="module-row-link" type="button" aria-label={`查看防火墙规则 ${row.name}`} onClick={() => setDrawer({ type: "detail", ruleId: row.id })}><StatusLight tone={row.enabled ? "green" : "gray"} /> <b>{row.name}</b></button> },
          { key: "port", label: "端口", render: (row) => row.port },
          { key: "protocol", label: "协议", render: (row) => <span className="pill blue">{row.protocol}</span> },
          { key: "source", label: "来源", render: (row) => row.source },
          { key: "target", label: "目标", render: (row) => row.target },
          { key: "enabled", label: "状态", render: (row) => <span className={`pill ${row.enabled ? "green" : "blue"}`}>{row.enabled ? "启用" : "停用"}</span> },
          { key: "ops", label: "操作", width: "230px", render: (row) => <span className="table-actions"><button type="button" aria-label={`${row.enabled ? "禁用" : "启用"}防火墙规则 ${row.name}`} onClick={() => toggleRule(row)}>{row.enabled ? "禁用" : "启用"}</button><button type="button" aria-label={`查看防火墙规则 ${row.name} 详情`} onClick={() => setDrawer({ type: "detail", ruleId: row.id })}>详情</button><button type="button" aria-label={`删除防火墙规则 ${row.name}`} onClick={() => setDrawer({ type: "delete", ruleId: row.id })}>删除</button></span> },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的防火墙规则"
        getRowKey={(row) => row.id}
        mobileCard={(row) => (
          <>
            <div className="module-card-head">
              <button className="module-row-link" type="button" aria-label={`查看防火墙规则 ${row.name}`} onClick={() => setDrawer({ type: "detail", ruleId: row.id })}><StatusLight tone={row.enabled ? "green" : "gray"} /><b>{row.name}</b></button>
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
              <div className="table-actions actions-3">
                <button type="button" aria-label={`${row.enabled ? "禁用" : "启用"}防火墙规则 ${row.name}`} onClick={() => toggleRule(row)}>{row.enabled ? "禁用" : "启用"}</button>
                <button type="button" aria-label={`查看防火墙规则 ${row.name} 详情`} onClick={() => setDrawer({ type: "detail", ruleId: row.id })}>详情</button>
                <button type="button" aria-label={`删除防火墙规则 ${row.name}`} onClick={() => setDrawer({ type: "delete", ruleId: row.id })}>删除</button>
              </div>
            </div>
          </>
        )}
      />
    </ModulePageShell>
  );
}

export { FirewallPage };
