import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSnapshotCache, SystemdDatabaseCollector, parseSystemdDatabaseUnits } from "../../packages/host-telemetry/dist/index.js";

test("database inventory parses fixed PostgreSQL, MySQL and MariaDB systemd services", () => {
  const output = [
    "postgresql.service loaded active running PostgreSQL",
    "postgresql@16-main.service loaded active running PostgreSQL cluster",
    "mysql.service loaded failed failed MySQL",
    "mariadb.service loaded inactive dead MariaDB",
    "nginx.service loaded active running Nginx",
  ].join("\n");
  const instances = parseSystemdDatabaseUnits(output, "db-node-01");
  assert.deepEqual(instances.map(({ name, engine, status }) => ({ name, engine, status })), [
    { name: "postgresql", engine: "postgresql", status: "running" },
    { name: "postgresql-16-main", engine: "postgresql", status: "running" },
    { name: "mysql", engine: "mysql", status: "degraded" },
    { name: "mariadb", engine: "mariadb", status: "stopped" },
  ]);
  assert.ok(instances.every((instance) => instance.port === null && instance.storageBytes === null && instance.backupStatus === "unavailable"));
});

test("database inventory reports unsupported and failed collection without fixtures", async () => {
  const now = () => new Date("2026-07-14T00:00:00.000Z");
  const unsupported = await new SystemdDatabaseCollector({ target: "darwin", now }).collect();
  assert.equal(unsupported.collectionStatus, "unavailable"); assert.deepEqual(unsupported.instances, []);
  const failed = await new SystemdDatabaseCollector({ target: "linux", now, run: async () => { throw new Error("systemd unavailable"); } }).collect();
  assert.equal(failed.collectionStatus, "unavailable"); assert.deepEqual(failed.instances, []);
});

test("database inventory cache prevents overlap and enforces the collection interval", async () => {
  let calls = 0; let release;
  const collector = { collect: async () => { calls += 1; await new Promise((resolve) => { release = resolve; }); return { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], instances: [] }; } };
  const cache = new DatabaseSnapshotCache(collector, 60_000);
  const first = cache.refreshIfDue(100_000); const second = cache.refreshIfDue(100_001);
  assert.equal(calls, 1); release(); await Promise.all([first, second]);
  await cache.refreshIfDue(159_999); assert.equal(calls, 1);
});

test("database inventory cache retains the last successful instances after a transient failure", async () => {
  let calls = 0;
  const instance = parseSystemdDatabaseUnits("postgresql.service loaded active running PostgreSQL", "db-node")[0];
  const collector = { collect: async () => calls++ === 0
    ? { collectedAt: "2026-07-14T00:00:00.000Z", collectionStatus: "complete", warnings: [], instances: [instance] }
    : { collectedAt: "2026-07-14T00:01:00.000Z", collectionStatus: "unavailable", warnings: ["systemd 不可用"], instances: [] } };
  const cache = new DatabaseSnapshotCache(collector, 60_000);
  await cache.refreshIfDue(100_000); await cache.refreshIfDue(160_000);
  assert.equal(cache.current.collectionStatus, "partial"); assert.equal(cache.current.instances.length, 1);
  assert.equal(cache.current.collectedAt, "2026-07-14T00:00:00.000Z");
  assert.match(cache.current.warnings.join(" "), /保留上次成功/);
});
