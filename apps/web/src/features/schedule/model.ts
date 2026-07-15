import type { ScheduleJob } from "../../api/scheduleApi";
import type { PageKey } from "../../types/app";
import { formatBackendDateTime } from "../../utils/time";

function schedulePagePreset(page: PageKey) {
  if (page === "schedule-failed") return { state: "全部", search: "", mode: "list", subtitle: "失败任务视图，默认定位最近执行失败的自动化任务。" };
  if (page === "schedule-calendar") return { state: "全部", search: "", mode: "calendar", subtitle: "执行日历视图，按时间先后展示真实的下一次执行。" };
  return { state: page === "schedule-enabled" ? "已启用" : "全部", search: "", mode: "list", subtitle: "管理 cron 自动化，支持启停、立即执行、编辑和新增。" };
}

function isLikelyCronExpression(value: string) {
  const parts = value.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  return parts.every((part) => /^[\dA-Z*/?,-]+$/i.test(part));
}

type ScheduleDraft = Pick<ScheduleJob, "name" | "cron" | "command" | "enabled">;

const scheduleCronPresets = [
  { label: "每 5 分钟", cron: "*/5 * * * *" },
  { label: "每小时", cron: "0 * * * *" },
  { label: "每天 02:00", cron: "0 2 * * *" },
  { label: "每周一 03:00", cron: "0 3 * * 1" },
  { label: "每月 1 日 04:00", cron: "0 4 1 * *" },
] as const;

function createScheduleDraft(): ScheduleDraft {
  return { name: "", cron: "*/5 * * * *", command: "", enabled: true };
}

function describeCronExpression(value: string) {
  const cron = value.trim();
  if (cron === "*/5 * * * *") return "每 5 分钟执行";
  if (cron === "0 * * * *") return "每小时执行";
  if (cron === "0 2 * * *") return "每天 02:00 执行";
  if (cron === "0 3 * * 1") return "每周一 03:00 执行";
  if (cron === "0 4 1 * *") return "每月 1 日 04:00 执行";
  return isLikelyCronExpression(cron) ? "自定义 cron 表达式" : "请输入 5 段 cron 表达式";
}

function scheduleCrontabPreview(draft: ScheduleDraft, id?: string) {
  const cron = draft.cron.trim() || "<cron>";
  const command = draft.command.trim() || "<command>";
  if (!draft.enabled) return "# 已停用：保存任务元数据，不写入执行行";
  return `${cron} ${command} # stackpilot:id=${id ?? "保存后生成"}`;
}

function scheduleNextRunLabel(row: ScheduleJob) {
  if (!row.enabled) return "已停用";
  if (!row.nextRunAt || Number.isNaN(Date.parse(row.nextRunAt))) return "时间暂不可用";
  return formatBackendDateTime(row.nextRunAt, "时间暂不可用");
}

function sortScheduleCalendarRows(rows: ScheduleJob[]) {
  const sortableTime = (row: ScheduleJob) => row.enabled && row.nextRunAt && !Number.isNaN(Date.parse(row.nextRunAt)) ? Date.parse(row.nextRunAt) : Number.POSITIVE_INFINITY;
  return [...rows].sort((left, right) => sortableTime(left) - sortableTime(right) || left.name.localeCompare(right.name, "zh-CN"));
}

export { schedulePagePreset, isLikelyCronExpression, scheduleCronPresets, createScheduleDraft, describeCronExpression, scheduleCrontabPreview, scheduleNextRunLabel, sortScheduleCalendarRows };
export type { ScheduleDraft };
