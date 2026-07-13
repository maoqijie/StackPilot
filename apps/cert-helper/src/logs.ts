import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import type { HelperConfig } from "./config.js";
import { within } from "./io.js";
import { SiteStateStore } from "./siteState.js";
import { HelperError } from "./types.js";

const METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const ACCESS = /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)]\s+"([A-Z]+)\s+([^\s?]+)(?:\?[^\s]*)?\s+HTTP\/[0-9.]+"\s+(\d{3})\s+(\d+|-)/;
export const MAX_LOG_RESULT_BYTES = 12_000;

function maskedAddress(value: string) { return `client_${createHash("sha256").update(value).digest("hex").slice(0, 12)}`; }

export function parseAccessLine(line: string) {
  const match = line.match(ACCESS); if (!match || !METHODS.has(match[3]!)) return null;
  const parsed = new Date(match[2]!.replace(/:/, " ")); if (!Number.isFinite(parsed.getTime())) return null; const timestamp = parsed.toISOString();
  return { timestamp, method: match[3]!, path: match[4]!.slice(0, 2_048), status: Number(match[5]), bytesSent: match[6] === "-" ? 0 : Number(match[6]), clientAddressMasked: maskedAddress(match[1]!) };
}

export function fitLogBudget(candidates: NonNullable<ReturnType<typeof parseAccessLine>>[]) {
  const selected: typeof candidates = []; let bytes = 2;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const row = candidates[index]!; const rowBytes = Buffer.byteLength(JSON.stringify(row), "utf8") + (selected.length ? 1 : 0);
    if (bytes + rowBytes > MAX_LOG_RESULT_BYTES) break;
    selected.unshift(row); bytes += rowBytes;
  }
  return selected;
}

export async function queryLogs(siteId: string, since: string | null, limit: number, config: HelperConfig) {
  if (!(await new SiteStateStore(config).site(siteId))) throw new HelperError("SITE_NOT_FOUND", "Managed site is not registered on this host");
  const path = within("/var/log/nginx", `stackpilot-${siteId}.access.log`); const handle = await open(path, "r").catch(() => null);
  if (!handle) return [];
  try {
    const info = await handle.stat(); const bytes = Math.min(info.size, 2 * 1024 * 1024); const buffer = Buffer.alloc(bytes); await handle.read(buffer, 0, bytes, Math.max(0, info.size - bytes));
    const cutoff = since ? Date.parse(since) : Number.NEGATIVE_INFINITY;
    const candidates = buffer.toString("utf8").split(/\r?\n/).map(parseAccessLine).filter((row): row is NonNullable<ReturnType<typeof parseAccessLine>> => Boolean(row && Date.parse(row.timestamp) >= cutoff)).slice(-limit);
    return fitLogBudget(candidates);
  } finally { await handle.close(); }
}
