import assert from "node:assert/strict";
import test from "node:test";
import { createHeartbeat } from "../../apps/agent/dist/heartbeat/heartbeat.js";
import {
  calculateCpuUsage,
  collectAgentTelemetry,
  collectProcessorQueueLength,
  parsePosixDiskUsage,
  parseProcessorQueueLength,
  parseWindowsDiskUsage,
  selectPrimaryIp,
  WindowsLoadSampler,
} from "../../apps/agent/dist/telemetry/collector.js";

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

test("Windows queue parsing accepts only uint32 JSON integers, including zero", async () => {
  assert.equal(parseProcessorQueueLength("\ufeff0\r\n"), 0);
  assert.equal(parseProcessorQueueLength("0\r\n"), 0);
  assert.equal(parseProcessorQueueLength("4294967295"), 4294967295);
  for (const invalid of ["", "-1", "1.0", "1e0", '"1"', "null", "4294967296", "warning\n1"]) {
    assert.equal(parseProcessorQueueLength(invalid), null, invalid);
  }

  let invocation;
  assert.equal(await collectProcessorQueueLength(async (executable, args, options) => {
    invocation = { executable, args, options };
    return { stdout: "0" };
  }), 0);
  assert.equal(invocation.executable, "powershell.exe");
  assert.deepEqual(invocation.args.slice(0, 4), ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]);
  assert.match(invocation.args[4], /Win32_PerfFormattedData_PerfOS_System/);
  assert.match(invocation.args[4], /ErrorActionPreference='Stop'/);
  assert.deepEqual(invocation.options, { timeout: 4_000, maxBuffer: 64 * 1024, windowsHide: true });
  assert.equal(await collectProcessorQueueLength(async () => { throw new Error("timeout"); }), null);
  assert.equal(await collectProcessorQueueLength(async () => { throw new Error("access denied"); }), null);
});

test("Windows load sampler calculates busy cores plus queue with monotonic EMA windows", async () => {
  let now = 1_000;
  const queues = [1, 3, 8];
  const sampler = new WindowsLoadSampler({
    monotonicNow: () => now,
    readProcessorQueueLength: async () => queues.shift() ?? null,
  });
  assert.deepEqual(await sampler.sample([50, 50]), [2, 2, 2]);

  now += 60_000;
  const second = await sampler.sample([100, 100]);
  const instantaneous = 5;
  [60, 300, 900].forEach((window, index) => {
    const weight = Math.exp(-60 / window);
    assert.ok(Math.abs(second[index] - (2 * weight + instantaneous * (1 - weight))) < 1e-12);
  });

  now += 3_600_000;
  const third = await sampler.sample([100, 0]);
  [60, 300, 900].forEach((window, index) => {
    const weight = Math.exp(-3600 / window);
    assert.ok(Math.abs(third[index] - (second[index] * weight + 9 * (1 - weight))) < 1e-12);
  });
});

test("Windows load sampler shares an in-flight queue query and isolates failures", async () => {
  let resolveQueue;
  let calls = 0;
  const sampler = new WindowsLoadSampler({
    monotonicNow: () => 0,
    readProcessorQueueLength: () => {
      calls += 1;
      return new Promise((resolve) => { resolveQueue = resolve; });
    },
  });
  const first = sampler.sample([50]);
  const overlapping = sampler.sample([100]);
  assert.equal(first, overlapping);
  assert.equal(calls, 1);
  resolveQueue(2);
  assert.deepEqual(await first, [2.5, 2.5, 2.5]);

  const failed = new WindowsLoadSampler({
    monotonicNow: () => 0,
    readProcessorQueueLength: async () => { throw new Error("CIM unavailable"); },
  });
  assert.equal(await failed.sample([25]), null);
  assert.equal(await failed.sample([]), null);

  let retryCalls = 0;
  const retrying = new WindowsLoadSampler({
    monotonicNow: () => retryCalls,
    readProcessorQueueLength: async () => ++retryCalls === 1 ? null : 2,
  });
  assert.equal(await retrying.sample([50]), null);
  assert.deepEqual(await retrying.sample([50]), [2.5, 2.5, 2.5]);
});

test("Windows collector runs disk and load collection together without coupling failures", async () => {
  let samples = 0;
  let diskStarted = false;
  let loadStarted = false;
  let resolveDisk;
  let resolveLoad;
  const collection = collectAgentTelemetry("win32", {
    now: () => new Date("2026-07-12T00:00:00.000Z"), sleep: async () => {},
    cpus: () => samples++ === 0 ? [cpu(50, 50)] : [cpu(100, 100)], hostname: () => "windows-node",
    networkInterfaces: () => ({}), totalmem: () => 1024, freemem: () => 512,
    loadavg: () => { throw new Error("Windows must not read native load average"); }, uptime: () => 42,
    collectDisks: () => {
      diskStarted = true;
      return new Promise((resolve) => { resolveDisk = resolve; });
    },
    collectWindowsLoad: (coreUsagePercents) => {
      loadStarted = true;
      assert.deepEqual(coreUsagePercents, [50]);
      return new Promise((resolve) => { resolveLoad = resolve; });
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(diskStarted, true);
  assert.equal(loadStarted, true);
  resolveDisk([{ label: "C:", mount: "C:\\", totalBytes: 1000, usedBytes: 500 }]);
  resolveLoad([1.5, 1.25, 1.1]);
  const telemetry = await collection;
  assert.deepEqual(telemetry.loadAverage, [1.5, 1.25, 1.1]);
  assert.equal(telemetry.disks.length, 1);

  samples = 0;
  const failedLoad = await collectAgentTelemetry("win32", {
    sleep: async () => {}, cpus: () => samples++ === 0 ? [cpu(50, 50)] : [cpu(100, 100)],
    collectWindowsLoad: async () => { throw new Error("CIM unavailable"); },
    collectDisks: async () => [{ label: "C:", mount: "C:\\", totalBytes: 1000, usedBytes: 500 }],
  });
  assert.equal(failedLoad.loadAverage, null);
  assert.deepEqual(failedLoad.cpu, { usagePercent: 50, coreUsagePercents: [50] });
  assert.equal(failedLoad.disks.length, 1);

  samples = 0;
  const failedDisk = await collectAgentTelemetry("win32", {
    sleep: async () => {}, cpus: () => samples++ === 0 ? [cpu(50, 50)] : [cpu(100, 100)],
    collectWindowsLoad: async () => [2, 1.5, 1],
    collectDisks: async () => { throw new Error("disk unavailable"); },
  });
  assert.deepEqual(failedDisk.loadAverage, [2, 1.5, 1]);
  assert.deepEqual(failedDisk.disks, []);
});

test("non-Windows collection preserves native load average and never calls Windows sampler", async () => {
  let samples = 0;
  let windowsCalls = 0;
  const telemetry = await collectAgentTelemetry("linux", {
    sleep: async () => {}, cpus: () => samples++ === 0 ? [cpu(50, 50)] : [cpu(100, 100)],
    loadavg: () => [1, 2, 3], collectDisks: async () => [],
    collectWindowsLoad: async () => { windowsCalls += 1; return [9, 9, 9]; },
  });
  assert.deepEqual(telemetry.loadAverage, [1, 2, 3]);
  assert.equal(windowsCalls, 0);
});

test("collector exposes unavailable metrics without inventing zero values and heartbeat carries the snapshot", async () => {
  let samples = 0;
  let windowsLoadCalls = 0;
  const telemetry = await collectAgentTelemetry("win32", {
    now: () => new Date("2026-07-12T00:00:00.000Z"), sleep: async () => {},
    cpus: () => samples++ === 0 ? [cpu(10, 10)] : [], hostname: () => "agent-node",
    networkInterfaces: () => ({}), totalmem: () => 0, freemem: () => 0, loadavg: () => [0, 0, 0], uptime: () => 42,
    collectDisks: async () => [],
    collectWindowsLoad: async () => { windowsLoadCalls += 1; return [1, 1, 1]; },
  });
  assert.equal(telemetry.cpu, null); assert.equal(telemetry.memory, null); assert.equal(telemetry.loadAverage, null); assert.equal(telemetry.primaryIp, null); assert.deepEqual(telemetry.disks, []);
  assert.equal(windowsLoadCalls, 0);
  const heartbeat = createHeartbeat({ agentVersion: "0.2.0", platform: "win32" }, "11111111-1111-4111-8111-111111111111", ["system.summary.read"], telemetry);
  assert.deepEqual(heartbeat.telemetry, telemetry); assert.equal(heartbeat.protocolVersion, "1.1"); assert.equal(heartbeat.health.status, "degraded");
  const legacyHeartbeat = createHeartbeat({ agentVersion: "0.1.0", platform: "win32" }, "11111111-1111-4111-8111-111111111111", ["system.summary.read"]);
  assert.equal("telemetry" in legacyHeartbeat, false); assert.equal(legacyHeartbeat.protocolVersion, "1.1");
  const failedHeartbeat = createHeartbeat({ agentVersion: "0.2.0", platform: "win32" }, "11111111-1111-4111-8111-111111111111", ["system.summary.read"], undefined, true);
  assert.equal("telemetry" in failedHeartbeat, false); assert.equal(failedHeartbeat.health.status, "degraded");
  const physicalHostId = `ph_${"a".repeat(64)}`;
  const identifiedHeartbeat = createHeartbeat({ agentVersion: "0.2.0", platform: "win32" }, "11111111-1111-4111-8111-111111111111", ["system.summary.read"], undefined, true, undefined, undefined, physicalHostId);
  assert.equal(identifiedHeartbeat.physicalHostId, physicalHostId); assert.equal("telemetry" in identifiedHeartbeat, false);
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
