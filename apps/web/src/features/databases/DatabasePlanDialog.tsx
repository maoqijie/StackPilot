import type { DatabaseOperationPlan } from "@stackpilot/contracts";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { executePlan, waitForDatabaseOperation } from "./operationClient";

export function DatabasePlanDialog({ plan, onClose, onComplete }: { plan: DatabaseOperationPlan; onClose: () => void; onComplete: (operationId: string) => void }) {
  const controllerRef = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const submit = async () => {
    setBusy(true); setError(null);
    const controller = new AbortController(); controllerRef.current = controller;
    try { const operation = await executePlan(plan); const completed = await waitForDatabaseOperation(operation, controller.signal); onComplete(completed.id); }
    catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "数据库操作失败"); }
    finally { if (controllerRef.current === controller) controllerRef.current = null; if (!controller.signal.aborted) setBusy(false); }
  };
  const close = () => { controllerRef.current?.abort(); onClose(); };
  return <ConfirmDialog title="确认数据库操作" message={plan.impact.join("；")} detail={`${plan.target} · 计划有效期至 ${new Date(plan.expiresAt).toLocaleString("zh-CN")}`} confirmLabel="确认执行" tone="warning" busy={busy} onClose={close} onConfirm={() => void submit()}>
    {error && <p className="form-error" role="alert">{error}</p>}
  </ConfirmDialog>;
}
