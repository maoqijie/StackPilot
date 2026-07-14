import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import type { SiteOperation } from "../../api/sitesApi";
import { formatBackendDateTime } from "../../utils/time";

function SiteOperationStatus({ operation, error }: { operation: SiteOperation; error: string | null }) {
  const done = operation.status === "succeeded";
  const failed = operation.status === "failed" || operation.status === "cancelled";
  const Icon = done ? CircleCheck : failed ? CircleAlert : LoaderCircle;
  return <section className={`site-operation-status is-${operation.status}`} aria-live="polite">
    <Icon size={18} className={!done && !failed ? "is-spinning" : undefined} />
    <span><strong>{operationLabel(operation)}</strong><small>{operation.progressPercent}% · {operation.stage} · {formatBackendDateTime(operation.updatedAt)}</small>{error && <em>{error}</em>}</span>
  </section>;
}

function operationLabel(operation: SiteOperation) {
  if (operation.status === "succeeded") return "操作已完成";
  if (operation.status === "failed") return `操作失败${operation.errorCode ? `：${operation.errorCode}` : ""}`;
  if (operation.status === "cancelled") return "操作已取消";
  return operation.status === "running" ? "操作执行中" : "操作等待执行";
}

export { SiteOperationStatus };
