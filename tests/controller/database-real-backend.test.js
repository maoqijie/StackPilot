import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentDatabaseQueryUploadSchema, AgentDatabaseSnapshotSchema, CreateDatabaseOperationPlanRequestSchema,
} from "@stackpilot/contracts";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { DatabaseBackupWorkspaceService } from "../../apps/controller/dist/modules/databases/databaseBackupWorkspaceService.js";
import { DatabaseInventoryService } from "../../apps/controller/dist/modules/databases/databaseInventoryService.js";
import { DatabaseOperationService } from "../../apps/controller/dist/modules/databases/databaseOperationService.js";
import { DatabaseRetentionService } from "../../apps/controller/dist/modules/databases/databaseRetentionService.js";
import { SqliteDatabaseRepository } from "../../apps/controller/dist/repositories/sqliteDatabaseRepository.js";

const masterKey = Buffer.alloc(32, 9);
const at = () => new Date().toISOString();
const snapshot = (managed = true) => AgentDatabaseSnapshotSchema.parse({
  collectedAt:at(),collectionStatus:"complete",warnings:[],instances:[{
    id:"postgres-main",name:"main",engine:"postgresql",version:"16.9",host:"db-node",port:5432,status:"running",source:"postgresql",
    managed,historicalSlowQueriesAvailable:managed,latencyMs:3,storageBytes:1024,activeConnections:2,maxConnections:100,slowQueryCount:1,
    backupStatus:"unavailable",lastBackupAt:null,accessMode:"read-write",owner:null,region:null,autoBackup:false,remoteAccess:true,volumes:[],
  }],
});
const upload = () => AgentDatabaseQueryUploadSchema.parse({
  collectedAt:at(),collectionStatus:"complete",warnings:[],
  sessions:[{id:"12",instanceLocalId:"postgres-main",database:"app",username:"app",applicationName:"api",clientAddress:"192.0.2.2",state:"active",startedAt:at(),transactionStartedAt:null,protected:false,protectedReason:null},
    {id:"13",instanceLocalId:"postgres-main",database:"app",username:"stackpilot",applicationName:"database-helper",clientAddress:null,state:"active",startedAt:at(),transactionStartedAt:null,protected:true,protectedReason:"StackPilot helper connection"}],
  queries:[{id:"local-query",instanceLocalId:"postgres-main",database:"app",fingerprint:"fp-1",sql:"SELECT * FROM customers WHERE email = 'secret@example.com'",durationMs:2500,calls:null,p95Ms:null,rowsExamined:null,risk:"low",state:"active",owner:"app",startedAt:at(),lastSeenAt:at(),sessionId:"12",waitEvent:null,historical:false}],
});

async function fixture() {
  const database=openDatabase(":memory:");
  const identity=new IdentityService(database,Buffer.alloc(32,4));
  const userId=await identity.createInitialAdministrator("admin","Administrator","correct horse battery staple");
  const nodeId=crypto.randomUUID(),now=at();
  const node={nodeId,nodeName:"db-node",status:"online",agentVersion:"0.3.0",protocolVersion:"1.1",platform:"linux",declaredCapabilities:["database.inventory.read"],allowedCapabilities:["database.inventory.read"],enrolledAt:now,lastSeenAt:now,revokedAt:null};
  database.prepare("INSERT INTO agent_nodes(node_id,payload,revoked_at,updated_at)VALUES(?,?,NULL,?)").run(nodeId,JSON.stringify(node),now);
  const repository=new SqliteDatabaseRepository(database,masterKey);
  return {database,identity,userId,nodeId,repository,inventory:new DatabaseInventoryService(repository),backups:new DatabaseBackupWorkspaceService(repository)};
}

test("schema 5 persists scoped snapshots and encrypted expiring SQL",async()=>{
  const value=await fixture();try{
    const databasePermissions=value.database.prepare("SELECT permission_key FROM role_permissions WHERE role_id='administrator' AND permission_key LIKE 'databases:%' ORDER BY permission_key").all().map((row)=>row.permission_key);
    assert.deepEqual(databasePermissions,["databases:backup","databases:install","databases:operate","databases:read","databases:restore","databases:sql:read"]);
    assert.equal(value.database.prepare("SELECT count(*) AS count FROM role_permissions WHERE role_id='operator' AND permission_key LIKE 'databases:%'").get().count,0);
    value.inventory.ingestSnapshot(value.nodeId,snapshot());value.inventory.ingestQueryUpload(value.nodeId,upload());
    const instance=value.inventory.list("all").instances[0];assert.equal(value.inventory.list([]).instances.length,0);assert.equal(value.inventory.list([value.nodeId]).instances.length,1);
    const withoutSql=value.inventory.slowQueries("all","24h",false).queries[0];assert.equal(withoutSql.sql,null);
    const withSql=value.inventory.slowQueries("all","24h",true).queries[0];assert.match(withSql.sql,/secret@example/);
    const raw=value.database.prepare("SELECT metadata,sql_ciphertext,sql_expires_at FROM database_slow_queries").get();assert.doesNotMatch(raw.metadata,/secret@example/);assert.ok(Buffer.isBuffer(raw.sql_ciphertext));assert.ok(Date.parse(raw.sql_expires_at)>Date.now()+6*86_400_000);
    value.database.prepare("UPDATE database_slow_queries SET sql_expires_at=?").run(new Date(Date.now()-1000).toISOString());assert.equal(value.repository.purgeExpiredSql(at()),1);assert.equal(value.database.prepare("SELECT sql_ciphertext FROM database_slow_queries").get().sql_ciphertext,null);
    assert.equal(value.inventory.detail(instance.id,"all",false).sessions.length,2);
  }finally{value.database.close();}
});

test("two-phase operations enforce sessions, versions, idempotency and managed boundaries",async()=>{
  const value=await fixture();try{
    value.inventory.ingestSnapshot(value.nodeId,snapshot());value.inventory.ingestQueryUpload(value.nodeId,upload());const instance=value.inventory.list("all").instances[0];
    const permissions=new Set(["databases:read","databases:operate","databases:install","databases:restore"]),session={userId:value.userId,principalType:"session",nodeScope:"all",permissions};
    const service=new DatabaseOperationService(value.repository,{list:async()=>[{nodeId:value.nodeId,revokedAt:null}]},value.identity.audit);
    await assert.rejects(()=>service.createPlan({kind:"terminate-session",instanceId:instance.id,sessionId:"13"},session,"protected-request"),/受保护/);
    const request=CreateDatabaseOperationPlanRequestSchema.parse({kind:"set-read-only",instanceId:instance.id});const plan=await service.createPlan(request,session,"plan-request");
    assert.equal(value.database.prepare("SELECT parameters_ciphertext FROM database_operation_plans WHERE id=?").get(plan.id).parameters_ciphertext instanceof Buffer,true);
    const operation=await service.execute({planId:plan.id,version:plan.version,idempotencyKey:"execute-readonly-001"},session,"execute-request");assert.equal(operation.status,"queued");
    const repeated=await service.execute({planId:plan.id,version:plan.version,idempotencyKey:"execute-readonly-001"},session,"repeat-request");assert.equal(repeated.id,operation.id);
    await assert.rejects(()=>service.execute({planId:plan.id,version:plan.version,idempotencyKey:"execute-readonly-002"},session,"bad-version"),/已经执行|版本/);
    await assert.rejects(()=>service.createPlan(request,{...session,principalType:"api-token"},"token-request"),/用户会话/);
    const otherNode=crypto.randomUUID();await assert.rejects(()=>service.createPlan({kind:"install",nodeId:otherNode,engine:"postgresql",name:"app",port:null,initialDatabase:"app",credentialPublicKey:"x".repeat(64)},{...session,nodeScope:[value.nodeId]},"scope-request"),/授权范围/);
    const auditParameters=value.database.prepare("SELECT parameters FROM audit_events ORDER BY sequence").all().map((row)=>row.parameters).join("\n");
    assert.doesNotMatch(auditParameters,/SELECT|credentialPublicKey|secret@example|postgres(?:ql)?:\/\//i);
  }finally{value.database.close();}
});

test("backup plans create persistent queued jobs and Agent updates are node-bound",async()=>{
  const value=await fixture();try{
    value.inventory.ingestSnapshot(value.nodeId,snapshot());const instance=value.inventory.list("all").instances[0];
    const plan=value.backups.create({instanceId:instance.id,name:"nightly",cron:"0 2 * * *",retentionCount:7,enabled:true},"all");
    const first=value.backups.run(plan.id,value.userId,"backup-run-001","backup-request","all");const second=value.backups.run(plan.id,value.userId,"backup-run-001","repeat-request","all");
    assert.equal(first.operationId,second.operationId);assert.equal(first.job.id,second.job.id);assert.equal(first.status,"queued");
    assert.throws(()=>value.repository.updateOperation(crypto.randomUUID(),{operationId:first.operationId,version:1,status:"running",errorCode:null,errorMessage:null,credentialEnvelope:null,updatedAt:at()}),/不存在/);
    const [dispatch]=value.repository.pollOperations(value.nodeId,4,["backup"]);assert.equal(dispatch.kind,"backup");assert.equal(dispatch.parameters.retentionCount,7);assert.equal(dispatch.version,2);
    const running=value.repository.updateOperation(value.nodeId,{operationId:first.operationId,version:2,status:"running",errorCode:null,errorMessage:null,credentialEnvelope:null,updatedAt:at()});assert.equal(running.status,"running");assert.equal(running.version,2);
    const result={kind:"backup",restorePointId:crypto.randomUUID(),createdAt:at(),sizeBytes:4096,checksum:"a".repeat(64),databaseVersion:"16.9",manifestVersion:1};
    const completed=value.repository.updateOperation(value.nodeId,{operationId:first.operationId,version:2,status:"succeeded",errorCode:null,errorMessage:null,credentialEnvelope:null,result,updatedAt:at()});assert.equal(completed.status,"succeeded");assert.equal(completed.version,3);assert.deepEqual(completed.result,result);
    const raw=value.database.prepare("SELECT result_ciphertext,result_nonce,result_tag FROM database_operations WHERE id=?").get(first.operationId);assert.ok(Buffer.isBuffer(raw.result_ciphertext));assert.doesNotMatch(raw.result_ciphertext.toString("utf8"),/databaseVersion|16\.9/);
    const point=value.backups.list("all").restorePoints.find((item)=>item.id===result.restorePointId);assert.equal(point?.checksum,result.checksum);assert.equal(point?.sizeBytes,result.sizeBytes);
    const retried=value.repository.updateOperation(value.nodeId,{operationId:first.operationId,version:2,status:"succeeded",errorCode:null,errorMessage:null,credentialEnvelope:null,result,updatedAt:at()});assert.equal(retried.id,completed.id);assert.equal(retried.version,3);
  }finally{value.database.close();}
});

test("non-managed instances reject in-place restore plans",async()=>{
  const value=await fixture();try{
    value.inventory.ingestSnapshot(value.nodeId,snapshot(false));const instance=value.inventory.list("all").instances[0];
    const service=new DatabaseOperationService(value.repository,{list:async()=>[{nodeId:value.nodeId,revokedAt:null}]});
    const operator={userId:value.userId,principalType:"session",nodeScope:"all",permissions:new Set(["databases:restore"])};
    await assert.rejects(()=>service.createPlan({kind:"restore",instanceId:instance.id,restorePointId:crypto.randomUUID()},operator,"restore-request"),/非 StackPilot 受管实例/);
  }finally{value.database.close();}
});

test("retention maintenance erases expired SQL and one-time credential ciphertext",async()=>{
  const value=await fixture();try{
    value.inventory.ingestSnapshot(value.nodeId,snapshot());value.inventory.ingestQueryUpload(value.nodeId,upload());
    const expired=new Date(Date.now()-1_000).toISOString();
    value.database.prepare("UPDATE database_slow_queries SET sql_expires_at=?").run(expired);
    value.database.prepare("INSERT INTO database_operations(id,node_id,kind,status,version,requested_by,request_id,idempotency_key,credential_ciphertext,credential_expires_at,created_at,updated_at,expires_at) VALUES(?,?,?,'succeeded',1,?,?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(),value.nodeId,"install",value.userId,"retention-request","retention-key","encrypted-once",expired,at(),at(),at());
    const retention=new DatabaseRetentionService(value.repository);const repeated=retention.run(at());retention.shutdown();
    assert.deepEqual(repeated,{sql:0,credentials:0,operationResults:0});
    assert.equal(value.database.prepare("SELECT sql_ciphertext FROM database_slow_queries").get().sql_ciphertext,null);
    const credential=value.database.prepare("SELECT credential_ciphertext,credential_expires_at FROM database_operations WHERE idempotency_key='retention-key'").get();assert.deepEqual(credential,{credential_ciphertext:null,credential_expires_at:null});
  }finally{value.database.close();}
});

test("Explain results are encrypted and erased after seven days",async()=>{
  const value=await fixture();try{
    value.inventory.ingestSnapshot(value.nodeId,snapshot());value.inventory.ingestQueryUpload(value.nodeId,upload());
    const instance=value.inventory.list("all").instances[0],query=value.inventory.slowQueries("all","24h",false).queries[0];
    const operation=value.repository.createDirectOperation("explain",value.nodeId,instance.id,value.userId,"explain-result-001","explain-request",at(),{queryId:query.id});
    const [dispatch]=value.repository.pollOperations(value.nodeId,1,["explain"]),updatedAt=at(),plan="Seq Scan on customers Filter: private@example.com";
    const completed=value.repository.updateOperation(value.nodeId,{operationId:operation.id,version:dispatch.version,status:"succeeded",errorCode:null,errorMessage:null,credentialEnvelope:null,result:{kind:"explain",format:"text",plan},updatedAt});
    assert.equal(completed.result?.kind,"explain");assert.equal(completed.result?.plan,plan);
    const raw=value.database.prepare("SELECT result_ciphertext,result_expires_at FROM database_operations WHERE id=?").get(operation.id);assert.ok(Buffer.isBuffer(raw.result_ciphertext));assert.doesNotMatch(raw.result_ciphertext.toString("utf8"),/private@example/);assert.ok(Date.parse(raw.result_expires_at)>Date.parse(updatedAt)+6*86_400_000);
    value.database.prepare("UPDATE database_operations SET result_expires_at=? WHERE id=?").run(new Date(Date.now()-1_000).toISOString(),operation.id);
    assert.equal(value.repository.purgeExpiredSensitiveData(at()).operationResults,1);assert.equal(value.repository.findOperation(operation.id,"all").result,null);
  }finally{value.database.close();}
});
