import assert from "node:assert/strict";
import test from "node:test";
import {
  API_CLIENT_PREFIX, API_ROOT_SEGMENTS, ApiErrorResponseSchema, CreateScheduleJobRequestSchema,
  OverviewSummaryPayloadSchema, PathIdSchema, WRITE_METHODS,
  AGENT_PROTOCOL_VERSION, AgentDatabaseSnapshotSchema, AgentHeartbeatSchema, AgentTelemetrySnapshotSchema, HostMonitoringRecordSchema,
  CreateRemoteTaskRequestSchema, RemoteTaskListResponseSchema, isAgentProtocolCompatible,
  SiteRuntimePayloadSchema,
  ExecuteTerminalSnippetRequestSchema, TerminalSnippetListResponseSchema,
  AgentSiteSnapshotSchema, CertificateRenewalTaskParametersSchema, CreateCertificateRenewalRequestSchema,
  CreateFileUploadRequestSchema, ResumableFileUploadRecordSchema,
  AgentDatabaseOperationUpdateSchema, AgentDatabaseQueryUploadSchema,
  BusinessDatabaseBackupsPayloadSchema, CreateDatabaseOperationPlanRequestSchema, DatabaseOperationPlanSchema,
  DatabaseInstancesPayloadSchema, DatabaseSlowQueriesPayloadSchema, ExecuteDatabaseOperationPlanRequestSchema,
  CreateApiTokenRequestSchema, LoginRequestSchema, UpdateUserAccessRequestSchema,
  PermissionSchema,
  CreateDirectoryRequestSchema,
} from "@stackpilot/contracts";

test("shared API constants preserve the existing HTTP contract", () => {
  assert.equal(API_CLIENT_PREFIX, "/api");
  assert.deepEqual(API_ROOT_SEGMENTS, ["api", "overview"]);
  assert.deepEqual(WRITE_METHODS, ["POST", "PATCH", "DELETE"]);
});

test("remote task history accepts collection timestamps from upgraded Controllers", () => {
  assert.equal(RemoteTaskListResponseSchema.safeParse({ tasks: [], collectedAt: new Date().toISOString() }).success, true);
  assert.equal(RemoteTaskListResponseSchema.safeParse({ tasks: [] }).success, true);
});

test("agent telemetry remains optional and strictly validates bounded snapshots", () => {
  const baseHeartbeat = { nodeId: crypto.randomUUID(), agentVersion: "0.1.0", protocolVersion: "1.0", timestamp: new Date().toISOString(), platform: "linux", capabilities: ["system.summary.read"], health: { status: "healthy", uptimeSeconds: 1 } };
  assert.equal(AgentHeartbeatSchema.safeParse(baseHeartbeat).success, true);
  const telemetry = {
    collectedAt: new Date().toISOString(), hostname: "node-1", primaryIp: "192.0.2.1",
    cpu: { usagePercent: 25.5, coreUsagePercents: [20, 31] },
    memory: { totalBytes: 1024, availableBytes: 512 }, loadAverage: [0.2, 0.3, 0.4],
    disks: [{ label: "/dev/sda1", mount: "/", totalBytes: 2048, usedBytes: 1024 }], uptimeSeconds: 60,
  };
  assert.equal(AgentHeartbeatSchema.safeParse({ ...baseHeartbeat, telemetry }).success, true);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, collectedAt: "2026-07-12" }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, secret: "forbidden" }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, cpu: { ...telemetry.cpu, extra: true } }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, disks: Array.from({ length: 257 }, () => telemetry.disks[0]) }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, cpu: { usagePercent: 25, coreUsagePercents: Array(513).fill(25) } }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, memory: { totalBytes: 100, availableBytes: 101 } }).success, false);
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, disks: [{ ...telemetry.disks[0], usedBytes: 4096 }] }).success, false);
  const unsafeAggregate = [{ ...telemetry.disks[0], totalBytes: Number.MAX_SAFE_INTEGER, usedBytes: Number.MAX_SAFE_INTEGER }, { ...telemetry.disks[0], label: "/dev/sdb1", mount: "/data", totalBytes: 1, usedBytes: 1 }];
  assert.equal(AgentTelemetrySnapshotSchema.safeParse({ ...telemetry, disks: unsafeAggregate }).success, false);
});

test("database inventory is optional on legacy heartbeats and rejects duplicate instance ids", () => {
  const snapshot = { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], instances: [{ id: "postgresql.service", name: "postgresql", engine: "postgresql", version: null, host: "node-a", port: null, status: "running", source: "systemd:postgresql.service", latencyMs: null, storageBytes: null, activeConnections: null, maxConnections: null, slowQueryCount: null, backupStatus: "unavailable", lastBackupAt: null, accessMode: "unknown", owner: null, region: null, autoBackup: null, remoteAccess: null }] };
  assert.equal(AgentDatabaseSnapshotSchema.safeParse(snapshot).success, false);
  const heartbeat = AgentHeartbeatSchema.safeParse({ nodeId: crypto.randomUUID(), agentVersion: "0.2.0", protocolVersion: "1.0", timestamp: new Date().toISOString(), platform: "linux", capabilities: ["databases.inventory.read"], health: { status: "healthy", uptimeSeconds: 1 }, databaseSnapshot: snapshot });
  assert.equal(heartbeat.success, true);
  if (heartbeat.success) assert.deepEqual(heartbeat.data.databaseSnapshot?.instances[0]?.volumes, []);
  assert.equal(AgentHeartbeatSchema.safeParse({ nodeId: crypto.randomUUID(), agentVersion: "0.2.0", protocolVersion: "1.0", timestamp: new Date().toISOString(), platform: "linux", capabilities: ["databases.inventory.read"], health: { status: "healthy", uptimeSeconds: 1 }, databaseSnapshot: { ...snapshot, instances: [snapshot.instances[0], snapshot.instances[0]] } }).success, false);
});

test("database instance payload exposes scoped records with strict freshness fields", () => {
  const collectedAt = new Date().toISOString();
  const instance = {
    id: `database-${"a".repeat(32)}`, nodeId: crypto.randomUUID(), nodeName: "database-node", address: "192.0.2.10",
    collectedAt, freshness: "current", name: "postgresql", engine: "postgresql", version: "16.9", host: "database-node",
    port: 5432, status: "running", source: "systemd:postgresql.service", managed: false, historicalSlowQueriesAvailable: false, latencyMs: null, storageBytes: null,
    activeConnections: null, maxConnections: null, slowQueryCount: null, backupStatus: "unavailable", lastBackupAt: null,
    accessMode: "unknown", owner: null, region: null, autoBackup: null, remoteAccess: null, volumes: [],
  };
  const payload = { collectedAt, collectionStatus: "complete", warnings: [], instances: [instance] };
  assert.equal(DatabaseInstancesPayloadSchema.safeParse(payload).success, true);
  assert.equal(DatabaseInstancesPayloadSchema.safeParse({ ...payload, instances: [{ ...instance, freshness: "unknown" }] }).success, false);
  assert.equal(DatabaseInstancesPayloadSchema.safeParse({ ...payload, clientCollectedAt: collectedAt }).success, false);
});

test("host monitoring contract preserves raw nullable metrics", () => {
  const host = { id: "controller-local", source: "controller", name: "controller", platform: "linux", address: null, environment: "未分类", owner: "未分配", connectionStatus: "local", healthStatus: "unknown", telemetryFreshness: "current", telemetryCollectedAt: null, lastSeenAt: null, cpuPercent: null, memory: null, disk: null, uptimeSeconds: null, backup: null, services: [], version: "0.2.0", latency: null, updateStatus: null };
  assert.equal(HostMonitoringRecordSchema.safeParse(host).success, true);
  assert.equal(HostMonitoringRecordSchema.safeParse({ ...host, memory: { totalBytes: 100, usedBytes: 101, percent: 50 } }).success, false);
  assert.equal(HostMonitoringRecordSchema.safeParse({ ...host, cpuPercent: 101 }).success, false);
});

test("site runtime contract keeps collection provenance and nullable measurements explicit", () => {
  const payload = { collectedAt: new Date().toISOString(), collectionStatus: "partial", warnings: ["one unreadable config"], sites: [{
    id: "nginx-site", nodeId: "node-local", domain: "app.example.com", status: "running", runtime: "反向代理", host: "controller-1",
    upstream: "http://127.0.0.1:3000", source: "Nginx · app.conf", latencyMs: 12,
    trafficBytes: null, collectedAt: new Date().toISOString(), freshness: "current",
    certificate: { status: "unavailable", notBefore: null, expiresAt: null, issuer: null, subjectAlternativeNames: [], fingerprintSha256: null, renewalMode: "unsupported", renewable: false, unavailableReason: "未配置 TLS", certificateId: null },
    renewal: { batchId: null, taskId: null, status: "idle", message: null, updatedAt: null },
  }] };
  assert.equal(SiteRuntimePayloadSchema.safeParse(payload).success, true);
  assert.equal(SiteRuntimePayloadSchema.safeParse({ ...payload, clientCollectedAt: payload.collectedAt }).success, false);
  assert.equal(SiteRuntimePayloadSchema.safeParse({ ...payload, sites: [{ ...payload.sites[0], latencyMs: -1 }] }).success, false);
});

test("certificate renewal contracts reject generic commands, paths and duplicate ids", () => {
  const snapshot = { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], sites: [{
    id: "site-opaque-1", domain: "app.example.com", status: "running", runtime: "Nginx", host: "node-1", upstream: null,
    source: "Nginx", latencyMs: 3, trafficBytes: null,
    certificate: { status: "critical", notBefore: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400000).toISOString(), issuer: "Test CA", subjectAlternativeNames: ["app.example.com"], fingerprintSha256: "A".repeat(64), renewalMode: "automatic", renewable: true, unavailableReason: null, certificateId: "certificate-opaque-1" },
  }] };
  assert.equal(AgentSiteSnapshotSchema.safeParse(snapshot).success, true);
  assert.equal(AgentSiteSnapshotSchema.safeParse({ ...snapshot, sites: [...snapshot.sites, snapshot.sites[0]] }).success, false);
  assert.equal(CreateCertificateRenewalRequestSchema.safeParse({ siteIds: ["site-opaque-1", "site-opaque-1"], idempotencyKey: "renewal-123" }).success, false);
  const parameters = { batchId: crypto.randomUUID(), certificates: [{ certificateId: "certificate-opaque-1", siteIds: ["site-opaque-1"] }] };
  assert.equal(CertificateRenewalTaskParametersSchema.safeParse(parameters).success, true);
  assert.equal(CertificateRenewalTaskParametersSchema.safeParse({ ...parameters, command: "certbot renew" }).success, false);
  assert.equal(CertificateRenewalTaskParametersSchema.safeParse({ ...parameters, certificates: [{ certificateId: "/etc/letsencrypt/live/app", siteIds: ["site-opaque-1"] }] }).success, false);
});

test("database slow-query contract preserves nullable historical statistics", () => {
  const collectedAt = new Date().toISOString();
  const payload = { collectedAt, collectionStatus: "complete", warnings: [], thresholdMs: 1_000,
    instances: [{ id: "postgres-orders", name: "orders", engine: "PostgreSQL 16", host: "Controller 本机", port: 5432, activeConnections: 3, slowQueryCount: 1, collectedAt }],
    queries: [{ id: "query-1", instanceId: "postgres-orders", database: "orders", fingerprint: "pg-1", sql: "SELECT ?", durationMs: 1_250, calls: null, p95Ms: null, rowsExamined: null, risk: "low", state: "active", owner: "reader", startedAt: collectedAt, lastSeenAt: collectedAt, sessionId: "91", waitEvent: null }] };
  assert.equal(DatabaseSlowQueriesPayloadSchema.safeParse(payload).success, true);
  assert.equal(DatabaseSlowQueriesPayloadSchema.safeParse({ ...payload, thresholdMs: 0 }).success, false);
  assert.equal(DatabaseSlowQueriesPayloadSchema.safeParse({ ...payload, queries: [{ ...payload.queries[0], sql: "x".repeat(2_001) }] }).success, false);
});

test("database contracts strictly validate inventory, SQL uploads, backups and two-phase operations", () => {
  const collectedAt = new Date().toISOString();
  const instance = { id:"postgres-main",name:"main",engine:"postgresql",version:"16.9",host:"db-1",port:5432,status:"running",source:"postgresql",managed:false,historicalSlowQueriesAvailable:false,latencyMs:3,storageBytes:1024,activeConnections:2,maxConnections:100,slowQueryCount:1,backupStatus:"unavailable",lastBackupAt:null,accessMode:"read-write",owner:null,region:null,autoBackup:false,remoteAccess:true,volumes:[] };
  assert.equal(AgentDatabaseSnapshotSchema.safeParse({collectedAt,collectionStatus:"complete",warnings:[],instances:[instance]}).success,true);
  assert.equal(AgentDatabaseSnapshotSchema.safeParse({collectedAt,collectionStatus:"complete",warnings:[],instances:[instance],password:"forbidden"}).success,false);
  const query={id:"q-1",instanceLocalId:"postgres-main",database:"app",fingerprint:"fp-1",sql:"SELECT * FROM t",durationMs:2000,calls:null,p95Ms:null,rowsExamined:null,risk:"low",state:"active",owner:"app",startedAt:collectedAt,lastSeenAt:collectedAt,sessionId:"12",waitEvent:null,historical:false};
  assert.equal(AgentDatabaseQueryUploadSchema.safeParse({collectedAt,collectionStatus:"complete",warnings:[],sessions:[],queries:[query]}).success,true);
  assert.equal(AgentDatabaseQueryUploadSchema.safeParse({collectedAt,collectionStatus:"complete",warnings:[],sessions:[],queries:[{...query,sql:"x".repeat(2001)}]}).success,false);
  assert.equal(BusinessDatabaseBackupsPayloadSchema.safeParse({collectedAt,collectionStatus:"complete",warnings:[],plans:[],jobs:[],restorePoints:[]}).success,true);
  const nodeId=crypto.randomUUID();
  assert.equal(CreateDatabaseOperationPlanRequestSchema.safeParse({kind:"install",nodeId,engine:"postgresql",name:"app",port:null,initialDatabase:"app",credentialPublicKey:"x".repeat(64)}).success,true);
  assert.equal(CreateDatabaseOperationPlanRequestSchema.safeParse({kind:"create-index",instanceId:"database-"+"a".repeat(32),queryId:"q",table:"users;drop",columns:["email"]}).success,false);
  const plan={id:crypto.randomUUID(),kind:"install",nodeId,instanceId:null,target:"postgresql / app",impact:["public listener"],version:1,expiresAt:new Date(Date.now()+60_000).toISOString(),createdAt:collectedAt,executedAt:null};
  assert.equal(DatabaseOperationPlanSchema.safeParse(plan).success,true);
  assert.equal(ExecuteDatabaseOperationPlanRequestSchema.safeParse({planId:plan.id,version:1,idempotencyKey:"execute-001"}).success,true);
  assert.equal(AgentDatabaseOperationUpdateSchema.safeParse({operationId:crypto.randomUUID(),version:1,status:"failed",errorCode:null,errorMessage:"failed",credentialEnvelope:null,updatedAt:collectedAt}).success,false);
});

test("identity schemas reject privilege fields and invalid node scopes", () => {
  assert.equal(LoginRequestSchema.safeParse({ username: "admin", password: "password", role: "administrator" }).success, false);
  assert.equal(CreateApiTokenRequestSchema.safeParse({ name: "reader", permissions: ["overview:read"], nodeScope: "all", expiresAt: null }).success, true);
  assert.equal(CreateApiTokenRequestSchema.safeParse({ name: "bad", permissions: ["unknown:permission"], nodeScope: "all", expiresAt: null }).success, false);
  assert.equal(UpdateUserAccessRequestSchema.safeParse({ roleIds: ["operator"], nodeScope: ["not-a-uuid"], disabled: false }).success, false);
  assert.equal(PermissionSchema.safeParse("databases:read").success, true);
  assert.equal(PermissionSchema.safeParse("files:delete").success, true);
  assert.equal(PermissionSchema.safeParse("terminal:read").success, true);
  assert.equal(PermissionSchema.safeParse("terminal:execute").success, true);
});

test("file upload contracts reject paths and inconsistent progress", () => {
  const request = { fileName: "artifact.zip", targetDirectory: "releases/2026", sizeBytes: 10, contentType: "application/zip", idempotencyKey: "upload-001" };
  assert.equal(CreateFileUploadRequestSchema.safeParse(request).success, true);
  for (const targetDirectory of ["/etc", "../etc", "safe/../etc", "safe//etc", "safe\\etc"]) assert.equal(CreateFileUploadRequestSchema.safeParse({ ...request, targetDirectory }).success, false);
  assert.equal(CreateFileUploadRequestSchema.safeParse({ ...request, fileName: "../secret" }).success, false);
  assert.equal(CreateFileUploadRequestSchema.safeParse({ ...request, sizeBytes: 0 }).success, true);
  const record = { id: crypto.randomUUID(), fileName: request.fileName, targetDirectory: request.targetDirectory, targetPath: "releases/2026/artifact.zip", sizeBytes: request.sizeBytes, contentType: request.contentType, receivedBytes: 10, status: "completed", owner: "Admin", sha256: "a".repeat(64), errorMessage: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: new Date().toISOString() };
  assert.equal(ResumableFileUploadRecordSchema.safeParse(record).success, true);
  assert.equal(ResumableFileUploadRecordSchema.safeParse({ ...record, receivedBytes: 9 }).success, false);
});

test("agent protocol schemas reject incompatible and generic command tasks", () => {
  assert.equal(AGENT_PROTOCOL_VERSION, "1.1");
  assert.equal(isAgentProtocolCompatible("1.0"), true);
  assert.equal(isAgentProtocolCompatible("1.1"), true);
  assert.equal(isAgentProtocolCompatible("1.9"), false);
  assert.equal(isAgentProtocolCompatible("2.0"), false);
  assert.equal(CreateRemoteTaskRequestSchema.safeParse({ type: "run-shell", parameters: { command: "id" }, expiresInSeconds: 60, idempotencyKey: "generic-command" }).success, false);
  assert.equal(AgentHeartbeatSchema.safeParse({ nodeId: crypto.randomUUID(), agentVersion: "0.1.0", protocolVersion: "1.0", timestamp: new Date().toISOString(), platform: "linux", capabilities: ["system.summary.read"], health: { status: "healthy", uptimeSeconds: 1 }, token: "forbidden" }).success, false);
});

test("shared schemas validate external request and error contracts at runtime", () => {
  assert.equal(PathIdSchema.safeParse("node-local").success, true);
  assert.equal(PathIdSchema.safeParse("../node").success, false);
  assert.equal(CreateScheduleJobRequestSchema.safeParse({ name: "backup", cron: "0 4 * * *", command: "true", extra: true }).success, false);
  assert.equal(ApiErrorResponseSchema.safeParse({ code: "BAD_REQUEST", error: "invalid", requestId: "request-1" }).success, true);
  assert.equal(ApiErrorResponseSchema.safeParse({ code: "REAUTHENTICATION_FAILED", error: "重新认证失败", requestId: "request-2" }).success, true);
  assert.equal(OverviewSummaryPayloadSchema.safeParse({}).success, false);
});

test("terminal snippet contracts reject browser-supplied commands", () => {
  const now = new Date().toISOString();
  assert.equal(TerminalSnippetListResponseSchema.safeParse({ collectedAt: now, snippets: [{ id: "system-summary", version: 1, title: "Summary", command: "df -h", category: "resource", risk: "read", description: "Read resources", favorite: false, lastUsedAt: null, executable: true, requiredCapability: "system.summary.read" }] }).success, true);
  const request = { nodeId: crypto.randomUUID(), snippetVersion: 1, idempotencyKey: "terminal-contract-1" };
  assert.equal(ExecuteTerminalSnippetRequestSchema.safeParse(request).success, true);
  assert.equal(ExecuteTerminalSnippetRequestSchema.safeParse({ ...request, command: "id" }).success, false);
});

test("file contracts reject unsafe names and non-virtual paths",()=>{
  assert.equal(CreateDirectoryRequestSchema.safeParse({parentPath:"/var/www",name:"site"}).success,true);
  assert.equal(CreateDirectoryRequestSchema.safeParse({parentPath:"../www",name:"site"}).success,false);
  for(const name of [".","..","nested/name","nested\\name","bad\0name"])assert.equal(CreateDirectoryRequestSchema.safeParse({parentPath:"/",name}).success,false,name);
  assert.equal(CreateDirectoryRequestSchema.safeParse({parentPath:"/var/www",name:"site",mode:"0777"}).success,false);
});
