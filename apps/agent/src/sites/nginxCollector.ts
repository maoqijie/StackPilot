import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, join } from "node:path";
import { AgentSiteSnapshotSchema, type AgentSiteSnapshot, type AgentSiteSnapshotRecord, type SiteCertificate } from "@stackpilot/contracts";
import { certificateSourceIdForPath } from "./certificateIdentity.js";
import { certHelperCertificates } from "./helperClient.js";

type Listener = { port: number; secure: boolean };
type Candidate = { domain: string; listeners: Listener[]; runtime: string; upstream: string | null; source: string; certificatePath: string | null };
type CollectorOptions = {
  roots?: string[]; hostName?: string; now?: () => Date;
  readText?: (path: string) => Promise<string>; helperCertificates?: () => Promise<Map<string, SiteCertificate>>;
};
const MAX_FILES = 500;
const MAX_BYTES = 2 * 1024 * 1024;

function blocksFrom(source: string) {
  const cleaned = source.replace(/#[^\r\n]*/g, ""); const blocks: string[] = []; const pattern = /\bserver\s*\{/g;
  while (pattern.exec(cleaned)) {
    const start = pattern.lastIndex; let depth = 1; let quote = ""; let escaped = false;
    for (let index = start; index < cleaned.length; index += 1) {
      const char = cleaned[index]!;
      if (escaped) { escaped = false; continue; } if (char === "\\") { escaped = true; continue; }
      if (quote) { if (char === quote) quote = ""; continue; } if (char === "\"" || char === "'") { quote = char; continue; }
      if (char === "{") depth += 1; if (char === "}") depth -= 1;
      if (!depth) { blocks.push(cleaned.slice(start, index)); pattern.lastIndex = index + 1; break; }
    }
  }
  return blocks;
}

function directives(block: string, name: string) {
  return [...block.matchAll(new RegExp(`(?:^|[\\s;{}])${name}\\s+([^;]+);`, "g"))].map((match) => match[1]?.trim() ?? "").filter(Boolean);
}

function domains(block: string) {
  return directives(block, "server_name").flatMap((value) => value.split(/\s+/)).filter((value) => {
    const domain = value.startsWith("*.") ? value.slice(2) : value;
    return value !== "_" && !value.startsWith("~") && !value.includes("$") && /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)*[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/i.test(domain) && domain.length <= 253;
  });
}

function listeners(block: string): Listener[] {
  const values = directives(block, "listen"); if (!values.length) return [{ port: 80, secure: false }];
  return values.flatMap((value) => { const first = value.split(/\s+/)[0] ?? ""; const port = Number(first.match(/(?:^|:)(\d+)$/)?.[1]); return Number.isInteger(port) && port > 0 && port <= 65535 ? [{ port, secure: /(?:^|\s)ssl(?:\s|$)/.test(value) || port === 443 }] : []; });
}

function safeUpstream(value: string | undefined) {
  if (!value) return null; if (value.includes("$")) return "dynamic upstream";
  const trimmed = value.trim().slice(0, 512); if (trimmed.startsWith("unix:")) return "Unix socket";
  try { const url = new URL(trimmed); url.username = ""; url.password = ""; url.search = ""; url.hash = ""; return url.toString().replace(/\/$/, ""); }
  catch { return /^[a-z0-9_.-]+:\d+$/i.test(trimmed) ? trimmed : "configured upstream"; }
}

function candidates(block: string, source: string): Candidate[] {
  const proxy = directives(block, "proxy_pass")[0]; const fastcgi = directives(block, "fastcgi_pass")[0]; const root = directives(block, "root")[0];
  const runtime = fastcgi ? "PHP-FPM" : proxy ? "Nginx reverse proxy" : root ? "Nginx static" : "Nginx";
  const path = directives(block, "ssl_certificate")[0] ?? null;
  const certificatePath = path && !path.includes("$") && /\.(?:pem|crt)$/i.test(path) && !/(?:^|[/_.-])(?:private|privkey|key)(?:[/_.-]|$)/i.test(path) ? path : null;
  return domains(block).map((domain) => ({ domain: domain.startsWith("*.") ? domain.slice(2) : domain, listeners: listeners(block), runtime, upstream: safeUpstream(proxy ?? fastcgi), source, certificatePath }));
}

function unavailable(reason: string): SiteCertificate {
  return { status: "unavailable", notBefore: null, expiresAt: null, issuer: null, subjectAlternativeNames: [], fingerprintSha256: null, renewalMode: "unsupported", renewable: false, unavailableReason: reason, certificateId: null };
}

export class NginxSiteCollector {
  private readonly roots; private readonly hostName; private readonly now; private readonly readText; private readonly helperInventory;
  constructor(private readonly nodeId: string, options: CollectorOptions = {}) {
    this.roots = options.roots ?? ["/etc/nginx/conf.d", "/etc/nginx/sites-enabled"];
    this.hostName = options.hostName ?? hostname(); this.now = options.now ?? (() => new Date());
    this.readText = options.readText ?? ((path) => readFile(path, "utf8")); this.helperInventory = options.helperCertificates ?? certHelperCertificates;
  }
  private certificate(path: string | null, certificates: Map<string, SiteCertificate>): SiteCertificate {
    if (!path) return unavailable("No public TLS certificate is configured");
    return certificates.get(certificateSourceIdForPath(path)) ?? unavailable("Certificate helper cannot read the active public chain");
  }
  async collect(platform: "linux" | "darwin" | "win32" = "linux"): Promise<AgentSiteSnapshot> {
    const collectedAt = this.now().toISOString();
    if (platform !== "linux") return AgentSiteSnapshotSchema.parse({ collectedAt, collectionStatus: "unavailable", warnings: ["Nginx certificate inventory is supported only on Linux"], sites: [] });
    const warnings: string[] = []; const files: string[] = [];
    for (const root of this.roots) { try { files.push(...(await readdir(root, { withFileTypes: true })).filter((entry) => entry.isSymbolicLink() || (entry.isFile() && entry.name.endsWith(".conf"))).map((entry) => join(root, entry.name))); } catch { warnings.push(`Nginx configuration directory is unreadable: ${root}`); } }
    const found: Candidate[] = [];
    for (const file of [...new Set(files)].slice(0, MAX_FILES)) { try { if ((await stat(file)).size > MAX_BYTES) { warnings.push(`Oversized Nginx configuration skipped: ${basename(file)}`); continue; } found.push(...blocksFrom(await this.readText(file)).flatMap((block) => candidates(block, `Nginx - ${basename(file)}`))); } catch { warnings.push(`Nginx configuration is unreadable: ${basename(file)}`); } }
    if (files.length > MAX_FILES) warnings.push(`Only the first ${MAX_FILES} Nginx configuration files were collected`);
    if (!files.length) warnings.push("No Nginx virtual host configuration was discovered");
    const merged = new Map<string, Candidate>();
    for (const candidate of found) {
      const key = candidate.domain.toLowerCase(); const previous = merged.get(key);
      const listenersByKey = new Map([...(previous?.listeners ?? []), ...candidate.listeners].map((listener) => [`${listener.port}:${Number(listener.secure)}`, listener]));
      merged.set(key, previous ? { ...previous, listeners: [...listenersByKey.values()], runtime: candidate.runtime !== "Nginx" ? candidate.runtime : previous.runtime, upstream: candidate.upstream ?? previous.upstream, certificatePath: candidate.certificatePath ?? previous.certificatePath, source: `${previous.source}, ${candidate.source}`.slice(0, 128) } : candidate);
    }
    const helperCertificates = await this.helperInventory().catch(() => new Map<string, SiteCertificate>()); const sites: AgentSiteSnapshotRecord[] = [];
    for (const candidate of [...merged.values()].slice(0, 2_000)) {
      const signature = candidate.listeners.map((item) => `${item.port}:${Number(item.secure)}`).sort().join(",");
      const id = `site_${createHash("sha256").update(`${this.nodeId}\0${candidate.domain.toLowerCase()}\0${signature}`).digest("hex").slice(0, 32)}`;
      sites.push({ id, domain: candidate.domain, status: "unknown", runtime: candidate.runtime, host: this.hostName, upstream: candidate.upstream, source: candidate.source, latencyMs: null, trafficBytes: null,
        certificate: this.certificate(candidate.certificatePath, helperCertificates) });
    }
    const unique = [...new Map(sites.map((site) => [site.id, site])).values()];
    return AgentSiteSnapshotSchema.parse({ collectedAt, collectionStatus: files.length === 0 ? "unavailable" : warnings.length ? "partial" : "complete", warnings: warnings.slice(0, 20), sites: unique });
  }
}

export class SiteSnapshotCache {
  private snapshot: AgentSiteSnapshot | undefined; private active: Promise<void> | undefined; private lastStarted = 0;
  constructor(private readonly collector: NginxSiteCollector, private readonly platform: "linux" | "darwin" | "win32", private readonly intervalMs = 60_000) {}
  async refreshIfDue(now = Date.now()) {
    if (this.active) return this.active; if (this.lastStarted && now - this.lastStarted < this.intervalMs) return;
    this.lastStarted = now; this.active = this.collector.collect(this.platform).then((snapshot) => { this.snapshot = snapshot; }).finally(() => { this.active = undefined; }); await this.active;
  }
  get current() { return this.snapshot; }
}

export { blocksFrom, candidates };
