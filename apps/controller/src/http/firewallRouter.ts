import { CreateFirewallRuleRequestSchema, DeleteFirewallRuleRequestSchema, FirewallMutationResponseSchema, FirewallRulesPayloadSchema, PathIdSchema } from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

function ruleId(context: RequestContext) {
  try { return parseSchema(PathIdSchema, decodeURIComponent(context.parts[3] ?? ""), "防火墙规则 ID"); }
  catch (error) { if (error instanceof URIError) throw badRequest("防火墙规则 ID 编码无效"); throw error; }
}

export async function routeFirewallRequest(context: RequestContext) {
  const method = context.request.method ?? "GET";
  if (context.parts.length === 3 && method === "GET") {
    context.identity?.require(context.principal, "firewall:read"); context.response.setHeader("Cache-Control", "no-store");
    sendJson(context.response, 200, await context.services.firewall.list(), FirewallRulesPayloadSchema); return;
  }
  if (context.parts.length === 3 && method === "POST") {
    context.identity?.require(context.principal, "firewall:operate");
    const input = parseSchema(CreateFirewallRuleRequestSchema, context.body, "防火墙规则");
    context.identity?.consumeReauth(context.principal!, typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined);
    sendJson(context.response, 201, await context.services.firewall.create(input), FirewallMutationResponseSchema); return;
  }
  if (context.parts.length === 4 && method === "DELETE") {
    context.identity?.require(context.principal, "firewall:operate");
    const input = parseSchema(DeleteFirewallRuleRequestSchema, context.body, "删除防火墙规则");
    context.identity?.consumeReauth(context.principal!, typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined);
    sendJson(context.response, 200, await context.services.firewall.delete(ruleId(context), input), FirewallMutationResponseSchema); return;
  }
  throw notFound("防火墙接口不存在");
}
