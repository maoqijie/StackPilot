import assert from "node:assert/strict";
import test from "node:test";
import { telemetryIsDegraded } from "../../apps/agent/dist/telemetry/collector.js";

test("health degradation catches unavailable and overloaded resources", () => {
  const base = {
    cpu: { usagePercent: 10, coreUsagePercents: [10] },
    memory: { totalBytes: 100, availableBytes: 50 },
    disks: [{ label: "disk", mount: "/", totalBytes: 100, usedBytes: 50 }],
  };
  assert.equal(telemetryIsDegraded(base), false);
  assert.equal(telemetryIsDegraded({ ...base, cpu: null }), true);
  assert.equal(telemetryIsDegraded({ ...base, cpu: { usagePercent: 90, coreUsagePercents: [90] } }), true);
  assert.equal(telemetryIsDegraded({ ...base, memory: { totalBytes: 100, availableBytes: 10 } }), true);
  assert.equal(telemetryIsDegraded({ ...base, disks: [{ ...base.disks[0], usedBytes: 95 }] }), true);
  assert.equal(telemetryIsDegraded({ ...base, disks: [{ ...base.disks[0], totalBytes: 1000, usedBytes: 800 }, { ...base.disks[0], label: "tiny", totalBytes: 1, usedBytes: 1 }] }), false);
  assert.equal(telemetryIsDegraded({ ...base, disks: [{ ...base.disks[0], totalBytes: 1000, usedBytes: 950 }, { ...base.disks[0], label: "tiny", totalBytes: 1, usedBytes: 0 }] }), true);
});
