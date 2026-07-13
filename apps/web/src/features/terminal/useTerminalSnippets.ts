import type { AgentNodeRecord, RemoteTaskRecord, TerminalSnippetRecord } from "@stackpilot/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTerminalNodes, fetchTerminalSnippets, fetchTerminalTasks, updateTerminalSnippetFavorite } from "../../api/terminalApi";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

function useTerminalSnippets() {
  const [snippets, setSnippets] = useState<TerminalSnippetRecord[]>([]);
  const [nodes, setNodes] = useState<AgentNodeRecord[]>([]);
  const [tasks, setTasks] = useState<RemoteTaskRecord[]>([]);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialControllerRef = useRef<AbortController | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const [snippetPayload, nodePayload, taskPayload] = await Promise.all([
        fetchTerminalSnippets(signal), fetchTerminalNodes(signal), fetchTerminalTasks(signal),
      ]);
      if (signal?.aborted) return;
      setSnippets(snippetPayload.snippets); setNodes(nodePayload.nodes); setTasks(taskPayload.tasks);
      setCollectedAt(snippetPayload.collectedAt);
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "常用命令后端加载失败");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const refreshRuntime = useCallback(async (signal: AbortSignal) => {
    const [nodePayload, taskPayload] = await Promise.all([fetchTerminalNodes(signal), fetchTerminalTasks(signal)]);
    if (signal.aborted) return;
    setNodes(nodePayload.nodes); setTasks(taskPayload.tasks);
  }, []);

  useEffect(() => {
    const controller = new AbortController(); initialControllerRef.current = controller;
    queueMicrotask(() => void load(controller.signal));
    return () => { controller.abort(); initialControllerRef.current = null; };
  }, [load]);

  useAutoRefresh(refreshRuntime, undefined, !loading && !error);

  const toggleFavorite = useCallback(async (snippet: TerminalSnippetRecord) => {
    const updated = await updateTerminalSnippetFavorite(snippet.id, !snippet.favorite);
    setSnippets((current) => current.map((item) => item.id === updated.id ? updated : item));
    return updated;
  }, []);

  const acceptExecution = useCallback((snippet: TerminalSnippetRecord, task: RemoteTaskRecord) => {
    setSnippets((current) => current.map((item) => item.id === snippet.id ? snippet : item));
    setTasks((current) => [task, ...current.filter((item) => item.taskId !== task.taskId)]);
  }, []);

  return { snippets, nodes, tasks, collectedAt, loading, error, retry: load, toggleFavorite, acceptExecution };
}

export { useTerminalSnippets };
