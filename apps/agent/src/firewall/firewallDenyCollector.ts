import { createHash } from "node:crypto";
import {
  AgentFirewallDenySnapshotSchema,
  AgentFirewallDenyEventSchema,
  FIREWALL_DENY_MAX_EVENTS,
  type AgentFirewallDenyEvent,
  type AgentFirewallDenySnapshot,
} from "@stackpilot/contracts";
import { runPlatformProbe } from "../platform/commandRunner.js";

type Probe = typeof runPlatformProbe;
const denyMarker = /(?:\[UFW\s+BLOCK\]|\b(?:DROP|REJECT|DENY|BLOCK)\b)/i;
const journalDenyPattern = "(?i)(\\[UFW\\s+BLOCK\\]|\\b(?:DROP|REJECT|DENY|BLOCK)\\b)";
const fieldPattern = /(?:^|\s)([A-Z][A-Z0-9_]*)=([^\s]*)/g;

function protocol(value: string | undefined): AgentFirewallDenyEvent["protocol"] {
  const normalized = value?.toUpperCase();
  if (normalized === "TCP" || normalized === "UDP" || normalized === "ICMP" || normalized === "ICMPV6") return normalized;
  return "OTHER";
}

function bounded(value: unknown, limit: number) {
  return [...String(value ?? "")].map((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  }).join("").trim().slice(0, limit);
}

function fields(message: string) {
  return Object.fromEntries([...message.matchAll(fieldPattern)].map((match) => [match[1], match[2]]));
}

export function parseFirewallJournal(output: string): AgentFirewallDenyEvent[] {
  const events = new Map<string, AgentFirewallDenyEvent>();
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    let row: Record<string, unknown>;
    try { row = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    const message = typeof row.MESSAGE === "string" ? row.MESSAGE : "";
    if (!denyMarker.test(message)) continue;
    const values = fields(message);
    const source = values.SRC;
    const occurredMicros = typeof row.__REALTIME_TIMESTAMP === "string" && /^\d{13,20}$/.test(row.__REALTIME_TIMESTAMP) ? Number(row.__REALTIME_TIMESTAMP) : NaN;
    if (!source || !Number.isSafeInteger(occurredMicros)) continue;
    const occurredAt = new Date(Math.floor(occurredMicros / 1_000)).toISOString();
    const destinationPort = /^\d{1,5}$/.test(values.DPT ?? "") ? Number(values.DPT) : null;
    const marker = message.match(/\[([^\]]{1,120})\]/)?.[1] ?? message.match(/\b(DROP|REJECT|DENY|BLOCK)\b/i)?.[1] ?? "Firewall deny";
    const identity = `${row.__CURSOR ?? ""}\0${occurredAt}\0${source}\0${values.DST ?? ""}\0${values.DPT ?? ""}\0${values.PROTO ?? ""}`;
    const event = AgentFirewallDenyEventSchema.safeParse({
      id: `fw_${createHash("sha256").update(identity).digest("hex")}`,
      occurredAt,
      sourceAddress: source,
      destinationAddress: values.DST || null,
      destinationPort: destinationPort && destinationPort <= 65_535 ? destinationPort : null,
      protocol: protocol(values.PROTO),
      interfaceName: bounded(values.IN, 32) || null,
      rule: bounded(marker, 120) || "Firewall deny",
      reason: marker.toUpperCase().includes("UFW") ? "Packet rejected by UFW policy" : "Packet rejected by host firewall policy",
    });
    if (event.success) events.set(event.data.id, event.data);
  }
  return [...events.values()].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)).slice(0, FIREWALL_DENY_MAX_EVENTS);
}

export class FirewallDenyCollector {
  constructor(private readonly probe: Probe = runPlatformProbe, private readonly now = () => new Date()) {}
  async collect(platform: "linux" | "darwin" | "win32" = "linux"): Promise<AgentFirewallDenySnapshot> {
    const collectedAt = this.now().toISOString();
    if (platform !== "linux") return AgentFirewallDenySnapshotSchema.parse({ collectedAt, collectionStatus: "unavailable", warnings: ["Firewall deny collection is supported only on Linux"], events: [] });
    const result = await this.probe("journalctl", ["--dmesg", "--since=-24 hours", `--grep=${journalDenyPattern}`, `--lines=${FIREWALL_DENY_MAX_EVENTS}`, "--reverse", "--output=json", "--no-pager", "--quiet"], new AbortController().signal, 12_000, 768 * 1024);
    const noMatches = !result.ok && String(result.code) === "1" && result.output === "" && result.errorOutput === "";
    if (!result.ok && !noMatches) return AgentFirewallDenySnapshotSchema.parse({ collectedAt, collectionStatus: "unavailable", warnings: ["Kernel firewall journal is unavailable to the Agent service account"], events: [] });
    return AgentFirewallDenySnapshotSchema.parse({ collectedAt, collectionStatus: "complete", warnings: [], events: parseFirewallJournal(result.output) });
  }
}

export class FirewallDenySnapshotCache {
  private snapshot: AgentFirewallDenySnapshot | undefined;
  private active: Promise<void> | undefined;
  private lastStarted = 0;
  constructor(private readonly collector: FirewallDenyCollector, private readonly platform: "linux" | "darwin" | "win32", private readonly intervalMs = 30_000) {}
  async refreshIfDue(now = Date.now()) {
    if (this.active) return this.active;
    if (this.lastStarted && now - this.lastStarted < this.intervalMs) return;
    this.lastStarted = now;
    this.active = this.collector.collect(this.platform).then((snapshot) => { this.snapshot = snapshot; }).finally(() => { this.active = undefined; });
    await this.active;
  }
  get current() { return this.snapshot; }
}
