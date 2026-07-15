import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { isIP } from "node:net";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FixedCommandRunner } from "./runner.js";
import { runFixedCommand } from "./runner.js";
import { HelperError } from "./types.js";

type FirewallProtocol = "tcp" | "udp";
type FirewallRule = {
  id: string; name: string; port: string; protocol: FirewallProtocol | null; source: string; destination: string;
  action: "allow" | "deny" | "reject" | "limit"; direction: "in" | "out"; ipVersion: "ipv4" | "ipv6";
  managed: boolean; version: string;
};
type CreateInput = { requestId: string; name: string; port: number; protocol: FirewallProtocol; source: string };
type DeleteInput = { requestId: string; ruleId: string; version: string };
type Receipt = { operation: "create" | "delete"; identity: string; status: "started" | "completed"; result?: unknown };

const MANAGED_COMMENT = /^StackPilot:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\s+(.+))?$/i;
const RULE_LINE = /^\[\s*(\d+)\]\s+(.+?)\s+(ALLOW|DENY|REJECT|LIMIT)\s+(IN|OUT)\s+(.+?)(?:\s+#\s+(.+))?$/i;

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function normalizeTarget(value: string) {
  const v6 = /\s+\(v6\)$/i.test(value); const clean = value.replace(/\s+\(v6\)$/i, "").trim();
  const match = clean.match(/^(.+?)\/(tcp|udp)$/i);
  return { port: (match?.[1] ?? clean).trim(), protocol: (match?.[2]?.toLowerCase() as FirewallProtocol | undefined) ?? null, ipVersion: v6 ? "ipv6" as const : "ipv4" as const };
}

export function parseUfwStatus(output: string, host = hostname()) {
  const active = /^Status:\s+active\s*$/im.test(output); const rules: FirewallRule[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.trim().match(RULE_LINE); if (!match) continue;
    const target = normalizeTarget(match[2]!); const comment = (match[6] ?? "").trim(); const managed = comment.match(MANAGED_COMMENT);
    const canonical = `${target.port}\0${target.protocol ?? "any"}\0${match[3]!.toLowerCase()}\0${match[4]!.toLowerCase()}\0${match[5]!.trim()}\0${target.ipVersion}\0${comment}`;
    rules.push({
      id: managed ? `firewall:${managed[1]!.toLowerCase()}:${target.ipVersion}` : `firewall:external:${digest(canonical).slice(0, 32)}`,
      name: (managed?.[2]?.trim() || `端口 ${target.port}`).slice(0, 120), port: target.port, protocol: target.protocol,
      source: match[5]!.trim(), destination: "Anywhere", action: match[3]!.toLowerCase() as FirewallRule["action"],
      direction: match[4]!.toLowerCase() as FirewallRule["direction"], ipVersion: target.ipVersion, managed: Boolean(managed), version: digest(canonical),
    });
  }
  return { engine: "ufw" as const, host, active, collectedAt: new Date().toISOString(), collectionStatus: "complete" as const, warnings: active ? [] : ["UFW 当前未启用；规则写操作已禁用"], rules };
}

async function status(run: FixedCommandRunner) {
  const result = await run("/usr/sbin/ufw", ["status", "numbered"], 10_000, { env: { PATH: "/usr/sbin:/usr/bin", LC_ALL: "C", LANG: "C" } });
  return parseUfwStatus(result.stdout);
}

function safeSource(value: string) {
  const [address, prefix, extra] = value.split("/");
  const family = isIP(address ?? "");
  if (!family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))) throw new HelperError("INVALID_FIREWALL_SOURCE", "Firewall source must be an IP address or CIDR");
  return value;
}

async function writeReceipt(path: string, receipt: Receipt) { const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify(receipt), { mode: 0o600 }); await rename(temporary, path); }
async function actionReceipt(stateRoot: string, requestId: string, operation: Receipt["operation"], identity: string, perform: () => Promise<unknown>) {
  const directory = join(stateRoot, "firewall-actions"); const path = join(directory, `${requestId}.json`); await mkdir(directory, { recursive: true, mode: 0o700 });
  let receipt: Receipt | null = null; try { receipt = JSON.parse(await readFile(path, "utf8")) as Receipt; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new HelperError("FIREWALL_RECEIPT_INVALID", "Firewall action receipt is invalid"); }
  if (receipt) {
    if (receipt.operation !== operation || receipt.identity !== identity) throw new HelperError("FIREWALL_IDEMPOTENCY_CONFLICT", "Firewall idempotency key changed");
    if (receipt.status === "completed") return receipt.result;
    throw new HelperError("FIREWALL_RESULT_UNKNOWN", "Firewall action result is unknown and will not be replayed");
  }
  await writeReceipt(path, { operation, identity, status: "started" }); const result = await perform();
  await writeReceipt(path, { operation, identity, status: "completed", result }); return result;
}

export async function listFirewallRules(run: FixedCommandRunner = runFixedCommand) { return status(run); }

export async function createFirewallRule(input: CreateInput, stateRoot: string, run: FixedCommandRunner = runFixedCommand) {
  const source = safeSource(input.source); const identity = `${input.name}\0${input.port}\0${input.protocol}\0${source}`;
  return actionReceipt(stateRoot, input.requestId, "create", identity, async () => {
    const before = await status(run); if (!before.active) throw new HelperError("FIREWALL_INACTIVE", "UFW is inactive");
    const name = [...input.name].map((character) => {
      const code = character.charCodeAt(0); return code < 32 || code === 127 ? " " : character;
    }).join("").trim().slice(0, 80);
    await run("/usr/sbin/ufw", ["allow", "proto", input.protocol, "from", source, "to", "any", "port", String(input.port), "comment", `StackPilot:${input.requestId} ${name}`], 20_000, { env: { PATH: "/usr/sbin:/usr/bin", LC_ALL: "C", LANG: "C" } });
    return status(run);
  });
}

export async function deleteFirewallRule(input: DeleteInput, stateRoot: string, run: FixedCommandRunner = runFixedCommand) {
  const identity = `${input.ruleId}\0${input.version}`;
  return actionReceipt(stateRoot, input.requestId, "delete", identity, async () => {
    const before = await status(run); if (!before.active) throw new HelperError("FIREWALL_INACTIVE", "UFW is inactive");
    const rule = before.rules.find((item) => item.id === input.ruleId);
    if (!rule) throw new HelperError("FIREWALL_RULE_NOT_FOUND", "Firewall rule was not found");
    if (!rule.managed) throw new HelperError("FIREWALL_RULE_FORBIDDEN", "Only StackPilot-managed firewall rules can be deleted");
    if (rule.version !== input.version) throw new HelperError("FIREWALL_RULE_CHANGED", "Firewall rule changed since it was collected");
    const result = await run("/usr/sbin/ufw", ["status", "numbered"], 10_000, { env: { PATH: "/usr/sbin:/usr/bin", LC_ALL: "C", LANG: "C" } });
    const numbered = result.stdout.split(/\r?\n/).find((line) => line.includes(`# StackPilot:${input.ruleId.split(":")[1]}`) && (input.ruleId.endsWith(":ipv6") ? /\(v6\)/i.test(line) : !/\(v6\)/i.test(line)));
    const number = numbered?.match(/^\[\s*(\d+)\]/)?.[1]; if (!number) throw new HelperError("FIREWALL_RULE_CHANGED", "Firewall rule number changed before deletion");
    await run("/usr/sbin/ufw", ["--force", "delete", number], 20_000, { env: { PATH: "/usr/sbin:/usr/bin", LC_ALL: "C", LANG: "C" } });
    return status(run);
  });
}
