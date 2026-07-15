import { AuditExportCreateResponseSchema, AuditExportListResponseSchema, CreateAuditExportRequestSchema, PathIdSchema } from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

export async function routeAuditExportRequest(context: RequestContext): Promise<void> {
  const service = context.services.auditExports;
  if (!service) throw notFound("审计导出服务未配置");
  const principal = context.principal;
  if (!principal || principal.type !== "session" || principal.nodeScope !== "all") throw notFound("审计导出不存在");
  context.identity?.require(principal, "audit:export");
  const method = context.request.method ?? "GET";
  const isAdministrator = principal.user.roles.includes("administrator");

  if (context.parts.length === 2 && method === "GET") {
    context.response.setHeader("Cache-Control", "private, no-store");
    sendJson(context.response, 200, service.list(principal.userId, isAdministrator), AuditExportListResponseSchema);
    return;
  }
  if (context.parts.length === 2 && method === "POST") {
    const input = parseSchema(CreateAuditExportRequestSchema, context.body, "审计导出");
    consumeReauthentication(context);
    const record = service.create(input, { userId: principal.userId, displayName: principal.user.displayName }, context.requestId);
    sendJson(context.response, 201, { export: record }, AuditExportCreateResponseSchema);
    return;
  }
  if (context.parts.length === 4 && context.parts[3] === "retry" && method === "POST") {
    const exportId = parseSchema(PathIdSchema, context.parts[2] ?? "", "导出 ID");
    consumeReauthentication(context);
    const record = service.retry(exportId, principal.userId, isAdministrator, { userId: principal.userId, displayName: principal.user.displayName }, context.requestId);
    sendJson(context.response, 201, { export: record }, AuditExportCreateResponseSchema);
    return;
  }
  if (context.parts.length === 4 && context.parts[3] === "download" && method === "POST") {
    const exportId = parseSchema(PathIdSchema, context.parts[2] ?? "", "导出 ID");
    consumeReauthentication(context);
    const { record, contents } = service.download(exportId, principal.userId, isAdministrator, context.requestId);
    const extension = record.format;
    const encodedName = encodeURIComponent(`${record.name}.${extension}`).replaceAll("'", "%27");
    context.response.statusCode = 200;
    context.response.setHeader("Content-Type", extension === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8");
    context.response.setHeader("Content-Disposition", `attachment; filename="stackpilot-audit-${record.id}.${extension}"; filename*=UTF-8''${encodedName}`);
    context.response.setHeader("Cache-Control", "private, no-store");
    context.response.setHeader("X-Content-Type-Options", "nosniff");
    context.response.setHeader("Content-Length", contents.byteLength);
    context.response.end(contents);
    return;
  }
  throw notFound("审计导出接口不存在");
}

function consumeReauthentication(context: RequestContext): void {
  const proof = typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined;
  context.identity?.consumeReauth(context.principal!, proof);
}
