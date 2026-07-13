import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentNodeRecord, CreateRemoteTaskRequest, HostMonitoringRecord, Permission, RemoteTaskRecord } from "@stackpilot/contracts";
import { createTerminalTask, fetchTerminalHosts, fetchTerminalNodes, fetchTerminalTasks } from "../../api/terminalApi";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";

function useLiveTerminal(permissions: Permission[]) {
  const [nodes, setNodes] = useState<AgentNodeRecord[]>([]); const [hosts, setHosts] = useState<HostMonitoringRecord[]>([]); const [tasks, setTasks] = useState<RemoteTaskRecord[]>([]);
  const [hostCollectedAt, setHostCollectedAt] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null); const inFlight = useRef<Promise<void> | null>(null); const active = useRef<AbortController | null>(null); const hasData = useRef(false);
  const load = useCallback((externalSignal?: AbortSignal, silent = false) => {
    if (inFlight.current) return inFlight.current;
    if (!silent) { setLoading(true); setError(null); }
    const controller = new AbortController(); const abort = () => controller.abort(); externalSignal?.addEventListener("abort", abort, { once: true }); active.current = controller;
    const requests = [
      permissions.includes("nodes:read") ? fetchTerminalNodes(controller.signal) : Promise.resolve({ nodes: [] }),
      permissions.includes("overview:read") ? fetchTerminalHosts(controller.signal) : Promise.resolve({ collectedAt: new Date(0).toISOString(), hosts: [] }),
      permissions.includes("tasks:read") ? fetchTerminalTasks(controller.signal) : Promise.resolve({ tasks: [] }),
    ] as const;
    const request = Promise.allSettled(requests).then(([nodeResult, hostResult, taskResult]) => {
      if (controller.signal.aborted) return;
      const failures = [nodeResult, hostResult, taskResult].filter((result) => result.status === "rejected");
      if (nodeResult.status === "fulfilled") setNodes(nodeResult.value.nodes);
      if (hostResult.status === "fulfilled") { setHosts(hostResult.value.hosts); if (permissions.includes("overview:read")) setHostCollectedAt(hostResult.value.collectedAt); }
      if (taskResult.status === "fulfilled") setTasks((current) => { const merged = new Map(taskResult.value.tasks.map((task) => [task.taskId, task])); for (const task of current) { const remote = merged.get(task.taskId); if (!remote || Date.parse(task.updatedAt) > Date.parse(remote.updatedAt)) merged.set(task.taskId, task); } return [...merged.values()]; });
      if (failures.length < 3) hasData.current = true;
      if (!failures.length) setError(null);
      else if (!silent || !hasData.current) setError(failures[0].reason instanceof Error ? failures[0].reason.message : "部分终端后端数据加载失败");
    }).finally(() => { externalSignal?.removeEventListener("abort", abort); if (active.current === controller) active.current = null; if (inFlight.current === request) inFlight.current = null; if (!controller.signal.aborted && !silent) setLoading(false); });
    inFlight.current = request; return request;
  }, [permissions]);
  useEffect(() => { let disposed = false; queueMicrotask(() => { if (!disposed) void load(); }); return () => { disposed = true; active.current?.abort(); }; }, [load]);
  useAutoRefresh((signal) => load(signal, true), undefined, !loading);
  const create = useCallback(async (nodeId: string, input: CreateRemoteTaskRequest, proof: string) => { const task = await createTerminalTask(nodeId, input, proof); setTasks((current) => [task, ...current.filter((item) => item.taskId !== task.taskId)]); return task; }, []);
  return { nodes, hosts, tasks, hostCollectedAt, loading, error, retry: load, create };
}
export { useLiveTerminal };
