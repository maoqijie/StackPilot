import { CreateFirewallRuleRequestSchema, FirewallPayloadSchema, type CreateFirewallRuleRequest, type FirewallPayload } from "@stackpilot/contracts";
import { FirewallHelperError, requestFirewallHelper, type FirewallHelperRequester } from "../../platform/firewallClient.js";
import { ServiceError } from "../serviceError.js";

function helperFailure(error: unknown): never {
  const code = error instanceof FirewallHelperError ? error.code : "FIREWALL_BACKEND_FAILED";
  if (code === "FIREWALL_INACTIVE") throw new ServiceError(409, "BAD_REQUEST", "UFW 当前未启用，未执行规则变更");
  if (code === "RULE_NOT_MANAGED") throw new ServiceError(409, "BAD_REQUEST", "该规则不是 StackPilot 受管规则，只允许查看");
  if (code === "RULE_NOT_FOUND") throw new ServiceError(404, "NOT_FOUND", "防火墙规则不存在");
  const unavailable = code.includes("UNAVAILABLE") || code.includes("TIMEOUT");
  throw new ServiceError(unavailable ? 503 : 502, "INTERNAL_ERROR", unavailable ? "防火墙后端暂不可用" : "防火墙操作失败，请查看服务日志");
}

type Operation = { kind: "create"; input: CreateFirewallRuleRequest } | { kind: "delete"; ruleId: string; idempotencyKey: string };

export class FirewallService {
  private readonly operations = new Map<string, { operation: Operation; result: Promise<FirewallPayload> }>();
  constructor(private readonly helper: FirewallHelperRequester = requestFirewallHelper) {}

  async list() {
    try { return FirewallPayloadSchema.parse((await this.helper({ operation: "firewall-list" })).data); }
    catch (error) { return helperFailure(error); }
  }

  private run(operation: Operation, request: Parameters<FirewallHelperRequester>[0]) {
    const key = operation.kind === "create" ? operation.input.idempotencyKey : operation.idempotencyKey;
    const existing = this.operations.get(key);
    if (existing) {
      if (JSON.stringify(existing.operation) !== JSON.stringify(operation)) throw new ServiceError(409, "BAD_REQUEST", "幂等键已用于其他防火墙操作");
      return existing.result;
    }
    const result = this.helper(request).then((response) => FirewallPayloadSchema.parse(response.data)).catch((error) => {
      if (this.operations.get(key)?.result === result) this.operations.delete(key);
      return helperFailure(error);
    });
    this.operations.set(key, { operation, result });
    if (this.operations.size > 1_000) this.operations.delete(this.operations.keys().next().value!);
    return result;
  }

  create(raw: CreateFirewallRuleRequest) {
    const input = CreateFirewallRuleRequestSchema.parse(raw);
    return this.run({ kind: "create", input }, { operation: "firewall-create", requestId: input.idempotencyKey, name: input.name, port: input.port, protocol: input.protocol, source: input.source });
  }

  delete(ruleId: string, idempotencyKey: string) {
    return this.run({ kind: "delete", ruleId, idempotencyKey }, { operation: "firewall-delete", requestId: idempotencyKey, ruleId });
  }
}
