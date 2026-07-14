import {
  SystemdActionRequestSchema, SystemdActionResponseSchema, SystemdJournalPayloadSchema,
  SystemdUnitActionSchema, SystemdUnitNameSchema, SystemdUnitsPayloadSchema,
} from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

function unitAt(context: RequestContext, index: number) {
  try { return parseSchema(SystemdUnitNameSchema, decodeURIComponent(context.parts[index] ?? ""), "systemd 单元名"); }
  catch (error) { if (error instanceof URIError) throw badRequest("systemd 单元名编码无效"); throw error; }
}

export async function routeSystemdRequest(context: RequestContext) {
  const method = context.request.method ?? "GET";
  const { parts, response } = context;
  context.identity?.require(context.principal, method === "GET" ? "services:read" : "services:operate");
  if (parts.length === 3 && method === "GET") {
    response.setHeader("Cache-Control", "no-store");
    sendJson(response, 200, await context.services.systemd.list(), SystemdUnitsPayloadSchema); return;
  }
  const unit = unitAt(context, 3);
  if (parts.length === 5 && parts[4] === "logs" && method === "GET") {
    response.setHeader("Cache-Control", "no-store");
    sendJson(response, 200, await context.services.systemd.logs(unit), SystemdJournalPayloadSchema); return;
  }
  if (parts.length === 5 && method === "POST") {
    const action = parseSchema(SystemdUnitActionSchema, parts[4], "systemd 动作");
    const input = parseSchema(SystemdActionRequestSchema, context.body, "systemd 操作请求");
    context.identity?.consumeReauth(context.principal!, typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined);
    const updated = await context.services.systemd.action(unit, action, input.idempotencyKey);
    const verb = action === "start" ? "启动" : action === "stop" ? "停止" : "重启";
    sendJson(response, 200, { unit: updated, collectedAt: new Date().toISOString(), message: `${unit} 已${verb}`, tone: action === "stop" ? "warning" : "success" }, SystemdActionResponseSchema); return;
  }
  throw notFound("systemd 接口不存在");
}
