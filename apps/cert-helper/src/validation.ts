import { isIP } from "node:net";
import type { EnvironmentVariable, HelperRequest } from "./types.js";
import { HelperError } from "./types.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OPAQUE_SITE_ID = /^site-[a-f0-9]{32}$/;
const CERTIFICATE_ID = /^cert_[a-f0-9]{32}$/;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,127}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/;
const SYSTEMD_UNIT = /^[A-Za-z0-9][A-Za-z0-9_.@:-]*\.(?:service|timer|socket|target)$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HelperError("INVALID_REQUEST", "Request must be an object");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort().join(",");
  if (actual !== [...expected].sort().join(",")) throw new HelperError("INVALID_REQUEST", "Request fields do not match the fixed operation schema");
}

export function validDomain(value: unknown): string {
  if (typeof value !== "string") throw new HelperError("INVALID_DOMAIN", "Domain must be a string");
  const domain = value.trim().toLowerCase();
  if (!DOMAIN.test(domain) || domain.startsWith("*.") || isIP(domain)) throw new HelperError("INVALID_DOMAIN", "Only non-wildcard DNS names are accepted");
  return domain;
}

export function publicGithubUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 512) throw new HelperError("INVALID_REPOSITORY", "Repository URL is invalid");
  let url: URL;
  try { url = new URL(value); } catch { throw new HelperError("INVALID_REPOSITORY", "Repository URL is invalid"); }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || isIP(url.hostname) || url.port || url.username || url.password || url.search || url.hash
    || !/^\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}(?:\.git)?$/.test(url.pathname)) {
    throw new HelperError("INVALID_REPOSITORY", "Only public github.com HTTPS repository URLs are accepted");
  }
  return url.toString();
}

function environment(value: unknown): EnvironmentVariable[] {
  if (!Array.isArray(value) || value.length > 100) throw new HelperError("INVALID_ENVIRONMENT", "Environment variable list is invalid");
  const seen = new Set<string>();
  return value.map((item) => {
    const entry = record(item); exactKeys(entry, ["name", "value"]);
    if (typeof entry.name !== "string" || !ENV_NAME.test(entry.name) || seen.has(entry.name) || typeof entry.value !== "string" || entry.value.length > 8_192 || /[\0\r\n]/.test(entry.value)) {
      throw new HelperError("INVALID_ENVIRONMENT", "Environment variables do not match the fixed schema");
    }
    seen.add(entry.name); return { name: entry.name, value: entry.value };
  });
}

function requestId(value: unknown) { if (typeof value !== "string" || !UUID.test(value)) throw new HelperError("INVALID_REQUEST", "requestId must be a UUID"); return value; }
function planId(value: unknown) { if (typeof value !== "string" || !UUID.test(value)) throw new HelperError("INVALID_REQUEST", "planId must be a UUID"); return value; }

export function parseRequest(raw: string): HelperRequest {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new HelperError("INVALID_REQUEST", "Request must be valid JSON"); }
  const value = record(parsed);
  if (value.operation === "systemd-list") { exactKeys(value, ["operation"]); return { operation: "systemd-list" }; }
  if (value.operation === "systemd-logs") {
    exactKeys(value, ["operation", "unit", "limit"]);
    if (typeof value.unit !== "string" || !SYSTEMD_UNIT.test(value.unit) || !Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 200) throw new HelperError("INVALID_REQUEST", "systemd log request is invalid");
    return { operation: "systemd-logs", unit: value.unit, limit: Number(value.limit) };
  }
  if (value.operation === "systemd-action") {
    exactKeys(value, ["operation", "requestId", "unit", "action"]);
    if (typeof value.unit !== "string" || !SYSTEMD_UNIT.test(value.unit) || !["start", "stop", "restart"].includes(String(value.action))) throw new HelperError("INVALID_REQUEST", "systemd action request is invalid");
    return { operation: "systemd-action", requestId: requestId(value.requestId), unit: value.unit, action: value.action as "start" | "stop" | "restart" };
  }
  if (value.operation === "status") { exactKeys(value, ["operation"]); return { operation: "status" }; }
  if (value.operation === "renew") {
    exactKeys(value, ["operation", "certificateId"]);
    if (typeof value.certificateId !== "string" || !CERTIFICATE_ID.test(value.certificateId)) throw new HelperError("INVALID_REQUEST", "certificateId must be opaque");
    return { operation: "renew", certificateId: value.certificateId };
  }
  if (value.operation === "prepare") {
    exactKeys(value, ["operation", "requestId", "planId", "nodeId", "domains", "repositoryUrl", "repositoryRef", "certificateEmail", "certificateEnvironment", "environmentVariables", "expectedPlanDigest"]);
    if (!Array.isArray(value.domains) || !value.domains.length || value.domains.length > 20) throw new HelperError("INVALID_DOMAIN", "Domain list is invalid");
    const domains = value.domains.map(validDomain); if (new Set(domains).size !== domains.length) throw new HelperError("INVALID_DOMAIN", "Domains must be unique");
    if (typeof value.repositoryRef !== "string" || !REF.test(value.repositoryRef) || value.repositoryRef.includes("..") || value.repositoryRef.includes("//") || value.repositoryRef.endsWith("/")) throw new HelperError("INVALID_REPOSITORY_REF", "Repository ref is unsafe");
    if (typeof value.certificateEmail !== "string" || value.certificateEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.certificateEmail)) throw new HelperError("INVALID_EMAIL", "Certificate email is invalid");
    if (typeof value.nodeId !== "string" || !UUID.test(value.nodeId) || !["staging", "production"].includes(String(value.certificateEnvironment)) || typeof value.expectedPlanDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.expectedPlanDigest)) throw new HelperError("INVALID_REQUEST", "Plan identity fields are invalid");
    return { operation: "prepare", requestId: requestId(value.requestId), planId: planId(value.planId), nodeId: value.nodeId, domains, repositoryUrl: publicGithubUrl(value.repositoryUrl), repositoryRef: value.repositoryRef, certificateEmail: value.certificateEmail, certificateEnvironment: value.certificateEnvironment as "staging" | "production", environmentVariables: environment(value.environmentVariables), expectedPlanDigest: value.expectedPlanDigest };
  }
  if (value.operation === "activate") {
    exactKeys(value, ["operation", "requestId", "planId", "stagingId", "expectedPlanDigest"]);
    if (typeof value.stagingId !== "string" || !/^staging_[a-f0-9]{32}$/.test(value.stagingId) || typeof value.expectedPlanDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.expectedPlanDigest)) throw new HelperError("INVALID_REQUEST", "Activation identity fields are invalid");
    return { operation: "activate", requestId: requestId(value.requestId), planId: planId(value.planId), stagingId: value.stagingId, expectedPlanDigest: value.expectedPlanDigest };
  }
  if (value.operation === "lifecycle") {
    exactKeys(value, ["operation", "requestId", "siteId", "action", "expectedVersion"]);
    if (typeof value.siteId !== "string" || !OPAQUE_SITE_ID.test(value.siteId) || !["running", "stopped", "deleted", "restored"].includes(String(value.action))
      || !Number.isInteger(value.expectedVersion) || Number(value.expectedVersion) < 1) throw new HelperError("INVALID_REQUEST", "Lifecycle request is invalid");
    return { operation: "lifecycle", requestId: requestId(value.requestId), siteId: value.siteId, action: value.action as "running" | "stopped" | "deleted" | "restored", expectedVersion: Number(value.expectedVersion) };
  }
  if (value.operation === "logs") {
    exactKeys(value, ["operation", "requestId", "siteId", "since", "limit"]);
    if (typeof value.siteId !== "string" || !OPAQUE_SITE_ID.test(value.siteId) || !(value.since === null || typeof value.since === "string" && Number.isFinite(Date.parse(value.since))) || !Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 200) throw new HelperError("INVALID_REQUEST", "Log query is invalid");
    return { operation: "logs", requestId: requestId(value.requestId), siteId: value.siteId, since: value.since as string | null, limit: Number(value.limit) };
  }
  throw new HelperError("INVALID_REQUEST", "Operation is not in the fixed helper protocol");
}

export function safeRelativePath(value: unknown, field: string): string {
  if (typeof value !== "string" || !value || value.length > 256 || value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new HelperError("INVALID_MANIFEST", `${field} must be a safe relative path`);
  }
  return value;
}

export { CERTIFICATE_ID, OPAQUE_SITE_ID, UUID };
