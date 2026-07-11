import { z } from "zod";

export const AGENT_SIGNATURE_ALGORITHM = "ed25519" as const;
export const AGENT_REQUEST_TIME_WINDOW_MS = 5 * 60 * 1000;
export const AgentRequestAuthenticationSchema = z.object({
  nodeId: z.string().uuid(), credentialId: z.string().uuid(), timestamp: z.string().datetime(),
  nonce: z.string().min(22).max(120).regex(/^[A-Za-z0-9_-]+$/), signature: z.string().min(64).max(256),
}).strict();
export const AgentErrorResponseSchema = z.object({ code: z.string().min(1), error: z.string().min(1), requestId: z.string().min(1) });

export function agentSignaturePayload(input: { protocolVersion: string; nodeId: string; credentialId: string; method: string; path: string; timestamp: string; nonce: string; bodySha256: string }): string {
  return [input.protocolVersion, input.nodeId, input.credentialId, input.method.toUpperCase(), input.path, input.timestamp, input.nonce, input.bodySha256].join("\n");
}
