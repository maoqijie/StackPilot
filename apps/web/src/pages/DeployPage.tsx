import type { DeploymentRecord, DeploymentReleaseRecord, Permission } from "@stackpilot/contracts";
import { Activity, CheckCircle2, CircleAlert, Clock3, CloudOff, CloudUpload, Eye, GitBranch, History, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { deployPagePreset } from "../app/pagePresets";
import { pushPageRoute } from "../app/routing";
import { resolvePageMeta } from "../app/navigation";
import { ModulePageShell } from "../components/layout/ModulePageShell";
import { MetricTile } from "../components/ui/Cards";
import { DataTable } from "../components/ui/DataTable";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { deploymentApp, deploymentEnvironmentLabel, deploymentStageLabel, deploymentStatusLabel, deploymentStatusTone, deploymentVersion } from "../features/deployments/model";
import { useDeployments } from "../features/deployments/useDeployments";
import type { PageKey } from "../types/app";
import { formatBackendDateTime } from "../utils/time";

const environmentValues = ["production", "staging", "development", "unknown"] as const;
type EnvironmentFilter = "all" | typeof environmentValues[number];

function DeployPage({ page, permissions = ["sites:read", "sites:deploy"] }: { page: PageKey; permissions?: Permission[] }) {
  const canRead = permissions.includes("sites:read");
  const canDeploy = permissions.includes("sites:deploy");
  const preset = deployPagePreset(page);
  const initialEnvironment: EnvironmentFilter = page === "deploy-rollbacks" ? "all" : page === "deploy-staging" ? "staging" : "production";
  const [environment, setEnvironment] = useState<EnvironmentFilter>(initialEnvironment);
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(null);
  const { data, loading, error, backgroundError, retry } = useDeployments(canRead);
  const deployments = useMemo(() => data?.deployments ?? [], [data]);
  const releases = useMemo(() => data?.releases ?? [], [data]);
  const isReleaseView = preset.mode === "rollbacks";
  const filteredDeployments = deployments.filter((row) => environment === "all" || row.environment === environment);
  const filteredReleases = releases.filter((row) => environment === "all" || row.environment === environment);
  const selectedDeployment = selectedDeploymentId ? deployments.find((row) => row.planId === selectedDeploymentId) ?? null : null;
  const selectedRelease = selectedReleaseId ? releases.find((row) => row.releaseId === selectedReleaseId) ?? null : null;

  useEffect(() => { if (selectedDeploymentId && data && !selectedDeployment) queueMicrotask(() => setSelectedDeploymentId(null)); }, [data, selectedDeployment, selectedDeploymentId]);
  useEffect(() => { if (selectedReleaseId && data && !selectedRelease) queueMicrotask(() => setSelectedReleaseId(null)); }, [data, selectedRelease, selectedReleaseId]);
  useEffect(() => { queueMicrotask(() => setEnvironment(initialEnvironment)); }, [initialEnvironment]);

  if (!canRead) return <section className="module-page module-page-deploy-prod"><h1>部署</h1><div className="overview-error-state" role="alert"><CircleAlert size={18} /><span>当前账号没有站点读取权限</span></div></section>;
  const freshness = backgroundError ? `后台刷新失败，保留上次数据：${backgroundError}` : `后端采集于 ${formatBackendDateTime(data?.collectedAt)}`;
  const envOptions: EnvironmentFilter[] = isReleaseView ? ["all", ...environmentValues] : [...environmentValues];

  return <><ModulePageShell title={resolvePageMeta(page).title} subtitle={`${preset.subtitle} · ${freshness}`} page={page}
    actions={!isReleaseView && canDeploy ? <button className="primary" type="button" onClick={() => pushPageRoute("sites-create")}><CloudUpload size={15} /> 创建部署计划</button> : undefined}
    filters={<div className="deploy-tabs" aria-label="部署环境">{envOptions.map((item) => <button key={item} className={item === environment ? "active" : ""} type="button" onClick={() => setEnvironment(item)}>{environmentLabel(item)}</button>)}</div>}
    metrics={isReleaseView
      ? <><MetricTile icon={History} label="发布版本" value={`${filteredReleases.length}`} tone="blue" /><MetricTile icon={Play} label="当前版本" value={`${filteredReleases.filter((row) => row.status === "active").length}`} tone="green" /><MetricTile icon={Clock3} label="历史版本" value={`${filteredReleases.filter((row) => row.status === "historical").length}`} tone="gray" /></>
      : <><MetricTile icon={CloudUpload} label="发布任务" value={`${filteredDeployments.length}`} tone="blue" /><MetricTile icon={Activity} label="进行中" value={`${filteredDeployments.filter((row) => ["queued", "preparing", "deploying"].includes(row.status)).length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="成功" value={`${filteredDeployments.filter((row) => row.status === "succeeded").length}`} tone="green" /></>}>
    {loading && !data && <span className="sr-only" role="status">正在读取真实发布队列</span>}
    {error && !data && <div className="overview-error-state"><CloudOff size={18} /><span>{error}</span><button type="button" onClick={() => void retry()}>重试</button></div>}
    {isReleaseView
      ? <ReleaseTable rows={filteredReleases} loading={loading} onOpen={setSelectedReleaseId} />
      : <DeploymentTable rows={filteredDeployments} loading={loading} onOpen={setSelectedDeploymentId} />}
  </ModulePageShell>
  {selectedDeployment && <DeploymentDrawer row={selectedDeployment} onClose={() => setSelectedDeploymentId(null)} />}
  {selectedRelease && <ReleaseDrawer row={selectedRelease} onClose={() => setSelectedReleaseId(null)} />}
  </>;
}

function DeploymentTable({ rows, loading, onOpen }: { rows: DeploymentRecord[]; loading: boolean; onOpen: (id: string) => void }) {
  return <DataTable columns={[
    { key: "app", label: "发布项目", width: "220px", render: (row) => <button className="module-row-link deploy-project-link" type="button" title={deploymentApp(row)} onClick={() => onOpen(row.planId)}><CloudUpload size={15} /><b>{deploymentApp(row)}</b></button> },
    { key: "target", label: "目标节点", width: "190px", render: (row) => <code title={row.nodeId}>{row.nodeId}</code> },
    { key: "version", label: "版本", width: "210px", render: (row) => <code title={deploymentVersion(row)}>{deploymentVersion(row)}</code> },
    { key: "status", label: "状态", width: "110px", render: (row) => <span className={`pill status-with-icon ${deploymentStatusTone(row.status)}`}>{statusIcon(row)}{deploymentStatusLabel(row.status)}</span> },
    { key: "operator", label: "操作人", width: "110px", render: (row) => row.operator ?? "系统" },
    { key: "updated", label: "更新时间", width: "180px", render: (row) => formatBackendDateTime(row.updatedAt) },
    { key: "ops", label: "操作", width: "90px", render: (row) => <span className="table-actions actions-1"><button type="button" aria-label={`查看 ${deploymentApp(row)} 发布详情`} onClick={() => onOpen(row.planId)}><Eye size={15} />详情</button></span> },
  ]} rows={rows} emptyText={loading ? "正在读取真实发布队列" : "当前环境还没有真实发布任务"} getRowKey={(row) => row.planId} mobileCard={(row) => <DeploymentCard row={row} onOpen={onOpen} />} />;
}

function DeploymentCard({ row, onOpen }: { row: DeploymentRecord; onOpen: (id: string) => void }) {
  return <><div className="module-card-head"><span className="module-card-title"><CloudUpload size={15} /><b title={deploymentApp(row)}>{deploymentApp(row)}</b></span><span className={`pill status-with-icon ${deploymentStatusTone(row.status)}`}>{statusIcon(row)}{deploymentStatusLabel(row.status)}</span></div><code className="module-card-code" title={deploymentVersion(row)}>{deploymentVersion(row)}</code><div className="module-card-meta"><span><b>环境</b><em>{deploymentEnvironmentLabel(row.environment)}</em></span><span><b>节点</b><em title={row.nodeId}>{row.nodeId}</em></span><span><b>操作人</b><em>{row.operator ?? "系统"}</em></span><span><b>更新时间</b><em>{formatBackendDateTime(row.updatedAt)}</em></span></div><div className="module-card-footer"><div className="table-actions actions-1"><button type="button" onClick={() => onOpen(row.planId)}><Eye size={15} />详情</button></div></div></>;
}

function ReleaseTable({ rows, loading, onOpen }: { rows: DeploymentReleaseRecord[]; loading: boolean; onOpen: (id: string) => void }) {
  return <DataTable columns={[
    { key: "app", label: "发布项目", width: "220px", render: (row) => <button className="module-row-link deploy-project-link" type="button" title={row.domains.join("、")} onClick={() => onOpen(row.releaseId)}><History size={15} /><b>{row.domains.join("、")}</b></button> },
    { key: "version", label: "发布版本", width: "240px", render: (row) => <code title={row.releaseId}>{row.releaseId}</code> },
    { key: "ref", label: "Git ref", width: "160px", render: (row) => <code title={row.repositoryRef}>{row.repositoryRef}</code> },
    { key: "status", label: "状态", width: "110px", render: (row) => <span className={`pill status-with-icon ${row.status === "active" ? "green" : "blue"}`}>{row.status === "active" ? <CheckCircle2 size={14} /> : <History size={14} />}{row.status === "active" ? "当前版本" : "历史版本"}</span> },
    { key: "updated", label: "激活时间", width: "180px", render: (row) => formatBackendDateTime(row.activatedAt ?? row.createdAt) },
    { key: "ops", label: "操作", width: "90px", render: (row) => <span className="table-actions actions-1"><button type="button" onClick={() => onOpen(row.releaseId)}><Eye size={15} />详情</button></span> },
  ]} rows={rows} emptyText={loading ? "正在读取真实发布历史" : "当前环境还没有真实发布版本"} getRowKey={(row) => row.releaseId} />;
}

function DeploymentDrawer({ row, onClose }: { row: DeploymentRecord; onClose: () => void }) {
  return <DetailDrawer className="deploy-log-drawer" title="发布详情" subtitle={deploymentApp(row)} modal onClose={onClose}><div className="deploy-detail-summary"><span className={`pill status-with-icon ${deploymentStatusTone(row.status)}`}>{statusIcon(row)}{deploymentStatusLabel(row.status)}</span><strong>{row.progressPercent}%</strong><span>{deploymentStageLabel(row.stage)}</span></div><div className="detail-kv deploy-preview-kv"><p><span>目标节点</span><b title={row.nodeId}>{row.nodeId}</b></p><p><span>Git ref</span><b>{row.repositoryRef}</b></p><p><span>发布版本</span><b title={deploymentVersion(row)}>{deploymentVersion(row)}</b></p><p><span>运行时</span><b>{row.runtime ?? "等待预检"}</b></p><p><span>健康检查</span><b>{row.healthCheckPath ?? "暂不可用"}</b></p><p><span>错误代码</span><b>{row.errorCode ?? "无"}</b></p><p><span>创建时间</span><b>{formatBackendDateTime(row.createdAt)}</b></p><p><span>更新时间</span><b>{formatBackendDateTime(row.updatedAt)}</b></p></div><section className="deploy-source-detail"><h3><GitBranch size={15} /> 仓库来源</h3><code title={row.repositoryUrl}>{row.repositoryUrl}</code></section></DetailDrawer>;
}

function ReleaseDrawer({ row, onClose }: { row: DeploymentReleaseRecord; onClose: () => void }) {
  return <DetailDrawer className="deploy-rollback-drawer" title="发布版本详情" subtitle={row.domains.join("、")} modal onClose={onClose}><div className="detail-kv deploy-preview-kv"><p><span>版本状态</span><b>{row.status === "active" ? "当前版本" : "历史版本"}</b></p><p><span>发布版本</span><b title={row.releaseId}>{row.releaseId}</b></p><p><span>Git ref</span><b>{row.repositoryRef}</b></p><p><span>目标节点</span><b title={row.nodeId}>{row.nodeId}</b></p><p><span>发布环境</span><b>{deploymentEnvironmentLabel(row.environment)}</b></p><p><span>激活时间</span><b>{formatBackendDateTime(row.activatedAt ?? row.createdAt)}</b></p></div></DetailDrawer>;
}

function statusIcon(row: DeploymentRecord) { return row.status === "succeeded" ? <CheckCircle2 size={14} /> : row.status === "failed" || row.status === "expired" ? <CircleAlert size={14} /> : <Activity size={14} />; }
function environmentLabel(environment: EnvironmentFilter) { return environment === "all" ? "全部" : deploymentEnvironmentLabel(environment); }

export { DeployPage };
