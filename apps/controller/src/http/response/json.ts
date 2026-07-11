import type { ServerResponse } from "node:http";
import { ApiErrorResponseSchema } from "@stackpilot/contracts";
import type { ApiErrorCode } from "@stackpilot/contracts";
import type { z } from "zod";

export function sendJson<T>(response: ServerResponse, status: number, payload: T, schema?: z.ZodType<T>) {
  const safePayload = schema ? schema.parse(payload) : payload;
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (status === 204) { response.end(); return; }
  response.end(JSON.stringify(safePayload));
}

export function sendError(response: ServerResponse, status: number, code: ApiErrorCode, error: string, requestId: string, headers: Record<string, string> = {}) {
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  sendJson(response, status, ApiErrorResponseSchema.parse({ code, error, requestId }));
}
