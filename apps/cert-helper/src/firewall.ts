import { createHash } from "node:crypto";
import { hostname } from "node:os";
import { runFirewallCommand, type FixedCommandRunner } from "./runner.js";
import { HelperError } from "./types.js";

const UFW = "/usr/sbin/ufw";
const STACKPILOT_MARKER = /\s+\[sp:[0-9a-f-]{36}\]$/;
const COMMAND_ENV: NodeJS.ProcessEnv = { LANG: "C", LC_ALL: "C", PATH: "/usr/sbin:/usr/bin:/sbin:/bin" };

export type FirewallRule = {
  id: string; name: string; port: string; protocol: "TCP" | "UDP" | "ALL"; source: string;
  action: "ALLOW" | "DENY" | "REJECT" | "LIMIT"; direction: "IN" | "OUT"; target: string; ipv6: boolean; managed: boolean;
};
export type FirewallPayload = {
  collectedAt: string; collectionStatus: "complete" | "partial" | "unavailable"; backend: "ufw";
  backendStatus: "active" | "inactive" | "unavailable"; host: string; warnings: string[];
  rules: FirewallRule[];
};

const digest = (prefix: string, value: string) => `${prefix}_${createHash("sha256").update(value).digest("hex")}`;
const cleanName = (value: string) => value.replace(STACKPILOT_MARKER, "").trim() || "UFW 规则";

function parseTarget(value: string) {
  const ipv6 = /\s+\(v6\)$/.test(value);
  const target = value.replace(/\s+\(v6\)$/, "").trim();
  const match = target.match(/^(.+?)\/(tcp|udp)$/i);
  return { port: match?.[1] ?? target, protocol: (match?.[2]?.toUpperCase() ?? "ALL") as FirewallRule["protocol"], ipv6 };
}

export function parseUfwStatus(output: string, host = hostname()): FirewallPayload {
  const collectedAt = new Date().toISOString();
  if (/^Status:\s+inactive/im.test(output)) return { collectedAt, collectionStatus: "complete", backend: "ufw", backendStatus: "inactive", host, warnings: ["UFW 当前未启用，规则变更已锁定"], rules: [] };
  if (!/^Status:\s+active/im.test(output)) return { collectedAt, collectionStatus: "unavailable", backend: "ufw", backendStatus: "unavailable", host, warnings: ["无法读取 UFW 状态"], rules: [] };

  const parsed = parseUfwRules(output, host); const rules = parsed.map(({ rule }) => rule);
  const warnings = rules.some((rule) => rule.ipv6) && rules.some((rule) => !rule.ipv6)
    ? ["IPv4 与 IPv6 规则均单独展示；StackPilot 仅允许删除自身创建的规则"] : [];
  return { collectedAt, collectionStatus: "complete", backend: "ufw", backendStatus: "active", host, warnings, rules };
}

function parseUfwRules(output: string, host: string) {
  const occurrences = new Map<string, number>();
  return output.split(/\r?\n/).flatMap((line): Array<{ comment: string; rule: FirewallRule }> => {
    const numbered = line.match(/^\[\s*\d+\]\s+(.+)$/);
    if (!numbered?.[1]) return [];
    const columns = numbered[1].trim().split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
    if (columns.length < 3) return [];
    const [rawTarget = "", rawAction = "", rawSource = "", ...commentParts] = columns;
    const actionMatch = rawAction.match(/^(ALLOW|DENY|REJECT|LIMIT)(?:\s+(IN|OUT))?$/);
    if (!actionMatch) return [];
    const target = parseTarget(rawTarget);
    const rawComment = commentParts.join(" ").replace(/^#\s*/, "");
    const canonical = `${rawTarget}\0${rawAction}\0${rawSource}\0${rawComment}`;
    const occurrence = (occurrences.get(canonical) ?? 0) + 1; occurrences.set(canonical, occurrence);
    return [{ comment: rawComment, rule: {
      id: digest("fw", `${canonical}\0${occurrence}`), name: cleanName(rawComment || `${target.port}/${target.protocol}`),
      port: target.port, protocol: target.protocol, source: rawSource.replace(/\s+\(v6\)$/, "") === "Anywhere" ? target.ipv6 ? "::/0" : "0.0.0.0/0" : rawSource.replace(/\s+\(v6\)$/, ""),
      action: actionMatch[1] as FirewallRule["action"], direction: (actionMatch[2] ?? "IN") as FirewallRule["direction"], target: host, ipv6: target.ipv6,
      managed: STACKPILOT_MARKER.test(rawComment),
    } }];
  });
}

async function status(runner: FixedCommandRunner) {
  return parseUfwStatus((await runner(UFW, ["status", "numbered"], 10_000, { env: COMMAND_ENV })).stdout);
}

export async function listFirewall(runner: FixedCommandRunner = runFirewallCommand): Promise<FirewallPayload> {
  return status(runner);
}

export async function createFirewallRule(input: { requestId: string; name: string; port: number; protocol: "TCP" | "UDP"; source: string }, runner: FixedCommandRunner = runFirewallCommand) {
  const raw = await runner(UFW, ["status", "numbered"], 10_000, { env: COMMAND_ENV });
  const before = parseUfwStatus(raw.stdout);
  if (before.backendStatus !== "active") throw new HelperError("FIREWALL_INACTIVE", "UFW must be active before rules can be changed");
  const marker = `[sp:${input.requestId}]`;
  if (raw.stdout.includes(marker)) return listFirewall(runner);
  await runner(UFW, ["allow", "proto", input.protocol.toLowerCase(), "from", input.source, "to", "any", "port", String(input.port), "comment", `${input.name} ${marker}`], 20_000, { env: COMMAND_ENV });
  return listFirewall(runner);
}

export async function deleteFirewallRule(input: { ruleId: string }, runner: FixedCommandRunner = runFirewallCommand) {
  const raw = await runner(UFW, ["status", "numbered"], 10_000, { env: COMMAND_ENV });
  const payload = parseUfwStatus(raw.stdout); const parsedRules = parseUfwRules(raw.stdout, payload.host);
  if (payload.backendStatus !== "active") throw new HelperError("FIREWALL_INACTIVE", "UFW must be active before rules can be changed");
  const found = parsedRules.find(({ rule }) => rule.id === input.ruleId);
  if (!found) return listFirewall(runner);
  if (!found.rule.managed) throw new HelperError("RULE_NOT_MANAGED", "Only StackPilot-managed firewall rules can be deleted");
  if (found.rule.direction !== "IN" || found.rule.action !== "ALLOW" || found.rule.protocol === "ALL" || !/^\d+$/.test(found.rule.port)) {
    throw new HelperError("RULE_NOT_MANAGED", "Managed rule does not match the fixed StackPilot rule shape");
  }
  await runner(UFW, ["--force", "delete", "allow", "proto", found.rule.protocol.toLowerCase(), "from", found.rule.source, "to", "any", "port", found.rule.port, "comment", found.comment], 20_000, { env: COMMAND_ENV });
  return listFirewall(runner);
}
