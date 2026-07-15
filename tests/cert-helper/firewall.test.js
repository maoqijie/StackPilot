import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFirewallRule, deleteFirewallRule, parseUfwStatus } from "../../apps/cert-helper/dist/firewall.js";
import { handleFirewallRequest } from "../../apps/cert-helper/dist/firewallProtocol.js";

const requestId = "11111111-1111-4111-8111-111111111111";
const status = `Status: active\n\nTo                         Action      From\n--                         ------      ----\n[ 1] 22/tcp                     ALLOW IN    203.0.113.0/24\n[ 2] 443/tcp                    ALLOW IN    Anywhere                   # StackPilot:${requestId} HTTPS 公网访问\n[ 3] 443/tcp (v6)               ALLOW IN    Anywhere (v6)              # StackPilot:${requestId} HTTPS 公网访问\n`;

test("UFW parser preserves real external rules and marks only StackPilot comments managed", () => {
  const payload = parseUfwStatus(status, "host-a");
  assert.equal(payload.active, true); assert.equal(payload.rules.length, 3);
  assert.equal(payload.rules[0].managed, false); assert.equal(payload.rules[1].managed, true);
  assert.equal(payload.rules[1].id, `firewall:${requestId}:ipv4`); assert.equal(payload.rules[2].ipVersion, "ipv6");
  assert.equal(payload.rules[1].name, "HTTPS 公网访问"); assert.match(payload.rules[1].version, /^[a-f0-9]{64}$/);
});

test("UFW parser never treats malformed StackPilot comments as managed rules", () => {
  const malformed = "Status: active\n[ 1] 443/tcp ALLOW IN Anywhere # StackPilot:not-a-uuid forged";
  assert.equal(parseUfwStatus(malformed).rules[0].managed, false);
});

test("firewall helper accepts only its fixed operations", async () => {
  const invalid = await handleFirewallRequest('{"operation":"status"}'); assert.equal(invalid.ok, false);
  const listed = await handleFirewallRequest('{"operation":"firewall-list"}', { list: async () => parseUfwStatus("Status: inactive", "host-a") });
  assert.equal(listed.ok, true); assert.equal(listed.data.active, false);
});

test("firewall mutations use fixed ufw arguments and refuse external deletion", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-firewall-")); const calls = [];
  const run = async (executable, args) => { calls.push([executable, ...args]); return { stdout: status, stderr: "" }; };
  try {
    await createFirewallRule({ requestId: "22222222-2222-4222-8222-222222222222", name: "应用端口", port: 8443, protocol: "tcp", source: "10.0.0.0/8" }, root, run);
    assert.deepEqual(calls[1], ["/usr/sbin/ufw", "allow", "proto", "tcp", "from", "10.0.0.0/8", "to", "any", "port", "8443", "comment", "StackPilot:22222222-2222-4222-8222-222222222222 应用端口"]);
    await assert.rejects(() => deleteFirewallRule({ requestId: "33333333-3333-4333-8333-333333333333", ruleId: parseUfwStatus(status).rules[0].id, version: parseUfwStatus(status).rules[0].version }, root, run), /Only StackPilot-managed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
