import { X509Certificate, createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { hostname } from "node:os";
import { basename, join } from "node:path";
import type { TLSSocket } from "node:tls";
import { SiteRuntimePayloadSchema } from "@stackpilot/contracts";
import type { SiteCertificate, SiteRuntimePayload, SiteRuntimeRecord, SiteRuntimeStatus } from "@stackpilot/contracts";
import { certHelperAvailable } from "./certHelperClient.js";

type Listener = { port: number; secure: boolean };
type SiteCandidate = {
  domain: string;
  listeners: Listener[];
  runtime: string;
  upstream: string | null;
  source: string;
  certificatePath: string | null;
};
type ProbeResult = Pick<SiteRuntimeRecord, "status" | "latencyMs" | "certificate">;
type SiteProbe = (domain: string, listeners: Listener[]) => Promise<ProbeResult>;
type PublicCertificateReader = (path: string) => Promise<SiteCertificate>;

const MAX_CONFIG_FILES = 500;
const MAX_CONFIG_BYTES = 2 * 1024 * 1024;
const MAX_SITES = 500;
const MAX_CONCURRENT_PROBES = 8;
const siteProbeHttpsAgent = new HttpsAgent({ keepAlive: false, maxCachedSessions: 0 });

function extractServerBlocks(source: string) {
  const cleaned = source.replace(/#[^\r\n]*/g, "");
  const blocks: string[] = [];
  const pattern = /\bserver\s*\{/g;
  while (pattern.exec(cleaned)) {
    const start = pattern.lastIndex;
    let depth = 1;
    let quote = "";
    let escaped = false;
    for (let index = start; index < cleaned.length; index += 1) {
      const char = cleaned[index];
      if (escaped) { escaped = false; continue; }
      if (char === "\\") { escaped = true; continue; }
      if (quote) { if (char === quote) quote = ""; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
      if (depth === 0) {
        blocks.push(cleaned.slice(start, index));
        pattern.lastIndex = index + 1;
        break;
      }
    }
  }
  return blocks;
}

function directiveValues(block: string, name: string) {
  return [...block.matchAll(new RegExp(`(?:^|[\\s;{}])${name}\\s+([^;]+);`, "g"))]
    .map((match) => match[1]?.trim() ?? "")
    .filter(Boolean);
}

function domainsFrom(block: string) {
  return directiveValues(block, "server_name").flatMap((value) => value.split(/\s+/)).filter((value) => {
    if (!value || value === "_" || value.startsWith("~") || value.includes("$")) return false;
    const normalized = value.startsWith("*.") ? value.slice(2) : value;
    return normalized.length <= 253 && /^(?=.{1,253}$)(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/i.test(normalized);
  });
}

function listenersFrom(block: string): Listener[] {
  const values = directiveValues(block, "listen");
  if (!values.length) return [{ port: 80, secure: false }];
  return values.flatMap((value) => {
    const target = value.split(/\s+/)[0] ?? "";
    if (target.startsWith("unix:")) return [];
    const port = Number(target.match(/(?:^|:)(\d+)$/)?.[1]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return [];
    return [{ port, secure: /(?:^|\s)ssl(?:\s|$)/.test(value) || port === 443 }];
  });
}

function safeUpstream(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 512);
  if (trimmed.includes("$")) return "动态上游";
  try {
    const url = new URL(trimmed);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    if (trimmed.startsWith("unix:")) return "Unix socket";
    return /^[a-z0-9_.-]+:\d+$/i.test(trimmed) ? trimmed : "已配置上游";
  }
}

function candidateFrom(block: string, source: string): SiteCandidate[] {
  const proxy = directiveValues(block, "proxy_pass")[0];
  const fastcgi = directiveValues(block, "fastcgi_pass")[0];
  const root = directiveValues(block, "root")[0];
  const runtime = fastcgi ? "PHP-FPM" : proxy ? "反向代理" : root ? "Nginx 静态" : "Nginx";
  const upstream = safeUpstream(proxy ?? fastcgi);
  const listeners = listenersFrom(block);
  const configuredPath = directiveValues(block, "ssl_certificate")[0];
  const certificatePath = configuredPath && !configuredPath.includes("$") && !/(?:^|[/_.-])(?:private|privkey|key)(?:[/_.-]|$)/i.test(configuredPath) ? configuredPath : null;
  return domainsFrom(block).map((domain) => ({ domain, listeners, runtime, upstream, source, certificatePath }));
}

function runtimePriority(runtime: string) {
  if (runtime === "PHP-FPM") return 3;
  if (runtime === "反向代理") return 2;
  if (runtime === "Nginx 静态") return 1;
  return 0;
}

function mergeCandidates(candidates: SiteCandidate[]) {
  const sites = new Map<string, SiteCandidate>();
  for (const candidate of candidates) {
    const key = candidate.domain.toLowerCase();
    const current = sites.get(key);
    if (!current) { sites.set(key, candidate); continue; }
    const listeners = [...current.listeners, ...candidate.listeners].filter((listener, index, all) => all.findIndex((item) => item.port === listener.port && item.secure === listener.secure) === index);
    const preferred = runtimePriority(candidate.runtime) > runtimePriority(current.runtime) ? candidate : current;
    sites.set(key, {
      ...current,
      listeners,
      runtime: preferred.runtime,
      upstream: preferred.upstream,
      certificatePath: preferred.certificatePath ?? current.certificatePath,
      source: current.source === candidate.source ? current.source : "多个 Nginx 配置",
    });
  }
  return [...sites.values()].sort((left, right) => left.domain.localeCompare(right.domain));
}

function certificateStatus(expiresAt: string | null): SiteCertificate["status"] {
  if (!expiresAt) return "unavailable";
  const remaining = Date.parse(expiresAt) - Date.now();
  if (remaining <= 0) return "expired";
  if (remaining <= 7 * 86_400_000) return "critical";
  if (remaining < 14 * 86_400_000) return "expiring";
  return "valid";
}

function unavailableCertificate(reason: string): SiteCertificate {
  return { status: "unavailable", notBefore: null, expiresAt: null, issuer: null, subjectAlternativeNames: [], fingerprintSha256: null, renewalMode: "unsupported", renewable: false, unavailableReason: reason, certificateId: null };
}

function certbotIdentity(path: string | null) {
  const match = path?.match(/^\/etc\/letsencrypt\/live\/([A-Za-z0-9._-]{1,128})\/(?:cert|chain|fullchain)\.pem$/);
  if (!match?.[1]) return null;
  return `cert_${createHash("sha256").update(`certbot:${match[1]}`).digest("hex").slice(0, 32)}`;
}

async function readPublicCertificate(path: string): Promise<SiteCertificate> {
  try {
    const certificate = new X509Certificate(await readFile(path));
    const expires = new Date(certificate.validTo); const starts = new Date(certificate.validFrom);
    const expiresAt = Number.isNaN(expires.getTime()) ? null : expires.toISOString();
    const sans = certificate.subjectAltName
      ? certificate.subjectAltName.split(/,\s*/).map((entry) => entry.replace(/^DNS:/, "")).filter((entry) => entry && !entry.startsWith("IP Address:")).slice(0, 100)
      : [];
    return {
      status: certificateStatus(expiresAt), notBefore: Number.isNaN(starts.getTime()) ? null : starts.toISOString(), expiresAt,
      issuer: certificate.issuer.replace(/\n/g, ", ").slice(0, 253) || null, subjectAlternativeNames: sans,
      fingerprintSha256: certificate.fingerprint256.replaceAll(":", "").toUpperCase(), renewalMode: "manual",
      renewable: false, unavailableReason: "证书不由 Certbot 管理", certificateId: null,
    };
  } catch { return unavailableCertificate("无法读取或解析公开 TLS 证书"); }
}

function certificateDetails(socket: TLSSocket): SiteCertificate {
  const certificate = socket.getPeerCertificate();
  const expiresAt = certificate.valid_to ? new Date(certificate.valid_to) : null;
  const notBefore = certificate.valid_from ? new Date(certificate.valid_from) : null;
  const issuer = certificate.issuer?.CN ?? certificate.issuer?.O ?? null;
  const expiresAtIso = expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt.toISOString() : null;
  const san = typeof certificate.subjectaltname === "string"
    ? certificate.subjectaltname.split(/,\s*/).map((item) => item.replace(/^DNS:/, "")).filter(Boolean).slice(0, 100)
    : [];
  const fingerprint = typeof certificate.fingerprint256 === "string" ? certificate.fingerprint256.replaceAll(":", "").toUpperCase() : null;
  return {
    status: certificateStatus(expiresAtIso),
    notBefore: notBefore && !Number.isNaN(notBefore.getTime()) ? notBefore.toISOString() : null,
    expiresAt: expiresAtIso,
    issuer: issuer ? String(issuer).slice(0, 253) : null,
    subjectAlternativeNames: san,
    fingerprintSha256: fingerprint && /^[A-F0-9]{64}$/.test(fingerprint) ? fingerprint : null,
    renewalMode: "unsupported",
    renewable: false,
    unavailableReason: "Controller 本机尚未配置证书续期 helper",
    certificateId: null,
  };
}

function probeListener(domain: string, listener: Listener): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    const request = (listener.secure ? httpsRequest : httpRequest)({
      host: "127.0.0.1", port: listener.port, method: "HEAD", path: "/",
      headers: { Host: domain, "User-Agent": "StackPilot-Site-Monitor/1.0" },
      timeout: 1_500,
      ...(listener.secure ? { agent: siteProbeHttpsAgent, servername: domain, rejectUnauthorized: true } : {}),
    }, (response) => {
      const status: SiteRuntimeStatus = (response.statusCode ?? 500) < 500 ? "running" : "warning";
      const certificate = listener.secure ? certificateDetails(response.socket as TLSSocket) : unavailableCertificate("站点未启用 TLS");
      response.resume();
      resolve({ status, latencyMs: Math.max(1, Math.round(performance.now() - started)), certificate });
    });
    request.once("timeout", () => request.destroy(new Error("timeout")));
    request.once("error", () => resolve({ status: "stopped", latencyMs: null, certificate: unavailableCertificate("无法连接站点 TLS 端点") }));
    request.end();
  });
}

async function defaultProbe(domain: string, listeners: Listener[]) {
  const ordered = [...listeners].sort((left, right) => Number(right.secure) - Number(left.secure));
  let fallback: ProbeResult = { status: "unknown", latencyMs: null, certificate: unavailableCertificate("站点 TLS 状态不可用") };
  for (const listener of ordered) {
    const result = await probeListener(domain, listener);
    if (result.status !== "stopped") return result;
    fallback = result;
  }
  return fallback;
}

async function mapConcurrent<T, R>(values: T[], limit: number, mapper: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex++;
      results[index] = await mapper(values[index]!);
    }
  }));
  return results;
}

export class NginxSiteCollector {
  constructor(
    private readonly roots: string[], private readonly probe: SiteProbe = defaultProbe,
    private readonly hostName = hostname(), private readonly helperAvailable: () => Promise<boolean> = certHelperAvailable,
    private readonly publicCertificateReader: PublicCertificateReader = readPublicCertificate,
  ) {}

  async collectSites(): Promise<SiteRuntimePayload> {
    const warnings: string[] = [];
    const files: string[] = [];
    for (const root of this.roots) {
      try {
        const entries = await readdir(root, { withFileTypes: true });
        files.push(...entries.filter((entry) => entry.isSymbolicLink() || (entry.isFile() && entry.name.endsWith(".conf"))).map((entry) => join(root, entry.name)));
      } catch { warnings.push(`Nginx 配置目录不可读：${root}`); }
    }
    const candidates: SiteCandidate[] = [];
    let unreadable = 0;
    for (const file of [...new Set(files)].slice(0, MAX_CONFIG_FILES)) {
      try {
        const info = await stat(file);
        if (info.size > MAX_CONFIG_BYTES) { unreadable += 1; continue; }
        const source = await readFile(file, "utf8");
        candidates.push(...extractServerBlocks(source).flatMap((block) => candidateFrom(block, `Nginx · ${basename(file)}`)));
      } catch { unreadable += 1; }
    }
    if (files.length > MAX_CONFIG_FILES) warnings.push(`Nginx 配置文件超过 ${MAX_CONFIG_FILES} 个，仅采集前 ${MAX_CONFIG_FILES} 个`);
    if (unreadable) warnings.push(`${unreadable} 个 Nginx 配置文件不可读`);
    const merged = mergeCandidates(candidates).slice(0, MAX_SITES);
    const collectedAt = new Date().toISOString();
    const helperReady = await this.helperAvailable();
    const sites = await mapConcurrent(merged, MAX_CONCURRENT_PROBES, async (candidate): Promise<SiteRuntimeRecord> => {
      const result = await this.probe(candidate.domain, candidate.listeners);
      const id = createHash("sha256").update(candidate.domain.toLowerCase()).digest("hex").slice(0, 24);
      const certificateId = certbotIdentity(candidate.certificatePath);
      const publicCertificate = candidate.certificatePath ? await this.publicCertificateReader(candidate.certificatePath) : result.certificate;
      const certificate = publicCertificate.status === "unavailable" ? publicCertificate : {
        ...publicCertificate, certificateId, renewalMode: certificateId ? "automatic" as const : "manual" as const,
        renewable: Boolean(certificateId && helperReady), unavailableReason: certificateId && helperReady ? null
          : certificateId ? "Controller 本机证书续期 helper 不可用或未授权" : "证书不由 Certbot 管理",
      };
      return {
        id: `nginx-${id}`, nodeId: "node-local", domain: candidate.domain, runtime: candidate.runtime, host: this.hostName,
        upstream: candidate.upstream, source: candidate.source, trafficBytes: null, collectedAt, freshness: "current",
        errorRatePercent: null, lastDeployAt: null, manageability: "monitored", managementReason: "站点尚未纳入 StackPilot 受管模板",
        protected: false, version: 1, desiredState: null,
        renewal: { batchId: null, taskId: null, status: "idle", message: null, updatedAt: null },
        status: result.status, latencyMs: result.latencyMs, certificate,
      };
    });
    const collectionStatus = files.length === 0 ? "unavailable" : warnings.length ? "partial" : "complete";
    return SiteRuntimePayloadSchema.parse({ collectedAt, collectionStatus, warnings: warnings.slice(0, 20), sites });
  }
}

export type { Listener, ProbeResult, SiteProbe };
