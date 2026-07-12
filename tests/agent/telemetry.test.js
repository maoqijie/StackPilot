import assert from "node:assert/strict";
import test from "node:test";
import { createHeartbeat } from "../../apps/agent/dist/heartbeat/heartbeat.js";
import { calculateCpuUsage, collectAgentTelemetry, parsePosixDiskUsage, parseWindowsDiskUsage, selectPrimaryIp } from "../../apps/agent/dist/telemetry/collector.js";

const cpu = (idle, user) => ({ times: { idle, user, nice: 0, sys: 0, irq: 0 } });

test("telemetry helpers calculate CPU, primary IP and cross-platform volumes", () => {
  assert.deepEqual(calculateCpuUsage([cpu(80, 20), cpu(60, 40)], [cpu(170, 30), cpu(120, 80)]), { usagePercent: 25, coreUsagePercents: [10, 40] });
  assert.equal(selectPrimaryIp({ lo: [{ address: "127.0.0.1", netmask: "", family: "IPv4", mac: "", internal: true, cidr: null }], eth0: [{ address: "2001:db8::1", netmask: "", family: "IPv6", mac: "", internal: false, cidr: null, scopeid: 0 }, { address: "192.0.2.10", netmask: "", family: "IPv4", mac: "", internal: false, cidr: null }] }), "192.0.2.10");
  assert.equal(selectPrimaryIp({ eth0: [{ address: "fe80::1%eth0", netmask: "", family: "IPv6", mac: "", internal: false, cidr: null, scopeid: 1 }] }), "fe80::1");
  const posix = parsePosixDiskUsage("Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 100 40 60 40% /\n/dev/sdb1 300 240 60 80% /data");
  assert.deepEqual(posix.map(({ totalBytes, usedBytes }) => [totalBytes, usedBytes]), [[102400, 40960], [307200, 245760]]);
  const weighted = posix.reduce((sum, disk) => sum + disk.usedBytes, 0) / posix.reduce((sum, disk) => sum + disk.totalBytes, 0) * 100;
  assert.equal(weighted, 70);
  assert.deepEqual(parseWindowsDiskUsage('[{"Name":"C:","Size":1000,"FreeSpace":400},{"Name":"D:","Size":3000,"FreeSpace":600}]').map((disk) => disk.usedBytes), [600, 2400]);
});

test("collector exposes unavailable metrics without inventing zero values and heartbeat carries the snapshot", async () => {
  let samples = 0;
  const telemetry = await collectAgentTelemetry("win32", {
    now: () => new Date("2026-07-12T00:00:00.000Z"), sleep: async () => {},
    cpus: () => samples++ === 0 ? [cpu(10, 10)] : [], hostname: () => "agent-node",
    networkInterfaces: () => ({}), totalmem: () => 0, freemem: () => 0, loadavg: () => [0, 0, 0], uptime: () => 42,
    collectDisks: async () => [],
  });
  assert.equal(telemetry.cpu, null); assert.equal(telemetry.memory, null); assert.equal(telemetry.loadAverage, null); assert.equal(telemetry.primaryIp, null); assert.deepEqual(telemetry.disks, []);
  const heartbeat = createHeartbeat({ agentVersion: "0.2.0", platform: "win32" }, "11111111-1111-4111-8111-111111111111", ["system.summary.read"], telemetry);
  assert.deepEqual(heartbeat.telemetry, telemetry); assert.equal(heartbeat.protocolVersion, "1.0"); assert.equal(heartbeat.health.status, "degraded");
  const legacyHeartbeat = createHeartbeat({ agentVersion: "0.1.0", platform: "win32" }, "11111111-1111-4111-8111-111111111111", ["system.summary.read"]);
  assert.equal("telemetry" in legacyHeartbeat, false); assert.equal(legacyHeartbeat.protocolVersion, "1.0");
});

test("collector degrades individual source failures to unavailable values", async () => {
  const telemetry = await collectAgentTelemetry("linux", {
    now: () => new Date("2026-07-12T00:00:00.000Z"), sleep: async () => { throw new Error("timer unavailable"); },
    cpus: () => { throw new Error("cpu unavailable"); }, hostname: () => { throw new Error("hostname unavailable"); },
    networkInterfaces: () => { throw new Error("network unavailable"); }, totalmem: () => { throw new Error("memory unavailable"); },
    freemem: () => 0, loadavg: () => { throw new Error("load unavailable"); }, uptime: () => { throw new Error("uptime unavailable"); },
    collectDisks: async () => { throw new Error("disk unavailable"); },
  });
  assert.equal(telemetry.collectedAt, "2026-07-12T00:00:00.000Z");
  assert.equal(telemetry.hostname, "unknown-host");
  assert.equal(telemetry.primaryIp, null);
  assert.equal(telemetry.cpu, null);
  assert.equal(telemetry.memory, null);
  assert.equal(telemetry.loadAverage, null);
  assert.deepEqual(telemetry.disks, []);
  assert.equal(telemetry.uptimeSeconds, 0);
});

test("collector bounds large hosts to the strict heartbeat contract", async () => {
  let samples = 0;
  const cores = Array.from({ length: 600 }, (_, index) => cpu(100 + index, 100));
  const disks = Array.from({ length: 300 }, (_, index) => ({ label: `disk-${index}`, mount: `/volume/${index}`, totalBytes: 1000, usedBytes: 500 }));
  const telemetry = await collectAgentTelemetry("linux", {
    now: () => new Date("2026-07-12T00:00:00.000Z"), sleep: async () => {},
    cpus: () => samples++ === 0 ? cores : cores.map((sample) => cpu(sample.times.idle + 50, sample.times.user + 50)),
    hostname: () => "large-host", networkInterfaces: () => ({}), totalmem: () => 1024, freemem: () => 512,
    loadavg: () => [1, 2, 3], uptime: () => 42, collectDisks: async () => disks,
  });
  assert.equal(telemetry.cpu.coreUsagePercents.length, 512);
  assert.equal(telemetry.disks.length, 256);
  const heartbeat = createHeartbeat({ agentVersion: "0.2.0", platform: "linux" }, "11111111-1111-4111-8111-111111111111", ["system.summary.read"], telemetry);
  assert.ok(Buffer.byteLength(JSON.stringify(heartbeat)) < 1024 * 1024);
});
