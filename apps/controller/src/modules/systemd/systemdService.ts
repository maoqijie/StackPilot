import {
  SystemdJournalPayloadSchema, SystemdUnitSchema, SystemdUnitsPayloadSchema,
  type SystemdUnitAction,
} from "@stackpilot/contracts";
import { ServiceError } from "../serviceError.js";
import { requestSystemdHelper, SystemdHelperError, type SystemdBackend, type SystemdHelperRequester } from "../../platform/systemdClient.js";

function helperFailure(error: unknown): never {
  const code = error instanceof SystemdHelperError ? error.code : "SYSTEMD_BACKEND_FAILED";
  const unavailable = code.includes("UNAVAILABLE") || code.includes("TIMEOUT");
  throw new ServiceError(unavailable ? 503 : 502, "INTERNAL_ERROR", unavailable ? "systemd 运维后端暂不可用" : "systemd 操作失败，请查看服务日志");
}

export class SystemdService implements SystemdBackend {
  private readonly actions = new Map<string, { unit: string; action: SystemdUnitAction; result: Promise<import("@stackpilot/contracts").SystemdUnit> }>();

  constructor(private readonly helper: SystemdHelperRequester = requestSystemdHelper) {}

  async list() {
    try {
      const response = await this.helper({ operation: "systemd-list" });
      return SystemdUnitsPayloadSchema.parse(response.data);
    } catch (error) { return helperFailure(error); }
  }

  async logs(unit: string) {
    try {
      const response = await this.helper({ operation: "systemd-logs", unit, limit: 100 });
      return SystemdJournalPayloadSchema.parse(response.data);
    } catch (error) { return helperFailure(error); }
  }

  async action(unit: string, action: SystemdUnitAction, idempotencyKey: string) {
    const existing = this.actions.get(idempotencyKey);
    if (existing) {
      if (existing.unit !== unit || existing.action !== action) throw new ServiceError(409, "BAD_REQUEST", "幂等键已用于其他 systemd 操作");
      return existing.result;
    }
    const result = this.helper({ operation: "systemd-action", requestId: idempotencyKey, unit, action })
      .then((response) => SystemdUnitSchema.parse(response.data?.unit))
      .catch(helperFailure);
    this.actions.set(idempotencyKey, { unit, action, result });
    if (this.actions.size > 1_000) this.actions.delete(this.actions.keys().next().value!);
    return result;
  }
}
