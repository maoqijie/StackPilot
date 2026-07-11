import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { AgentRequestAuthenticationSchema, AGENT_PROTOCOL_VERSION } from "@stackpilot/contracts";
import type { NodeService } from "../../modules/nodes/nodeService.js";
import { ServiceError } from "../../modules/serviceError.js";

const header = (request: IncomingMessage, name: string) => typeof request.headers[name] === "string" ? request.headers[name] : "";

export async function authenticateAgentRequest(request: IncomingMessage, path: string, rawBody: Buffer, nodes: NodeService) {
  if (!("encrypted" in request.socket) || request.socket.encrypted !== true) throw new ServiceError(426, "BAD_REQUEST", "Agent API 要求 TLS");
  const parsed = AgentRequestAuthenticationSchema.safeParse({
    nodeId: header(request, "x-stackpilot-node-id"), credentialId: header(request, "x-stackpilot-credential-id"),
    timestamp: header(request, "x-stackpilot-timestamp"), nonce: header(request, "x-stackpilot-nonce"), signature: header(request, "x-stackpilot-signature"),
  });
  if (!parsed.success) throw new ServiceError(401, "UNAUTHORIZED", "Agent 身份头无效");
  return nodes.authenticate({ ...parsed.data, method: request.method ?? "GET", path, bodySha256: createHash("sha256").update(rawBody).digest("hex"), protocolVersion: header(request, "x-stackpilot-protocol") || AGENT_PROTOCOL_VERSION });
}
