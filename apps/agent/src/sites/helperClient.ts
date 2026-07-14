import { connect } from "node:net";
import { CertificateHelperStatusDataSchema, type SiteCertificate } from "@stackpilot/contracts";

export const CERT_HELPER_SOCKET_PATH = "/run/stackpilot-cert-helper/helper.sock";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export type SiteHelperRequest =
  | { operation: "status" }
  | { operation: "renew"; certificateId: string }
  | { operation: "prepare"; requestId: string; planId: string; nodeId: string; domains: string[]; repositoryUrl: string; repositoryRef: string; certificateEmail: string; certificateEnvironment: "staging" | "production"; environmentVariables: Array<{ name: string; value: string }>; expectedPlanDigest: string; runtimeInstallAuthorized: boolean }
  | { operation: "activate"; requestId: string; planId: string; stagingId: string; expectedPlanDigest: string }
  | { operation: "lifecycle"; requestId: string; siteId: string; action: "running" | "stopped" | "deleted" | "restored"; expectedVersion: number }
  | { operation: "logs"; requestId: string; siteId: string; since: string | null; limit: number };
type HelperResponse = { ok: boolean; operation: SiteHelperRequest["operation"]; errorCode?: string; message?: string; data?: Record<string, unknown> };

export class CertHelperError extends Error {
  constructor(public readonly code: string, message = "Certificate helper request failed") {
    super(message); this.name = code;
  }
}

export function requestCertHelper(request: SiteHelperRequest, signal?: AbortSignal, socketPath = CERT_HELPER_SOCKET_PATH): Promise<HelperResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new CertHelperError("CERT_HELPER_CANCELLED")); return; }
    const socket = connect({ path: socketPath });
    let response = "";
    const fail = (error: unknown) => { socket.destroy(); reject(error instanceof CertHelperError ? error : new CertHelperError("CERT_HELPER_UNAVAILABLE")); };
    const abort = () => fail(new CertHelperError("CERT_HELPER_CANCELLED"));
    signal?.addEventListener("abort", abort, { once: true });
    socket.setTimeout(request.operation === "status" ? 2_000 : request.operation === "logs" || request.operation === "lifecycle" ? 120_000 : 1_790_000, () => fail(new CertHelperError("CERT_HELPER_TIMEOUT")));
    socket.once("connect", () => socket.end(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) fail(new CertHelperError("CERT_HELPER_RESPONSE_TOO_LARGE"));
    });
    socket.once("error", fail);
    socket.once("end", () => {
      signal?.removeEventListener("abort", abort);
      try {
        const parsed = JSON.parse(response.trim()) as HelperResponse;
        if (!parsed || typeof parsed.ok !== "boolean" || parsed.operation !== request.operation) throw new Error("invalid response");
        if (!parsed.ok) { reject(new CertHelperError(parsed.errorCode ?? "CERT_HELPER_FAILED", parsed.message)); return; }
        resolve(parsed);
      } catch (error) { reject(error instanceof CertHelperError ? error : new CertHelperError("CERT_HELPER_INVALID_RESPONSE")); }
    });
  });
}

export async function certHelperAvailable() {
  try { return (await requestCertHelper({ operation: "status" })).ok; } catch { return false; }
}

export async function certHelperCertificates() {
  const response = await requestCertHelper({ operation: "status" });
  const data = CertificateHelperStatusDataSchema.parse(response.data);
  return new Map(data.certificates.map((entry): [string, SiteCertificate] => [entry.sourceId, entry.certificate]));
}
