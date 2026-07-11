import { ZodError } from "zod";
import type { Logger } from "../../logging/logger.js";
import { ServiceError } from "../../modules/serviceError.js";
import { ApiError } from "./ApiError.js";

export function mapError(error: unknown, requestId: string, logger: Logger) {
  if (error instanceof ApiError) return error;
  if (error instanceof ServiceError) return new ApiError(error.status, error.code, error.message);
  if (error instanceof ZodError) {
    logger.log({ level: "error", time: new Date().toISOString(), message: "响应契约校验失败", requestId, issueCount: error.issues.length });
    return new ApiError(500, "INTERNAL_ERROR", "服务内部错误");
  }
  logger.log({ level: "error", time: new Date().toISOString(), message: "未预期的 Controller 错误", requestId, errorName: error instanceof Error ? error.name : "UnknownError" });
  return new ApiError(500, "INTERNAL_ERROR", "服务内部错误");
}
