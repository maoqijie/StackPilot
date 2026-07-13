import type { DatabaseSlowQueriesPayload } from "@stackpilot/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDatabaseSlowQueries } from "../../api/databasesApi";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

function useDatabaseSlowQueries(initialPayload: DatabaseSlowQueriesPayload | null = null) {
  const [payload, setPayload] = useState<DatabaseSlowQueriesPayload | null>(initialPayload);
  const [loading, setLoading] = useState(initialPayload === null);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasDataRef = useRef(initialPayload !== null);
  const load = useCallback((externalSignal?: AbortSignal, silent = false) => {
    if (inFlightRef.current) return inFlightRef.current;
    if (!silent) { setLoading(true); setError(null); }
    const controller = new AbortController(); const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true }); requestRef.current = controller;
    const request = fetchDatabaseSlowQueries(controller.signal).then((nextPayload) => {
      if (controller.signal.aborted) return; hasDataRef.current = true; setPayload(nextPayload); setError(null);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted || (silent && hasDataRef.current)) return;
      setError(reason instanceof Error ? reason.message : "慢查询后端加载失败");
    }).finally(() => {
      externalSignal?.removeEventListener("abort", abort); if (requestRef.current === controller) requestRef.current = null;
      if (inFlightRef.current === request) inFlightRef.current = null; if (!controller.signal.aborted && !silent) setLoading(false);
    });
    inFlightRef.current = request; return request;
  }, []);
  useEffect(() => {
    if (initialPayload) return; let disposed = false; queueMicrotask(() => { if (!disposed) void load(); });
    return () => { disposed = true; requestRef.current?.abort(); };
  }, [initialPayload, load]);
  useAutoRefresh((signal) => load(signal, true), undefined, !loading && initialPayload === null);
  return { payload, loading, error, retry: load };
}

export { useDatabaseSlowQueries };
