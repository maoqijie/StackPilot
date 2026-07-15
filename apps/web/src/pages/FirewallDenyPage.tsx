import type { FirewallDenyRecord } from "@stackpilot/contracts";
import { Clock3, CloudOff, Eye, Network, Server, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile, ModuleSearch } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FieldSelect } from "../components/ui/FormControls";
import { useFirewallDenyRecords } from "../features/firewall/useFirewallDenyRecords";
import type { PageKey } from "../types/app";
import { formatBackendDateTime } from "../utils/time";

function target(record: FirewallDenyRecord) {
  return record.destinationAddress ?? "目标地址不可用";
}

function portAndProtocol(record: FirewallDenyRecord) {
  return record.destinationPort === null ? record.protocol : `${record.destinationPort}/${record.protocol}`;
}

function FirewallDenyPage({ page }: { page: PageKey }) {
  const { data, loading, error, backgroundError, retry } = useFirewallDenyRecords();
  const [search, setSearch] = useState("");
  const [protocol, setProtocol] = useState("全部");
  const [source, setSource] = useState("全部");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerTrigger, setDrawerTrigger] = useState<HTMLElement | null>(null);
  const rows = useMemo(() => data?.records ?? [], [data]);
  const selected = selectedId ? rows.find((record) => record.id === selectedId) ?? null : null;
  const protocols = ["全部", ...Array.from(new Set(rows.map((record) => record.protocol)))];
  const sources = ["全部", ...Array.from(new Set(rows.map((record) => record.sourceAddress)))];
  const filteredRows = rows.filter((record) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || `${record.sourceAddress} ${target(record)} ${record.nodeName} ${record.rule} ${record.reason}`.toLowerCase().includes(query);
    return matchesQuery && (protocol === "全部" || record.protocol === protocol) && (source === "全部" || record.sourceAddress === source);
  });

  useEffect(() => {
    if (!selectedId || !data || rows.some((record) => record.id === selectedId)) return;
    let active = true;
    queueMicrotask(() => { if (active) setSelectedId(null); });
    return () => { active = false; };
  }, [data, rows, selectedId]);

  const openDetail = (record: FirewallDenyRecord, trigger: HTMLElement) => {
    setDrawerTrigger(trigger);
    setSelectedId(record.id);
  };
  const collectionMessage = backgroundError
    ? `后台刷新失败，保留上次数据：${backgroundError}`
    : data?.warnings[0] ?? (data?.collectionStatus === "complete" ? "数据来自 Agent 的只读内核防火墙日志" : "等待 Agent 采集防火墙拒绝事件");
  const emptyText = data?.collectionStatus === "unavailable" ? "防火墙拒绝数据暂不可用" : "没有匹配的真实拦截记录，系统将继续自动采集";
  const initialState = !data && (loading
    ? <div className="firewall-deny-initial-state" role="status">正在读取真实防火墙拦截记录</div>
    : <div className="overview-error-state"><CloudOff size={18} /><span>{error ?? "防火墙拦截记录加载失败"}</span><button type="button" onClick={() => void retry()}>重试</button></div>);

  return <ModulePageShell
    title={resolvePageMeta(page).title}
    subtitle="查看授权节点最近 24 小时内核防火墙实际拒绝的访问事件。"
    page={page}
    sideModal
    filters={data ? <><ModuleSearch value={search} placeholder="搜索来源、目标、节点、规则或原因" onChange={setSearch} /><FieldSelect label="协议" value={protocol} options={protocols} onChange={setProtocol} /><FieldSelect label="来源" value={source} options={sources} onChange={setSource} /></> : null}
    metrics={data ? <><MetricTile icon={ShieldAlert} label="拦截记录" value={`${rows.length}`} tone="red" /><MetricTile icon={Network} label="来源地址" value={`${new Set(rows.map((record) => record.sourceAddress)).size}`} tone="orange" /><MetricTile icon={Server} label="涉及节点" value={`${new Set(rows.map((record) => record.nodeId)).size}`} tone="green" /></> : null}
    side={selected && <DetailDrawer title="拦截详情" subtitle={`${selected.sourceAddress} -> ${selected.nodeName}`} className="firewall-deny-drawer" modal restoreFocusTarget={drawerTrigger} onClose={() => setSelectedId(null)} actions={<button className="ghost" type="button" onClick={() => setSelectedId(null)}>关闭</button>}>
      <div className="firewall-deny-detail-status is-denied"><ShieldAlert size={20} /><span><strong>访问已拦截</strong><small>{formatBackendDateTime(selected.occurredAt)}</small></span></div>
      <dl className="firewall-deny-detail-list">
        <div><dt>来源</dt><dd><code>{selected.sourceAddress}</code></dd></div>
        <div><dt>目标节点</dt><dd title={selected.nodeName}>{selected.nodeName}</dd></div>
        <div><dt>目标地址</dt><dd><code>{target(selected)}</code></dd></div>
        <div><dt>端口 / 协议</dt><dd><code>{portAndProtocol(selected)}</code></dd></div>
        <div><dt>入站接口</dt><dd>{selected.interfaceName ?? "暂不可用"}</dd></div>
        <div><dt>命中标记</dt><dd>{selected.rule}</dd></div>
        <div><dt>拒绝原因</dt><dd>{selected.reason}</dd></div>
        <div><dt>节点采集</dt><dd>{formatBackendDateTime(selected.sourceCollectedAt)}</dd></div>
      </dl>
    </DetailDrawer>}
  >
    {initialState}
    {data && <><div className="firewall-deny-freshness"><Clock3 size={18} /><div><strong>采集时间 {formatBackendDateTime(data.collectedAt)}</strong><span>{collectionMessage}</span></div></div>
    <DataTable
      columns={[
        { key: "time", label: "时间", width: "158px", render: (record) => formatBackendDateTime(record.occurredAt) },
        { key: "source", label: "来源", width: "150px", render: (record) => <code className="firewall-deny-source" title={record.sourceAddress}>{record.sourceAddress}</code> },
        { key: "target", label: "目标节点", render: (record) => <span className="firewall-deny-target" title={record.nodeName}>{record.nodeName}</span> },
        { key: "port", label: "端口", width: "96px", render: portAndProtocol },
        { key: "result", label: "结果", width: "86px", render: () => <span className="pill red">拒绝</span> },
        { key: "ops", label: "操作", width: "72px", render: (record) => <span className="table-icon-actions firewall-deny-actions"><button type="button" aria-label={`查看拦截记录 ${record.sourceAddress} 详情`} onClick={(event) => openDetail(record, event.currentTarget)}><Eye size={15} /><span className="firewall-deny-tooltip" aria-hidden="true">查看详情</span></button></span> },
      ]}
      rows={filteredRows}
      emptyText={emptyText}
      getRowKey={(record) => record.id}
      mobileCard={(record) => <><div className="module-card-head"><span className="module-card-title firewall-deny-mobile-source is-denied"><ShieldAlert size={18} /><b>{record.sourceAddress}</b></span><span className="pill red">拒绝</span></div><code className="module-card-code">{`${record.sourceAddress} -> ${record.nodeName} · ${portAndProtocol(record)}`}</code><div className="module-card-meta"><span><b>目标</b><em>{target(record)}</em></span><span><b>规则</b><em>{record.rule}</em></span><span><b>时间</b><em>{formatBackendDateTime(record.occurredAt)}</em></span><span><b>采集</b><em>{formatBackendDateTime(record.sourceCollectedAt)}</em></span></div><div className="module-card-footer"><button className="ghost" type="button" aria-label={`查看拦截记录 ${record.sourceAddress} 详情`} onClick={(event) => openDetail(record, event.currentTarget)}><Eye size={15} />详情</button></div></>}
    /></>}
  </ModulePageShell>;
}

export { FirewallDenyPage };
