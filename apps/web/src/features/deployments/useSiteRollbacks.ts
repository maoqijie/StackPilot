import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSiteRollbacks } from "../../api/deploymentsApi";
import type { SiteRollbackRecord } from "../../api/deploymentsApi";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

function useSiteRollbacks(enabled: boolean) {
  const [rows, setRows] = useState<SiteRollbackRecord[]>([]);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const hasDataRef = useRef(false);

  const refresh = useCallback((externalSignal?: AbortSignal, silent = false) => {
    if (!enabled) return Promise.resolve();
    if (inFlightRef.current) return inFlightRef.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    requestRef.current = controller;
    const request = fetchSiteRollbacks(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        hasDataRef.current = true;
        setRows(payload.rollbacks);
        setCollectedAt(payload.collectedAt);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        if (!silent || !hasDataRef.current) {
          setError(reason instanceof Error ? reason.message : "回滚记录加载失败");
        }
      })
      .finally(() => {
        externalSignal?.removeEventListener("abort", abort);
        if (requestRef.current === controller) requestRef.current = null;
        if (inFlightRef.current === request) inFlightRef.current = null;
        if (!controller.signal.aborted && !silent) setLoading(false);
      });
    inFlightRef.current = request;
    return request;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void refresh(); });
    return () => {
      disposed = true;
      requestRef.current?.abort();
    };
  }, [enabled, refresh]);

  useAutoRefresh((signal) => refresh(signal, true), 10_000, enabled && !loading);
  return { rows, collectedAt, loading, error, refresh };
}

export { useSiteRollbacks };
