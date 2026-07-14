import {
  AgentSystemdSnapshotSchema,
  SYSTEMD_MAX_JOURNAL_ENTRIES,
  SYSTEMD_MAX_SERVICES,
  type AgentSystemdService,
  type AgentSystemdSnapshot,
  type SystemdJournalEntry,
} from "@stackpilot/contracts";
import { runPlatformProbe } from "../platform/commandRunner.js";

type Probe = (executable: string, args: readonly string[], signal: AbortSignal, timeoutMs: number, maxOutputBytes: number) => Promise<{ ok: boolean; output: string; code?: string }>;
const unitPattern = /^[A-Za-z0-9_.@:-]+\.service$/;
const secretPatterns = [
  /(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;]+/gi,
  /((?:password|passwd|token|secret|api[_-]?key)\s*[:=]\s*)[^\s,;]+/gi,
  /\b(?:sk|sp)_[A-Za-z0-9_-]{16,}\b/g,
] as const;

function bounded(value: unknown, limit: number) { return [...String(value ?? "")].map((char) => { const code = char.charCodeAt(0); return code < 32 && char !== "\t" && char !== "\n" && char !== "\r" || code === 127 ? " " : char; }).join("").slice(0, limit); }
function redact(message: unknown) { return secretPatterns.reduce((value, pattern) => value.replace(pattern, (_match, prefix = "") => `${prefix}[REDACTED]`), bounded(message, 512)); }
function integer(value: string | undefined) { const number = Number(value); return Number.isSafeInteger(number) && number >= 0 ? number : null; }
function timestampFromMicroseconds(value: string | undefined) { const microseconds = integer(value); return microseconds === null || microseconds === 0 ? null : new Date(Math.floor(microseconds / 1_000)).toISOString(); }

function parseServiceBlocks(output: string): AgentSystemdService[] {
  return output.split(/\r?\n\r?\n/).flatMap((block) => {
    const fields = Object.fromEntries(block.split(/\r?\n/).map((line) => {
      const separator = line.indexOf("="); return separator < 1 ? ["", ""] : [line.slice(0, separator), line.slice(separator + 1)];
    }).filter(([key]) => key));
    const unit = fields.Id;
    if (!unit || !unitPattern.test(unit)) return [];
    const activeState = ["active", "reloading", "inactive", "failed", "activating", "deactivating"].includes(fields.ActiveState ?? "") ? fields.ActiveState as AgentSystemdService["activeState"] : "unknown";
    return [{
      unit, description: bounded(fields.Description || unit, 256), loadState: bounded(fields.LoadState || "unknown", 40),
      activeState, subState: bounded(fields.SubState || "unknown", 80), memoryCurrentBytes: integer(fields.MemoryCurrent),
      restartCount: integer(fields.NRestarts), stateChangedAt: timestampFromMicroseconds(fields.StateChangeTimestampUSec), journal: [],
    }];
  }).slice(0, SYSTEMD_MAX_SERVICES);
}

function parseJournal(output: string) {
  const byUnit = new Map<string, SystemdJournalEntry[]>();
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    let record: Record<string, unknown>;
    try { record = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    const unit = typeof record._SYSTEMD_UNIT === "string" ? record._SYSTEMD_UNIT : typeof record.UNIT === "string" ? record.UNIT : "";
    const cursor = typeof record.__CURSOR === "string" ? record.__CURSOR : "";
    const micros = typeof record.__REALTIME_TIMESTAMP === "string" ? integer(record.__REALTIME_TIMESTAMP) : null;
    if (!unitPattern.test(unit) || !cursor || micros === null) continue;
    const priority = Math.max(0, Math.min(7, Number(record.PRIORITY ?? 6)));
    const entry: SystemdJournalEntry = {
      cursor: bounded(cursor, 256), timestamp: new Date(Math.floor(micros / 1_000)).toISOString(), priority: Number.isInteger(priority) ? priority : 6,
      identifier: typeof record.SYSLOG_IDENTIFIER === "string" ? bounded(record.SYSLOG_IDENTIFIER, 120) : null,
      pid: typeof record._PID === "string" && /^\d{1,20}$/.test(record._PID) ? record._PID : null,
      message: redact(record.MESSAGE),
    };
    const entries = byUnit.get(unit) ?? [];
    if (entries.length < SYSTEMD_MAX_JOURNAL_ENTRIES) entries.push(entry);
    byUnit.set(unit, entries);
  }
  return byUnit;
}

export class SystemdCollector {
  constructor(private readonly probe: Probe = runPlatformProbe, private readonly now = () => new Date()) {}
  async collect(platform: "linux" | "darwin" | "win32" = "linux"): Promise<AgentSystemdSnapshot> {
    const collectedAt = this.now().toISOString();
    if (platform !== "linux") return AgentSystemdSnapshotSchema.parse({ collectedAt, collectionStatus: "unavailable", warnings: ["systemd service collection is supported only on Linux"], services: [] });
    const controller = new AbortController();
    const serviceResult = await this.probe("systemctl", ["show", "--type=service", "--all", "--property=Id,Description,LoadState,ActiveState,SubState,MemoryCurrent,NRestarts,StateChangeTimestampUSec", "--no-pager"], controller.signal, 12_000, 512 * 1024);
    if (!serviceResult.ok) return AgentSystemdSnapshotSchema.parse({ collectedAt, collectionStatus: "unavailable", warnings: ["systemctl service inventory is unavailable"], services: [] });
    const services = parseServiceBlocks(serviceResult.output); const warnings: string[] = [];
    if (services.length === SYSTEMD_MAX_SERVICES) warnings.push(`Only the first ${SYSTEMD_MAX_SERVICES} systemd services were collected`);
    if (services.length) {
      const units = services.map((service) => `--unit=${service.unit}`);
      const journal = await this.probe("journalctl", [...units, "--lines=512", "--reverse", "--output=json", "--no-pager", "--quiet"], controller.signal, 12_000, 768 * 1024);
      if (journal.ok) {
        const entries = parseJournal(journal.output);
        for (const service of services) service.journal = entries.get(service.unit) ?? [];
      } else warnings.push("system journal is unavailable to the Agent service account");
    }
    return AgentSystemdSnapshotSchema.parse({ collectedAt, collectionStatus: warnings.length ? "partial" : "complete", warnings, services });
  }
}

export class SystemdSnapshotCache {
  private snapshot: AgentSystemdSnapshot | undefined; private active: Promise<void> | undefined; private lastStarted = 0;
  constructor(private readonly collector: SystemdCollector, private readonly platform: "linux" | "darwin" | "win32", private readonly intervalMs = 30_000) {}
  async refreshIfDue(now = Date.now()) {
    if (this.active) return this.active; if (this.lastStarted && now - this.lastStarted < this.intervalMs) return;
    this.lastStarted = now; this.active = this.collector.collect(this.platform).then((snapshot) => { this.snapshot = snapshot; }).finally(() => { this.active = undefined; }); await this.active;
  }
  get current() { return this.snapshot; }
}

export { parseJournal, parseServiceBlocks, redact };
