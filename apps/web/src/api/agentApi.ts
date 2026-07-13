import { AgentNodeListResponseSchema, RemoteTaskListResponseSchema } from "@stackpilot/contracts";
import type { CreateEnrollmentRequest } from "@stackpilot/contracts";
import { requestJson } from "./client";

export type EnrollmentCredential = { enrollmentId: string; token: string; expiresAt: string; purpose: "agent-enrollment" };
export const listAgentNodes = (signal?: AbortSignal) => requestJson<unknown>("/nodes", { signal }).then((payload) => AgentNodeListResponseSchema.parse(payload));
export const createAgentEnrollment = (payload: CreateEnrollmentRequest, reauthProof: string) => requestJson<EnrollmentCredential>("/enrollments", { method: "POST", headers:{"X-Reauth-Proof":reauthProof}, body: JSON.stringify(payload) });
export const revokeAgentNode = (nodeId: string, reauthProof: string) => requestJson<{ message: string }>(`/nodes/${encodeURIComponent(nodeId)}`, { method: "DELETE", headers:{"X-Reauth-Proof":reauthProof}, body:"{}" });
export const listRemoteTasks = (signal?: AbortSignal) => requestJson<unknown>("/remote-tasks", { signal }).then((payload) => RemoteTaskListResponseSchema.parse(payload));
