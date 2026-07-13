import { connect } from "node:net";
import { CertificateHelperStatusDataSchema, type SiteCertificate } from "@stackpilot/contracts";

const SOCKET_PATH = "/run/stackpilot-cert-helper/helper.sock";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
type Request = { operation: "status" } | { operation: "renew"; certificateId: string };
type Response = { ok: boolean; operation: "status" | "renew"; errorCode?: string; message?: string; data?: unknown };

export class CertHelperError extends Error {
  constructor(public readonly code: string, message = "Certificate helper request failed") {
    super(message); this.name = code;
  }
}

export function requestCertHelper(request: Request, socketPath = SOCKET_PATH): Promise<Response> {
  return new Promise((resolve, reject) => {
    const socket = connect({ path: socketPath });
    let response = "";
    const fail = (error: unknown) => {
      socket.destroy();
      reject(error instanceof CertHelperError ? error : new CertHelperError("CERT_HELPER_UNAVAILABLE"));
    };
    socket.setTimeout(request.operation === "status" ? 2_000 : 590_000, () => fail(new CertHelperError("CERT_HELPER_TIMEOUT")));
    socket.once("connect", () => socket.end(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk: Buffer) => {
      response += chunk.toString("utf8");
      if (Buffer.byteLength(response) > MAX_RESPONSE_BYTES) fail(new CertHelperError("CERT_HELPER_RESPONSE_TOO_LARGE"));
    });
    socket.once("error", fail);
    socket.once("end", () => {
      try {
        const parsed = JSON.parse(response.trim()) as Response;
        if (!parsed || typeof parsed.ok !== "boolean" || parsed.operation !== request.operation) throw new Error();
        if (!parsed.ok) { reject(new CertHelperError(parsed.errorCode ?? "CERT_HELPER_FAILED", parsed.message)); return; }
        resolve(parsed);
      } catch (error) {
        reject(error instanceof CertHelperError ? error : new CertHelperError("CERT_HELPER_INVALID_RESPONSE"));
      }
    });
  });
}

export async function certHelperCertificates() {
  const response = await requestCertHelper({ operation: "status" });
  const data = CertificateHelperStatusDataSchema.parse(response.data);
  return new Map(data.certificates.map((entry): [string, SiteCertificate] => [entry.sourceId, entry.certificate]));
}

export async function certHelperAvailable() {
  try { return (await requestCertHelper({ operation: "status" })).ok; } catch { return false; }
}
