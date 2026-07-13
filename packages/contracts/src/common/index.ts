import { z } from "zod";

export const API_ROOT_SEGMENTS = ["api", "overview"] as const;
export const API_CLIENT_PREFIX = "/api" as const;
export const WRITE_METHODS = ["POST", "PATCH", "DELETE"] as const;

export const ApiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "REAUTHENTICATION_FAILED",
  "FORBIDDEN",
  "NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
  "NOT_READY",
  "NOT_IMPLEMENTED",
  "TOO_MANY_REQUESTS",
  "INTERNAL_ERROR",
]);

export const ApiErrorResponseSchema = z.object({
  code: ApiErrorCodeSchema,
  error: z.string().min(1),
  requestId: z.string().min(1),
});

export const ApiNoticeSchema = z.object({
  message: z.string(),
  tone: z.enum(["success", "info", "warning", "danger"]).optional(),
});

export const EmptyObjectSchema = z.object({}).strict();
export const PathIdSchema = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9._:-]+$/);
export const EmptyQuerySchema = z.object({}).strict();
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.literal("stackpilot-api"),
  time: z.string(),
});
export const ReadinessResponseSchema = z.object({
  ready: z.boolean(),
  service: z.literal("stackpilot-api"),
});

export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;
export type ApiNotice = z.infer<typeof ApiNoticeSchema>;
export type WriteMethod = (typeof WRITE_METHODS)[number];
