import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { DatabaseBackupWorkspaceService } from "../../apps/controller/dist/modules/databases/databaseBackupWorkspaceService.js";
import { DatabaseInventoryService } from "../../apps/controller/dist/modules/databases/databaseInventoryService.js";
import { DatabaseOperationService } from "../../apps/controller/dist/modules/databases/databaseOperationService.js";
import { SqliteDatabaseRepository } from "../../apps/controller/dist/repositories/sqliteDatabaseRepository.js";
import { routeDatabaseRequest } from "../../apps/controller/dist/http/databaseRouter.js";
import { routeDatabaseAgentRequest } from "../../apps/controller/dist/http/databaseAgentRouter.js";
import { NodeService } from "../../apps/controller/dist/modules/nodes/nodeService.js";
import { SqliteAgentControlRepository } from "../../apps/controller/dist/repositories/sqliteAgentControlRepository.js";

function response(){return{statusCode:0,headers:new Map(),body:"",setHeader(name,value){this.headers.set(name.toLowerCase(),value);},end(body=""){this.body=String(body);}};}

async function fixture(){
  const database=openDatabase(":memory:");const identity=new IdentityService(database,Buffer.alloc(32,3));
  await identity.createInitialAdministrator("admin","Admin","correct horse battery staple");const principal=(await identity.login("admin","correct horse battery staple","test","ua")).principal;
  const nodeId=crypto.randomUUID(),now=new Date().toISOString(),node={nodeId,nodeName:"db-node",status:"online",agentVersion:"0.3.0",protocolVersion:"1.1",platform:"linux",declaredCapabilities:[],allowedCapabilities:[],enrolledAt:now,lastSeenAt:now,revokedAt:null};database.prepare("INSERT INTO agent_nodes(node_id,payload,revoked_at,updated_at)VALUES(?,?,NULL,?)").run(nodeId,JSON.stringify(node),now);
  const repository=new SqliteDatabaseRepository(database,Buffer.alloc(32,5)),inventory=new DatabaseInventoryService(repository);inventory.ingestSnapshot(nodeId,{collectedAt:now,collectionStatus:"complete",warnings:[],instances:[{id:"postgres-main",name:"main",engine:"postgresql",version:"16.9",host:"db-node",port:5432,status:"running",source:"postgresql",managed:true,historicalSlowQueriesAvailable:true,latencyMs:1,storageBytes:100,activeConnections:1,maxConnections:100,slowQueryCount:1,backupStatus:"pending",lastBackupAt:null,accessMode:"read-write",owner:null,region:null,autoBackup:false,remoteAccess:true,volumes:[]}]});
  inventory.ingestQueryUpload(nodeId,{collectedAt:now,collectionStatus:"complete",warnings:[],sessions:[],queries:[{id:"q",instanceLocalId:"postgres-main",database:"app",fingerprint:"fp",sql:"SELECT secret_value FROM accounts",durationMs:2000,calls:null,p95Ms:null,rowsExamined:null,risk:"low",state:"active",owner:null,startedAt:now,lastSeenAt:now,sessionId:null,waitEvent:null,historical:false}]});
  const nodes=new NodeService(new SqliteAgentControlRepository(database));
  const services={databaseInventory:inventory,databaseWorkspace:new DatabaseBackupWorkspaceService(repository),databaseOperations:new DatabaseOperationService(repository,nodes),nodes};
  return{database,identity,principal,nodeId,services};
}
function context(value,{path="/api/databases",method="GET",body={},principal=value.principal}={}){const url=new URL(path,"http://localhost"),res=response();return{request:{method,headers:{}},response:res,requestId:crypto.randomUUID(),url,parts:url.pathname.split("/").filter(Boolean),services:value.services,identity:value.identity,principal,body,rawBody:Buffer.alloc(0)};}

test("database router returns scoped no-store responses and gates full SQL",async()=>{
  const value=await fixture();try{
    const read={...value.principal,permissions:new Set(["databases:read"]),nodeScope:[value.nodeId]};const query=context(value,{path:"/api/databases/slow-queries?range=24h",principal:read});await routeDatabaseRequest(query);assert.equal(query.response.statusCode,200);assert.equal(query.response.headers.get("cache-control"),"no-store");assert.equal(JSON.parse(query.response.body).queries[0].sql,null);
    const sql={...read,permissions:new Set(["databases:read","databases:sql:read"])};const full=context(value,{path:"/api/databases/slow-queries?range=7d",principal:sql});await routeDatabaseRequest(full);assert.match(JSON.parse(full.response.body).queries[0].sql,/secret_value/);
    const empty=context(value,{principal:{...read,nodeScope:[]}});await routeDatabaseRequest(empty);assert.deepEqual(JSON.parse(empty.response.body).instances,[]);
  }finally{value.database.close();}
});

test("database router rejects missing backup permission and API-token high-risk plans",async()=>{
  const value=await fixture();try{
    const read={...value.principal,permissions:new Set(["databases:read"])};await assert.rejects(()=>routeDatabaseRequest(context(value,{path:"/api/databases/backups",principal:read})),/权限不足/);
    const instance=value.services.databaseInventory.list("all").instances[0];const token={...value.principal,type:"api-token",permissions:new Set(["databases:read","databases:operate"])};
    await assert.rejects(()=>routeDatabaseRequest(context(value,{path:"/api/databases/operation-plans",method:"POST",body:{kind:"set-read-only",instanceId:instance.id},principal:token})),/用户会话/);
  }finally{value.database.close();}
});

test("database install node list uses database permissions and node scope",async()=>{
  const value=await fixture();try{
    const install={...value.principal,permissions:new Set(["databases:read","databases:install"]),nodeScope:[value.nodeId]};
    value.database.prepare("UPDATE agent_nodes SET payload=json_set(payload,'$.declaredCapabilities',json('[\"database.install\"]'),'$.allowedCapabilities',json('[\"database.install\"]')) WHERE node_id=?").run(value.nodeId);
    const request=context(value,{path:"/api/databases/install-nodes",principal:install});await routeDatabaseRequest(request);
    assert.equal(request.response.statusCode,200);assert.deepEqual(JSON.parse(request.response.body).nodes.map((node)=>node.nodeId),[value.nodeId]);
    const denied=context(value,{path:"/api/databases/install-nodes",principal:{...install,permissions:new Set(["databases:read"])} });await assert.rejects(()=>routeDatabaseRequest(denied),/权限不足/);
  }finally{value.database.close();}
});

test("signed Agent backup endpoints require capability and persist offline reports",async()=>{
  const value=await fixture();try{
    const instance=value.services.databaseInventory.list("all").instances[0],plan=value.services.databaseWorkspace.create({instanceId:instance.id,name:"offline",cron:"*/5 * * * *",retentionCount:7,enabled:true},"all");
    const agentContext=(path,body)=>{const request=context(value,{path,method:"POST",body,principal:undefined});return{...request,agentIdentity:{nodeId:value.nodeId,credentialId:crypto.randomUUID(),protocolVersion:"1.1"}};};
    await assert.rejects(()=>routeDatabaseAgentRequest(agentContext("/api/agent/databases/backup-plans/poll",{})),/未获数据库备份能力授权/);
    value.database.prepare("UPDATE agent_nodes SET payload=json_set(payload,'$.declaredCapabilities',json('[\"database.backup\"]'),'$.allowedCapabilities',json('[\"database.backup\"]')) WHERE node_id=?").run(value.nodeId);
    const poll=agentContext("/api/agent/databases/backup-plans/poll",{});await routeDatabaseAgentRequest(poll);assert.deepEqual(JSON.parse(poll.response.body).plans.map((item)=>item.id),[plan.id]);
    const now=new Date().toISOString(),report={reportId:crypto.randomUUID(),planId:plan.id,planVersion:1,instanceLocalId:"postgres-main",scheduledFor:now,status:"failed",result:null,errorCode:"CAPACITY_UNKNOWN",completedAt:now};
    const result=agentContext("/api/agent/databases/backup-plans/results",{reports:[report]});await routeDatabaseAgentRequest(result);assert.deepEqual(JSON.parse(result.response.body).acceptedReportIds,[report.reportId]);
    assert.equal(value.database.prepare("SELECT status FROM database_backup_jobs WHERE scheduled_report_id=?").get(report.reportId).status,"failed");
  }finally{value.database.close();}
});
