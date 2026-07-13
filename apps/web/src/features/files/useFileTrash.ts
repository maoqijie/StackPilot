import type { TrashMutationResponse, TrashPayload } from "@stackpilot/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFileTrash } from "../../api/filesApi";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

function isAbortError(reason: unknown) {
  return reason instanceof DOMException && reason.name === "AbortError";
}

export function useFileTrash() {
  const [payload, setPayload] = useState<TrashPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const mutationRef = useRef(false);
  const generationRef = useRef(0);
  const hasDataRef = useRef(false);

  const invalidateRequest = useCallback(() => {
    generationRef.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    inFlightRef.current = null;
  }, []);

  const load = useCallback((externalSignal?: AbortSignal, silent = false) => {
    if (mutationRef.current) return Promise.resolve();
    if (inFlightRef.current) return inFlightRef.current;
    if (!silent) { setLoading(true); setError(null); }
    const controller = new AbortController();
    const generation = generationRef.current;
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    requestRef.current = controller;
    const request = fetchFileTrash(controller.signal)
      .then((next) => {
        if (!controller.signal.aborted && generation === generationRef.current) {
          hasDataRef.current = true;
          setPayload(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && generation === generationRef.current && !isAbortError(reason) && (!silent || !hasDataRef.current)) {
          setError(reason instanceof Error ? reason.message : "回收站后端加载失败");
        }
      })
      .finally(() => {
        externalSignal?.removeEventListener("abort", abort);
        if (requestRef.current === controller) requestRef.current = null;
        if (inFlightRef.current === request) inFlightRef.current = null;
        if (!controller.signal.aborted && generation === generationRef.current && !silent) setLoading(false);
      });
    inFlightRef.current = request;
    return request;
  }, []);

  const mutate = useCallback(async (operation: () => Promise<TrashMutationResponse>) => {
    if (mutationRef.current) throw new Error("回收站操作正在处理中");
    mutationRef.current = true;
    invalidateRequest();
    setLoading(false);
    setMutating(true);
    try {
      const result = await operation();
      generationRef.current += 1;
      hasDataRef.current = true;
      setPayload(result.trash);
      setError(null);
      return result;
    } finally {
      mutationRef.current = false;
      setMutating(false);
    }
  }, [invalidateRequest]);

  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => { if (!disposed) void load(); });
    return () => { disposed = true; invalidateRequest(); };
  }, [invalidateRequest, load]);
  useAutoRefresh((signal) => load(signal, true), 10_000, Boolean(payload) && !loading && !mutating);

  return { payload, loading, error, mutating, retry: load, mutate };
}
