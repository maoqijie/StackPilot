import {
  AGENT_FEATURE_DATABASE_INVENTORY, AgentEnrollmentRequestSchema, AgentEnrollmentResponseSchema, AgentHeartbeatResponseSchema, AgentHeartbeatSchema,
  RemoteTaskPollResponseSchema, RemoteTaskRecordSchema, RemoteTaskStatusUpdateSchema, RotateCredentialRequestSchema, RotateCredentialResponseSchema,
} from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

export async function routeAgentRequest(context: RequestContext) {
  const method = context.request.method ?? "GET";
  context.response.setHeader("X-StackPilot-Agent-Features", AGENT_FEATURE_DATABASE_INVENTORY);
  if (context.url.pathname === "/api/agent/enroll" && method === "POST") {
    const input = parseSchema(AgentEnrollmentRequestSchema, context.body, "注册请求");
    sendJson(context.response, 201, await context.services.enrollments.enroll(input, context.requestId), AgentEnrollmentResponseSchema);
    return;
  }
  const identity = context.agentIdentity;
  if (!identity) throw notFound("Agent 身份不可用");
  if (context.url.pathname === "/api/agent/heartbeat" && method === "POST") {
    const input = parseSchema(AgentHeartbeatSchema, context.body, "心跳");
    sendJson(context.response, 200, await context.services.nodes.heartbeat(identity.nodeId, input, context.requestId), AgentHeartbeatResponseSchema);
    return;
  }
  if (context.url.pathname === "/api/agent/tasks/poll" && method === "POST") {
    const tasks = await context.services.remoteTasks.poll(identity.nodeId, context.requestId);
    const cancelledTaskIds = await context.services.remoteTasks.cancellations(identity.nodeId);
    sendJson(context.response, 200, { tasks, cancelledTaskIds, controllerTime: new Date().toISOString() }, RemoteTaskPollResponseSchema);
    return;
  }
  if (context.url.pathname === "/api/agent/tasks/status" && method === "POST") {
    const input = parseSchema(RemoteTaskStatusUpdateSchema, context.body, "任务状态");
    sendJson(context.response, 200, await context.services.remoteTasks.update(identity.nodeId, input, context.requestId), RemoteTaskRecordSchema);
    return;
  }
  if (context.url.pathname === "/api/agent/credentials/rotate" && method === "POST") {
    const input = parseSchema(RotateCredentialRequestSchema, context.body, "凭据轮换");
    sendJson(context.response, 200, await context.services.nodes.rotate(identity.nodeId, identity.credentialId, input.rotationId, input.publicKey, context.requestId), RotateCredentialResponseSchema);
    return;
  }
  throw notFound("Agent 接口不存在");
}
