import assert from "node:assert/strict";
import test from "node:test";
import { AgentFirewallDenySnapshotSchema } from "@stackpilot/contracts";
import { FirewallDenyCollector, FirewallDenySnapshotCache, parseFirewallJournal } from "../../apps/agent/dist/firewall/firewallDenyCollector.js";

const timestamp = "1784073600000000";
const eventLine = (message, cursor = "cursor-1") => JSON.stringify({ __CURSOR: cursor, __REALTIME_TIMESTAMP: timestamp, MESSAGE: message });

test("firewall journal parser accepts bounded deny events and ignores unrelated kernel messages", () => {
  const events = parseFirewallJournal([
    eventLine("[UFW BLOCK] IN=eth0 OUT= MAC=00 SRC=198.51.100.24 DST=192.0.2.10 LEN=60 PROTO=TCP SPT=44321 DPT=22"),
    eventLine("kernel device initialized", "cursor-2"),
    eventLine("nft DROP IN=ens3 SRC=2001:db8::1 DST=2001:db8::2 PROTO=UDP SPT=53000 DPT=53", "cursor-3"),
  ].join("\n"));
  assert.equal(events.length, 2);
  assert.equal(events[0].sourceAddress, "198.51.100.24");
  assert.equal(events[0].destinationPort, 22);
  assert.equal(events[0].protocol, "TCP");
  assert.equal(events[1].sourceAddress, "2001:db8::1");
  assert.doesNotMatch(JSON.stringify(events), /MAC=|SPT=/);
});

test("firewall collector uses one fixed read-only journalctl invocation", async () => {
  const calls = [];
  const snapshot = await new FirewallDenyCollector(async (...args) => {
    calls.push(args);
    return { ok: true, output: eventLine("[UFW BLOCK] IN=eth0 SRC=198.51.100.24 DST=192.0.2.10 PROTO=TCP DPT=22") };
  }, () => new Date("2026-07-15T00:00:00.000Z")).collect("linux");
  AgentFirewallDenySnapshotSchema.parse(snapshot);
  assert.equal(snapshot.collectionStatus, "complete");
  assert.equal(calls[0][0], "journalctl");
  assert.deepEqual(calls[0][1], ["--dmesg", "--since=-24 hours", "--grep=(?i)(\\[UFW\\s+BLOCK\\]|\\b(?:DROP|REJECT|DENY|BLOCK)\\b)", "--lines=500", "--reverse", "--output=json", "--no-pager", "--quiet"]);
  assert.ok(calls[0][1].indexOf("--grep=(?i)(\\[UFW\\s+BLOCK\\]|\\b(?:DROP|REJECT|DENY|BLOCK)\\b)") < calls[0][1].indexOf("--lines=500"));
  assert.ok(calls[0][1].every((argument) => !/[;`$]/.test(argument)));
});

test("firewall collector treats an empty journal grep as a successful empty snapshot", async () => {
  const empty = await new FirewallDenyCollector(async () => ({ ok: false, output: "", errorOutput: "", code: 1 }), () => new Date("2026-07-16T00:00:00.000Z")).collect("linux");
  assert.equal(empty.collectionStatus, "complete");
  assert.deepEqual(empty.events, []);
  assert.deepEqual(empty.warnings, []);

  const denied = await new FirewallDenyCollector(async () => ({ ok: false, output: "", errorOutput: "permission denied", code: 1 }), () => new Date("2026-07-16T00:00:00.000Z")).collect("linux");
  assert.equal(denied.collectionStatus, "unavailable");
  assert.deepEqual(denied.events, []);
  assert.equal(denied.warnings.length, 1);
});

test("firewall collection is unavailable off Linux and cache does not overlap refreshes", async () => {
  assert.equal((await new FirewallDenyCollector(async () => { throw new Error("must not run"); }).collect("win32")).collectionStatus, "unavailable");
  let calls = 0; let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const cache = new FirewallDenySnapshotCache({ collect: async () => { calls += 1; await pending; return { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], events: [] }; } }, "linux", 30_000);
  const first = cache.refreshIfDue(100_000); const second = cache.refreshIfDue(100_001);
  assert.equal(calls, 1); release(); await Promise.all([first, second]);
  await cache.refreshIfDue(100_002); assert.equal(calls, 1);
});
