import { createConnection } from "node:net";
import { DatabaseHelperResponseSchema, type DatabaseHelperRequest, type DatabaseHelperResponse } from "@stackpilot/contracts";

const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
export class DatabaseHelperClient {
  constructor(private readonly socketPath: string) {}
  request(request: DatabaseHelperRequest): Promise<DatabaseHelperResponse> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []; let size = 0; const socket = createConnection(this.socketPath);
      socket.setTimeout(30 * 60_000, () => socket.destroy(new Error("database-helper 请求超时")));
      socket.on("connect", () => socket.end(Buffer.from(JSON.stringify(request), "utf8")));
      socket.on("data", (chunk: Buffer) => { size += chunk.length; if (size > MAX_RESPONSE_BYTES) socket.destroy(new Error("database-helper 响应过大")); else chunks.push(chunk); });
      socket.on("end", () => { try { resolve(DatabaseHelperResponseSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")))); } catch (error) { reject(error); } });
      socket.on("error", reject);
    });
  }
}
