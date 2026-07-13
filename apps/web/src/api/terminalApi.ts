import {
  AgentNodeListResponseSchema, ExecuteTerminalSnippetResponseSchema, RemoteTaskListResponseSchema,
  TerminalSnippetListResponseSchema, TerminalSnippetRecordSchema,
  type ExecuteTerminalSnippetRequest,
} from "@stackpilot/contracts";
import { requestJson } from "./client";

export function fetchTerminalSnippets(signal?: AbortSignal) {
  return requestJson<unknown>("/terminal/snippets", { signal }).then((payload) => TerminalSnippetListResponseSchema.parse(payload));
}

export function fetchTerminalNodes(signal?: AbortSignal) {
  return requestJson<unknown>("/nodes", { signal }).then((payload) => AgentNodeListResponseSchema.parse(payload));
}

export function fetchTerminalTasks(signal?: AbortSignal) {
  return requestJson<unknown>("/remote-tasks", { signal }).then((payload) => RemoteTaskListResponseSchema.parse(payload));
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
