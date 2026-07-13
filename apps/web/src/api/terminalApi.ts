import { AgentNodeListResponseSchema, HostMonitoringPayloadSchema, RemoteTaskListResponseSchema, RemoteTaskRecordSchema } from "@stackpilot/contracts";
import type { CreateRemoteTaskRequest } from "@stackpilot/contracts";
import { requestJson } from "./client";

const fetchTerminalNodes = (signal?: AbortSignal) => requestJson<unknown>("/nodes", { signal }).then((value) => AgentNodeListResponseSchema.parse(value));
const fetchTerminalHosts = (signal?: AbortSignal) => requestJson<unknown>("/hosts", { signal }).then((value) => HostMonitoringPayloadSchema.parse(value));
const fetchTerminalTasks = (signal?: AbortSignal) => requestJson<unknown>("/remote-tasks", { signal }).then((value) => RemoteTaskListResponseSchema.parse(value));
const createTerminalTask = (nodeId: string, input: CreateRemoteTaskRequest, proof: string) => requestJson<unknown>(`/nodes/${encodeURIComponent(nodeId)}/tasks`, { method: "POST", headers: { "X-Reauth-Proof": proof }, body: JSON.stringify(input) }).then((value) => RemoteTaskRecordSchema.parse(value));

export { createTerminalTask, fetchTerminalHosts, fetchTerminalNodes, fetchTerminalTasks };
