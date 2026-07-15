import { z } from "zod";
import { ApiNoticeSchema } from "../common/index.js";

const SafeLineSchema = z.string().trim().min(1).max(400).refine((value) => !/[\r\n]/.test(value), "不能包含换行");
const ScheduleIdempotencyKeySchema = z.string().trim().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/);
export const CronExpressionSchema = z.string().trim().refine((value) => {
  const parts = value.split(/\s+/);
  return parts.length === 5 && parts.every((part) => /^[\dA-Z*/?,-]+$/i.test(part));
}, "cron 需要是 5 段表达式，例如 0 4 * * *");
export const ScheduleExecutionSchema = z.object({
  id: z.string().uuid(),
  commandDigest: z.string().regex(/^[a-f0-9]{64}$/),
  source: z.enum(["cron", "manual"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  status: z.enum(["成功", "失败"]),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().int().nonnegative(),
  output: z.string().max(16_000),
  error: z.string().max(8_000),
}).strict();
export const ScheduleJobSchema = z.object({
  id: z.string(), name: z.string(), cron: z.string(), command: z.string(), enabled: z.boolean(),
  nextRun: z.string(), nextRunAt: z.string().datetime().nullable(), lastRun: z.string(), result: z.enum(["成功", "失败", "未运行", "运行中"]),
  lastExecution: ScheduleExecutionSchema.nullable().optional(),
}).refine((job) => job.enabled || job.nextRunAt === null, { path: ["nextRunAt"], message: "停用任务不能包含下次执行时间" });
export const SchedulePayloadSchema = z.object({
  jobs: z.array(ScheduleJobSchema),
  scannedAt: z.string().datetime().optional(),
  writeEnabled: z.boolean(),
});
export const CreateScheduleJobRequestSchema = z.object({
  name: SafeLineSchema.max(160), cron: CronExpressionSchema, command: SafeLineSchema, enabled: z.boolean().optional(), idempotencyKey: ScheduleIdempotencyKeySchema,
}).strict();
export const UpdateScheduleJobRequestSchema = z.object({
  name: SafeLineSchema.max(160).optional(), cron: CronExpressionSchema.optional(), command: SafeLineSchema.optional(), enabled: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "至少提供一个可更新字段");
export const RunScheduleJobRequestSchema = z.object({ action: z.literal("run"), idempotencyKey: ScheduleIdempotencyKeySchema }).strict();
export const ScheduleNoticeSchema = ApiNoticeSchema;
export const ScheduleMutationResponseSchema = ApiNoticeSchema.extend({ job: ScheduleJobSchema, jobs: z.array(ScheduleJobSchema) });

export type ScheduleJob = z.infer<typeof ScheduleJobSchema>;
export type ScheduleExecution = z.infer<typeof ScheduleExecutionSchema>;
export type SchedulePayload = z.infer<typeof SchedulePayloadSchema>;
export type ScheduleNotice = z.infer<typeof ScheduleNoticeSchema>;
export type ScheduleMutationResponse = z.infer<typeof ScheduleMutationResponseSchema>;
export type CreateScheduleJobRequest = z.infer<typeof CreateScheduleJobRequestSchema>;
export type UpdateScheduleJobRequest = z.infer<typeof UpdateScheduleJobRequestSchema>;
export type RunScheduleJobRequest = z.infer<typeof RunScheduleJobRequestSchema>;
