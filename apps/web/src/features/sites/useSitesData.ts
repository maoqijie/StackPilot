import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSites } from "../../api/sitesApi";
import type { SiteRuntimePayload } from "../../api/sitesApi";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { runtimeSiteFromApi } from "./model";
import type { SiteRuntimeView } from "./types";

function useSitesData(onRows?: (rows: SiteRuntimeView[]) => void) {
  const [rows, setRows] = useState<SiteRuntimeView[]>([]);
  const [payload, setPayload] = useState<SiteRuntimePayload | null>(null);
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
    const request = fetchSites(controller.signal)
      .then((nextPayload) => {
        if (controller.signal.aborted) return;
        hasDataRef.current = true;
        setPayload(nextPayload);
        const nextRows = nextPayload.sites.map((site) => runtimeSiteFromApi(site, nextPayload.collectedAt));
        setRows(nextRows);
        onRows?.(nextRows);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (silent && hasDataRef.current)) return;
        setError(reason instanceof Error ? reason.message : "站点监控后端加载失败");
      })
      .finally(() => {
        externalSignal?.removeEventListener("abort", abort);
        if (requestRef.current === controller) requestRef.current = null;
        if (inFlightRef.current === request) inFlightRef.current = null;
        if (!controller.signal.aborted && !silent) setLoading(false);
      });
    inFlightRef.current = request;
    return request;
  }, [onRows]);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void load(); });
    return () => { disposed = true; requestRef.current?.abort(); };
  }, [load]);
  useAutoRefresh((signal) => load(signal, true), undefined, !loading);

  return { rows, payload, loading, error, retry: load };
}

export { useSitesData };
