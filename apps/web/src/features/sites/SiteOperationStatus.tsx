import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import type { SiteOperation } from "../../api/sitesApi";
import { formatBackendDateTime } from "../../utils/time";

function SiteOperationStatus({ operation, error }: { operation: SiteOperation; error: string | null }) {
  const done = operation.status === "succeeded";
  const failed = operation.status === "failed" || operation.status === "cancelled";
  const Icon = done ? CircleCheck : failed ? CircleAlert : LoaderCircle;
  return <section className={`site-operation-status is-${operation.status}`} aria-live="polite">
    <Icon size={18} className={!done && !failed ? "is-spinning" : undefined} />
    <span><strong>{operationLabel(operation)}</strong><small>{operation.progressPercent}% · {stageLabel(operation.stage)} · {formatBackendDateTime(operation.updatedAt)}</small>{error && <em>{error}</em>}</span>
  </section>;
}

function stageLabel(stage: string) {
  return {
    awaiting_executor: "等待执行器",
    agent_running: "节点执行中",
    certificate_renewal: "证书续期中",
    dispatch_failed: "任务下发失败",
    complete: "已完成",
    lifecycle_running: "正在启动",
    lifecycle_stopped: "正在停止",
    lifecycle_deleted: "正在软删除",
    lifecycle_restored: "正在恢复",
  }[stage] ?? "处理中";
}

function operationLabel(operation: SiteOperation) {
  if (operation.status === "succeeded") return "操作已完成";
  if (operation.status === "failed") return `操作失败${operation.errorCode ? `：${operation.errorCode}` : ""}`;
  if (operation.status === "cancelled") return "操作已取消";
  return operation.status === "running" ? "操作执行中" : "操作等待执行";
}

export { SiteOperationStatus };
