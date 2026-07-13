import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const MAX_FILES = 500;
const MAX_BYTES = 2 * 1024 * 1024;

export function certificateIdForName(name: string) {
  return `cert_${createHash("sha256").update(`certbot:${name}`).digest("hex").slice(0, 32)}`;
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

export async function buildCertificateMap(roots = ["/etc/nginx/conf.d", "/etc/nginx/sites-enabled"], liveRoot = "/etc/letsencrypt/live") {
  const files: string[] = [];
  for (const root of roots) {
    try { files.push(...(await readdir(root, { withFileTypes: true })).filter((entry) => entry.isSymbolicLink() || (entry.isFile() && entry.name.endsWith(".conf"))).map((entry) => join(root, entry.name))); } catch { /* An absent Nginx directory contributes no certificates. */ }
  }
  const certificates = new Map<string, string>();
  for (const file of [...new Set(files)].slice(0, MAX_FILES)) {
    try {
      if ((await stat(file)).size > MAX_BYTES) continue;
      for (const path of publicCertificatePaths(await readFile(file, "utf8"))) {
        const name = certbotName(path, liveRoot); if (name) certificates.set(certificateIdForName(name), name);
      }
    } catch { /* Invalid or unreadable configuration is ignored by the narrow mapper. */ }
  }
  return certificates;
}

export { publicCertificatePaths };
