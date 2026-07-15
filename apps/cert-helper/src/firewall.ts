import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { isIP } from "node:net";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { runFirewallCommand, type FixedCommandRunner } from "./runner.js";
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

const UFW = "/usr/sbin/ufw";
const COMMAND_ENV: NodeJS.ProcessEnv = { PATH: "/usr/sbin:/usr/bin:/sbin:/bin", LC_ALL: "C", LANG: "C" };
const MANAGED_COMMENT = /^StackPilot:([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:\s+(.+))?$/i;
const RULE_LINE = /^\[\s*(\d+)\]\s+(.+?)\s+(ALLOW|DENY|REJECT|LIMIT)\s+(IN|OUT)\s+(.+?)(?:\s+#\s+(.+))?$/i;

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
function normalizeTarget(value: string) {
  const v6 = /\s+\(v6\)$/i.test(value); const clean = value.replace(/\s+\(v6\)$/i, "").trim();
  const match = clean.match(/^(.+?)\/(tcp|udp)$/i);
  return { port: (match?.[1] ?? clean).trim(), protocol: (match?.[2]?.toLowerCase() as FirewallProtocol | undefined) ?? null, ipVersion: v6 ? "ipv6" as const : "ipv4" as const };
}

export function parseUfwStatus(output: string, host = hostname()) {
  const active = /^Status:\s+active\s*$/im.test(output); const inactive = /^Status:\s+inactive\s*$/im.test(output); const rules: FirewallRule[] = [];
  if (!active && !inactive) return { engine: "ufw" as const, host, active: false, collectedAt: new Date().toISOString(), collectionStatus: "unavailable" as const, warnings: ["UFW 状态输出无法解析"], rules };
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
  return parseUfwStatus((await run(UFW, ["status", "numbered"], 10_000, { env: COMMAND_ENV })).stdout);
}

function requireActive(payload: Awaited<ReturnType<typeof status>>) {
  if (payload.collectionStatus === "unavailable") throw new HelperError("FIREWALL_BACKEND_UNAVAILABLE", "UFW status output is unavailable");
  if (!payload.active) throw new HelperError("FIREWALL_INACTIVE", "UFW is inactive");
}

function safeSource(value: string) {
  const [address, prefix, extra] = value.split("/"); const family = isIP(address ?? "");
  if (!family || extra !== undefined || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (family === 4 ? 32 : 128)))) throw new HelperError("INVALID_FIREWALL_SOURCE", "Firewall source must be an IP address or CIDR");
  return value;
}

async function writeReceipt(path: string, receipt: Receipt) {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(receipt));
      await file.sync();
    } finally { await file.close(); }
    await rename(temporary, path);
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally {
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}
async function actionReceipt(stateRoot: string, requestId: string, operation: Receipt["operation"], identity: string, validate: () => Promise<void>, perform: () => Promise<unknown>) {
  const directory = join(stateRoot, "firewall-actions"); const path = join(directory, `${requestId}.json`); await mkdir(directory, { recursive: true, mode: 0o700 });
  let receipt: Receipt | null = null;
  try { receipt = JSON.parse(await readFile(path, "utf8")) as Receipt; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new HelperError("FIREWALL_RECEIPT_INVALID", "Firewall action receipt is invalid"); }
  if (receipt) {
    if (receipt.operation !== operation || receipt.identity !== identity) throw new HelperError("FIREWALL_IDEMPOTENCY_CONFLICT", "Firewall idempotency key changed");
    if (receipt.status === "completed") return receipt.result;
    throw new HelperError("FIREWALL_RESULT_UNKNOWN", "Firewall action result is unknown and will not be replayed");
  }
  await validate();
  await writeReceipt(path, { operation, identity, status: "started" }); const result = await perform();
  await writeReceipt(path, { operation, identity, status: "completed", result }); return result;
}

export async function listFirewallRules(run: FixedCommandRunner = runFirewallCommand) { return status(run); }

export async function createFirewallRule(input: CreateInput, stateRoot: string, run: FixedCommandRunner = runFirewallCommand) {
  const source = safeSource(input.source); const identity = `${input.name}\0${input.port}\0${input.protocol}\0${source}`;
  return actionReceipt(stateRoot, input.requestId, "create", identity,
    async () => { requireActive(await status(run)); },
    async () => {
    const name = [...input.name].map((character) => { const code = character.charCodeAt(0); return code < 32 || code === 127 ? " " : character; }).join("").trim().slice(0, 80);
    await run(UFW, ["allow", "proto", input.protocol, "from", source, "to", "any", "port", String(input.port), "comment", `StackPilot:${input.requestId} ${name}`], 20_000, { env: COMMAND_ENV });
    return status(run);
    });
}

export async function deleteFirewallRule(input: DeleteInput, stateRoot: string, run: FixedCommandRunner = runFirewallCommand) {
  const identity = `${input.ruleId}\0${input.version}`;
  let validatedRule: FirewallRule | undefined;
  const validate = async () => {
    const before = await status(run); requireActive(before);
    validatedRule = before.rules.find((item) => item.id === input.ruleId);
    if (!validatedRule) throw new HelperError("FIREWALL_RULE_NOT_FOUND", "Firewall rule was not found");
    if (!validatedRule.managed || validatedRule.action !== "allow" || validatedRule.direction !== "in" || !validatedRule.protocol || !/^\d+$/.test(validatedRule.port)) throw new HelperError("FIREWALL_RULE_FORBIDDEN", "Only fixed StackPilot-managed allow rules can be deleted");
    if (validatedRule.version !== input.version) throw new HelperError("FIREWALL_RULE_CHANGED", "Firewall rule changed since it was collected");
  };
  return actionReceipt(stateRoot, input.requestId, "delete", identity, validate, async () => {
    const rule = validatedRule!;
    const marker = input.ruleId.split(":")[1]; const comment = `StackPilot:${marker} ${rule.name}`;
    const source = rule.source.replace(/\s+\(v6\)$/i, "") === "Anywhere" ? rule.ipVersion === "ipv6" ? "::/0" : "0.0.0.0/0" : rule.source.replace(/\s+\(v6\)$/i, "");
    await run(UFW, ["--force", "delete", "allow", "proto", rule.protocol!, "from", source, "to", "any", "port", rule.port, "comment", comment], 20_000, { env: COMMAND_ENV });
    return status(run);
  });
}
