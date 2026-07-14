import type { SiteRollbackRecord } from "../../api/deploymentsApi";

const activeStatuses = new Set<SiteRollbackRecord["status"]>(["queued", "running"]);

const statusText: Record<SiteRollbackRecord["status"], string> = {
  available: "可回滚",
  queued: "排队中",
  running: "回滚中",
  succeeded: "已回滚",
  failed: "失败",
  cancelled: "已取消",
};

function matchesRollbackFilter(row: SiteRollbackRecord, filter: string) {
  if (filter === "全部") return true;
  if (filter === "可回滚") return row.status === "available";
  if (filter === "执行中") return activeStatuses.has(row.status);
  if (filter === "成功") return row.status === "succeeded";
  return row.status === "failed" || row.status === "cancelled";
}

export { activeStatuses, matchesRollbackFilter, statusText };
