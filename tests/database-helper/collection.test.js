import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseCollector } from "../../apps/database-helper/dist/collection/collector.js";
import { postgresInventorySql, postgresQueriesSql } from "../../apps/database-helper/dist/collection/sql.js";

const instance = {
  id: "postgresql-16-main", name: "postgresql-16-main", engine: "postgresql", version: "16.14", port: 5432,
  managed: false, serviceName: "postgresql@16-main.service", dataDirectory: "/var/lib/postgresql/16/main",
  backupDirectory: "/var/lib/stackpilot-database-helper/backups/postgresql-16-main", host: "127.0.0.1",
  username: "stackpilot", initialDatabase: "postgres", historicalSlowQueriesAvailable: false, createdAt: new Date().toISOString(),
};

test("PostgreSQL collection normalizes empty application names and inet network suffixes at the source", async () => {
  assert.match(postgresQueriesSql, /NULLIF\(application_name,''\) "applicationName"/);
  assert.match(postgresQueriesSql, /host\(client_addr\) "clientAddress"/);
  assert.doesNotMatch(postgresQueriesSql, /client_addr::text "clientAddress"/);

  const queries = {
    async query(_instance, _credential, sql) {
      if (sql === postgresInventorySql) return { version: "16.14", storageBytes: 624_813_384_575, activeConnections: 149, maxConnections: 1000, accessMode: "read-write" };
      assert.equal(sql, postgresQueriesSql);
      return { sessions: [{ id: "123", database: "postgres", username: "app", applicationName: null, clientAddress: "127.0.0.1", state: "idle", startedAt: null, transactionStartedAt: null, protected: false, protectedReason: null }], queries: [] };
    },
  };
  const collector = new DatabaseCollector({ async list() { return [instance]; }, async credential() { return { instanceId: instance.id, username: "stackpilot", password: "strong-password-123" }; } }, queries, async () => ({ bsize: 4096, blocks: 100, bavail: 25 }));
  const result = await collector.collect();
  assert.equal(result.snapshot.collectionStatus, "complete");
  assert.equal(result.snapshot.instances[0].storageBytes, 624_813_384_575);
  assert.deepEqual(result.queryUpload.sessions[0].applicationName, null);
  assert.equal(result.queryUpload.sessions[0].clientAddress, "127.0.0.1");
});
