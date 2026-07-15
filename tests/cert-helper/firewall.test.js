import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFirewallRule, deleteFirewallRule, parseUfwStatus } from "../../apps/cert-helper/dist/firewall.js";
import { handleFirewallRequest } from "../../apps/cert-helper/dist/firewallProtocol.js";
import { runFirewallCommand, runFixedCommand } from "../../apps/cert-helper/dist/runner.js";

const requestId = "11111111-1111-4111-8111-111111111111";
const status = `Status: active\n\nTo                         Action      From\n--                         ------      ----\n[ 1] 22/tcp                     ALLOW IN    203.0.113.0/24\n[ 2] 443/tcp                    ALLOW IN    Anywhere                   # StackPilot:${requestId} HTTPS 公网访问\n[ 3] 443/tcp (v6)               ALLOW IN    Anywhere (v6)              # StackPilot:${requestId} HTTPS 公网访问\n`;

test("UFW parser preserves external rules and recognizes only valid StackPilot markers", () => {
  const payload = parseUfwStatus(status, "host-a");
  assert.equal(payload.active, true); assert.equal(payload.rules.length, 3);
  assert.equal(payload.rules[0].managed, false); assert.equal(payload.rules[1].managed, true);
  assert.equal(payload.rules[1].id, `firewall:${requestId}:ipv4`); assert.equal(payload.rules[2].ipVersion, "ipv6");
  assert.equal(payload.rules[1].name, "HTTPS 公网访问"); assert.match(payload.rules[1].version, /^[a-f0-9]{64}$/);
  assert.equal(parseUfwStatus("Status: active\n[ 1] 443/tcp ALLOW IN Anywhere # StackPilot:not-a-uuid forged").rules[0].managed, false);
  const malformed = parseUfwStatus("unexpected output", "host-a"); assert.equal(malformed.collectionStatus, "unavailable"); assert.equal(malformed.active, false); assert.deepEqual(malformed.rules, []);
});

test("firewall helper accepts only its fixed protocol and isolated executable allowlist", async () => {
  const invalid = await handleFirewallRequest('{"operation":"status"}'); assert.equal(invalid.ok, false);
  const listed = await handleFirewallRequest('{"operation":"firewall-list"}', { list: async () => parseUfwStatus("Status: inactive", "host-a") });
  assert.equal(listed.ok, true); assert.equal(listed.data.active, false);
  await assert.rejects(() => runFixedCommand("/usr/sbin/ufw", ["status"], 1), /allowlist/);
  await assert.rejects(() => runFirewallCommand("/usr/bin/git", ["status"], 1), /allowlist/);
});

test("firewall create persists a completed receipt and replays no side effect", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-firewall-create-")); const calls = [];
  const input = { requestId: "22222222-2222-4222-8222-222222222222", name: "应用端口", port: 8443, protocol: "tcp", source: "10.0.0.0/8" };
  const run = async (executable, args) => { calls.push([executable, ...args]); return { stdout: status, stderr: "" }; };
  try {
    await createFirewallRule(input, root, run); await createFirewallRule(input, root, run);
    assert.deepEqual(calls.filter((call) => call[1] === "allow"), [["/usr/sbin/ufw", "allow", "proto", "tcp", "from", "10.0.0.0/8", "to", "any", "port", "8443", "comment", "StackPilot:22222222-2222-4222-8222-222222222222 应用端口"]]);
    const receipt = JSON.parse(await readFile(join(root, "firewall-actions", `${input.requestId}.json`), "utf8")); assert.equal(receipt.status, "completed");
    await assert.rejects(() => createFirewallRule({ ...input, port: 9443 }, root, run), /idempotency key changed/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("firewall mutations reject external rules, changed versions and unknown receipts", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-firewall-guard-"));
  const external = parseUfwStatus(status).rules[0], managed = parseUfwStatus(status).rules[1];
  const run = async () => ({ stdout: status, stderr: "" });
  try {
    await assert.rejects(() => deleteFirewallRule({ requestId: "33333333-3333-4333-8333-333333333333", ruleId: external.id, version: external.version }, root, run), /Only fixed StackPilot-managed/);
    const changedId = "44444444-4444-4444-8444-444444444444";
    await assert.rejects(() => deleteFirewallRule({ requestId: changedId, ruleId: managed.id, version: "b".repeat(64) }, root, run), /changed since it was collected/);
    await assert.rejects(() => readFile(join(root, "firewall-actions", `${changedId}.json`)), { code: "ENOENT" });
    const unknownId = "55555555-5555-4555-8555-555555555555"; const directory = join(root, "firewall-actions"); await mkdir(directory, { recursive: true });
    await writeFile(join(directory, `${unknownId}.json`), JSON.stringify({ operation: "delete", identity: `${managed.id}\0${managed.version}`, status: "started" }));
    await assert.rejects(() => deleteFirewallRule({ requestId: unknownId, ruleId: managed.id, version: managed.version }, root, run), /result is unknown/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("firewall deletion uses the validated complete marker rule, never a rule number", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-firewall-delete-")); const calls = [];
  const rule = parseUfwStatus(status).rules[1];
  const run = async (executable, args) => { calls.push([executable, ...args]); return { stdout: status, stderr: "" }; };
  try {
    await deleteFirewallRule({ requestId: "66666666-6666-4666-8666-666666666666", ruleId: rule.id, version: rule.version }, root, run);
    const deletion = calls.find((call) => call[1] === "--force");
    assert.deepEqual(deletion, ["/usr/sbin/ufw", "--force", "delete", "allow", "proto", "tcp", "from", "0.0.0.0/0", "to", "any", "port", "443", "comment", `StackPilot:${requestId} HTTPS 公网访问`]);
    assert.equal(deletion.includes("2"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
