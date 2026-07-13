import { useCallback, useEffect, useRef, useState } from "react";
import { listAgentNodes, listRemoteTasks } from "../../api/agentApi";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { terminalHistoryView, type TerminalHistoryView } from "./historyModel";

function useTerminalHistory(onRows?: (rows: TerminalHistoryView[]) => void) {
  const [rows, setRows] = useState<TerminalHistoryView[]>([]);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
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
    const request = Promise.all([
      listRemoteTasks(controller.signal), listAgentNodes(controller.signal).catch(() => ({ nodes: [] })),
    ]).then(([tasks, nodes]) => {
      if (controller.signal.aborted) return;
      const nextRows = tasks.tasks.map((task) => terminalHistoryView(task, nodes.nodes));
      hasDataRef.current = true;
      setRows(nextRows.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, 200));
      onRows?.(nextRows);
      setCollectedAt(tasks.collectedAt ?? null);
      setError(null);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted || (silent && hasDataRef.current)) return;
      setError(reason instanceof Error ? reason.message : "执行历史后端加载失败");
    }).finally(() => {
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
  return { rows, collectedAt, loading, error, retry: load };
}

export { useTerminalHistory };
