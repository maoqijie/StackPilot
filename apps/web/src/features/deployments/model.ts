import type { DeploymentEnvironment, DeploymentRecord, DeploymentStatus } from "@stackpilot/contracts";

const environmentLabels: Record<DeploymentEnvironment, string> = {
  production: "生产", staging: "预发", development: "开发", unknown: "未分类",
};
const statusLabels: Record<DeploymentStatus, string> = {
  queued: "等待预检", preparing: "预检中", ready: "待上线", deploying: "发布中", succeeded: "成功", failed: "失败", expired: "已过期",
};
const stageLabels: Record<string, string> = {
  awaiting_executor: "等待执行器", agent_running: "Agent 正在执行", dispatch_failed: "任务派发失败", complete: "执行完成",
};

export function deploymentEnvironmentLabel(environment: DeploymentEnvironment) { return environmentLabels[environment]; }
export function deploymentStatusLabel(status: DeploymentStatus) { return statusLabels[status]; }
export function deploymentStageLabel(stage: string) { return stageLabels[stage] ?? stage.replaceAll("_", " "); }
export function deploymentStatusTone(status: DeploymentStatus) { return status === "succeeded" ? "green" : status === "failed" || status === "expired" ? "red" : status === "ready" ? "orange" : "blue"; }
export function deploymentApp(row: DeploymentRecord) { return row.domains.join("、"); }
export function deploymentVersion(row: DeploymentRecord) { return row.releaseId ?? row.repositoryRef; }
