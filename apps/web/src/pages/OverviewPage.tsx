import { checkOverviewUpdates, fetchOverview } from "../api/overviewApi";
import type { OverviewNode, OverviewSummaryPayload } from "../api/overviewApi";
import { CircleHelp, PackageSearch, Shield, ShieldAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PanelCard } from "../components/ui/Cards";
import { StatusLight } from "../components/ui/StatusVisuals";
import { percentValue } from "../features/hosts/model";
import { emptyOverviewSummary, overviewMetricIcons, reportApiError } from "../features/overview/model";
import { useOptionalOverviewData } from "../features/overview/OverviewDataProvider";
import { AuditTable, HostTable, ResourceOverview, RiskList, TaskTable, WorkbenchProgress } from "../features/overview/OverviewTables";
import type { Notify, SetPage } from "../types/app";
import { formatBackendDateTime, overviewCollectedAt } from "../utils/time";

function OverviewPage({ setPage, notify }: { setPage: SetPage; notify: Notify }) {
  const shared = useOptionalOverviewData();
  const [localOverview, setLocalOverview] = useState<OverviewSummaryPayload>(() => emptyOverviewSummary());
  const [localLoading, setLocalLoading] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const overview = shared?.overview ?? localOverview;
  const loading = shared?.loading ?? localLoading;
  const error = shared?.error ?? localError;
  const [taskTab, setTaskTab] = useState("全部任务");
  const resourceTabs = buildResourceTabs(overview.nodes, Object.keys(overview.resources));
  const [resourceTab, setResourceTab] = useState("cluster");
  const activeResourceTab = resourceTabs.some((tab) => tab.key === resourceTab) ? resourceTab : resourceTabs[0]?.key ?? "cluster";
  const activeResourceLabel = resourceTabs.find((tab) => tab.key === activeResourceTab)?.label;
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
    { label: "刷新", value: formatBackendDateTime(overviewCollectedAt(overview), "-") },
    {
      label: "待处理",
      value: `${overview.cluster.pendingUpdates}`,
      className: overview.cluster.pendingUpdates ? "red-text" : "green-text",
    },
  ];

  const loadOverview = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (shared) { await shared.reload(); return; }
    if (!silent) setLocalLoading(true);
    try {
      const payload = await fetchOverview(signal);
      setLocalOverview(payload);
      setLocalError(null);
    } catch (loadError) {
      if (signal?.aborted) return;
      if (!silent) {
        const message = loadError instanceof Error ? loadError.message : "工作台数据加载失败";
        setLocalError(message);
        reportApiError(loadError, notify, "工作台数据加载失败");
      }
    } finally {
      if (!signal?.aborted) setLocalLoading(false);
    }
  }, [notify, shared]);

  useEffect(() => {
    if (shared) return;
    const controller = new AbortController();
    fetchOverview(controller.signal)
      .then((payload) => {
        setLocalOverview(payload);
        setLocalError(null);
        setLocalLoading(false);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        const message = loadError instanceof Error ? loadError.message : "工作台数据加载失败";
        setLocalError(message);
        setLocalLoading(false);
        reportApiError(loadError, notify, "工作台数据加载失败");
      });
    return () => controller.abort();
  }, [notify, shared]);

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
            onClick={async () => {
              try {
                const payload = await checkOverviewUpdates();
                if (shared) shared.replace(payload.overview); else setLocalOverview(payload.overview);
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
          <PanelCard title="资源概览" tabs={resourceTabs.map((tab) => tab.label)} activeTab={activeResourceLabel} onTabChange={(label) => setResourceTab(resourceTabs.find((tab) => tab.label === label)?.key ?? activeResourceTab)}>
            <ResourceOverview resources={overview.resources[activeResourceTab] ?? []} />
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function buildResourceTabs(nodes: OverviewNode[], resourceKeys: string[]) {
  const labels = resourceKeys.map((key) => key === "cluster" ? "集群" : key === "node-local" ? nodes.find((node) => node.source === "controller")?.name ?? "Controller" : nodes.find((node) => node.id === key)?.name ?? key);
  return resourceKeys.map((key, index) => {
    const label = labels[index] ?? key;
    return { key, label: labels.filter((candidate) => candidate === label).length > 1 ? `${label} (${key.slice(0, 8)})` : label };
  });
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

export { OverviewPage, MetricCard };
export { NodeDetailContent } from "../features/overview/OverviewTables";
