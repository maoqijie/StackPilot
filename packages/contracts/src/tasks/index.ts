import { z } from "zod";
import { ApiNoticeSchema } from "../common/index.js";

export const OverviewMetricIconSchema = z.enum(["server", "globe", "database", "calendar", "shield", "bell"]);
export const OverviewTaskStatusSchema = z.enum(["成功", "运行中", "等待", "失败", "取消", "过期"]);
export const OverviewTaskPrioritySchema = z.enum(["高", "中", "低"]);

export const OverviewTaskRecordSchema = z.object({
  id: z.string(), type: z.string(), title: z.string(), target: z.string(),
  status: OverviewTaskStatusSchema, priority: OverviewTaskPrioritySchema,
  operator: z.string(), queuedAt: z.string(), duration: z.string(), source: z.string(),
  actionLabel: z.string(), collectedAt: z.string(), logs: z.array(z.string()),
});

export const OverviewTaskPageDataSchema = z.object({
  title: z.string(), subtitle: z.string(), searchPlaceholder: z.string(),
  filters: z.array(z.object({ id: z.string(), label: z.string(), statuses: z.array(OverviewTaskStatusSchema) })),
  metrics: z.array(z.object({ label: z.string(), value: z.string(), icon: OverviewMetricIconSchema, tone: z.string() })),
  context: z.object({ eyebrow: z.string(), title: z.string(), chips: z.array(z.string()) }),
  collectedAt: z.string(),
});

export const OverviewTasksPayloadSchema = z.object({
  tasks: z.array(OverviewTaskRecordSchema),
  page: OverviewTaskPageDataSchema,
});
export const RunOverviewTaskRequestSchema = z.object({ action: z.literal("run") }).strict();
export const OverviewTasksRefreshResponseSchema = ApiNoticeSchema.extend(OverviewTasksPayloadSchema.shape);
export const OverviewTaskMutationResponseSchema = ApiNoticeSchema.extend({
  task: OverviewTaskRecordSchema,
  tasks: z.array(OverviewTaskRecordSchema),
  page: OverviewTaskPageDataSchema,
});

export type OverviewMetricIcon = z.infer<typeof OverviewMetricIconSchema>;
export type OverviewTaskStatus = z.infer<typeof OverviewTaskStatusSchema>;
export type OverviewTaskPriority = z.infer<typeof OverviewTaskPrioritySchema>;
export type OverviewTaskRecord = z.infer<typeof OverviewTaskRecordSchema>;
export type OverviewTaskPageData = z.infer<typeof OverviewTaskPageDataSchema>;
export type OverviewTasksPayload = z.infer<typeof OverviewTasksPayloadSchema>;
export type OverviewTasksRefreshResponse = z.infer<typeof OverviewTasksRefreshResponseSchema>;
export type OverviewTaskMutationResponse = z.infer<typeof OverviewTaskMutationResponseSchema>;
