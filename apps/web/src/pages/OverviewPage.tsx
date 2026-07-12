import { checkOverviewUpdates, fetchOverview } from "../api/overviewApi";
import type { OverviewAuditRow, OverviewNode, OverviewResourceRecord, OverviewRiskRecord, OverviewService, OverviewSummaryPayload, OverviewTaskRecord } from "../api/overviewApi";
import { Activity, CheckCircle2, CircleHelp, CircleX, Clock3, Eye, HardDrive, KeyRound, LoaderCircle, PackageSearch, Server, Shield, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PanelCard } from "../components/ui/Cards";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { Bar, Sparkline, StatusLight } from "../components/ui/StatusVisuals";
import { isCleanUpdate, percentValue } from "../features/hosts/model";
import { emptyOverviewSummary, healthProbeTone, overviewMetricIcons, reportApiError, serviceHealthLabel, serviceHealthTone, serviceTone, taskTone } from "../features/overview/model";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import type { Notify, SetPage } from "../types/app";

function OverviewPage({ setPage, notify }: { setPage: SetPage; notify: Notify }) {
  const [overview, setOverview] = useState<OverviewSummaryPayload>(() => emptyOverviewSummary());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [taskTab, setTaskTab] = useState("全部任务");
  const resourceTabs = Object.keys(overview.resources);
  const [resourceTab, setResourceTab] = useState("当前采样");
  const activeResourceTab = resourceTabs.includes(resourceTab) ? resourceTab : resourceTabs[0] ?? "当前采样";
  const pendingRiskCount = overview.risks.filter((risk) => risk.status === "待处理").length;
  const queuedTaskCount = overview.tasks.filter((task) => ["运行中", "等待"].includes(task.status)).length;
  const highRiskCount = overview.risks.filter((risk) => risk.status === "待处理" && risk.level === "高危").length;
  const hasOverview = overview.nodes.length > 0 || overview.metrics.length > 0;
  const currentNode = overview.nodes[0] ?? null;
  const healthTone = overview.cluster.health === "健康" ? "green" : overview.cluster.health === "维护" ? "gray" : "orange";
  const statusToneClass = overview.cluster.health === "健康" ? "green-text" : overview.cluster.health === "维护" ? "gray-text" : "orange-text";
  const summaryItems = [
    { label: "状态", value: overview.cluster.health, className: statusToneClass },
    { label: "延迟", value: overview.cluster.latency },
    { label: "版本", value: overview.cluster.version },
    { label: "运行", value: overview.cluster.uptime },
    { label: "刷新", value: overview.lastRefresh || "-" },
    {
      label: "待处理",
      value: `${overview.cluster.pendingUpdates}`,
      className: overview.cluster.pendingUpdates ? "red-text" : "green-text",
    },
  ];

  const loadOverview = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const payload = await fetchOverview(signal);
      setOverview(payload);
      setError(null);
    } catch (loadError) {
      if (signal?.aborted) return;
      if (!silent) {
        const message = loadError instanceof Error ? loadError.message : "工作台数据加载失败";
        setError(message);
        reportApiError(loadError, notify, "工作台数据加载失败");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const controller = new AbortController();
    fetchOverview(controller.signal)
      .then((payload) => {
        setOverview(payload);
        setError(null);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        const message = loadError instanceof Error ? loadError.message : "工作台数据加载失败";
        setError(message);
        setLoading(false);
        reportApiError(loadError, notify, "工作台数据加载失败");
      });
    return () => controller.abort();
  }, [notify]);

  useAutoRefresh((signal) => loadOverview(signal, true), undefined, !loading);

  return (
    <div className="overview-page">
      <header className="overview-page-head">
        <div>
          <span>Operations overview</span>
          <h1>工作台</h1>
          <p>基础设施、任务与风险的实时运行视图</p>
        </div>
        <span className="overview-freshness"><StatusLight tone={error ? "red" : loading ? "blue" : healthTone} />{loading ? "正在采集" : error ? "采集异常" : `更新于 ${overview.lastRefresh || "刚刚"}`}</span>
      </header>
      <section className="workbench-hero" aria-label="实时工作台状态">
        <div className="workbench-identity">
          <span className="workbench-eyebrow">实时工作台</span>
          <strong><StatusLight tone={healthTone} /> {overview.cluster.current || "等待采集"}</strong>
        </div>
        <div className="workbench-summary" aria-label="采样摘要">
          {summaryItems.map((item) => (
            <span key={item.label}>
              <em>{item.label}</em>
              <b className={item.className}>{item.value}</b>
            </span>
          ))}
        </div>
        <div className="workbench-actions">
          <button
            className="ghost small"
            type="button"
            onClick={async () => {
              try {
                const payload = await checkOverviewUpdates();
                setOverview(payload.overview);
                notify(payload.message, payload.tone ?? "warning");
              } catch (error) {
                reportApiError(error, notify, "检查更新失败");
              }
            }}
          >
            <PackageSearch size={14} /> 检查更新
          </button>
          <button className="warning small" type="button" onClick={() => setPage("overview-risks", { message: "已打开风险中心", tone: "warning" })}><ShieldAlert size={14} /> 风险中心 <b>{pendingRiskCount}</b></button>
        </div>
      </section>
      {loading && <div className="overview-inline-detail"><StatusLight tone="blue" /> 正在从后端实时采集工作台数据...</div>}
      {error && (
        <div className="overview-error-state">
          <Shield size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => void loadOverview(undefined, false)}>重试</button>
        </div>
      )}
      {!loading && !error && !hasOverview && (
        <div className="overview-error-state">
          <CircleHelp size={18} />
          <span>后端暂未返回工作台数据，系统将继续自动采集。</span>
        </div>
      )}
      <section className="metric-row">
        {overview.metrics.map((item) => (
          <MetricCard key={item.label} {...item} icon={overviewMetricIcons[item.icon]} />
        ))}
      </section>
      <section className="overview-grid">
        <div className="left-stack">
          <PanelCard title="集群状态" action="查看全部" onAction={() => setPage("overview-health", { message: "已打开集群状态", tone: "info" })}>
            <HostTable nodes={overview.nodes} notify={notify} />
          </PanelCard>
          <div className="two-panels">
            <PanelCard title="处置建议" tabs={["全部任务", `待处理 (${queuedTaskCount})`]} activeTab={taskTab} onTabChange={setTaskTab} action="查看全部" onAction={() => setPage("overview-tasks", { message: "已打开任务流", tone: "info" })}>
              <TaskTable tasks={overview.tasks} queued={taskTab !== "全部任务"} />
            </PanelCard>
            <PanelCard title="近期动态" action="查看全部" onAction={() => setPage("audit", { message: "已打开审计日志列表", tone: "info" })}>
              <AuditTable rows={overview.audits} />
            </PanelCard>
          </div>
        </div>
        <div className="right-stack">
          <PanelCard title={`风险预警 ${highRiskCount ? `(${highRiskCount} 高危)` : ""}`} action="查看详情" onAction={() => setPage("overview-risks", { message: "已打开风险中心", tone: "warning" })}>
            <RiskList risks={overview.risks} />
          </PanelCard>
          <PanelCard title="当前目标">
            <WorkbenchProgress node={currentNode} taskCount={queuedTaskCount} riskCount={pendingRiskCount} />
          </PanelCard>
          <PanelCard title="资源概览" tabs={resourceTabs} activeTab={activeResourceTab} onTabChange={setResourceTab}>
            <ResourceOverview resources={overview.resources[activeResourceTab] ?? []} />
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  delta,
  icon: Icon,
  tone,
  details,
}: {
  label: string;
  value: string;
  suffix: string;
  delta: string;
  icon: LucideIcon;
  tone: string;
  line: number[];
  details?: Array<{ label: string; value: string; detail: string }>;
}) {
  const numericValue = percentValue(`${value}${suffix}`);
  const isPercentage = suffix === "%";
  const progress = isPercentage ? numericValue : 100;
  const radius = 38;
  return (
    <article className={`metric-card ${tone} ${details?.length ? "has-details" : ""}`} tabIndex={details?.length ? 0 : undefined} aria-describedby={details?.length ? `metric-details-${label}` : undefined}>
      <div className={`metric-ring ${isPercentage ? "is-progress" : "is-count"}`}>
        <svg viewBox="0 0 96 96" aria-hidden="true">
          <circle className="metric-ring-track" cx="48" cy="48" r={radius} />
          <circle
            className="metric-ring-value"
            cx="48"
            cy="48"
            r={radius}
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 - progress}
          />
        </svg>
        <span><Icon size={16} /><strong>{value}<em>{suffix}</em></strong></span>
      </div>
      <div className="metric-copy">
        <span>{label}</span>
        <p className={tone === "red" || tone === "orange" ? "orange-text" : "green-text"}>{delta}</p>
      </div>
      {details?.length ? (
        <div className="metric-details-tooltip" id={`metric-details-${label}`} role="tooltip">
          <header><strong>磁盘明细</strong><span>{details.length} 个盘</span></header>
          <div>
            {details.map((detail) => (
              <p key={`${detail.label}-${detail.value}`}>
                <span><b>{detail.label}</b><small>{detail.detail}</small></span>
                <strong>{detail.value}</strong>
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function OverviewServiceList({ services }: { services: OverviewService[] }) {
  return (
    <div className="node-service-list">
      {services.map((service) => (
        <article key={service.id}>
          <StatusLight tone={serviceTone(service.status)} />
          <span><strong>{service.name}</strong><small>{service.target}</small></span>
          <span><b>{service.status}</b><small>{service.detail}</small></span>
        </article>
      ))}
      {services.length === 0 && <p className="node-detail-empty">未发现服务实例</p>}
    </div>
  );
}

function NodeDetailContent({ node }: { node: OverviewNode }) {
  const statusTone = node.status === "健康" ? "green" : node.status === "警告" ? "orange" : "gray";
  return (
    <div className="node-detail-content">
      <section className="node-detail-summary">
        <span className="node-detail-summary-icon"><Server size={20} /></span>
        <div><span>节点状态</span><strong><StatusLight tone={statusTone} /> {node.status}</strong></div>
        <div><span>网络延迟</span><strong><StatusLight tone={healthProbeTone(node.latencyStatus)} /> {node.latency}</strong></div>
      </section>
      <section className="node-detail-section">
        <header><Server size={17} /><strong>节点信息</strong></header>
        <div className="node-detail-facts">
          <p><span>版本</span><b>{node.version}</b></p>
          <p><span>运行时间</span><b>{node.uptime}</b></p>
          <p><span>最后备份</span><b><StatusLight tone={healthProbeTone(node.backupStatus)} /> {node.backup}</b></p>
          <p><span>更新状态</span><b className={isCleanUpdate(node.update) ? "green-text" : "orange-text"}>{node.update}</b></p>
          <p><span>负责人</span><b>{node.owner}</b></p>
        </div>
      </section>
      <section className="node-detail-section">
        <header><Activity size={17} /><strong>资源使用</strong></header>
        <div className="node-resource-list">
          <p><span>CPU</span><Bar value={node.cpu} tone={node.status === "警告" ? "orange" : "green"} /></p>
          <p><span>内存</span><Bar value={node.memory} tone={node.status === "警告" ? "red" : "green"} /></p>
          <p><span>磁盘</span><Bar value={node.disk} tone={node.status === "警告" ? "red" : "green"} /></p>
        </div>
      </section>
      <section className="node-detail-section">
        <header><HardDrive size={17} /><strong>服务列表</strong><span>{node.services.length} 个实例</span></header>
        <OverviewServiceList services={node.services} />
      </section>
    </div>
  );
}

function HostTable({ nodes, notify }: { nodes: OverviewNode[]; notify: Notify }) {
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null);
  const selectedHost = nodes.find((host) => host.id === selectedHostId) ?? null;
  const openHostDetail = (host: OverviewNode) => {
    setSelectedHostId(host.id);
    notify(`${host.name} 详情已打开`, "info");
  };

  return (
    <>
      <table className="mini-table host-table">
        <thead>
          <tr>
            <th>主机名</th>
            <th>IP 地址</th>
            <th>CPU</th>
            <th>内存</th>
            <th>磁盘</th>
            <th>服务健康</th>
            <th>备份状态</th>
            <th>更新状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((host) => (
            <tr className={selectedHostId === host.id ? "is-selected" : ""} key={host.id}>
              <td><span className="overview-host-name" title={host.name}><StatusLight tone={host.status === "警告" ? "orange" : host.status === "维护" ? "gray" : "green"} /><b>{host.name}</b></span></td>
              <td>{host.ip}</td>
              <td><Bar value={host.cpu} tone={host.status === "警告" ? "orange" : "green"} /></td>
              <td><Bar value={host.memory} tone={host.status === "警告" ? "red" : "green"} /></td>
              <td><Bar value={host.disk} tone={host.status === "警告" ? "red" : "green"} /></td>
              <td><StatusLight tone={serviceHealthTone(host.services)} /> {serviceHealthLabel(host.services)}</td>
              <td><StatusLight tone={healthProbeTone(host.backupStatus)} /> {host.backup}</td>
              <td className={isCleanUpdate(host.update) ? "green-text" : "orange-text"}>{host.update}</td>
              <td>
                <button
                  className="icon-action inline"
                  type="button"
                  onClick={() => openHostDetail(host)}
                  aria-label={`查看 ${host.name} 节点详情`}
                  title="查看详情"
                >
                  <Eye size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selectedHost && (
        <DetailDrawer title={selectedHost.name} subtitle={`${selectedHost.ip} · ${selectedHost.env}`} onClose={() => setSelectedHostId(null)} autoFocus={false}>
          <NodeDetailContent node={selectedHost} />
        </DetailDrawer>
      )}
    </>
  );
}

function TaskTable({ tasks, queued }: { tasks: OverviewTaskRecord[]; queued?: boolean }) {
  const rows = queued ? tasks.filter((row) => ["运行中", "等待"].includes(row.status)) : tasks.slice(0, 6);
  return (
    <div className="task-flow">
      {rows.map((row) => (
        <div key={row.id}>
          <FeedStatusIcon status={row.status} />
          <span className="feed-copy"><strong>{row.type}</strong><p>{row.title}</p><time>{row.queuedAt}</time></span>
          <span className="feed-result"><b className={`${taskTone(row.status)}-text`}>{row.status}</b><small>{row.duration}</small></span>
        </div>
      ))}
      {rows.length === 0 && <div className="feed-empty">暂无任务</div>}
    </div>
  );
}

function AuditTable({ rows }: { rows: OverviewAuditRow[] }) {
  return (
    <div className="audit-feed">
      {rows.slice(0, 6).map((row) => (
        <article key={row[0] + row[6]}>
          <FeedStatusIcon status={row[5]} />
          <span className="feed-copy">
            <strong>{row[3]}</strong>
            <span className="feed-context"><span>{row[1]}</span><span>{row[2]}</span><span>{row[4]}</span></span>
            <time>{row[0]}</time>
          </span>
          <span className="feed-result"><b className={row[5] === "失败" ? "red-text" : "green-text"}>{row[5]}</b><code>{row[6]}</code></span>
        </article>
      ))}
      {rows.length === 0 && <div className="feed-empty">暂无近期动态</div>}
    </div>
  );
}

function FeedStatusIcon({ status }: { status: OverviewTaskRecord["status"] | OverviewAuditRow[5] }) {
  const tone = status === "成功" ? "green" : status === "失败" ? "red" : status === "运行中" ? "blue" : "orange";
  const Icon = status === "成功" ? CheckCircle2 : status === "失败" ? CircleX : status === "运行中" ? LoaderCircle : Clock3;
  return <span className={`feed-status-icon ${tone}`} aria-hidden="true"><Icon size={18} /></span>;
}

function RiskList({ risks }: { risks: OverviewRiskRecord[] }) {
  return (
    <div className="risk-list">
      {risks.slice(0, 4).map((row) => (
        <div key={row.id}>
          <span className={`risk-icon ${row.level === "高危" ? "red" : row.level === "中危" ? "orange" : "blue"}`}><KeyRound size={15} /></span>
          <span className="feed-copy"><strong>{row.title}</strong><p>{row.target}</p><em>{row.detected}</em></span>
          <span className="feed-result"><b className={row.level === "高危" ? "red-text" : row.level === "中危" ? "orange-text" : "blue-text"}>{row.level}</b><small>{row.owner}</small></span>
        </div>
      ))}
      {risks.length === 0 && <div className="risk-empty"><CheckCircle2 size={17} /><span>当前没有实时风险</span></div>}
    </div>
  );
}

function WorkbenchProgress({ node, taskCount, riskCount }: { node: OverviewNode | null; taskCount: number; riskCount: number }) {
  const cpu = node ? percentValue(node.cpu) : 0;
  const memory = node ? percentValue(node.memory) : 0;
  const disk = node ? percentValue(node.disk) : 0;
  const stability = Math.max(0, Math.min(100, Math.round(100 - (cpu + memory + disk) / 6 - riskCount * 8 - taskCount * 4)));
  return (
    <div className="workbench-progress">
      <header>
        <span>当前目标</span>
        <strong>{node?.version ?? "-"} 工作区</strong>
      </header>
      <div className="progress-score">
        <b>{stability}%</b>
        <i><span style={{ width: `${stability}%` }} /></i>
      </div>
      <p>待处理任务 {taskCount} · 风险 {riskCount} · {node?.owner ?? "等待采集"}</p>
      <div className="progress-meta">
        <span>CPU {node?.cpu ?? "-"}</span>
        <span>内存 {node?.memory ?? "-"}</span>
        <span>磁盘 {node?.disk ?? "-"}</span>
      </div>
    </div>
  );
}

function ResourceOverview({ resources }: { resources: OverviewResourceRecord[] }) {
  return (
    <div className="resource-grid">
      {resources.map((resource) => (
        <article key={resource.label}>
          <div><span>{resource.label}</span><em>{resource.delta}</em></div>
          <strong>{resource.value}</strong>
          <Sparkline values={resource.values} tone="blue" />
        </article>
      ))}
    </div>
  );
}

export { OverviewPage, MetricCard, NodeDetailContent, HostTable, TaskTable, AuditTable, RiskList, WorkbenchProgress, ResourceOverview };
