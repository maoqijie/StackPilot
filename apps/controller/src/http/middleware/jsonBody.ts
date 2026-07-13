import type { IncomingMessage } from "node:http";
import { ApiError } from "../errors/ApiError.js";

export async function readJsonRequest(request: IncomingMessage, limitBytes: number, rawOnly = false): Promise<{ value: unknown; raw: Buffer }> {
  const contentLength = Number(request.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > limitBytes) {
    request.resume();
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", rawOnly ? "上传文件过大" : "JSON 请求体过大");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    size += chunk.length;
    if (size > limitBytes) {
      request.resume();
      throw new ApiError(413, "PAYLOAD_TOO_LARGE", rawOnly ? "上传文件过大" : "JSON 请求体过大");
    }
    chunks.push(chunk);
  }
  const rawBuffer = Buffer.concat(chunks, size);
  if (rawOnly) return { value: {}, raw: rawBuffer };
  const raw = rawBuffer.toString("utf8");
  if (!raw.trim()) return { value: {}, raw: Buffer.alloc(0) };
  try { return { value: JSON.parse(raw) as unknown, raw: rawBuffer }; }
  catch { throw new ApiError(400, "BAD_REQUEST", "请求体必须是合法 JSON"); }
}

export async function readJsonBody(request: IncomingMessage, limitBytes: number): Promise<unknown> {
  return (await readJsonRequest(request, limitBytes)).value;
}
