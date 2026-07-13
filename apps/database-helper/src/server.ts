import { chmod, chown, mkdir, rm } from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { dirname } from "node:path";
import {
  DatabaseHelperRequestSchema, DatabaseHelperResponseSchema, type DatabaseHelperResponse,
} from "@stackpilot/contracts";
import type { DatabaseCollector } from "./collection/collector.js";
import type { DatabaseOperationService } from "./operations/operationService.js";
import { HelperError } from "./domain.js";

const MAX_REQUEST_BYTES = 96 * 1024;
export class DatabaseHelperServer {
  constructor(private readonly collector: DatabaseCollector, private readonly operations: DatabaseOperationService) {}
  async handle(raw: unknown): Promise<DatabaseHelperResponse> {
    try {
      const request = DatabaseHelperRequestSchema.parse(raw);
      const result = request.action === "collect" ? await this.collector.collect() : await this.operations.execute(request.operation);
      return DatabaseHelperResponseSchema.parse({ ok: true, result });
    } catch (error) {
      const code = error instanceof HelperError ? error.code : error instanceof SyntaxError || (error as { name?: string }).name === "ZodError" ? "INVALID_REQUEST" : "HELPER_FAILED";
      const message = error instanceof HelperError ? error.message : code === "INVALID_REQUEST" ? "database-helper 请求无效" : "database-helper 操作失败";
      return { ok: false, code, error: message };
    }
  }
  listen(options: { path: string; fd?: number; gid?: number }) {
    const server = createServer({ allowHalfOpen: true }, (socket) => this.connection(socket));
    if (options.fd !== undefined) server.listen({ fd: options.fd });
    else void this.listenPath(server, options.path, options.gid);
    return server;
  }
  private async listenPath(server: ReturnType<typeof createServer>, path: string, gid?: number) {
    await mkdir(dirname(path), { recursive: true, mode: 0o755 }); await rm(path, { force: true });
    server.listen(path, async () => { await chmod(path, 0o660); if (gid !== undefined) await chown(path, 0, gid); });
  }
  private connection(socket: Socket) {
    const chunks: Buffer[] = []; let size = 0; socket.setTimeout(10_000, () => socket.destroy());
    socket.on("data", (chunk: Buffer) => { size += chunk.length; if (size > MAX_REQUEST_BYTES) socket.destroy(); else chunks.push(chunk); });
    socket.on("end", () => { void this.processSocket(socket, Buffer.concat(chunks)); }); socket.on("error", () => undefined);
  }
  private async processSocket(socket: Socket, body: Buffer) {
    let parsed: unknown;
    try { parsed = JSON.parse(body.toString("utf8")); } catch { socket.end(`${JSON.stringify({ ok: false, code: "INVALID_JSON", error: "请求必须为单个 JSON 对象" })}\n`); return; }
    socket.end(`${JSON.stringify(await this.handle(parsed))}\n`);
  }
}
