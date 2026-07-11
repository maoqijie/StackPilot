import type { IncomingMessage, ServerResponse } from "node:http";
import { ApiError } from "../errors/ApiError.js";

function appendVary(response: ServerResponse, value: string) {
  const current = response.getHeader("Vary");
  const values = new Set(String(current ?? "").split(",").map((item) => item.trim()).filter(Boolean));
  values.add(value);
  response.setHeader("Vary", [...values].join(", "));
}

export function applyCors(request: IncomingMessage, response: ServerResponse, allowedOrigins: readonly string[]) {
  const origin = request.headers.origin;
  if (!origin) return;
  appendVary(response, "Origin");
  if (!allowedOrigins.includes(origin)) throw new ApiError(403, "FORBIDDEN", "请求来源不在允许列表中");
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-CSRF-Token, X-Reauth-Proof");
  response.setHeader("Access-Control-Allow-Credentials", "true");
  response.setHeader("Access-Control-Max-Age", "600");
}
