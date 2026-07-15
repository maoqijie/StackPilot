import { CreateFirewallRuleRequestSchema, DeleteFirewallRuleRequestSchema, FirewallDenyRecordsPayloadSchema, FirewallMutationResponseSchema, FirewallOpenPortsPayloadSchema, FirewallPayloadSchema } from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { badRequest, notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

const ruleId = /^fw_[a-f0-9]{64}$/;
function ruleAt(context: RequestContext) {
  try { const value = decodeURIComponent(context.parts[2] ?? ""); if (!ruleId.test(value)) throw badRequest("防火墙规则 ID 无效"); return value; }
  catch (error) { if (error instanceof URIError) throw badRequest("防火墙规则 ID 编码无效"); throw error; }
}

export async function routeFirewallRequest(context: RequestContext) {
  const method = context.request.method ?? "GET";
  if (context.parts.length === 3 && context.parts[2] === "deny-records" && method === "GET") {
    context.identity?.require(context.principal, "firewall:read"); context.response.setHeader("Cache-Control", "no-store");
    sendJson(context.response, 200, await context.services.firewallDeny.list(context.principal?.nodeScope ?? []), FirewallDenyRecordsPayloadSchema); return;
  }
  if (context.parts.length === 3 && context.parts[2] === "open-ports" && method === "GET") {
    context.identity?.require(context.principal, "firewall:read"); context.response.setHeader("Cache-Control", "no-store");
    sendJson(context.response, 200, await context.services.firewallOpenPorts.list(), FirewallOpenPortsPayloadSchema); return;
  }
  if (context.parts.length === 2 && method === "GET") {
    context.identity?.require(context.principal, "firewall:read"); context.response.setHeader("Cache-Control", "no-store");
    sendJson(context.response, 200, await context.services.firewall.list(), FirewallPayloadSchema); return;
  }
  if (context.parts.length === 3 && context.parts[2] === "rules" && method === "POST") {
    context.identity?.require(context.principal, "firewall:read");
    context.identity?.require(context.principal, "firewall:operate");
    context.identity?.consumeReauth(context.principal!, typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined);
    const input = parseSchema(CreateFirewallRuleRequestSchema, context.body, "防火墙规则"); const payload = await context.services.firewall.create(input);
    sendJson(context.response, 201, { ...payload, message: `${input.port}/${input.protocol} 防火墙规则已新增`, tone: "success" }, FirewallMutationResponseSchema); return;
  }
  if (context.parts.length === 3 && method === "DELETE" && ruleId.test(context.parts[2] ?? "")) {
    context.identity?.require(context.principal, "firewall:read");
    context.identity?.require(context.principal, "firewall:operate");
    context.identity?.consumeReauth(context.principal!, typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined);
    const input = parseSchema(DeleteFirewallRuleRequestSchema, context.body, "防火墙删除请求"); const payload = await context.services.firewall.delete(ruleAt(context), input.idempotencyKey);
    sendJson(context.response, 200, { ...payload, message: "防火墙规则已删除", tone: "warning" }, FirewallMutationResponseSchema); return;
  }
  throw notFound("防火墙接口不存在");
}
