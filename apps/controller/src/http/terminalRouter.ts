import {
  ExecuteTerminalSnippetRequestSchema, ExecuteTerminalSnippetResponseSchema, TerminalSnippetIdSchema,
  TerminalSnippetListResponseSchema, TerminalSnippetRecordSchema, UpdateTerminalSnippetFavoriteRequestSchema,
} from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";

function snippetId(context: RequestContext) {
  try { return parseSchema(TerminalSnippetIdSchema, decodeURIComponent(context.parts[3] ?? ""), "命令片段 ID"); }
  catch (error) { if (error instanceof URIError) throw notFound("命令片段不存在"); throw error; }
}

export async function routeTerminalRequest(context: RequestContext) {
  const method = context.request.method ?? "GET";
  const identity = context.identity;
  const principal = context.principal;
  const userId = principal?.userId ?? "";
  if (context.parts.length === 3 && context.parts[2] === "snippets" && method === "GET") {
    identity?.require(principal, "terminal:read");
    sendJson(context.response, 200, context.services.terminalSnippets.list(userId), TerminalSnippetListResponseSchema); return;
  }
  if (context.parts.length === 5 && context.parts[2] === "snippets" && context.parts[4] === "favorite" && method === "PATCH") {
    identity?.require(principal, "terminal:read");
    const input = parseSchema(UpdateTerminalSnippetFavoriteRequestSchema, context.body, "收藏状态");
    sendJson(context.response, 200, context.services.terminalSnippets.setFavorite(userId, snippetId(context), input.favorite), TerminalSnippetRecordSchema); return;
  }
  if (context.parts.length === 5 && context.parts[2] === "snippets" && context.parts[4] === "executions" && method === "POST") {
    const input = parseSchema(ExecuteTerminalSnippetRequestSchema, context.body, "命令片段执行请求");
    identity?.require(principal, "terminal:execute", input.nodeId);
    identity?.consumeReauth(principal!, typeof context.request.headers["x-reauth-proof"] === "string" ? context.request.headers["x-reauth-proof"] : undefined);
    sendJson(context.response, 201, await context.services.terminalSnippets.execute(userId, snippetId(context), input, context.requestId), ExecuteTerminalSnippetResponseSchema); return;
  }
  throw notFound("终端接口不存在");
}
