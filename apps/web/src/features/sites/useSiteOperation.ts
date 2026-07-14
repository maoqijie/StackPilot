import { useCallback, useEffect, useRef, useState } from "react";
import type { SiteOperation } from "../../api/sitesApi";
import { fetchSiteOperation } from "../../api/sitesApi";

const terminal = new Set<SiteOperation["status"]>(["succeeded", "failed", "cancelled"]);

function useSiteOperation() {
  const [operation, setOperation] = useState<SiteOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const operationRef = useRef<SiteOperation | null>(null);
  const watchedOperationId = operation?.operationId;

  const watch = useCallback((next: SiteOperation) => { operationRef.current = next; setOperation(next); setError(null); }, []);

  useEffect(() => {
    if (!watchedOperationId || terminal.has(operationRef.current?.status ?? "cancelled")) return;
    let timer: number | null = null; let disposed = false; let inFlight = false;
    const schedule = () => { if (!disposed && !document.hidden && !terminal.has(operationRef.current?.status ?? "cancelled")) timer = window.setTimeout(run, 2_000); };
    const run = async () => {
      const current = operationRef.current;
      if (disposed || document.hidden || inFlight || !current || terminal.has(current.status)) return;
      inFlight = true; const controller = new AbortController(); controllerRef.current = controller;
      try {
        const next = await fetchSiteOperation(current.operationId, controller.signal);
        if (!controller.signal.aborted) { operationRef.current = next; setOperation(next); setError(null); }
      } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "任务状态读取失败"); }
      finally { inFlight = false; controllerRef.current = null; schedule(); }
    };
    const visibility = () => { if (timer !== null) window.clearTimeout(timer); timer = null; if (!document.hidden) void run(); };
    schedule(); document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; if (timer !== null) window.clearTimeout(timer); document.removeEventListener("visibilitychange", visibility); controllerRef.current?.abort(); };
  }, [watchedOperationId]);

  useEffect(() => () => controllerRef.current?.abort(), []);
  const clear = useCallback(() => { controllerRef.current?.abort(); operationRef.current = null; setOperation(null); setError(null); }, []);
  return { operation, error, watch, clear };
}

export { useSiteOperation };
