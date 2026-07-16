import { Globe2, Plus, RefreshCw, Shield, TerminalSquare } from "lucide-react";
import { useState } from "react";
import { ModuleSearch } from "../../components/ui/Cards";
import { DataTable } from "../../components/ui/DataTable";
import { DetailDrawer } from "../../components/ui/DetailDrawer";
import { FieldSelect, FormLine, FormSelectLine, ToggleLine } from "../../components/ui/FormControls";
import { StatusLight } from "../../components/ui/StatusVisuals";
import { latencyValue } from "../../utils/data";
import type { ProxyEndpoint, ProxyRouteRule } from "./types";
import { initialProxyEndpoints, initialProxyRules } from "../../mocks/demoData";
import { SettingsPageFrame } from "./SettingsPageFrame";
import type { Notify, PageKey, SetPage, SettingsReadOnlyState, Tone } from "../../types/app";

function SettingsProxyPage({
  page,
  setPage,
  notify,
  readOnlyState,
}: {
  page: PageKey;
  setPage: SetPage;
  notify: Notify;
  readOnlyState: SettingsReadOnlyState;
}) {
  const { readOnly } = readOnlyState;
  const [endpoints, setEndpoints] = useState(initialProxyEndpoints);
  const [rules, setRules] = useState(initialProxyRules);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [deployProxy, setDeployProxy] = useState(true);
  const [terminalProxy, setTerminalProxy] = useState(true);
  const [strictTls, setStrictTls] = useState(true);
  const [noProxy, setNoProxy] = useState("localhost,127.0.0.1,10.0.0.0/8,*.internal");
  const [drawer, setDrawer] = useState<{ type: "test"; endpointId: string } | { type: "create" } | null>(null);
  const [draft, setDraft] = useState({ name: "临时调试代理", protocol: "HTTP", url: "http://proxy.local:7890", scope: "部署" });
  const healthyEndpoints = endpoints.filter((endpoint) => endpoint.enabled && endpoint.status === "可用");
  const selectedDrawerEndpoint = drawer?.type === "test" ? endpoints.find((endpoint) => endpoint.id === drawer.endpointId) ?? null : null;
  const filteredEndpoints = endpoints.filter((endpoint) => {
    const keyword = search.trim().toLowerCase();
    const matchSearch = !keyword || `${endpoint.name} ${endpoint.url} ${endpoint.scope}`.toLowerCase().includes(keyword);
    const matchScope = scopeFilter === "全部" || endpoint.scope === scopeFilter;
    const matchStatus = statusFilter === "全部" || endpoint.status === statusFilter;
    return matchSearch && matchScope && matchStatus;
  });
  const updateEndpoint = (id: string, patch: Partial<ProxyEndpoint>) => {
    setEndpoints((current) => current.map((endpoint) => endpoint.id === id ? { ...endpoint, ...patch } : endpoint));
  };
  const updateRule = (id: string, patch: Partial<ProxyRouteRule>) => {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  };
  const guardProxyWrite = (action: string) => {
    if (!readOnly) return true;
    notify(`只读模式已开启，无法${action}`, "warning");
    return false;
  };
  const runProbe = (endpoint: ProxyEndpoint) => {
    if (!guardProxyWrite("检查代理节点")) return;
    const latency = endpoint.status === "告警" ? "86ms" : endpoint.latency === "-" || endpoint.latency === "未探测" ? "58ms" : endpoint.latency;
    const nextStatus = endpoint.enabled && endpoint.status !== "告警" ? "可用" : endpoint.enabled ? "未验证" : "停用";
    updateEndpoint(endpoint.id, { status: nextStatus, latency, lastCheck: "刚刚" });
    notify(`${endpoint.name} 检查标记已更新，估算延迟 ${latency}${endpoint.enabled ? "" : "，节点仍保持停用"}`);
  };
  const addEndpoint = () => {
    if (!guardProxyWrite("新增代理")) return;
    if (!draft.name.trim() || !draft.url.trim()) {
      notify("代理名称和地址不能为空", "danger");
      return;
    }
    const next: ProxyEndpoint = {
      id: `px-${Date.now()}`,
      name: draft.name.trim(),
      protocol: draft.protocol as ProxyEndpoint["protocol"],
      url: draft.url.trim(),
      scope: draft.scope as ProxyEndpoint["scope"],
      enabled: true,
      latency: "未探测",
      status: "未验证",
      lastCheck: "未探测",
    };
    setEndpoints((current) => [next, ...current]);
    setSearch("");
    setScopeFilter("全部");
    setStatusFilter("全部");
    setDrawer({ type: "test", endpointId: next.id });
    notify(`${next.name} 已新增`);
  };
  const toggleEndpoint = (endpoint: ProxyEndpoint) => {
    if (!guardProxyWrite(endpoint.enabled ? "停用代理节点" : "启用代理节点")) return;
    const enabled = !endpoint.enabled;
    updateEndpoint(endpoint.id, { enabled, status: enabled ? "未验证" : "停用", latency: enabled ? "未探测" : "-" });
    notify(`${endpoint.name} 已${enabled ? "启用，等待检查" : "停用"}`, enabled ? "success" : "warning");
  };
  const addRouteRule = () => {
    if (!guardProxyWrite("新增代理路由规则")) return;
    const next: ProxyRouteRule = { id: `rule-${Date.now()}`, target: "api.github.com", type: "代理", endpointId: healthyEndpoints[0]?.id ?? "direct", note: "新增 API 规则", enabled: true };
    setRules((current) => [next, ...current]);
    notify("代理路由规则已新增");
  };
  const toggleRouteRule = (rule: ProxyRouteRule) => {
    if (!guardProxyWrite(rule.enabled ? "禁用代理路由规则" : "启用代理路由规则")) return;
    updateRule(rule.id, { enabled: !rule.enabled });
    notify(`${rule.target} 规则已${rule.enabled ? "禁用" : "启用"}`, rule.enabled ? "warning" : "success");
  };
  const saveProxyPolicy = () => {
    if (!guardProxyWrite("保存代理运行时策略")) return;
    notify("代理运行时策略已保存");
  };
  const proxyEndpointForRule = (rule: ProxyRouteRule) => endpoints.find((endpoint) => endpoint.id === rule.endpointId);
  const ruleTone = (rule: ProxyRouteRule): Tone => {
    if (!rule.enabled) return "gray";
    if (rule.type === "直连") return "blue";
    const endpoint = proxyEndpointForRule(rule);
    if (!endpoint || !endpoint.enabled || endpoint.status === "停用") return "red";
    if (endpoint.status === "告警" || endpoint.status === "未验证") return "orange";
    return "green";
  };
  const endpointForProtocol = (protocol: ProxyEndpoint["protocol"]) => (
    healthyEndpoints.find((endpoint) => endpoint.protocol === protocol)
    ?? endpoints.find((endpoint) => endpoint.enabled && endpoint.protocol === protocol && endpoint.status !== "停用")
  );
  const httpEndpoint = endpointForProtocol("HTTP");
  const httpsEndpoint = endpointForProtocol("HTTPS");
  const socksEndpoint = endpointForProtocol("SOCKS5");
  const httpProxy = deployProxy ? httpEndpoint?.url ?? "" : "";
  const httpsProxy = deployProxy ? httpsEndpoint?.url ?? httpProxy : "";
  const socksProxy = terminalProxy ? socksEndpoint?.url ?? "" : "";
  const terminalProxyState = !terminalProxy ? "停用" : socksEndpoint?.status === "可用" ? "启用" : socksEndpoint?.status === "告警" ? "告警" : socksProxy ? "待检查" : "未配置";
  const terminalProxyTone: Tone = terminalProxyState === "启用" ? "blue" : terminalProxyState === "停用" ? "gray" : terminalProxyState === "告警" ? "red" : "orange";
  const envPreview = [
    `HTTP_PROXY=${httpProxy}`,
    `HTTPS_PROXY=${httpsProxy}`,
    `ALL_PROXY=${socksProxy}`,
    `NO_PROXY=${noProxy}`,
    `STACKPILOT_DEPLOY_PROXY=${deployProxy ? "enabled" : "disabled"}`,
    `STACKPILOT_TERMINAL_PROXY=${terminalProxy ? "enabled" : "disabled"}`,
    `NODE_TLS_REJECT_UNAUTHORIZED=${strictTls ? "1" : "0"}`,
  ];
  const copyProxyText = (value: string, successMessage: string) => {
    if (!navigator.clipboard?.writeText) {
      notify("复制失败，请检查浏览器剪贴板权限", "danger");
      return;
    }
    void navigator.clipboard.writeText(value)
      .then(() => notify(successMessage, "info"))
      .catch(() => notify("复制失败，请检查浏览器剪贴板权限", "danger"));
  };
  const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
  const diagnosticForEndpoint = (endpoint: ProxyEndpoint) => [
    `curl -x ${shellQuote(endpoint.url)} https://api.github.com -I`,
    `scope=${endpoint.scope}`,
    `status=${endpoint.status}`,
    `latency=${endpoint.latency}`,
  ].join("\n");

  return (
    <SettingsPageFrame
      page={page}
      setPage={setPage}
      actions={<><button className="ghost" type="button" disabled={readOnly} onClick={() => { if (!guardProxyWrite("批量检查代理")) return; setEndpoints((current) => current.map((endpoint) => endpoint.enabled ? { ...endpoint, latency: endpoint.latency === "-" || endpoint.latency === "未探测" ? "54ms" : endpoint.latency, lastCheck: "刚刚" } : endpoint)); notify("代理节点检查时间已更新"); }}><RefreshCw size={15} /> 批量检查</button><button className="primary" type="button" disabled={readOnly} onClick={() => { if (!guardProxyWrite("新增代理")) return; setDrawer({ type: "create" }); }}><Plus size={15} /> 新增代理</button></>}
      side={drawer?.type === "create" ? (
        <DetailDrawer title="新增代理" subtitle="保存后加入代理节点池" modal onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" disabled={readOnly} onClick={addEndpoint}>保存代理</button></>}>
          <FormLine label="代理名称" required value={draft.name} disabled={readOnly} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
          <FormSelectLine label="协议" required value={draft.protocol} options={["HTTP", "HTTPS", "SOCKS5"]} disabled={readOnly} onChange={(value) => setDraft((current) => ({ ...current, protocol: value }))} />
          <FormLine label="代理地址" required value={draft.url} disabled={readOnly} onChange={(value) => setDraft((current) => ({ ...current, url: value }))} />
          <FormSelectLine label="用途" required value={draft.scope} options={["全局", "部署", "终端", "仓库"]} disabled={readOnly} onChange={(value) => setDraft((current) => ({ ...current, scope: value }))} />
        </DetailDrawer>
      ) : selectedDrawerEndpoint ? (
        <DetailDrawer className="proxy-detail-drawer" title="代理状态" subtitle={selectedDrawerEndpoint.name} modal onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => copyProxyText(diagnosticForEndpoint(selectedDrawerEndpoint), `${selectedDrawerEndpoint.name} curl 诊断已复制`)}>复制诊断</button><button className="primary" type="button" disabled={readOnly} onClick={() => runProbe(selectedDrawerEndpoint)}>检查状态</button></>}>
          <div className="proxy-test-panel">
            <p><span>协议</span><b>{selectedDrawerEndpoint.protocol}</b></p>
            <p><span>地址</span><b>{selectedDrawerEndpoint.url}</b></p>
            <p><span>用途</span><b>{selectedDrawerEndpoint.scope}</b></p>
            <p><span>状态</span><b>{selectedDrawerEndpoint.status}</b></p>
            <p><span>最近探测</span><b>{selectedDrawerEndpoint.lastCheck}</b></p>
            <p><span>延迟</span><b>{selectedDrawerEndpoint.latency}</b></p>
          </div>
        </DetailDrawer>
      ) : null}
      sideModal={Boolean(drawer)}
    >
      <section className="proxy-settings-workspace" aria-labelledby="proxy-workspace-title">
        <header className="proxy-workspace-head">
          <div>
            <span className="proxy-workspace-overline">代理网络</span>
            <h2 id="proxy-workspace-title">代理节点与路由</h2>
            <p>集中维护出口节点、目标路由与任务运行时环境。</p>
          </div>
          <div className="proxy-workspace-summary" aria-label="代理状态概览">
            <span><Shield className="green" size={18} /><em>可用节点</em><b>{healthyEndpoints.length}</b></span>
            <span><TerminalSquare className={terminalProxyTone} size={18} /><em>终端代理</em><b>{terminalProxyState}</b></span>
            <span><Globe2 className={deployProxy ? "blue" : "gray"} size={18} /><em>部署代理</em><b>{deployProxy ? "启用" : "停用"}</b></span>
          </div>
        </header>

        <div className="proxy-filter-bar" aria-label="代理节点筛选">
          <ModuleSearch value={search} placeholder="搜索代理名称、地址或用途" onChange={setSearch} />
          <FieldSelect label="用途" value={scopeFilter} options={["全部", "全局", "部署", "终端", "仓库"]} onChange={setScopeFilter} />
          <FieldSelect label="状态" value={statusFilter} options={["全部", "可用", "告警", "未验证", "停用"]} onChange={setStatusFilter} />
        </div>

        <section className="proxy-node-workbench" aria-labelledby="proxy-node-list-title">
          <header className="proxy-section-head">
            <div>
              <h3 id="proxy-node-list-title">代理节点</h3>
              <p>当前筛选显示 {filteredEndpoints.length} 个节点</p>
            </div>
          </header>
          <DataTable
          columns={[
            { key: "name", label: "代理节点", width: "220px", render: (endpoint) => <button className="module-row-link" type="button" aria-label={`查看代理 ${endpoint.name}`} onClick={() => setDrawer({ type: "test", endpointId: endpoint.id })}><StatusLight tone={proxyStatusTone(endpoint)} /><b>{endpoint.name}</b></button> },
            { key: "protocol", label: "协议", width: "86px", render: (endpoint) => <span className="pill blue">{endpoint.protocol}</span> },
            { key: "url", label: "地址", render: (endpoint) => <code>{endpoint.url}</code> },
            { key: "scope", label: "用途", width: "78px", render: (endpoint) => endpoint.scope },
            { key: "status", label: "状态", width: "88px", render: (endpoint) => <span className={`pill ${proxyStatusTone(endpoint)}`}>{endpoint.status}</span> },
            { key: "latency", label: "延迟", width: "82px", sortValue: (endpoint) => latencyValue(endpoint.latency), render: (endpoint) => endpoint.latency },
            { key: "ops", label: "操作", width: "230px", render: (endpoint) => <span className="table-actions"><button type="button" disabled={readOnly} aria-label={`检查 ${endpoint.name}`} onClick={() => runProbe(endpoint)}>检查</button><button type="button" disabled={readOnly} aria-label={`${endpoint.enabled ? "停用" : "启用"} ${endpoint.name}`} onClick={() => toggleEndpoint(endpoint)}>{endpoint.enabled ? "停用" : "启用"}</button><button type="button" aria-label={`打开 ${endpoint.name} 详情`} onClick={() => setDrawer({ type: "test", endpointId: endpoint.id })}>详情</button></span> },
          ]}
          rows={filteredEndpoints}
          emptyText="没有匹配的代理节点"
          getRowKey={(endpoint) => endpoint.id}
          mobileCard={(endpoint) => (
            <>
              <div className="module-card-head">
                <button className="module-row-link" type="button" aria-label={`查看代理 ${endpoint.name}`} onClick={() => setDrawer({ type: "test", endpointId: endpoint.id })}>
                  <StatusLight tone={proxyStatusTone(endpoint)} />
                  <b>{endpoint.name}</b>
                </button>
                <span className={`pill ${proxyStatusTone(endpoint)}`}>{endpoint.status}</span>
              </div>
              <code className="module-card-code">{endpoint.url}</code>
              <div className="module-card-meta">
                <span><b>协议</b><em>{endpoint.protocol}</em></span>
                <span><b>用途</b><em>{endpoint.scope}</em></span>
                <span><b>延迟</b><em>{endpoint.latency}</em></span>
                <span><b>探测</b><em>{endpoint.lastCheck}</em></span>
              </div>
              <div className="module-card-footer">
                <div className="table-actions actions-3">
                  <button type="button" disabled={readOnly} aria-label={`检查代理 ${endpoint.name}`} onClick={() => runProbe(endpoint)}>检查</button>
                  <button type="button" disabled={readOnly} aria-label={`${endpoint.enabled ? "停用" : "启用"}代理 ${endpoint.name}`} onClick={() => toggleEndpoint(endpoint)}>{endpoint.enabled ? "停用" : "启用"}</button>
                  <button type="button" aria-label={`打开代理 ${endpoint.name} 详情`} onClick={() => setDrawer({ type: "test", endpointId: endpoint.id })}>详情</button>
                </div>
              </div>
            </>
          )}
          />
        </section>
        <section className="proxy-lower-grid">
          <section className="proxy-rule-workbench" aria-labelledby="proxy-rule-list-title">
            <header className="proxy-section-head">
              <div>
                <h3 id="proxy-rule-list-title">代理路由规则</h3>
                <p>按目标决定直连或代理出口</p>
              </div>
              {!readOnly && <button className="proxy-section-action" type="button" onClick={addRouteRule}><Plus size={14} /> 新增规则</button>}
            </header>
            <div className="proxy-rule-list">
              {rules.map((rule) => {
                const endpoint = proxyEndpointForRule(rule);
                const endpointName = rule.type === "直连" ? "DIRECT" : endpoint?.name ?? "未绑定";
                const tone = ruleTone(rule);
                const ruleState = !rule.enabled
                  ? "已禁用"
                  : rule.type === "直连"
                    ? "直连"
                    : endpoint?.status === "可用" && endpoint.enabled
                      ? "可用"
                      : "需处理";
                return (
                  <article key={rule.id}>
                    <span className="proxy-rule-target"><StatusLight tone={tone} /><b>{rule.target}</b></span>
                    <em className="proxy-rule-note">{rule.note}</em>
                    <strong className="proxy-rule-route">{rule.type} · {endpointName} · {ruleState}</strong>
                    <button className="proxy-rule-action" type="button" disabled={readOnly} aria-label={`${rule.enabled ? "禁用" : "启用"}规则 ${rule.target}`} onClick={() => toggleRouteRule(rule)}>{rule.enabled ? "禁用" : "启用"}</button>
                  </article>
                );
              })}
            </div>
          </section>
          <section className="proxy-policy-workbench" aria-labelledby="proxy-policy-title">
            <header className="proxy-section-head">
              <div>
                <h3 id="proxy-policy-title">运行时策略</h3>
                <p>控制任务和终端会话的代理环境</p>
              </div>
            </header>
            <div className="proxy-policy-panel">
              <ToggleLine label="部署任务使用代理" active={deployProxy} disabled={readOnly} onToggle={setDeployProxy} hint="用于 npm、composer、镜像拉取和远端发布任务" />
              <ToggleLine label="终端会话使用 SOCKS5" active={terminalProxy} disabled={readOnly} onToggle={setTerminalProxy} hint="仅影响新开的终端会话" />
              <ToggleLine label="严格 TLS 校验" active={strictTls} disabled={readOnly} onToggle={setStrictTls} hint="关闭后会在审计日志标记为高风险" />
              <FormLine label="NO_PROXY" value={noProxy} disabled={readOnly} onChange={setNoProxy} hint="逗号分隔，支持通配符和 CIDR" />
              <div className="proxy-env-preview">
                {envPreview.map((line) => <code key={line}>{line}</code>)}
              </div>
              <div className="settings-buttons">
                <button className="primary" type="button" disabled={readOnly} onClick={saveProxyPolicy}>保存策略</button>
                <button className="ghost" type="button" onClick={() => copyProxyText(envPreview.join("\n"), "环境变量已复制")}>复制环境变量</button>
              </div>
            </div>
          </section>
        </section>
      </section>
    </SettingsPageFrame>
  );
}

function proxyStatusTone(endpoint: ProxyEndpoint) {
  if (!endpoint.enabled || endpoint.status === "停用") return "gray";
  if (endpoint.status === "告警") return "red";
  if (endpoint.status === "未验证") return "orange";
  return "green";
}

export { SettingsProxyPage };
