import { OverviewSummaryPayloadSchema, type OverviewSummaryPayload } from "@stackpilot/contracts";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { fetchOverview } from "../../api/overviewApi";

const OVERVIEW_POLL_INTERVAL_MS = 10_000;

type OverviewDataContextValue = {
  overview: OverviewSummaryPayload | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  replace: (payload: OverviewSummaryPayload) => void;
};

const OverviewDataContext = createContext<OverviewDataContextValue | null>(null);

function OverviewDataProvider({ children }: { children: React.ReactNode }) {
  const [overview, setOverview] = useState<OverviewSummaryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const sequenceRef = useRef(0);
  const hasDataRef = useRef(false);

  const load = useCallback((silent: boolean) => {
    if (inFlightRef.current) return inFlightRef.current;
    const controller = new AbortController();
    const sequence = ++sequenceRef.current;
    requestRef.current = controller;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    const request = fetchOverview(controller.signal)
      .then((payload) => {
        if (controller.signal.aborted || sequence !== sequenceRef.current) return;
        hasDataRef.current = true;
        setOverview(payload);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || sequence !== sequenceRef.current) return;
        if (!silent || !hasDataRef.current) {
          setError(reason instanceof Error ? reason.message : "工作台数据加载失败");
        }
      })
      .finally(() => {
        if (requestRef.current === controller) {
          requestRef.current = null;
          inFlightRef.current = null;
        }
        if (!controller.signal.aborted && sequence === sequenceRef.current && !silent) setLoading(false);
      });
    inFlightRef.current = request;
    return request;
  }, []);

  const replace = useCallback((payload: OverviewSummaryPayload) => {
    const parsed = OverviewSummaryPayloadSchema.parse(payload);
    sequenceRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    inFlightRef.current = null;
    hasDataRef.current = true;
    setOverview(parsed);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    let disposed = false;
    const schedule = () => {
      if (disposed || document.hidden) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        timer = null;
        await load(true);
        schedule();
      }, OVERVIEW_POLL_INTERVAL_MS);
    };
    const visibility = () => {
      if (disposed) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (document.hidden) return;
      void load(true).finally(schedule);
    };
    queueMicrotask(() => {
      if (!disposed) void load(false).finally(schedule);
    });
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      sequenceRef.current += 1;
      requestRef.current?.abort();
      requestRef.current = null;
      inFlightRef.current = null;
    };
  }, [load]);

  const value = useMemo<OverviewDataContextValue>(() => ({ overview, loading, error, reload: () => load(false), replace }), [error, load, loading, overview, replace]);
  return <OverviewDataContext.Provider value={value}>{children}</OverviewDataContext.Provider>;
}

function useOverviewData() {
  const value = useContext(OverviewDataContext);
  if (!value) throw new Error("useOverviewData 必须在 OverviewDataProvider 内使用");
  return value;
}

function useOptionalOverviewData() { return useContext(OverviewDataContext); }

/* eslint-disable react-refresh/only-export-components -- Provider hooks share its private context. */
export { OVERVIEW_POLL_INTERVAL_MS, OverviewDataProvider, useOptionalOverviewData, useOverviewData };
