import { X509Certificate, createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const MAX_FILES = 500;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_CERTIFICATES = 200;

export function certificateIdForName(name: string) {
  return `cert_${createHash("sha256").update(`certbot:${name}`).digest("hex").slice(0, 32)}`;
}

export function certificateSourceId(path: string) {
  return `source_${createHash("sha256").update(`public-certificate:${path}`).digest("hex").slice(0, 32)}`;
}

function certbotName(path: string, liveRoot: string) {
  const prefix = `${liveRoot.replace(/\/$/, "")}/`; if (!path.startsWith(prefix)) return null;
  const [name, file, ...rest] = path.slice(prefix.length).split("/");
  return !rest.length && name && /^[A-Za-z0-9._-]{1,128}$/.test(name) && /^(?:cert|chain|fullchain)\.pem$/.test(file ?? "") ? name : null;
}

function publicCertificatePaths(source: string) {
  const cleaned = source.replace(/#[^\r\n]*/g, "");
  return [...cleaned.matchAll(/(?:^|[\s;{}])ssl_certificate\s+([^;]+);/g)]
    .map((match) => match[1]?.trim() ?? "")
    .filter((path) => path.startsWith("/") && !path.includes("$") && /\.(?:pem|crt)$/i.test(path) && !/(?:^|[/_.-])(?:private|privkey|key)(?:[/_.-]|$)/i.test(path));
}

async function discoverCertificates(roots: string[], liveRoot: string) {
  const files: string[] = [];
  for (const root of roots) {
    try { files.push(...(await readdir(root, { withFileTypes: true })).filter((entry) => entry.isSymbolicLink() || (entry.isFile() && entry.name.endsWith(".conf"))).map((entry) => join(root, entry.name))); } catch { /* An absent Nginx directory contributes no certificates. */ }
  }
  const certificates = new Map<string, { name: string | null; path: string }>();
  for (const file of [...new Set(files)].slice(0, MAX_FILES)) {
    try {
      if ((await stat(file)).size > MAX_BYTES) continue;
      for (const path of publicCertificatePaths(await readFile(file, "utf8"))) {
        certificates.set(certificateSourceId(path), { name: certbotName(path, liveRoot), path });
      }
    } catch { /* Invalid or unreadable configuration is ignored by the narrow mapper. */ }
  }
  return certificates;
}

export async function buildCertificateMap(roots = ["/etc/nginx/conf.d", "/etc/nginx/sites-enabled"], liveRoot = "/etc/letsencrypt/live") {
  return new Map([...(await discoverCertificates(roots, liveRoot))]
    .flatMap(([, certificate]): Array<[string, string]> => certificate.name ? [[certificateIdForName(certificate.name), certificate.name]] : []));
}

function certificateStatus(expiresAt: string) {
  const remaining = Date.parse(expiresAt) - Date.now();
  if (remaining <= 0) return "expired" as const;
  if (remaining <= 7 * 86_400_000) return "critical" as const;
  if (remaining < 14 * 86_400_000) return "expiring" as const;
  return "valid" as const;
}

export async function buildCertificateInventory(roots = ["/etc/nginx/conf.d", "/etc/nginx/sites-enabled"], liveRoot = "/etc/letsencrypt/live") {
  const inventory = [];
  for (const [sourceId, entry] of [...await discoverCertificates(roots, liveRoot)].slice(0, MAX_CERTIFICATES)) {
    try {
      const certificate = new X509Certificate(await readFile(entry.path));
      const starts = new Date(certificate.validFrom); const expires = new Date(certificate.validTo);
      if (Number.isNaN(starts.getTime()) || Number.isNaN(expires.getTime())) continue;
      const expiresAt = expires.toISOString();
      const subjectAlternativeNames = certificate.subjectAltName
        ? certificate.subjectAltName.split(/,\s*/).map((value) => value.replace(/^DNS:/, "")).filter((value) => value && !value.startsWith("IP Address:")).slice(0, 100)
        : [];
      const certificateId = entry.name ? certificateIdForName(entry.name) : null;
      inventory.push({ sourceId, certificate: {
        status: certificateStatus(expiresAt), notBefore: starts.toISOString(), expiresAt,
        issuer: certificate.issuer.replace(/\n/g, ", ").slice(0, 253) || null,
        subjectAlternativeNames, fingerprintSha256: certificate.fingerprint256.replaceAll(":", "").toUpperCase(),
        renewalMode: certificateId ? "automatic" as const : "manual" as const, renewable: Boolean(certificateId),
        unavailableReason: certificateId ? null : "Certificate is not managed by Certbot", certificateId,
      } });
    } catch { /* A broken public chain is omitted without exposing its path. */ }
  }
  return inventory;
}

export { publicCertificatePaths };
