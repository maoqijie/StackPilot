import { useCallback, useEffect, useRef, useState } from "react";
import { useAutoRefresh } from "./useAutoRefresh";

type PollingState<T> = { data: T | null; loading: boolean; error: string | null; backgroundError: string | null };

export function usePollingResource<T>(loader: (signal: AbortSignal) => Promise<T>, initialData: T | null = null, enabled = true, resourceKey = "default") {
  const [state, setState] = useState<PollingState<T>>({ data: initialData, loading: initialData === null, error: null, backgroundError: null });
  const requestRef = useRef<Promise<void> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const dataRef = useRef(initialData);
  const loaderRef = useRef(loader);
  const resourceKeyRef = useRef(resourceKey);
  useEffect(() => { loaderRef.current = loader; }, [loader]);

  const load = useCallback((externalSignal?: AbortSignal, silent = false) => {
    if (requestRef.current) return requestRef.current;
    if (!silent) setState((current) => ({ ...current, loading: true, error: null }));
    const controller = new AbortController(); controllerRef.current = controller;
    const abort = () => controller.abort(); externalSignal?.addEventListener("abort", abort, { once: true });
    const request = loaderRef.current(controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      dataRef.current = data;
      setState({ data, loading: false, error: null, backgroundError: null });
    }).catch((caught: unknown) => {
      if (controller.signal.aborted) return;
      const message = caught instanceof Error ? caught.message : "数据库请求失败";
      setState((current) => dataRef.current && silent ? { ...current, loading: false, backgroundError: message } : { ...current, loading: false, error: message });
    }).finally(() => {
      externalSignal?.removeEventListener("abort", abort);
      if (controllerRef.current === controller) controllerRef.current = null;
      if (requestRef.current === request) requestRef.current = null;
    });
    requestRef.current = request; return request;
  }, []);

  useEffect(() => {
    let disposed = false;
    const resourceChanged = resourceKeyRef.current !== resourceKey;
    resourceKeyRef.current = resourceKey;
    controllerRef.current?.abort();
    requestRef.current = null;
    if (enabled && (initialData === null || resourceChanged)) {
      queueMicrotask(() => {
        if (disposed) return;
        void load(undefined, initialData !== null);
      });
    }
    return () => { disposed = true; controllerRef.current?.abort(); };
  }, [enabled, initialData, load, resourceKey]);
  useAutoRefresh((signal) => load(signal, true), 10_000, enabled && !state.loading);
  const replaceData = useCallback((data: T) => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    requestRef.current = null;
    dataRef.current = data;
    setState({ data, loading: false, error: null, backgroundError: null });
  }, []);
  return { ...state, retry: () => load(undefined, false), refresh: () => load(undefined, true), replaceData };
}
