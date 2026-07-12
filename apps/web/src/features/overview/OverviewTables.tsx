import type { OverviewAuditRow, OverviewNode, OverviewResourceRecord, OverviewRiskRecord, OverviewService, OverviewTaskRecord } from "../../api/overviewApi";
import { Activity, CheckCircle2, CircleX, Clock3, Eye, HardDrive, KeyRound, LoaderCircle, Server } from "lucide-react";
import { useState } from "react";
import { DetailDrawer } from "../../components/ui/DetailDrawer";
import { Bar, Sparkline, StatusLight } from "../../components/ui/StatusVisuals";
import { healthProbeTone, overviewNodeCollectedAt, overviewNodeFieldAvailable, overviewNodeFreshness, serviceHealthLabel, serviceHealthTone, serviceTone, taskTone } from "./model";
import type { Notify } from "../../types/app";
import { formatBackendDateTime } from "../../utils/time";

function freshnessLabel(node: OverviewNode) { return node.freshness === "stale" ? "数据已过期" : node.freshness === "awaiting" ? "等待遥测" : "实时"; }
function isCleanUpdate(value: string) { return ["已是最新", "已同步"].includes(value); }
function percentValue(value: string) { return Number(value.replace("%", "")) || 0; }
function nodeStatusTone(node: OverviewNode) { return node.status === "健康" ? "green" : node.status === "警告" ? "orange" : node.status === "离线" ? "red" : "gray"; }
function resourceTone(node: OverviewNode, warning: "orange" | "red") { return node.freshness === "stale" || node.status === "离线" ? "gray" : node.status === "警告" ? warning : "green"; }
function UnavailableValue() { return <span>暂不可用</span>; }

function OverviewServiceList({ services }: { services: OverviewService[] }) {
  return <div className="node-service-list">{services.map((service) => <article key={service.id}><StatusLight tone={serviceTone(service.status)} /><span><strong>{service.name}</strong><small>{service.target}</small></span><span><b>{service.status}</b><small>{service.detail}</small></span></article>)}{services.length === 0 && <p className="node-detail-empty">未发现服务实例</p>}</div>;
}

function NodeDetailContent({ node }: { node: OverviewNode }) {
  const stale = overviewNodeFreshness(node) === "stale";
  const collectedAt = formatBackendDateTime(overviewNodeCollectedAt(node), "暂不可用");
  return <div className="node-detail-content">
    <section className="node-detail-summary"><span className="node-detail-summary-icon"><Server size={20} /></span><div><span>节点状态</span><strong><StatusLight tone={nodeStatusTone(node)} /> {node.status}</strong></div><div><span>数据状态</span><strong>{freshnessLabel(node)}{stale ? ` · ${collectedAt}` : ""}</strong></div></section>
    <section className="node-detail-section"><header><Server size={17} /><strong>节点信息</strong></header><div className="node-detail-facts">
      <p><span>网络延迟</span><b>{overviewNodeFieldAvailable(node, "latency") ? <><StatusLight tone={healthProbeTone(node.latencyStatus)} /> {node.latency}</> : "暂不可用"}</b></p><p><span>版本</span><b>{node.version}</b></p><p><span>运行时间</span><b>{node.uptime}</b></p>
      <p><span>最后备份</span><b>{overviewNodeFieldAvailable(node, "backup") ? <><StatusLight tone={healthProbeTone(node.backupStatus)} /> {node.backup}</> : "暂不可用"}</b></p><p><span>更新状态</span><b className={overviewNodeFieldAvailable(node, "update") ? (isCleanUpdate(node.update) ? "green-text" : "orange-text") : undefined}>{overviewNodeFieldAvailable(node, "update") ? node.update : "暂不可用"}</b></p><p><span>负责人</span><b>{node.owner}</b></p><p><span>采集时间</span><b>{collectedAt}{stale ? " · 数据已过期" : ""}</b></p>
    </div></section>
    <section className="node-detail-section"><header><Activity size={17} /><strong>资源使用</strong></header><div className="node-resource-list">
      <p><span>CPU</span>{overviewNodeFieldAvailable(node, "cpu") ? <Bar value={node.cpu} tone={resourceTone(node, "orange")} /> : <UnavailableValue />}</p><p><span>内存</span>{overviewNodeFieldAvailable(node, "memory") ? <Bar value={node.memory} tone={resourceTone(node, "red")} /> : <UnavailableValue />}</p><p><span>磁盘</span>{overviewNodeFieldAvailable(node, "disk") ? <Bar value={node.disk} tone={resourceTone(node, "red")} /> : <UnavailableValue />}</p>
    </div></section>
    <section className="node-detail-section"><header><HardDrive size={17} /><strong>服务列表</strong>{overviewNodeFieldAvailable(node, "services") && <span>{node.services.length} 个实例</span>}</header>{overviewNodeFieldAvailable(node, "services") ? <OverviewServiceList services={node.services} /> : <p className="node-detail-empty">暂不可用</p>}</section>
  </div>;
}

function HostTable({ nodes, notify }: { nodes: OverviewNode[]; notify: Notify }) {
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const selectedHost = nodes.find((host) => host.id === selectedHostId) ?? null;
  return <><table className="mini-table host-table"><thead><tr><th>主机名</th><th>IP 地址</th><th>CPU</th><th>内存</th><th>磁盘</th><th>服务健康</th><th>备份状态</th><th>更新状态</th><th>操作</th></tr></thead><tbody>{nodes.map((host) => <tr className={selectedHostId === host.id ? "is-selected" : ""} key={host.id}>
    <td><span className="overview-host-name" title={host.name}><StatusLight tone={nodeStatusTone(host)} /><span className="feed-copy"><b>{host.name}</b>{host.freshness !== "current" && <time>{freshnessLabel(host)}{host.freshness === "stale" ? ` · ${formatBackendDateTime(host.collectedAt, "暂不可用")}` : ""}</time>}</span></span></td><td>{host.ip}</td>
    <td>{host.availability.cpu ? <Bar value={host.cpu} tone={resourceTone(host, "orange")} /> : <UnavailableValue />}</td><td>{host.availability.memory ? <Bar value={host.memory} tone={resourceTone(host, "red")} /> : <UnavailableValue />}</td><td>{host.availability.disk ? <Bar value={host.disk} tone={resourceTone(host, "red")} /> : <UnavailableValue />}</td>
    <td>{host.availability.services ? <><StatusLight tone={serviceHealthTone(host.services)} /> {serviceHealthLabel(host.services)}</> : <UnavailableValue />}</td><td>{host.availability.backup ? <><StatusLight tone={healthProbeTone(host.backupStatus)} /> {host.backup}</> : <UnavailableValue />}</td><td className={host.availability.update ? (isCleanUpdate(host.update) ? "green-text" : "orange-text") : undefined}>{host.availability.update ? host.update : <UnavailableValue />}</td>
    <td><button className="icon-action inline" type="button" onClick={() => { setSelectedHostId(host.id); notify(`${host.name} 详情已打开`, "info"); }} aria-label={`查看 ${host.name} 节点详情`} title="查看详情"><Eye size={16} /></button></td>
  </tr>)}</tbody></table>{selectedHost && <DetailDrawer title={selectedHost.name} subtitle={`${selectedHost.ip} · ${selectedHost.env}`} onClose={() => setSelectedHostId(null)} autoFocus={false}><NodeDetailContent node={selectedHost} /></DetailDrawer>}</>;
}

function FeedStatusIcon({ status }: { status: OverviewTaskRecord["status"] | OverviewAuditRow[5] }) { const tone = status === "成功" ? "green" : status === "失败" ? "red" : status === "运行中" ? "blue" : "orange"; const Icon = status === "成功" ? CheckCircle2 : status === "失败" ? CircleX : status === "运行中" ? LoaderCircle : Clock3; return <span className={`feed-status-icon ${tone}`} aria-hidden="true"><Icon size={18} /></span>; }
function TaskTable({ tasks, queued }: { tasks: OverviewTaskRecord[]; queued?: boolean }) { const rows = queued ? tasks.filter((row) => ["运行中", "等待"].includes(row.status)) : tasks.slice(0, 6); return <div className="task-flow">{rows.map((row) => <div key={row.id}><FeedStatusIcon status={row.status} /><span className="feed-copy"><strong>{row.type}</strong><p>{row.title}</p><time>{row.queuedAt}</time></span><span className="feed-result"><b className={`${taskTone(row.status)}-text`}>{row.status}</b><small>{row.duration}</small></span></div>)}{rows.length === 0 && <div className="feed-empty">暂无任务</div>}</div>; }
function AuditTable({ rows }: { rows: OverviewAuditRow[] }) { return <div className="audit-feed">{rows.slice(0, 6).map((row) => <article key={row[0] + row[6]}><FeedStatusIcon status={row[5]} /><span className="feed-copy"><strong>{row[3]}</strong><span className="feed-context"><span>{row[1]}</span><span>{row[2]}</span><span>{row[4]}</span></span><time>{row[0]}</time></span><span className="feed-result"><b className={row[5] === "失败" ? "red-text" : "green-text"}>{row[5]}</b><code>{row[6]}</code></span></article>)}{rows.length === 0 && <div className="feed-empty">暂无近期动态</div>}</div>; }
function RiskList({ risks }: { risks: OverviewRiskRecord[] }) { return <div className="risk-list">{risks.slice(0, 4).map((row) => <div key={row.id}><span className={`risk-icon ${row.level === "高危" ? "red" : row.level === "中危" ? "orange" : "blue"}`}><KeyRound size={15} /></span><span className="feed-copy"><strong>{row.title}</strong><p>{row.target}</p><em>{row.detected}</em></span><span className="feed-result"><b className={row.level === "高危" ? "red-text" : row.level === "中危" ? "orange-text" : "blue-text"}>{row.level}</b><small>{row.owner}</small></span></div>)}{risks.length === 0 && <div className="risk-empty"><CheckCircle2 size={17} /><span>当前没有实时风险</span></div>}</div>; }
function WorkbenchProgress({ node, taskCount, riskCount }: { node: OverviewNode | null; taskCount: number; riskCount: number }) { const usage = node ? (["cpu", "memory", "disk"] as const).filter((field) => node.availability[field]).map((field) => percentValue(node[field])) : []; const stability = usage.length ? Math.max(0, Math.min(100, Math.round(100 - usage.reduce((sum, value) => sum + value, 0) / usage.length / 2 - riskCount * 8 - taskCount * 4))) : null; return <div className="workbench-progress"><header><span>当前目标</span><strong>{node?.version ?? "-"} 工作区</strong></header>{stability === null ? <div className="progress-score"><b>暂不可用</b></div> : <div className="progress-score"><b>{stability}%</b><i><span style={{ width: `${stability}%` }} /></i></div>}<p>待处理任务 {taskCount} · 风险 {riskCount} · {node?.owner ?? "等待采集"}{node?.freshness === "stale" ? ` · 数据已过期 ${formatBackendDateTime(node.collectedAt, "")}` : ""}</p><div className="progress-meta"><span>CPU {node?.availability.cpu ? node.cpu : "暂不可用"}</span><span>内存 {node?.availability.memory ? node.memory : "暂不可用"}</span><span>磁盘 {node?.availability.disk ? node.disk : "暂不可用"}</span></div></div>; }
function ResourceOverview({ resources }: { resources: OverviewResourceRecord[] }) {
  if (!resources.length) return <div className="feed-empty">等待遥测</div>;
  return <div className="resource-grid">{resources.map((resource) => <article key={resource.label}>
    <div><span>{resource.label}</span><em>{resource.freshness === "stale" ? `数据已过期 · ${formatBackendDateTime(resource.collectedAt, "暂不可用")}` : resource.delta}</em></div>
    <strong>{resource.value}</strong>
    {resource.values.length ? <Sparkline values={resource.values} tone={resource.freshness === "stale" ? "gray" : "blue"} /> : <span className="resource-unavailable">暂不可用</span>}
  </article>)}</div>;
}

export { AuditTable, HostTable, NodeDetailContent, ResourceOverview, RiskList, TaskTable, WorkbenchProgress };
