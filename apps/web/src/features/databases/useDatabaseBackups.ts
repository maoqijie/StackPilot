import { useCallback, useEffect, useRef, useState } from "react";
import type { DatabaseBackupsPayload } from "@stackpilot/contracts";
import { fetchDatabaseBackups } from "../../api/databaseBackupsApi";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

export function useDatabaseBackups() {
  const [payload, setPayload] = useState<DatabaseBackupsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const hasDataRef = useRef(false);

  const load = useCallback((externalSignal?: AbortSignal, silent = false) => {
    if (inFlightRef.current) return inFlightRef.current;
    if (!silent) { setLoading(true); setError(null); }
    const controller = new AbortController();
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    requestRef.current = controller;
    const request = fetchDatabaseBackups(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        hasDataRef.current = true;
        setPayload(next);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (silent && hasDataRef.current)) return;
        setError(reason instanceof Error ? reason.message : "数据库备份后端加载失败");
      })
      .finally(() => {
        externalSignal?.removeEventListener("abort", abort);
        if (requestRef.current === controller) requestRef.current = null;
        if (inFlightRef.current === request) inFlightRef.current = null;
        if (!controller.signal.aborted && !silent) setLoading(false);
      });
    inFlightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void load(); });
    return () => { disposed = true; requestRef.current?.abort(); };
  }, [load]);
  useAutoRefresh((signal) => load(signal, true), undefined, !loading);

  return { payload, loading, error, retry: load, refresh: () => load(undefined, true) };
}
