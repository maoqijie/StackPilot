import { connect } from "node:net";
import { CertificateHelperStatusDataSchema, type SiteCertificate } from "@stackpilot/contracts";

export const CERT_HELPER_SOCKET_PATH = "/run/stackpilot-cert-helper/helper.sock";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export type CertificateHelperRequest = { operation: "status" } | { operation: "renew"; certificateId: string };
type CertificateHelperResponse = { ok: boolean; operation: CertificateHelperRequest["operation"]; errorCode?: string; message?: string; data?: Record<string, unknown> };

export class CertHelperError extends Error {
  constructor(public readonly code: string, message = "Certificate helper request failed") {
    super(message);
    this.name = code;
  }
}

export function requestCertHelper(request: CertificateHelperRequest, signal?: AbortSignal, socketPath = CERT_HELPER_SOCKET_PATH): Promise<CertificateHelperResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new CertHelperError("CERT_HELPER_CANCELLED")); return; }
    const socket = connect({ path: socketPath });
    let response = "";
    const fail = (error: unknown) => {
      socket.destroy();
      reject(error instanceof CertHelperError ? error : new CertHelperError("CERT_HELPER_UNAVAILABLE"));
    };
    const abort = () => fail(new CertHelperError("CERT_HELPER_CANCELLED"));
    signal?.addEventListener("abort", abort, { once: true });
    socket.setTimeout(request.operation === "status" ? 2_000 : 590_000, () => fail(new CertHelperError("CERT_HELPER_TIMEOUT")));
    socket.once("connect", () => socket.end(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) fail(new CertHelperError("CERT_HELPER_RESPONSE_TOO_LARGE"));
    });
    socket.once("error", fail);
    socket.once("end", () => {
      signal?.removeEventListener("abort", abort);
      try {
        const parsed = JSON.parse(response.trim()) as CertificateHelperResponse;
        if (!parsed || typeof parsed.ok !== "boolean" || parsed.operation !== request.operation) throw new Error("invalid response");
        if (!parsed.ok) { reject(new CertHelperError(parsed.errorCode ?? "CERT_HELPER_FAILED", parsed.message)); return; }
        resolve(parsed);
      } catch (error) {
        reject(error instanceof CertHelperError ? error : new CertHelperError("CERT_HELPER_INVALID_RESPONSE"));
      }
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
