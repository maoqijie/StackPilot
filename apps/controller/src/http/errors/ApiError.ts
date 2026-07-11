import type { ApiErrorCode } from "@stackpilot/contracts";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly headers: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(message: string) { return new ApiError(400, "BAD_REQUEST", message); }
export function notFound(message = "接口不存在") { return new ApiError(404, "NOT_FOUND", message); }
export function forbidden(message: string) { return new ApiError(403, "FORBIDDEN", message); }
