import assert from "node:assert/strict";
import test from "node:test";
import { AgentSystemdSnapshotSchema } from "@stackpilot/contracts";
import { SystemdCollector, parseJournal, parseServiceBlocks, redact } from "../../apps/agent/dist/systemd/systemdCollector.js";

const serviceOutput = [
  "Id=nginx.service", "Description=A web server", "LoadState=loaded", "ActiveState=active", "SubState=running",
  "MemoryCurrent=1048576", "NRestarts=2", "StateChangeTimestampUSec=1784073600000000", "",
  "Id=broken.service", "Description=Broken worker", "LoadState=loaded", "ActiveState=failed", "SubState=failed",
  "MemoryCurrent=[not set]", "NRestarts=0", "StateChangeTimestampUSec=0",
].join("\n");

test("systemd parser returns bounded typed services", () => {
  const rows = parseServiceBlocks(serviceOutput);
  assert.equal(rows.length, 2); assert.equal(rows[0].unit, "nginx.service"); assert.equal(rows[0].memoryCurrentBytes, 1048576);
  assert.equal(rows[1].activeState, "failed"); assert.equal(rows[1].memoryCurrentBytes, null); assert.equal(rows[1].stateChangedAt, null);
});

test("journal parser groups entries by unit and redacts credentials", () => {
  const output = [
    { _SYSTEMD_UNIT: "nginx.service", __CURSOR: "cursor-1", __REALTIME_TIMESTAMP: "1784073600000000", PRIORITY: "3", SYSLOG_IDENTIFIER: "nginx", _PID: "42", MESSAGE: "Authorization: Bearer live-secret-value" },
    { _SYSTEMD_UNIT: "nginx.service", __CURSOR: "cursor-2", __REALTIME_TIMESTAMP: "1784073601000000", MESSAGE: "api_key=sk_abcdefghijklmnopqrstuvwxyz" },
    { _SYSTEMD_UNIT: "invalid/unit", __CURSOR: "cursor-3", __REALTIME_TIMESTAMP: "1784073602000000", MESSAGE: "ignored" },
  ].map((row) => JSON.stringify(row)).join("\n");
  const entries = parseJournal(output).get("nginx.service");
  assert.equal(entries.length, 2); assert.match(entries[0].message, /\[REDACTED\]/); assert.doesNotMatch(JSON.stringify(entries), /live-secret|abcdefghijklmnopqrstuvwxyz/);
  assert.equal(redact("password=hunter2 token=abc123"), "password=[REDACTED] token=[REDACTED]");
  const variants = redact('{"secret":"json-secret"} https://example.test/?api_key=query-secret postgresql://user:dbpass@localhost/db');
  assert.doesNotMatch(variants, /json-secret|query-secret|dbpass/);
  const extended = redact([
    "Authorization: Basic dXNlcjpwYXNzd29yZA==", "Cookie: session=live-cookie; csrf=live-csrf", "Set-Cookie: refresh=live-refresh; HttpOnly",
    "client_secret=oauth-secret AWS_SECRET_ACCESS_KEY=aws-secret PRIVATE_KEY=inline-secret", "mongodb+srv://dbuser:db-password@cluster.example/db https://opaque-token@example.test/path",
    "-----BEGIN PRIVATE KEY-----\nprivate-key-body\n-----END PRIVATE KEY-----",
  ].join("\n"));
  assert.doesNotMatch(extended, /dXNlcj|live-cookie|live-csrf|live-refresh|oauth-secret|aws-secret|inline-secret|db-password|opaque-token|private-key-body/);
  assert.match(extended, /Authorization: \[REDACTED\]/); assert.match(extended, /mongodb\+srv:\/\/\[REDACTED\]@cluster\.example/);
});

test("collector uses fixed read-only programs and reports partial journal access", async () => {
  const calls = [];
  const probe = async (executable, args) => {
    calls.push([executable, args]);
    return executable === "systemctl" ? { ok: true, output: serviceOutput } : { ok: false, output: "", code: "EACCES" };
  };
  const snapshot = await new SystemdCollector(probe, () => new Date("2026-07-15T00:00:00.000Z")).collect("linux");
  AgentSystemdSnapshotSchema.parse(snapshot); assert.equal(snapshot.collectionStatus, "partial"); assert.equal(snapshot.services.length, 2);
  assert.deepEqual(calls.map(([program]) => program), ["systemctl", "journalctl"]);
  assert.ok(calls[0][1].includes("--no-pager")); assert.ok(calls[1][1].every((arg) => !/[;&|`$]/.test(arg)));
});

test("non-Linux collection is explicitly unavailable", async () => {
  const snapshot = await new SystemdCollector(async () => { throw new Error("must not run"); }).collect("win32");
  assert.equal(snapshot.collectionStatus, "unavailable"); assert.deepEqual(snapshot.services, []);
});

test("systemd snapshot stays within the signed heartbeat body limit for multi-byte logs", () => {
  const journal = Array.from({ length: 4 }, (_, index) => ({ cursor: `cursor-${index}`.padEnd(256, "x"), timestamp: nowIso(), priority: 6, identifier: "服".repeat(120), pid: "123", message: "密".repeat(512) }));
  const services = Array.from({ length: 64 }, (_, index) => ({ unit: `service-${index}.service`, description: "服".repeat(256), loadState: "加载".repeat(20), activeState: "active", subState: "运行".repeat(40), memoryCurrentBytes: 1024, restartCount: 0, stateChangedAt: nowIso(), journal }));
  const snapshot = AgentSystemdSnapshotSchema.parse({ collectedAt: nowIso(), collectionStatus: "complete", warnings: [], services });
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 1024 * 1024);
});

function nowIso() { return "2026-07-15T00:00:00.000Z"; }
