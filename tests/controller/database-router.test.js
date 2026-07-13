import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase } from "../../apps/controller/dist/database/database.js";
import { migrateDatabase } from "../../apps/controller/dist/database/migrator.js";
import { readFile } from "node:fs/promises";
import { IdentityService } from "../../apps/controller/dist/identity/identityService.js";
import { DatabaseBackupWorkspaceService } from "../../apps/controller/dist/modules/databases/databaseBackupWorkspaceService.js";
import { DatabaseInventoryService } from "../../apps/controller/dist/modules/databases/databaseInventoryService.js";
import { DatabaseOperationService } from "../../apps/controller/dist/modules/databases/databaseOperationService.js";
import { SqliteDatabaseRepository } from "../../apps/controller/dist/repositories/sqliteDatabaseRepository.js";
import { routeDatabaseRequest } from "../../apps/controller/dist/http/databaseRouter.js";

const migrationUrl=new URL("../../apps/controller/src/database/migrations/004_databases.sql",import.meta.url);
function response(){return{statusCode:0,headers:new Map(),body:"",setHeader(name,value){this.headers.set(name.toLowerCase(),value);},end(body=""){this.body=String(body);}};}

async function fixture(){
  const database=openDatabase(":memory:");migrateDatabase(database,[{version:4,name:"databases",sql:await readFile(migrationUrl,"utf8")}]);const identity=new IdentityService(database,Buffer.alloc(32,3));
  await identity.createInitialAdministrator("admin","Admin","correct horse battery staple");const principal=(await identity.login("admin","correct horse battery staple","test","ua")).principal;
  const nodeId=crypto.randomUUID(),now=new Date().toISOString(),node={nodeId,nodeName:"db-node",status:"online",agentVersion:"0.3.0",protocolVersion:"1.1",platform:"linux",declaredCapabilities:[],allowedCapabilities:[],enrolledAt:now,lastSeenAt:now,revokedAt:null};database.prepare("INSERT INTO agent_nodes(node_id,payload,revoked_at,updated_at)VALUES(?,?,NULL,?)").run(nodeId,JSON.stringify(node),now);
  const repository=new SqliteDatabaseRepository(database,Buffer.alloc(32,5)),inventory=new DatabaseInventoryService(repository);inventory.ingestSnapshot(nodeId,{collectedAt:now,collectionStatus:"complete",warnings:[],instances:[{id:"postgres-main",name:"main",engine:"postgresql",version:"16.9",host:"db-node",port:5432,status:"running",source:"postgresql",managed:true,historicalSlowQueriesAvailable:true,latencyMs:1,storageBytes:100,activeConnections:1,maxConnections:100,slowQueryCount:1,backupStatus:"pending",lastBackupAt:null,accessMode:"read-write",owner:null,region:null,autoBackup:false,remoteAccess:true,volumes:[]}]});
  inventory.ingestQueryUpload(nodeId,{collectedAt:now,collectionStatus:"complete",warnings:[],sessions:[],queries:[{id:"q",instanceLocalId:"postgres-main",database:"app",fingerprint:"fp",sql:"SELECT secret_value FROM accounts",durationMs:2000,calls:null,p95Ms:null,rowsExamined:null,risk:"low",state:"active",owner:null,startedAt:now,lastSeenAt:now,sessionId:null,waitEvent:null,historical:false}]});
  const services={databaseInventory:inventory,databaseWorkspace:new DatabaseBackupWorkspaceService(repository),databaseOperations:new DatabaseOperationService(repository,{list:async()=>[node]})};
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
