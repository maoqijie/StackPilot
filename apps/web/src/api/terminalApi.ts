import {
  AgentNodeListResponseSchema, ExecuteTerminalSnippetResponseSchema, HostMonitoringPayloadSchema,
  RemoteTaskListResponseSchema, RemoteTaskRecordSchema, TerminalSnippetListResponseSchema, TerminalSnippetRecordSchema,
  type ExecuteTerminalSnippetRequest,
} from "@stackpilot/contracts";
import type { CreateRemoteTaskRequest } from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchTerminalSnippets(signal?: AbortSignal) {
  return requestJson<unknown>("/terminal/snippets", { signal }).then((payload) => TerminalSnippetListResponseSchema.parse(payload));
}

export function fetchTerminalSnippetNodes(signal?: AbortSignal) {
  return requestJson<unknown>("/terminal/nodes", { signal }).then((payload) => AgentNodeListResponseSchema.parse(payload));
}

export function fetchTerminalSnippetTasks(signal?: AbortSignal) {
  return requestJson<unknown>("/terminal/tasks", { signal }).then((payload) => RemoteTaskListResponseSchema.parse(payload));
}

export function updateTerminalSnippetFavorite(snippetId: string, favorite: boolean, signal?: AbortSignal) {
  return requestJson<unknown>(`/terminal/snippets/${encodeURIComponent(snippetId)}/favorite`, {
    method: "PATCH", body: JSON.stringify({ favorite }), signal,
  }).then((payload) => TerminalSnippetRecordSchema.parse(payload));
}

export function executeTerminalSnippet(snippetId: string, input: ExecuteTerminalSnippetRequest, reauthProof: string, signal?: AbortSignal) {
  return requestJson<unknown>(`/terminal/snippets/${encodeURIComponent(snippetId)}/executions`, {
    method: "POST", headers: { "X-Reauth-Proof": reauthProof }, body: JSON.stringify(input), signal,
  }).then((payload) => ExecuteTerminalSnippetResponseSchema.parse(payload));
}

const fetchTerminalNodes = (signal?: AbortSignal) => requestJson<unknown>("/nodes", { signal }).then((value) => AgentNodeListResponseSchema.parse(value));
const fetchTerminalHosts = (signal?: AbortSignal) => requestJson<unknown>("/hosts", { signal }).then((value) => HostMonitoringPayloadSchema.parse(value));
const fetchTerminalTasks = (signal?: AbortSignal) => requestJson<unknown>("/remote-tasks", { signal }).then((value) => RemoteTaskListResponseSchema.parse(value));
const createTerminalTask = (nodeId: string, input: CreateRemoteTaskRequest, proof: string) => requestJson<unknown>(`/nodes/${encodeURIComponent(nodeId)}/tasks`, { method: "POST", headers: { "X-Reauth-Proof": proof }, body: JSON.stringify(input) }).then((value) => RemoteTaskRecordSchema.parse(value));

export { createTerminalTask, fetchTerminalHosts, fetchTerminalNodes, fetchTerminalTasks };
