import { checkOverviewUpdates, fetchOverview, refreshOverview } from "../api/overviewApi";
import type { OverviewAuditRow, OverviewNode, OverviewResourceRecord, OverviewRiskRecord, OverviewService, OverviewSummaryPayload, OverviewTaskRecord } from "../api/overviewApi";
import { CheckCircle2, CircleHelp, Code2, KeyRound, MoreVertical, RefreshCw, Shield } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PanelCard } from "../components/ui/Cards";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { Bar, Sparkline, StatusLight } from "../components/ui/StatusVisuals";
import { isCleanUpdate, percentValue } from "../features/hosts/model";
import { emptyOverviewSummary, healthProbeTone, overviewMetricIcons, reportApiError, serviceHealthLabel, serviceHealthTone, serviceTone, taskTone } from "../features/overview/model";
import type { Notify, SetPage, ToastTone } from "../types/app";

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
      const message = loadError instanceof Error ? loadError.message : "工作台数据加载失败";
      setError(message);
      reportApiError(loadError, notify, "工作台数据加载失败");
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

  const reloadOverview = async (request: () => Promise<OverviewSummaryPayload>, success?: string, tone: ToastTone = "success") => {
    try {
      const payload = await request();
      setOverview(payload);
      setError(null);
      if (success) notify(success, tone);
    } catch (error) {
      reportApiError(error, notify, "工作台后端请求失败");
    }
  };

  return (
    <div className="overview-page">
      <h1 className="sr-only">工作台</h1>
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
            onClick={() => {
              void reloadOverview(refreshOverview, "工作台数据已刷新");
            }}
          >
            <RefreshCw size={14} /> 刷新
          </button>
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
            <RefreshCw size={14} /> 检查更新
          </button>
          <button className="warning small" type="button" onClick={() => setPage("overview-risks", { message: "已打开风险中心", tone: "warning" })}>风险中心 <b>{pendingRiskCount}</b></button>
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
          <span>后端返回了空工作台数据。</span>
          <button type="button" onClick={() => void loadOverview(undefined, false)}>重新采集</button>
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
  line,
}: {
  label: string;
  value: string;
  suffix: string;
  delta: string;
  icon: LucideIcon;
  tone: string;
  line: number[];
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon"><Icon size={24} /></div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}<em>{suffix}</em></strong>
        <p className={tone === "red" || tone === "orange" ? "orange-text" : "green-text"}>{delta}</p>
      </div>
      <Sparkline values={line} tone={tone} />
    </article>
  );
}

function OverviewServiceList({ services }: { services: OverviewService[] }) {
  return (
    <div className="drawer-list">
      <strong>服务列表</strong>
      {services.map((service) => (
        <p key={service.id}>
          <StatusLight tone={serviceTone(service.status)} />
          {service.name}
          <span>{service.status} · {service.detail}</span>
        </p>
      ))}
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
              <td><StatusLight tone={host.status === "警告" ? "orange" : host.status === "维护" ? "gray" : "green"} /> {host.name}</td>
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
                  aria-label={`${host.name} 更多操作`}
                >
                  <MoreVertical size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selectedHost && (
        <DetailDrawer title={selectedHost.name} subtitle={`${selectedHost.ip} · ${selectedHost.env}`} onClose={() => setSelectedHostId(null)} autoFocus={false}>
          <div className="detail-kv">
            <p><span>状态</span><b><StatusLight tone={selectedHost.status === "健康" ? "green" : selectedHost.status === "警告" ? "orange" : "gray"} /> {selectedHost.status}</b></p>
            <p><span>延迟</span><b><StatusLight tone={healthProbeTone(selectedHost.latencyStatus)} /> {selectedHost.latency}</b></p>
            <p><span>版本</span><b>{selectedHost.version}</b></p>
            <p><span>运行时间</span><b>{selectedHost.uptime}</b></p>
            <p><span>备份</span><b><StatusLight tone={healthProbeTone(selectedHost.backupStatus)} /> {selectedHost.backup}</b></p>
            <p><span>更新</span><b>{selectedHost.update}</b></p>
            <p><span>负责人</span><b>{selectedHost.owner}</b></p>
          </div>
          <div className="resource-bars">
            <p><span>CPU</span><Bar value={selectedHost.cpu} tone={selectedHost.status === "警告" ? "orange" : "green"} /></p>
            <p><span>内存</span><Bar value={selectedHost.memory} tone={selectedHost.status === "警告" ? "red" : "green"} /></p>
            <p><span>磁盘</span><Bar value={selectedHost.disk} tone={selectedHost.status === "警告" ? "red" : "green"} /></p>
          </div>
          <OverviewServiceList services={selectedHost.services} />
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
          <StatusLight tone={taskTone(row.status)} />
          <span className="task-icon"><Code2 size={15} /></span>
          <strong>{row.type}</strong>
          <p>{row.title}</p>
          <b>{row.status}</b>
          <em>{row.queuedAt}</em>
          <small>{row.duration}</small>
        </div>
      ))}
      {rows.length === 0 && <div><StatusLight tone="gray" /><p>暂无任务</p></div>}
    </div>
  );
}

function AuditTable({ rows }: { rows: OverviewAuditRow[] }) {
  return (
    <div className="audit-feed">
      {rows.slice(0, 6).map((row) => (
        <article key={row[0] + row[6]}>
          <span>{row[0]}</span>
          <strong>{row[3]}</strong>
          <p>{row[1]} · {row[2]} · {row[4]}</p>
          <em className={row[5] === "失败" ? "pill red" : "pill green"}>{row[5]}</em>
        </article>
      ))}
      {rows.length === 0 && <div className="feed-empty">暂无近期动态</div>}
    </div>
  );
}

function RiskList({ risks }: { risks: OverviewRiskRecord[] }) {
  return (
    <div className="risk-list">
      {risks.slice(0, 4).map((row) => (
        <div key={row.id}>
          <KeyRound size={16} />
          <span>
            <strong>{row.title}</strong>
            <b>{row.target}</b>
          </span>
          <em className={row.level === "高危" ? "red-text" : row.level === "中危" ? "orange-text" : "blue-text"}>{row.level}</em>
          <small>{row.detected}</small>
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

export { OverviewPage, MetricCard, OverviewServiceList, HostTable, TaskTable, AuditTable, RiskList, WorkbenchProgress, ResourceOverview };
