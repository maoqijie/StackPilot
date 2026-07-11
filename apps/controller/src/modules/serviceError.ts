import type { ApiErrorCode } from "@stackpilot/contracts";

export class ServiceError extends Error {
  constructor(readonly status: number, readonly code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ServiceError";
  }
}

export function missingRecord(message: string) {
  return new ServiceError(404, "NOT_FOUND", message);
}
