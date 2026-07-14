import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { importLegacyAgentState } from "../../apps/controller/dist/database/legacyImport.js";
import { openDatabase } from "../../apps/controller/dist/database/database.js";

test("legacy Agent import preserves physical identity and monitoring extensions", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-legacy-agent-"));
  const statePath = join(root, "agent-control.json");
  const now = new Date().toISOString();
  const nodeId = "11111111-1111-4111-8111-111111111111";
  const physicalHostId = `ph_${"a".repeat(64)}`;
  const node = {
    nodeId, nodeName: "legacy-node", status: "online", agentVersion: "0.3.0", protocolVersion: "1.0", platform: "linux",
    declaredCapabilities: ["system.summary.read"], allowedCapabilities: ["system.summary.read"], enrolledAt: now, lastSeenAt: now, revokedAt: null,
    physicalHostId, heartbeatHealthStatus: "healthy",
    telemetry: { collectedAt: now, hostname: "legacy-node", primaryIp: "192.0.2.10", cpu: null, memory: null, loadAverage: null, disks: [], uptimeSeconds: 1 },
  };
  await writeFile(statePath, JSON.stringify({ enrollments: [], credentials: [], nodes: [node], nonces: [], tasks: [], audits: [] }));
  const database = openDatabase(":memory:");
  try {
    await importLegacyAgentState(database, statePath);
    const stored = JSON.parse(database.prepare("SELECT payload FROM agent_nodes WHERE node_id=?").get(nodeId).payload);
    assert.equal(stored.physicalHostId, physicalHostId);
    assert.equal(stored.heartbeatHealthStatus, "healthy");
    assert.equal(stored.telemetry.primaryIp, "192.0.2.10");
  } finally { database.close(); await rm(root, { recursive: true, force: true }); }
});
