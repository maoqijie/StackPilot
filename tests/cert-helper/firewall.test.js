import test from "node:test";
import assert from "node:assert/strict";
import { createFirewallRule, deleteFirewallRule, parseUfwStatus } from "../../apps/cert-helper/dist/firewall.js";
import { parseFirewallRequest } from "../../apps/cert-helper/dist/firewallProtocol.js";
import { runFirewallCommand, runFixedCommand } from "../../apps/cert-helper/dist/runner.js";

const managedComment = "Web ingress [sp:11111111-1111-4111-8111-111111111111]";
const active = `Status: active\n\nTo                         Action      From\n--                         ------      ----\n[ 1] 443/tcp                ALLOW IN    Anywhere                   # ${managedComment}\n[ 2] 22/tcp                 ALLOW IN    192.0.2.0/24               # SSH operations\n[ 3] 443/tcp (v6)           ALLOW IN    Anywhere (v6)              # ${managedComment}\n`;

test("UFW status parser exposes stable managed and native rules", () => {
  const first = parseUfwStatus(active, "host-a"), second = parseUfwStatus(active, "host-a");
  assert.equal(first.backendStatus, "active"); assert.equal(first.rules.length, 3); assert.deepEqual(first.rules.map((rule) => rule.id), second.rules.map((rule) => rule.id));
  assert.deepEqual(first.rules[0], { id: first.rules[0].id, name: "Web ingress", port: "443", protocol: "TCP", source: "0.0.0.0/0", action: "ALLOW", direction: "IN", target: "host-a", ipv6: false, managed: true });
  assert.equal(first.rules[1].managed, false); assert.equal(first.rules[2].source, "::/0"); assert.notEqual(first.rules[0].id, first.rules[2].id);
  const inactive = parseUfwStatus("Status: inactive\n", "host-a"); assert.equal(inactive.backendStatus, "inactive"); assert.deepEqual(inactive.rules, []);
});

test("fixed firewall protocol rejects extra fields and unsafe values", () => {
  const create = { operation: "firewall-create", requestId: crypto.randomUUID(), name: "HTTPS", port: 443, protocol: "TCP", source: "192.0.2.0/24" };
  assert.deepEqual(parseFirewallRequest(JSON.stringify(create)), create);
  assert.equal(parseFirewallRequest(JSON.stringify({ ...create, requestId: create.requestId.toUpperCase() })).requestId, create.requestId);
  for (const invalid of [{ ...create, command: "ufw disable" }, { ...create, source: "999.0.0.1" }, { ...create, port: 0 }, { ...create, protocol: "ALL" }, { ...create, name: "HTTPS\nStatus: inactive" }, { ...create, name: "HTTPS [sp:11111111-1111-4111-8111-111111111111]" }]) assert.throws(() => parseFirewallRequest(JSON.stringify(invalid)), /fixed firewall helper protocol/);
});

test("firewall executable access is isolated from the general root helper", async () => {
  await assert.rejects(() => runFixedCommand("/usr/sbin/ufw", ["status"], 1), /allowlist/);
  await assert.rejects(() => runFirewallCommand("/usr/bin/git", ["status"], 1), /allowlist/);
});

test("create is idempotent and delete refuses native UFW rules", async () => {
  const calls = [];
  const runner = async (executable, args) => { calls.push([executable, args]); if (args[0] === "status") return { stdout: active, stderr: "" }; if (executable.endsWith("journalctl")) return { stdout: "", stderr: "" }; return { stdout: "", stderr: "" }; };
  await createFirewallRule({ requestId: "11111111-1111-4111-8111-111111111111", name: "Web ingress", port: 443, protocol: "TCP", source: "0.0.0.0/0" }, runner);
  assert.equal(calls.some(([, args]) => args[0] === "allow"), false);
  await assert.rejects(() => deleteFirewallRule({ ruleId: parseUfwStatus(active, "host-a").rules[1].id }, runner), /Only StackPilot-managed/);
});

test("delete removes only the exact selected managed UFW rule", async () => {
  const duplicate = `${active}[ 4] 443/tcp                ALLOW IN    Anywhere                   # Web ingress [sp:22222222-2222-4222-8222-222222222222]\n`;
  const selected = parseUfwStatus(duplicate, "host-a").rules[0];
  const calls = [];
  const runner = async (executable, args) => {
    calls.push([executable, args]);
    if (args[0] === "status") return { stdout: duplicate, stderr: "" };
    return { stdout: "", stderr: "" };
  };

  await deleteFirewallRule({ ruleId: selected.id }, runner);

  assert.deepEqual(calls.filter(([executable, args]) => executable.endsWith("/ufw") && args[0] === "--force"), [["/usr/sbin/ufw", ["--force", "delete", "allow", "proto", "tcp", "from", "0.0.0.0/0", "to", "any", "port", "443", "comment", managedComment]]]);
});
