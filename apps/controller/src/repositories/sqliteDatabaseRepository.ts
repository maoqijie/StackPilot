import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import {
  AgentDatabaseOperationDispatchSchema, BusinessDatabaseBackupPlanSchema, DatabaseBackupJobSchema, DatabaseInstanceRecordSchema, DatabaseOperationPlanSchema,
  DatabaseOperationSchema, DatabaseRestorePointSchema, DatabaseSessionSchema, DatabaseSlowQueryMetadataSchema,
  DatabaseSlowQueryRecordSchema, type AgentDatabaseQueryUpload, type AgentDatabaseSnapshot, type BusinessDatabaseBackupPlan,
  type CreateBusinessDatabaseBackupPlanRequest, type CreateDatabaseOperationPlanRequest, type DatabaseBackupJob,
  type DatabaseInstanceRecord, type DatabaseOperation, type DatabaseOperationPlan, type DatabaseRestorePoint, type DatabaseSession,
  type DatabaseSlowQueryRecord, type UpdateBusinessDatabaseBackupPlanRequest, type AgentDatabaseOperationUpdate, type DatabaseOperationKind,
} from "@stackpilot/contracts";
import { decryptValue, deriveKey, encryptValue } from "../security/crypto.js";
import { DatabaseRepositoryError, type CreatePlanRecord, type DatabaseAccess, type DatabaseRepository } from "./databaseRepository.js";

type Row = Record<string, unknown>;
const instanceId = (nodeId: string, localId: string) => `database-${createHash("sha256").update(`${nodeId}\0${localId}`).digest("hex").slice(0, 32)}`;
const scopeSql = (scope: DatabaseAccess["nodeScope"], column = "i.node_id") => scope === "all"
  ? { clause: "", values: [] as string[] }
  : { clause: ` AND ${column} IN (${scope.map(() => "?").join(",") || "NULL"})`, values: [...scope] };

export class SqliteDatabaseRepository implements DatabaseRepository {
  private readonly sqlKey: Buffer;
  private readonly planKey: Buffer;
  constructor(private readonly database: Database.Database, masterKey: Buffer) {
    this.sqlKey = deriveKey(masterKey, "database-sql-v1");
    this.planKey = deriveKey(masterKey, "database-plan-v1");
  }

  saveSnapshot(nodeId: string, snapshot: AgentDatabaseSnapshot): void {
    const now = new Date().toISOString();
    this.database.transaction(() => {
      const nodeRow = this.database.prepare("SELECT payload FROM agent_nodes WHERE node_id=? AND revoked_at IS NULL").get(nodeId) as { payload: string } | undefined;
      if (!nodeRow) throw new DatabaseRepositoryError(404, "NOT_FOUND", "数据库快照节点不存在或已撤销");
      const node = JSON.parse(nodeRow.payload) as { nodeName?: string; telemetry?: { hostname?: string; primaryIp?: string | null } };
      const nodeName = node.nodeName ?? node.telemetry?.hostname ?? nodeId;
      const address = node.telemetry?.primaryIp ?? null;
      for (const item of snapshot.instances) {
        const record = DatabaseInstanceRecordSchema.parse({ ...item, id: instanceId(nodeId, item.id), localId: item.id, nodeId, nodeName, address, collectedAt: snapshot.collectedAt, freshness: "current" });
        this.database.prepare(`INSERT INTO database_instances(id,node_id,local_id,snapshot,managed,collected_at,updated_at) VALUES(?,?,?,?,?,?,?)
          ON CONFLICT(node_id,local_id) DO UPDATE SET snapshot=excluded.snapshot,managed=excluded.managed,collected_at=excluded.collected_at,updated_at=excluded.updated_at`)
          .run(record.id, nodeId, item.id, JSON.stringify(record), item.managed ? 1 : 0, snapshot.collectedAt, now);
      }
    })();
  }

  saveQueryUpload(nodeId: string, upload: AgentDatabaseQueryUpload): void {
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    this.database.transaction(() => {
      const ids = new Map((this.database.prepare("SELECT id,local_id FROM database_instances WHERE node_id=?").all(nodeId) as Array<{id:string;local_id:string}>).map((row) => [row.local_id, row.id]));
      this.database.prepare("DELETE FROM database_sessions WHERE instance_id IN (SELECT id FROM database_instances WHERE node_id=?)").run(nodeId);
      for (const session of upload.sessions) {
        const mapped = ids.get(session.instanceLocalId); if (!mapped) throw new DatabaseRepositoryError(409, "BAD_REQUEST", "查询上传引用了未知数据库实例");
        const record = DatabaseSessionSchema.parse({ id:session.id,instanceId:mapped,database:session.database,username:session.username,
          applicationName:session.applicationName,clientAddress:session.clientAddress,state:session.state,startedAt:session.startedAt,
          transactionStartedAt:session.transactionStartedAt,protected:session.protected,protectedReason:session.protectedReason });
        this.database.prepare("INSERT INTO database_sessions(id,instance_id,snapshot,collected_at) VALUES(?,?,?,?)").run(record.id, mapped, JSON.stringify(record), upload.collectedAt);
      }
      for (const query of upload.queries) {
        const mapped = ids.get(query.instanceLocalId); if (!mapped) throw new DatabaseRepositoryError(409, "BAD_REQUEST", "查询上传引用了未知数据库实例");
        const queryId = `query-${createHash("sha256").update(`${nodeId}\0${query.id}`).digest("hex").slice(0, 32)}`;
        const metadata = DatabaseSlowQueryMetadataSchema.parse({ id:queryId,instanceId:mapped,database:query.database,fingerprint:query.fingerprint,
          durationMs:query.durationMs,calls:query.calls,p95Ms:query.p95Ms,rowsExamined:query.rowsExamined,risk:query.risk,state:query.state,
          owner:query.owner,startedAt:query.startedAt,lastSeenAt:query.lastSeenAt,sessionId:query.sessionId,waitEvent:query.waitEvent,
          resolvedAt:null,historical:query.historical });
        const encrypted = encryptValue(this.sqlKey, Buffer.from(query.sql, "utf8"));
        this.database.prepare(`INSERT INTO database_slow_queries(id,instance_id,metadata,sql_key_version,sql_nonce,sql_ciphertext,sql_tag,sql_expires_at,first_seen_at,last_seen_at,resolved_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET instance_id=excluded.instance_id,metadata=excluded.metadata,sql_key_version=excluded.sql_key_version,
          sql_nonce=excluded.sql_nonce,sql_ciphertext=excluded.sql_ciphertext,sql_tag=excluded.sql_tag,sql_expires_at=excluded.sql_expires_at,last_seen_at=excluded.last_seen_at`)
          .run(queryId, mapped, JSON.stringify(metadata), encrypted.keyVersion, encrypted.nonce, encrypted.ciphertext, encrypted.tag, expiresAt, query.startedAt, query.lastSeenAt);
      }
    })();
  }

  listInstances(nodeScope: DatabaseAccess["nodeScope"]): DatabaseInstanceRecord[] {
    const scope = scopeSql(nodeScope, "node_id");
    const rows = this.database.prepare(`SELECT snapshot,collected_at FROM database_instances WHERE 1=1${scope.clause} ORDER BY collected_at DESC`).all(...scope.values) as Array<{snapshot:string;collected_at:string}>;
    return rows.map((row) => {
      const parsed = DatabaseInstanceRecordSchema.parse(JSON.parse(row.snapshot));
      return { ...parsed, freshness: Date.now() - Date.parse(row.collected_at) > 120_000 ? "stale" : "current" };
    });
  }

  findInstance(id: string, nodeScope: DatabaseAccess["nodeScope"]): DatabaseInstanceRecord | null {
    return this.listInstances(nodeScope).find((item) => item.id === id) ?? null;
  }
  listSessions(instanceIdValue: string): DatabaseSession[] {
    return (this.database.prepare("SELECT snapshot FROM database_sessions WHERE instance_id=? ORDER BY collected_at DESC").all(instanceIdValue) as Array<{snapshot:string}>).map((row) => DatabaseSessionSchema.parse(JSON.parse(row.snapshot)));
  }
  listQueries(nodeScope: DatabaseAccess["nodeScope"], range: "24h" | "7d", includeSql: boolean): DatabaseSlowQueryRecord[] {
    this.purgeExpiredSql(new Date().toISOString());
    const scope = scopeSql(nodeScope); const since = new Date(Date.now() - (range === "24h" ? 1 : 7) * 86_400_000).toISOString();
    const rows = this.database.prepare(`SELECT q.* FROM database_slow_queries q JOIN database_instances i ON i.id=q.instance_id WHERE q.last_seen_at>=?${scope.clause} ORDER BY q.last_seen_at DESC LIMIT 10000`).all(since, ...scope.values) as Row[];
    return rows.map((row) => {
      const metadata = DatabaseSlowQueryMetadataSchema.parse(JSON.parse(row.metadata as string));
      let sql: string | null = null;
      if (includeSql && row.sql_ciphertext && row.sql_nonce && row.sql_tag && row.sql_expires_at && Date.parse(row.sql_expires_at as string) > Date.now()) {
        sql = decryptValue(this.sqlKey, { keyVersion: row.sql_key_version as number, nonce: row.sql_nonce as Buffer, ciphertext: row.sql_ciphertext as Buffer, tag: row.sql_tag as Buffer }).toString("utf8");
      }
      return DatabaseSlowQueryRecordSchema.parse({ ...metadata, resolvedAt: row.resolved_at as string | null, sql });
    });
  }
  findQuery(id:string,nodeScope:DatabaseAccess["nodeScope"],includeSql:boolean){return this.listQueries(nodeScope,"7d",includeSql).find((item)=>item.id===id)??null;}
  resolveQuery(id: string, at: string): DatabaseSlowQueryRecord | null {
    const result = this.database.prepare("UPDATE database_slow_queries SET resolved_at=? WHERE id=?").run(at, id);
    if (!result.changes) return null;
    const row = this.database.prepare("SELECT metadata,resolved_at FROM database_slow_queries WHERE id=?").get(id) as {metadata:string;resolved_at:string};
    return DatabaseSlowQueryRecordSchema.parse({ ...DatabaseSlowQueryMetadataSchema.parse(JSON.parse(row.metadata)), state: "resolved", resolvedAt: row.resolved_at, sql: null });
  }

  createBackupPlan(input: CreateBusinessDatabaseBackupPlanRequest, now: string): BusinessDatabaseBackupPlan {
    const plan = BusinessDatabaseBackupPlanSchema.parse({ id: randomUUID(), ...input, version: 1, lastRunAt: null, nextRunAt: null, createdAt: now, updatedAt: now });
    this.database.prepare("INSERT INTO database_backup_plans VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(plan.id,plan.instanceId,plan.name,plan.cron,plan.retentionCount,plan.enabled?1:0,plan.version,plan.lastRunAt,plan.nextRunAt,plan.createdAt,plan.updatedAt);
    return plan;
  }
  updateBackupPlan(id: string, input: UpdateBusinessDatabaseBackupPlanRequest, now: string): BusinessDatabaseBackupPlan | null {
    const current = this.database.prepare("SELECT * FROM database_backup_plans WHERE id=?").get(id) as Row | undefined; if (!current) return null;
    if (current.version !== input.version) throw new DatabaseRepositoryError(409,"BAD_REQUEST","备份计划版本已变化，请刷新后重试");
    const next = BusinessDatabaseBackupPlanSchema.parse({ id, instanceId:current.instance_id, name:input.name??current.name, cron:input.cron??current.cron, retentionCount:input.retentionCount??current.retention_count, enabled:input.enabled??Boolean(current.enabled), version:input.version+1, lastRunAt:current.last_run_at, nextRunAt:current.next_run_at, createdAt:current.created_at, updatedAt:now });
    this.database.prepare("UPDATE database_backup_plans SET name=?,cron=?,retention_count=?,enabled=?,version=?,updated_at=? WHERE id=? AND version=?").run(next.name,next.cron,next.retentionCount,next.enabled?1:0,next.version,now,id,input.version);
    return next;
  }
  listBackupPlans(nodeScope: DatabaseAccess["nodeScope"]): BusinessDatabaseBackupPlan[] {
    const scope=scopeSql(nodeScope);return (this.database.prepare(`SELECT p.* FROM database_backup_plans p JOIN database_instances i ON i.id=p.instance_id WHERE 1=1${scope.clause} ORDER BY p.created_at DESC`).all(...scope.values) as Row[]).map(this.backupPlan);
  }
  createBackupJob(plan: BusinessDatabaseBackupPlan, operationId: string, now: string): DatabaseBackupJob {
    const job=DatabaseBackupJobSchema.parse({id:randomUUID(),planId:plan.id,instanceId:plan.instanceId,status:"queued",startedAt:null,completedAt:null,sizeBytes:null,errorCode:null,manifestVersion:null,checksum:null});
    this.database.transaction(()=>{this.database.prepare("INSERT INTO database_backup_jobs(id,plan_id,instance_id,operation_id,status,created_at)VALUES(?,?,?,?,?,?)").run(job.id,plan.id,plan.instanceId,operationId,job.status,now);this.database.prepare("UPDATE database_backup_plans SET last_run_at=?,updated_at=?,version=version+1 WHERE id=?").run(now,now,plan.id);})();return job;
  }
  findBackupJobByOperation(operationId:string):DatabaseBackupJob|null{const row=this.database.prepare("SELECT * FROM database_backup_jobs WHERE operation_id=?").get(operationId)as Row|undefined;return row?DatabaseBackupJobSchema.parse({id:row.id,planId:row.plan_id,instanceId:row.instance_id,status:row.status,startedAt:row.started_at,completedAt:row.completed_at,sizeBytes:row.size_bytes,errorCode:row.error_code,manifestVersion:row.manifest_version,checksum:row.checksum}):null;}
  listBackupJobs(nodeScope:DatabaseAccess["nodeScope"]):DatabaseBackupJob[]{const scope=scopeSql(nodeScope);return(this.database.prepare(`SELECT j.* FROM database_backup_jobs j JOIN database_instances i ON i.id=j.instance_id WHERE 1=1${scope.clause} ORDER BY j.created_at DESC LIMIT 10000`).all(...scope.values)as Row[]).map(row=>DatabaseBackupJobSchema.parse({id:row.id,planId:row.plan_id,instanceId:row.instance_id,status:row.status,startedAt:row.started_at,completedAt:row.completed_at,sizeBytes:row.size_bytes,errorCode:row.error_code,manifestVersion:row.manifest_version,checksum:row.checksum}));}
  listRestorePoints(nodeScope:DatabaseAccess["nodeScope"]):DatabaseRestorePoint[]{const scope=scopeSql(nodeScope);return(this.database.prepare(`SELECT r.* FROM database_restore_points r JOIN database_instances i ON i.id=r.instance_id WHERE 1=1${scope.clause} ORDER BY r.created_at DESC LIMIT 10000`).all(...scope.values)as Row[]).map(row=>DatabaseRestorePointSchema.parse({id:row.id,jobId:row.job_id,instanceId:row.instance_id,createdAt:row.created_at,sizeBytes:row.size_bytes,checksum:row.checksum,databaseVersion:row.database_version,manifestVersion:row.manifest_version,verifiedAt:row.verified_at,drillStatus:row.drill_status,drilledAt:row.drilled_at}));}
  findRestorePoint(id:string,nodeScope:DatabaseAccess["nodeScope"]){return this.listRestorePoints(nodeScope).find((item)=>item.id===id)??null;}

  createOperationPlan(record: CreatePlanRecord): DatabaseOperationPlan {
    const id=randomUUID(),encrypted=encryptValue(this.planKey,Buffer.from(JSON.stringify(record.input)));const plan=DatabaseOperationPlanSchema.parse({id,kind:record.input.kind,nodeId:record.nodeId,instanceId:record.instanceId,target:record.target,impact:record.impact,version:1,expiresAt:record.expiresAt,createdAt:record.now,executedAt:null});
    this.database.prepare(`INSERT INTO database_operation_plans(id,actor_user_id,node_id,instance_id,kind,target,impact,parameters_key_version,
      parameters_nonce,parameters_ciphertext,parameters_tag,version,expires_at,created_at,executed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)`)
      .run(id,record.actorUserId,record.nodeId,record.instanceId,plan.kind,plan.target,JSON.stringify(plan.impact),encrypted.keyVersion,encrypted.nonce,encrypted.ciphertext,encrypted.tag,plan.version,plan.expiresAt,plan.createdAt);return plan;
  }
  findOperationPlan(id:string){const row=this.database.prepare("SELECT * FROM database_operation_plans WHERE id=?").get(id)as Row|undefined;if(!row)return null;return{plan:this.operationPlan(row),input:JSON.parse(decryptValue(this.planKey,{keyVersion:row.parameters_key_version as number,nonce:row.parameters_nonce as Buffer,ciphertext:row.parameters_ciphertext as Buffer,tag:row.parameters_tag as Buffer}).toString())as CreateDatabaseOperationPlanRequest};}
  executeOperationPlan(planId:string,version:number,userId:string,idempotencyKey:string,requestId:string,now:string):DatabaseOperation{return this.database.transaction(()=>{const duplicate=this.operationByIdempotency(userId,idempotencyKey);if(duplicate)return duplicate;const found=this.findOperationPlan(planId);if(!found)throw new DatabaseRepositoryError(404,"NOT_FOUND","确认计划不存在");if((this.database.prepare("SELECT actor_user_id FROM database_operation_plans WHERE id=?").get(planId)as{actor_user_id:string}).actor_user_id!==userId)throw new DatabaseRepositoryError(403,"FORBIDDEN","确认计划不属于当前用户");if(found.plan.version!==version)throw new DatabaseRepositoryError(409,"BAD_REQUEST","确认计划版本已变化");if(found.plan.executedAt)throw new DatabaseRepositoryError(409,"BAD_REQUEST","确认计划已经执行");if(Date.parse(found.plan.expiresAt)<=Date.parse(now))throw new DatabaseRepositoryError(409,"BAD_REQUEST","确认计划已过期");const operation=this.insertOperation(found.plan.kind,found.plan.nodeId,found.plan.instanceId,userId,idempotencyKey,requestId,planId,now);this.database.prepare("UPDATE database_operation_plans SET executed_at=?,version=version+1 WHERE id=? AND version=? AND executed_at IS NULL").run(now,planId,version);return operation;})();}
  createDirectOperation(kind:"backup"|"explain",nodeId:string,instanceIdValue:string,userId:string,idempotencyKey:string,requestId:string,now:string,context:Record<string,string>):DatabaseOperation{return this.database.transaction(()=>this.operationByIdempotency(userId,idempotencyKey)??this.insertOperation(kind,nodeId,instanceIdValue,userId,idempotencyKey,requestId,null,now,context))();}
  findOperation(id:string,nodeScope:DatabaseAccess["nodeScope"]):DatabaseOperation|null{const scope=scopeSql(nodeScope,"node_id");const row=this.database.prepare(`SELECT * FROM database_operations WHERE id=?${scope.clause}`).get(id,...scope.values)as Row|undefined;return row?this.operation(row):null;}
  pollOperations(nodeId:string,limit:number,allowedKinds:readonly DatabaseOperationKind[]){return this.database.transaction(()=>{
    const now=new Date().toISOString(),leaseCutoff=new Date(Date.now()-30*60_000).toISOString();
    this.database.prepare("UPDATE database_operations SET status='failed',error_code='OPERATION_EXPIRED',error_message='数据库操作等待 Agent 超时',version=version+1,updated_at=?,completed_at=? WHERE node_id=? AND status='queued' AND expires_at<=?").run(now,now,nodeId,now);
    this.database.prepare("UPDATE database_operations SET status='failed',error_code='OPERATION_RESULT_UNKNOWN',error_message='Agent 未在租约期内回报，操作结果不确定且未自动重试',version=version+1,updated_at=?,completed_at=? WHERE node_id=? AND status='running' AND updated_at<=?").run(now,now,nodeId,leaseCutoff);
    const rows=this.database.prepare(`SELECT * FROM database_operations WHERE node_id=? AND status='queued' AND expires_at>? ORDER BY created_at LIMIT ?`).all(nodeId,new Date().toISOString(),limit)as Row[],dispatches=[];
    for(const row of rows){if(!allowedKinds.includes(row.kind as DatabaseOperationKind))continue;const version=(row.version as number)+1;
      this.database.prepare("UPDATE database_operations SET status='running',version=?,updated_at=? WHERE id=? AND status='queued' AND version=?").run(version,new Date().toISOString(),row.id,row.version);
      const instance=row.instance_id?this.database.prepare("SELECT local_id FROM database_instances WHERE id=?").get(row.instance_id)as{local_id:string}|undefined:undefined;
      const plan=row.plan_id?this.findOperationPlan(row.plan_id as string):null;let parameters:Record<string,unknown>;
      if(plan){const input=plan.input;if(input.kind==="install")parameters={kind:input.kind,engine:input.engine,name:input.name,port:input.port,initialDatabase:input.initialDatabase,credentialPublicKey:input.credentialPublicKey};
        else if(input.kind==="terminate-session")parameters={kind:input.kind,instanceLocalId:instance!.local_id,sessionId:input.sessionId};
        else if(input.kind==="create-index")parameters={kind:input.kind,instanceLocalId:instance!.local_id,table:input.table,columns:input.columns};
        else if(input.kind==="restore")parameters={kind:input.kind,instanceLocalId:instance!.local_id,restorePointId:input.restorePointId};
        else parameters={kind:input.kind,instanceLocalId:instance!.local_id};
      }else{const context=this.operationContext(row);if(row.kind==="backup"){const planRow=this.database.prepare("SELECT retention_count FROM database_backup_plans WHERE id=?").get(context.planId)as{retention_count:number}|undefined;if(!planRow)throw new DatabaseRepositoryError(409,"BAD_REQUEST","备份操作缺少计划");parameters={kind:"backup",instanceLocalId:instance!.local_id,retentionCount:planRow.retention_count};}
        else{if(!context.queryId)throw new DatabaseRepositoryError(409,"BAD_REQUEST","Explain 操作缺少查询引用");const query=this.findQuery(context.queryId,"all",true);if(!query?.sql)throw new DatabaseRepositoryError(409,"BAD_REQUEST","Explain 查询 SQL 已过期");parameters={kind:"explain",instanceLocalId:instance!.local_id,sql:query.sql};}}
      dispatches.push(AgentDatabaseOperationDispatchSchema.parse({operationId:row.id,version,kind:row.kind,parameters,idempotencyKey:row.idempotency_key,expiresAt:row.expires_at}));
    }return dispatches;
  })();}
  updateOperation(nodeId:string,update:AgentDatabaseOperationUpdate):DatabaseOperation{return this.database.transaction(()=>{const row=this.database.prepare("SELECT * FROM database_operations WHERE id=? AND node_id=?").get(update.operationId,nodeId)as Row|undefined;if(!row)throw new DatabaseRepositoryError(404,"NOT_FOUND","数据库操作不存在");const terminal=["succeeded","failed","cancelled"].includes(row.status as string);if(terminal&&row.status===update.status&&row.version===(update.version+1))return this.operation(row);if(row.version!==update.version)throw new DatabaseRepositoryError(409,"BAD_REQUEST","数据库操作版本不匹配");if(row.status===update.status)return this.operation(row);if(terminal)return this.operation(row);const allowed=row.status==="queued"?["running","succeeded","failed"]:row.status==="running"?["succeeded","failed"]:[];if(!allowed.includes(update.status))throw new DatabaseRepositoryError(409,"BAD_REQUEST","数据库操作状态转换无效");const credential=update.credentialEnvelope;if(credential&&row.kind!=="install")throw new DatabaseRepositoryError(400,"BAD_REQUEST","只有安装操作可以返回一次性凭据密文");if(credential&&(Date.parse(credential.expiresAt)>Date.parse(update.updatedAt)+5*60_000||Date.parse(credential.expiresAt)<=Date.parse(update.updatedAt)))throw new DatabaseRepositoryError(400,"BAD_REQUEST","一次性凭据密文有效期必须在五分钟内");this.database.prepare("UPDATE database_operations SET status=?,version=version+1,error_code=?,error_message=?,credential_ciphertext=?,credential_expires_at=?,updated_at=?,completed_at=? WHERE id=? AND version=?").run(update.status,update.errorCode,update.errorMessage,credential?.ciphertext??null,credential?.expiresAt??null,update.updatedAt,update.status==="running"?null:update.updatedAt,update.operationId,update.version);return this.operation(this.database.prepare("SELECT * FROM database_operations WHERE id=?").get(update.operationId)as Row);})();}
  purgeExpiredSql(now:string):number{return this.database.prepare("UPDATE database_slow_queries SET sql_key_version=NULL,sql_nonce=NULL,sql_ciphertext=NULL,sql_tag=NULL,sql_expires_at=NULL WHERE sql_expires_at IS NOT NULL AND sql_expires_at<=?").run(now).changes;}

  private backupPlan=(row:Row)=>BusinessDatabaseBackupPlanSchema.parse({id:row.id,instanceId:row.instance_id,name:row.name,cron:row.cron,retentionCount:row.retention_count,enabled:Boolean(row.enabled),version:row.version,lastRunAt:row.last_run_at,nextRunAt:row.next_run_at,createdAt:row.created_at,updatedAt:row.updated_at});
  private operationPlan(row:Row){return DatabaseOperationPlanSchema.parse({id:row.id,kind:row.kind,nodeId:row.node_id,instanceId:row.instance_id,target:row.target,impact:JSON.parse(row.impact as string),version:row.version,expiresAt:row.expires_at,createdAt:row.created_at,executedAt:row.executed_at});}
  private operation(row:Row){const credentialCurrent=row.credential_ciphertext&&row.credential_expires_at&&Date.parse(row.credential_expires_at as string)>Date.now();return DatabaseOperationSchema.parse({id:row.id,kind:row.kind,nodeId:row.node_id,instanceId:row.instance_id,status:row.status,version:row.version,errorCode:row.error_code,errorMessage:row.error_message,requestedBy:row.requested_by,requestId:row.request_id,createdAt:row.created_at,updatedAt:row.updated_at,completedAt:row.completed_at,credentialEnvelope:credentialCurrent?{algorithm:"RSA-OAEP-256",ciphertext:row.credential_ciphertext,expiresAt:row.credential_expires_at}:null});}
  private operationByIdempotency(userId:string,key:string){const row=this.database.prepare("SELECT * FROM database_operations WHERE requested_by=? AND idempotency_key=?").get(userId,key)as Row|undefined;return row?this.operation(row):null;}
  private operationContext(row:Row){if(!row.context_ciphertext||!row.context_nonce||!row.context_tag)return{} as Record<string,string>;return JSON.parse(decryptValue(this.planKey,{keyVersion:row.context_key_version as number,nonce:row.context_nonce as Buffer,ciphertext:row.context_ciphertext as Buffer,tag:row.context_tag as Buffer}).toString())as Record<string,string>;}
  private insertOperation(kind:string,nodeId:string,instanceIdValue:string|null,userId:string,key:string,requestId:string,planId:string|null,now:string,context?:Record<string,string>){const id=randomUUID(),encrypted=context?encryptValue(this.planKey,Buffer.from(JSON.stringify(context))):null,expiresAt=new Date(Date.parse(now)+30*60_000).toISOString();this.database.prepare(`INSERT INTO database_operations(id,plan_id,node_id,instance_id,kind,status,requested_by,request_id,idempotency_key,context_key_version,context_nonce,context_ciphertext,context_tag,created_at,updated_at,expires_at)VALUES(?,?,?,?,?,'queued',?,?,?,?,?,?,?,?,?,?)`).run(id,planId,nodeId,instanceIdValue,kind,userId,requestId,key,encrypted?.keyVersion??null,encrypted?.nonce??null,encrypted?.ciphertext??null,encrypted?.tag??null,now,now,expiresAt);return this.operation(this.database.prepare("SELECT * FROM database_operations WHERE id=?").get(id)as Row);}
}
