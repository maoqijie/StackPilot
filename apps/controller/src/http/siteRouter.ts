import {
  ActivateSitePlanRequestSchema, CreateSiteCertificateRenewalRequestSchema, CreateSiteLogQueryRequestSchema,
  CreateSitePlanRequestSchema, SiteOperationSchema, SitePlanSchema, SiteRuntimePayloadSchema,
  UpdateSiteLifecycleRequestSchema,
} from "@stackpilot/contracts";
import type { Permission } from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

function idAt(context: RequestContext, index: number) {
  try {
    const id = decodeURIComponent(context.parts[index] ?? "");
    if (!/^[A-Za-z0-9:_-]{8,160}$/.test(id)) throw badRequest("路径参数格式无效");
    return id;
  } catch (error) {
    if (error instanceof URIError) throw badRequest("路径参数编码无效");
    throw error;
  }
}

function requirePermission(context: RequestContext, permission: Permission, reauthenticate = false) {
  context.identity?.require(context.principal, permission);
  if (reauthenticate) context.identity?.consumeReauth(context.principal!, typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined);
}

function access(context: RequestContext) { return { nodeScope: context.principal?.nodeScope ?? [] }; }
function requester(context: RequestContext) { return `user:${context.principal?.userId}`; }

export async function routeSiteRequest(context: RequestContext): Promise<void> {
  const { request, response, parts, services } = context;
  const method = request.method ?? "GET";
  if (parts[1] === "sites" && parts.length === 2 && method === "GET") {
    requirePermission(context, "sites:read");
    sendJson(response, 200, await services.siteManagement.getSites(access(context)), SiteRuntimePayloadSchema); return;
  }
  if (parts[1] === "site-plans" && parts.length === 2 && method === "POST") {
    requirePermission(context, "sites:deploy", true);
    const input = parseSchema(CreateSitePlanRequestSchema, context.body, "站点部署计划");
    sendJson(response, 202, await services.siteManagement.createPlan(input, access(context), requester(context), context.principal?.user.displayName ?? null), SitePlanSchema); return;
  }
  if (parts[1] === "site-plans" && parts[3] === "activate" && parts.length === 4 && method === "POST") {
    requirePermission(context, "sites:deploy", true);
    const input = parseSchema(ActivateSitePlanRequestSchema, context.body, "站点部署激活");
    sendJson(response, 202, await services.siteManagement.activate(idAt(context, 2), input, access(context), requester(context)), SiteOperationSchema); return;
  }
  if (parts[1] === "sites" && parts.length === 3 && method === "PATCH") {
    requirePermission(context, "sites:operate", true);
    const input = parseSchema(UpdateSiteLifecycleRequestSchema, context.body, "站点生命周期操作");
    sendJson(response, 202, await services.siteManagement.updateLifecycle(idAt(context, 2), input, access(context), requester(context)), SiteOperationSchema); return;
  }
  if (parts[1] === "sites" && parts[3] === "certificate-renewals" && parts.length === 4 && method === "POST") {
    requirePermission(context, "sites:renew", true);
    const input = parseSchema(CreateSiteCertificateRenewalRequestSchema, context.body, "站点证书续期");
    sendJson(response, 202, await services.siteManagement.renewCertificate(idAt(context, 2), input, access(context), requester(context), context.requestId), SiteOperationSchema); return;
  }
  if (parts[1] === "sites" && parts[3] === "log-queries" && parts.length === 4 && method === "POST") {
    requirePermission(context, "sites:logs");
    const input = parseSchema(CreateSiteLogQueryRequestSchema, context.body, "站点日志查询");
    sendJson(response, 202, await services.siteManagement.queryLogs(idAt(context, 2), input, access(context), requester(context)), SiteOperationSchema); return;
  }
  if (parts[1] === "site-operations" && parts.length === 3 && method === "GET") {
    requirePermission(context, "sites:read");
    response.setHeader("Cache-Control", "no-store");
    sendJson(response, 200, await services.siteManagement.getOperation(idAt(context, 2), access(context)), SiteOperationSchema); return;
  }
  throw notFound("站点管理接口不存在");
}
