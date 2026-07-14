import { connect } from "node:net";
import type { SystemdJournalPayload, SystemdUnit, SystemdUnitAction } from "@stackpilot/contracts";

const SOCKET_PATH = "/run/stackpilot-cert-helper/helper.sock";
const MAX_RESPONSE_BYTES = 1024 * 1024;

type SystemdHelperRequest =
  | { operation: "systemd-list" }
  | { operation: "systemd-logs"; unit: string; limit: number }
  | { operation: "systemd-action"; requestId: string; unit: string; action: SystemdUnitAction };
type SystemdHelperResponse = {
  ok: boolean;
  operation: SystemdHelperRequest["operation"];
  errorCode?: string;
  message?: string;
  data?: Record<string, unknown>;
};
export type SystemdHelperRequester = (request: SystemdHelperRequest, socketPath?: string) => Promise<SystemdHelperResponse>;

export class SystemdHelperError extends Error {
  constructor(public readonly code: string, message = "systemd helper request failed") {
    super(message);
    this.name = code;
  }
}

export function requestSystemdHelper(request: SystemdHelperRequest, socketPath = SOCKET_PATH): Promise<SystemdHelperResponse> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: socketPath });
    let response = "";
    const fail = (error: unknown) => {
      socket.destroy();
      reject(error instanceof SystemdHelperError ? error : new SystemdHelperError("SYSTEMD_HELPER_UNAVAILABLE"));
    };
    socket.setTimeout(request.operation === "systemd-action" ? 35_000 : 10_000, () => fail(new SystemdHelperError("SYSTEMD_HELPER_TIMEOUT")));
    socket.once("connect", () => socket.end(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) fail(new SystemdHelperError("SYSTEMD_HELPER_RESPONSE_TOO_LARGE"));
    });
    socket.once("error", fail);
    socket.once("end", () => {
      try {
        const parsed = JSON.parse(response.trim()) as SystemdHelperResponse;
        if (!parsed || typeof parsed.ok !== "boolean" || parsed.operation !== request.operation) throw new Error("invalid response");
        if (!parsed.ok) { reject(new SystemdHelperError(parsed.errorCode ?? "SYSTEMD_HELPER_FAILED", parsed.message)); return; }
        resolve(parsed);
      } catch (error) {
        reject(error instanceof SystemdHelperError ? error : new SystemdHelperError("SYSTEMD_HELPER_INVALID_RESPONSE"));
      }
    });
  });
}

export type SystemdBackend = {
  list(): Promise<{ units: SystemdUnit[]; collectedAt: string; host: string; warnings: string[] }>;
  logs(unit: string): Promise<SystemdJournalPayload>;
  action(unit: string, action: SystemdUnitAction, idempotencyKey: string): Promise<SystemdUnit>;
};
