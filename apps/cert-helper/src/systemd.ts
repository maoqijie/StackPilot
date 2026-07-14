import { hostname } from "node:os";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FixedCommandRunner } from "./runner.js";
import { runFixedCommand } from "./runner.js";
import { HelperError } from "./types.js";

export type SystemdAction = "start" | "stop" | "restart";
export const SYSTEMD_UNIT = /^[A-Za-z0-9][A-Za-z0-9_.@:-]*\.(?:service|timer|socket|target)$/;

type UnitRecord = {
  id: string; name: string; description: string; host: string; state: "active" | "failed" | "inactive";
  activeState: string; subState: string; restarts: number; memoryBytes: number | null; stateChangedAt: string | null;
  availableActions: SystemdAction[];
};

function safeUnit(value: string) {
  if (!SYSTEMD_UNIT.test(value)) throw new HelperError("INVALID_SYSTEMD_UNIT", "systemd unit name is invalid");
  return value;
}

function normalizeState(value: string): UnitRecord["state"] {
  if (value === "active" || value === "reloading" || value === "activating") return "active";
  if (value === "failed") return "failed";
  return "inactive";
}

function isoDate(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function nonnegativeInteger(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function memoryBytes(value: string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseSystemdShow(output: string, managedUnits: ReadonlySet<string>, host = hostname()): UnitRecord[] {
  return output.split(/\n\s*\n/).flatMap((block) => {
    const fields = new Map(block.split(/\r?\n/).flatMap((line) => {
      const index = line.indexOf("=");
      return index > 0 ? [[line.slice(0, index), line.slice(index + 1)] as const] : [];
    }));
    const id = fields.get("Id") ?? "";
    if (!SYSTEMD_UNIT.test(id) || fields.get("LoadState") === "not-found") return [];
    const activeState = fields.get("ActiveState") || "unknown";
    return [{
      id, name: id, description: (fields.get("Description") || id).slice(0, 512), host,
      state: normalizeState(activeState), activeState: activeState.slice(0, 80), subState: (fields.get("SubState") || "unknown").slice(0, 80),
      restarts: nonnegativeInteger(fields.get("NRestarts") || "0"), memoryBytes: memoryBytes(fields.get("MemoryCurrent") || ""),
      stateChangedAt: isoDate(fields.get("StateChangeTimestamp") || ""),
      availableActions: managedUnits.has(id) ? ["start", "stop", "restart"] as SystemdAction[] : [],
    }];
  }).sort((left, right) => left.name.localeCompare(right.name));
}

async function showUnits(run: FixedCommandRunner, units: readonly string[]) {
  return run("/usr/bin/systemctl", ["show", "--all", "--no-pager", "--property=Id,Description,LoadState,ActiveState,SubState,NRestarts,MemoryCurrent,StateChangeTimestamp", ...units], 10_000);
}

export async function listSystemdUnits(managedUnits: ReadonlySet<string> = new Set(), run: FixedCommandRunner = runFixedCommand) {
  const inventory = await run("/usr/bin/systemctl", ["list-units", "--all", "--plain", "--no-legend", "--no-pager", "--type=service", "--type=timer", "--type=socket", "--type=target"], 10_000);
  const names = inventory.stdout.split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/, 1)[0] ?? "")
    .filter((name) => SYSTEMD_UNIT.test(name))
    .slice(0, 2_000);
  if (!names.length) return { units: [] as UnitRecord[], collectedAt: new Date().toISOString(), host: hostname(), warnings: [] as string[] };
  const result = await showUnits(run, names);
  return { units: parseSystemdShow(result.stdout, managedUnits), collectedAt: new Date().toISOString(), host: hostname(), warnings: [] as string[] };
}

export function redactSystemdMessage(value: string) {
  return value
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(/\b(password|passwd|token|secret|api[_-]?key|authorization)=([^\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 4_096);
}

export async function readSystemdLogs(unit: string, limit: number, run: FixedCommandRunner = runFixedCommand) {
  safeUnit(unit);
  const boundedLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const result = await run("/usr/bin/journalctl", ["--unit", unit, "--lines", String(boundedLimit), "--no-pager", "--output=json"], 10_000);
  const candidates = result.stdout.split(/\r?\n/).flatMap((line) => {
    try {
      const value = JSON.parse(line) as Record<string, unknown>;
      const micros = typeof value.__REALTIME_TIMESTAMP === "string" ? Number(value.__REALTIME_TIMESTAMP) : Number.NaN;
      const message = typeof value.MESSAGE === "string" ? redactSystemdMessage(value.MESSAGE) : "";
      if (!Number.isFinite(micros) || !message) return [];
      return [{ timestamp: new Date(Math.trunc(micros / 1000)).toISOString(), message }];
    } catch { return []; }
  });
  return { unit, entries: candidates.slice(-boundedLimit), collectedAt: new Date().toISOString(), truncated: candidates.length > boundedLimit };
}

export async function runSystemdAction(unit: string, action: SystemdAction, managedUnits: ReadonlySet<string> = new Set(), run: FixedCommandRunner = runFixedCommand) {
  safeUnit(unit);
  if (!managedUnits.has(unit)) throw new HelperError("SYSTEMD_UNIT_FORBIDDEN", "systemd unit is not in the managed allowlist");
  await run("/usr/bin/systemctl", [action, unit], 30_000);
  const result = await showUnits(run, [unit]);
  const updated = parseSystemdShow(result.stdout, managedUnits).find((row) => row.id === unit);
  if (!updated) throw new HelperError("SYSTEMD_UNIT_NOT_FOUND", "systemd unit was not found after the action");
  return { unit: updated };
}

type ActionReceipt = { unit: string; action: SystemdAction; status: "started" | "completed"; result?: { unit: UnitRecord } };

async function writeReceipt(path: string, receipt: ActionReceipt) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(receipt), { mode: 0o600 });
  await rename(temporary, path);
}

export async function runIdempotentSystemdAction(requestId: string, unit: string, action: SystemdAction, stateRoot: string, managedUnits: ReadonlySet<string> = new Set(), run: FixedCommandRunner = runFixedCommand) {
  const directory = join(stateRoot, "systemd-actions"); const path = join(directory, `${requestId}.json`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  let receipt: ActionReceipt | null = null;
  try { receipt = JSON.parse(await readFile(path, "utf8")) as ActionReceipt; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new HelperError("SYSTEMD_RECEIPT_INVALID", "systemd action receipt is invalid"); }
  if (receipt) {
    if (receipt.unit !== unit || receipt.action !== action) throw new HelperError("SYSTEMD_IDEMPOTENCY_CONFLICT", "systemd action idempotency key changed");
    if (receipt.status === "completed" && receipt.result) return receipt.result;
    throw new HelperError("SYSTEMD_RESULT_UNKNOWN", "systemd action result is unknown and will not be replayed");
  }
  await writeReceipt(path, { unit, action, status: "started" });
  const result = await runSystemdAction(unit, action, managedUnits, run);
  await writeReceipt(path, { unit, action, status: "completed", result });
  return result;
}
