import { certificateHelperReady, renewOpaqueCertificate } from "./certificates.js";
import { buildCertificateInventory } from "./certificateMap.js";
import { log } from "./audit.js";
import { HelperError } from "./types.js";

type CertificateRequest = { operation: "status" } | { operation: "renew"; certificateId: string };
type CertificateResponse = { ok: boolean; operation: "status" | "renew"; errorCode?: string; message?: string; data?: Record<string, unknown> };
const CERTIFICATE_ID = /^cert_[a-f0-9]{32}$/;

function parseCertificateRequest(raw: string): CertificateRequest {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new HelperError("INVALID_REQUEST", "Request must be valid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new HelperError("INVALID_REQUEST", "Request must be an object");
  const value = parsed as Record<string, unknown>;
  if (value.operation === "status" && Object.keys(value).length === 1) return { operation: "status" };
  if (value.operation === "renew" && Object.keys(value).sort().join(",") === "certificateId,operation" && typeof value.certificateId === "string" && CERTIFICATE_ID.test(value.certificateId)) {
    return { operation: "renew", certificateId: value.certificateId };
  }
  throw new HelperError("INVALID_REQUEST", "Only status and opaque certificate renewal are accepted");
}

export async function handleCertificateRequest(raw: string, dependencies: { ready?: () => Promise<boolean>; inventory?: typeof buildCertificateInventory; renew?: typeof renewOpaqueCertificate } = {}): Promise<CertificateResponse> {
  let request: CertificateRequest;
  try { request = parseCertificateRequest(raw); }
  catch (error) { return { ok: false, operation: "status", errorCode: error instanceof HelperError ? error.code : "INVALID_REQUEST", message: "Request does not match the certificate helper protocol" }; }
  const started = performance.now();
  try {
    if (request.operation === "status") return await (dependencies.ready ?? certificateHelperReady)()
      ? { ok: true, operation: "status", data: { certificates: await (dependencies.inventory ?? buildCertificateInventory)() } }
      : { ok: false, operation: "status", errorCode: "HELPER_NOT_READY", message: "Required certificate executables are unavailable" };
    await (dependencies.renew ?? renewOpaqueCertificate)(request.certificateId);
    log({ level: "info", message: "Certificate helper operation completed", operation: request.operation, durationMs: Math.round(performance.now() - started) });
    return { ok: true, operation: "renew", data: { certificateId: request.certificateId } };
  } catch (error) {
    const code = error instanceof HelperError ? error.code : "HELPER_OPERATION_FAILED";
    log({ level: "error", message: "Certificate helper operation failed", operation: request.operation, errorCode: code, durationMs: Math.round(performance.now() - started) });
    return { ok: false, operation: request.operation, errorCode: code, message: "Certificate helper operation failed; inspect structured root helper logs" };
  }
}

export { parseCertificateRequest };
