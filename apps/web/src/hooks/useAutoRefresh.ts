import { useEffect, useRef } from "react";

const OVERVIEW_REFRESH_INTERVAL_MS = 10_000;

function useAutoRefresh(
  refresh: (signal: AbortSignal) => Promise<void>,
  intervalMs = OVERVIEW_REFRESH_INTERVAL_MS,
  enabled = true,
) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    let controller: AbortController | null = null;
    let timer: number | null = null;
    let inFlight = false;
    let disposed = false;

    const schedule = () => {
      if (disposed || document.hidden) return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(run, intervalMs);
    };

    const run = async () => {
      if (disposed || document.hidden || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      try {
        await refreshRef.current(controller.signal);
      } catch {
        // Background refresh failures retain the last successful data.
      } finally {
        inFlight = false;
        controller = null;
        schedule();
      }
    };

    schedule();
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        return;
      }
      void run();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      controller?.abort();
    };
  }, [enabled, intervalMs]);
}

export { OVERVIEW_REFRESH_INTERVAL_MS, useAutoRefresh };
