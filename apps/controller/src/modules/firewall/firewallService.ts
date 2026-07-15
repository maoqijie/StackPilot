import { FirewallRulesPayloadSchema, type CreateFirewallRuleRequest, type DeleteFirewallRuleRequest, type FirewallRulesPayload } from "@stackpilot/contracts";
import { FirewallHelperError, requestFirewallHelper, type FirewallHelperRequester } from "../../platform/firewallClient.js";
import { ServiceError } from "../serviceError.js";

function failure(error: unknown): never {
  const code = error instanceof FirewallHelperError ? error.code : "FIREWALL_BACKEND_FAILED";
  if (code === "FIREWALL_INACTIVE") throw new ServiceError(409, "NOT_READY", "UFW 当前未启用，不能修改防火墙规则");
  if (code === "FIREWALL_RULE_NOT_FOUND") throw new ServiceError(404, "NOT_FOUND", "防火墙规则不存在");
  if (code === "FIREWALL_RULE_CHANGED") throw new ServiceError(409, "BAD_REQUEST", "防火墙规则已变化，请等待列表更新后重试");
  if (code === "FIREWALL_RULE_FORBIDDEN") throw new ServiceError(403, "FORBIDDEN", "只能删除由 StackPilot 创建的防火墙规则");
  if (code === "FIREWALL_IDEMPOTENCY_CONFLICT") throw new ServiceError(409, "BAD_REQUEST", "防火墙幂等键已用于其他操作参数");
  if (code === "INVALID_FIREWALL_SOURCE") throw new ServiceError(400, "BAD_REQUEST", "防火墙来源必须是 IP 地址或 CIDR");
  if (code === "FIREWALL_RESULT_UNKNOWN") throw new ServiceError(409, "NOT_READY", "防火墙操作结果未知，已锁定该操作以防止重复执行");
  const unavailable = code.includes("UNAVAILABLE") || code.includes("TIMEOUT");
  throw new ServiceError(unavailable ? 503 : 502, "INTERNAL_ERROR", unavailable ? "防火墙运维后端暂不可用" : "防火墙操作失败，请查看服务日志");
}

export class FirewallService {
  constructor(private readonly helper: FirewallHelperRequester = requestFirewallHelper) {}
  async list(): Promise<FirewallRulesPayload> { try { return FirewallRulesPayloadSchema.parse((await this.helper({ operation: "firewall-list" })).data); } catch (error) { return failure(error); } }
  async create(input: CreateFirewallRuleRequest) {
    try {
      const data = FirewallRulesPayloadSchema.parse((await this.helper({ operation: "firewall-create", requestId: input.idempotencyKey, name: input.name, port: input.port, protocol: input.protocol, source: input.source })).data);
      return { ...data, message: `${input.port}/${input.protocol.toUpperCase()} 放行规则已应用`, tone: "success" as const };
    } catch (error) { return failure(error); }
  }
  async delete(ruleId: string, input: DeleteFirewallRuleRequest) {
    try {
      const data = FirewallRulesPayloadSchema.parse((await this.helper({ operation: "firewall-delete", requestId: input.idempotencyKey, ruleId, version: input.version })).data);
      return { ...data, message: "防火墙规则已删除", tone: "warning" as const };
    } catch (error) { return failure(error); }
  }
}
