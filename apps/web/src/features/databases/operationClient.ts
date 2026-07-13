import type { DatabaseOperation, DatabaseOperationPlan, ExecuteDatabaseOperationPlanRequest } from "@stackpilot/contracts";
import { executeDatabaseOperationPlan, fetchDatabaseOperation } from "../../api/databasesApi";

export const databaseIdempotencyKey = (prefix: string) => `${prefix}:${crypto.randomUUID()}`;

export async function executePlan(plan: DatabaseOperationPlan) {
  const input: ExecuteDatabaseOperationPlanRequest = { planId: plan.id, version: plan.version, idempotencyKey: databaseIdempotencyKey(plan.kind) };
  return (await executeDatabaseOperationPlan(plan.id, input)).operation;
}

export async function waitForDatabaseOperation(initial: DatabaseOperation, signal?: AbortSignal, intervalMs = 1_000): Promise<DatabaseOperation> {
  let operation = initial;
  while (operation.status === "queued" || operation.status === "running") {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, intervalMs);
      signal?.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });
    operation = (await fetchDatabaseOperation(operation.id, signal)).operation;
  }
  if (operation.status !== "succeeded") throw new Error(operation.errorMessage ?? operation.errorCode ?? "数据库操作失败");
  return operation;
}
