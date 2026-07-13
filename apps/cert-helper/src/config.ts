import { readFile } from "node:fs/promises";
import { HelperError, type RuntimeKind } from "./types.js";

export type RuntimeDefinition = { runtime: Exclude<RuntimeKind, "static">; version: string; url: string; sha256: string };
export type HelperConfig = {
  stateRoot: string; sitesRoot: string; nginxRoot: string; environmentRoot: string; unitRoot: string;
  challengeRoot: string; runtimeRoot: string; runtimeCatalogPath: string; protectedDomains: ReadonlySet<string>;
};

const absolute = (value: string | undefined, fallback: string) => {
  const path = value?.trim() || fallback;
  if (!path.startsWith("/") || path.includes("\0")) throw new HelperError("INVALID_CONFIGURATION", "Helper paths must be absolute");
  return path.replace(/\/$/, "");
};

function protectedDomains(value: string | undefined) {
  const domains = (value ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const valid = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  if (domains.some((domain) => !valid.test(domain))) throw new HelperError("INVALID_CONFIGURATION", "Core-site protection domains must be valid DNS names");
  return new Set(domains.filter((domain) => !domain.endsWith(".invalid")));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): HelperConfig {
  return {
    stateRoot: absolute(env.STACKPILOT_SITE_HELPER_STATE_ROOT, "/var/lib/stackpilot-site-helper"),
    sitesRoot: absolute(env.STACKPILOT_SITE_ROOT, "/srv/stackpilot/sites"),
    nginxRoot: absolute(env.STACKPILOT_SITE_NGINX_ROOT, "/etc/nginx/conf.d"),
    environmentRoot: absolute(env.STACKPILOT_SITE_ENV_ROOT, "/etc/stackpilot-sites"),
    unitRoot: absolute(env.STACKPILOT_SITE_UNIT_ROOT, "/etc/systemd/system"),
    challengeRoot: absolute(env.STACKPILOT_ACME_CHALLENGE_ROOT, "/var/lib/letsencrypt/stackpilot-challenges"),
    runtimeRoot: absolute(env.STACKPILOT_RUNTIME_ROOT, "/opt/stackpilot-runtimes"),
    runtimeCatalogPath: absolute(env.STACKPILOT_RUNTIME_CATALOG, "/etc/stackpilot-site-helper/runtimes.json"),
    protectedDomains: protectedDomains(env.STACKPILOT_CORE_SITE_DOMAINS),
  };
}

export async function readRuntimeCatalog(path: string): Promise<Map<RuntimeKind, RuntimeDefinition>> {
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(path, "utf8")); } catch { throw new HelperError("RUNTIME_CATALOG_UNAVAILABLE", "Runtime catalog is unavailable"); }
  if (!Array.isArray(parsed) || parsed.length !== 2) throw new HelperError("INVALID_RUNTIME_CATALOG", "Runtime catalog must define Node 20 and Node 22");
  const result = new Map<RuntimeKind, RuntimeDefinition>();
  for (const item of parsed) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new HelperError("INVALID_RUNTIME_CATALOG", "Runtime entry is invalid");
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).sort().join(",") !== "runtime,sha256,url,version" || (entry.runtime !== "node20" && entry.runtime !== "node22")
      || typeof entry.version !== "string" || !/^v(?:20|22)\.\d+\.\d+$/.test(entry.version)
      || typeof entry.url !== "string" || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new HelperError("INVALID_RUNTIME_CATALOG", "Runtime entry is invalid");
    const url = new URL(entry.url);
    const major = entry.runtime === "node20" ? "20" : "22";
    if (url.protocol !== "https:" || url.hostname !== "nodejs.org" || url.port || url.username || url.password || url.search || url.hash
      || url.pathname !== `/dist/${entry.version}/node-${entry.version}-linux-x64.tar.xz` || !entry.version.startsWith(`v${major}.`)) throw new HelperError("INVALID_RUNTIME_CATALOG", "Runtime source is not an approved fixed Node.js archive");
    result.set(entry.runtime, { runtime: entry.runtime, version: entry.version, url: entry.url, sha256: entry.sha256 });
  }
  if (!result.has("node20") || !result.has("node22")) throw new HelperError("INVALID_RUNTIME_CATALOG", "Both Node runtime majors are required");
  return result;
}
