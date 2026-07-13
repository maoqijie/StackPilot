import {
  BusinessDatabaseBackupPlanResponseSchema, BusinessDatabaseBackupsPayloadSchema, CreateBusinessDatabaseBackupPlanRequestSchema,
  CreateDatabaseOperationPlanRequestSchema, DatabaseIdSchema, DatabaseInstanceDetailSchema, DatabaseInstancesPayloadSchema, DatabaseQueryRangeSchema,
  DatabaseOperationPlanResponseSchema, DatabaseOperationResponseSchema, DatabaseSlowQueriesPayloadSchema, DatabaseSlowQueryResponseSchema,
  ExecuteDatabaseOperationPlanRequestSchema, ExplainDatabaseQueryRequestSchema, PathIdSchema, ResolveDatabaseQueryRequestSchema,
  RunBusinessDatabaseBackupPlanRequestSchema, RunBusinessDatabaseBackupPlanResponseSchema, UpdateBusinessDatabaseBackupPlanRequestSchema,
  type Permission,
} from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";
import { ServiceError } from "../modules/serviceError.js";
import { DatabaseRepositoryError } from "../repositories/databaseRepository.js";

const id = (context:RequestContext,index:number,database=false) => parseSchema(database?DatabaseIdSchema:PathIdSchema,decodeURIComponent(context.parts[index]??""),"路径参数");
const requireServices=(context:RequestContext)=>{
  const inventory=context.services.databaseInventory,workspace=context.services.databaseWorkspace,operations=context.services.databaseOperations;
  if(!inventory||!workspace||!operations)throw new ServiceError(503,"NOT_READY","数据库控制面尚未就绪");return{inventory,workspace,operations};
};
function requirePermission(context:RequestContext,permission:Permission,nodeId?:string){context.identity?.require(context.principal,permission,nodeId);}
function operator(context:RequestContext){if(!context.principal)throw new ServiceError(401,"UNAUTHORIZED","需要登录");return{userId:context.principal.userId,principalType:context.principal.type,nodeScope:context.principal.nodeScope,permissions:context.principal.permissions};}
function noStore(context:RequestContext){context.response.setHeader("Cache-Control","no-store");}

async function routeDatabaseRequestInner(context:RequestContext){
  const method=context.request.method??"GET",{parts,response}=context,{inventory,workspace,operations}=requireServices(context);noStore(context);
  requirePermission(context,"databases:read");const scope=context.principal!.nodeScope;
  if(parts.length===2&&method==="GET"){sendJson(response,200,inventory.list(scope),DatabaseInstancesPayloadSchema);return;}
  if(parts[2]==="slow-queries"&&parts.length===3&&method==="GET"){
    const parsed=parseSchema(DatabaseQueryRangeSchema,context.url.searchParams.get("range")??"24h","查询范围");
    const includeSql=Boolean(context.principal?.permissions.has("databases:sql:read"));sendJson(response,200,inventory.slowQueries(scope,parsed,includeSql),DatabaseSlowQueriesPayloadSchema);return;
  }
  if(parts[2]==="backups"){
    if(parts.length===3&&method==="GET"){requirePermission(context,"databases:backup");sendJson(response,200,workspace.list(scope),BusinessDatabaseBackupsPayloadSchema);return;}
  }
  if(parts[2]==="backup-plans"){
    requirePermission(context,"databases:backup");
    if(parts.length===3&&method==="POST"){const plan=workspace.create(parseSchema(CreateBusinessDatabaseBackupPlanRequestSchema,context.body,"备份计划"),scope);sendJson(response,201,{plan},BusinessDatabaseBackupPlanResponseSchema);return;}
    if(parts.length===4&&method==="PATCH"){const plan=workspace.update(id(context,3),parseSchema(UpdateBusinessDatabaseBackupPlanRequestSchema,context.body,"备份计划"),scope);sendJson(response,200,{plan},BusinessDatabaseBackupPlanResponseSchema);return;}
    if(parts[4]==="run"&&parts.length===5&&method==="POST"){const input=parseSchema(RunBusinessDatabaseBackupPlanRequestSchema,context.body,"运行备份计划请求");sendJson(response,202,workspace.run(id(context,3),context.principal!.userId,input.idempotencyKey,context.requestId,scope),RunBusinessDatabaseBackupPlanResponseSchema);return;}
  }
  if(parts[2]==="queries"&&parts.length===5&&method==="POST"){
    const queryId=id(context,3);if(parts[4]==="explain"){requirePermission(context,"databases:operate");const input=parseSchema(ExplainDatabaseQueryRequestSchema,context.body,"Explain 请求");sendJson(response,202,{operation:await operations.explain(queryId,operator(context),input.idempotencyKey,context.requestId)},DatabaseOperationResponseSchema);return;}
    if(parts[4]==="resolve"){requirePermission(context,"databases:operate");parseSchema(ResolveDatabaseQueryRequestSchema,context.body,"查询处置请求");sendJson(response,200,{query:inventory.resolveQuery(queryId,scope)},DatabaseSlowQueryResponseSchema);return;}
  }
  if(parts[2]==="operation-plans"){
    if(parts.length===3&&method==="POST"){
      const input=parseSchema(CreateDatabaseOperationPlanRequestSchema,context.body,"数据库操作计划");requirePermission(context,input.kind==="install"?"databases:install":input.kind==="restore"?"databases:restore":"databases:operate");
      sendJson(response,201,{plan:await operations.createPlan(input,operator(context),context.requestId)},DatabaseOperationPlanResponseSchema);return;
    }
    if(parts[4]==="execute"&&parts.length===5&&method==="POST"){
      const input=parseSchema(ExecuteDatabaseOperationPlanRequestSchema,context.body,"数据库操作确认");if(input.planId!==id(context,3))throw new ServiceError(409,"BAD_REQUEST","路径计划 ID 与请求体不匹配");
      const found=context.services.databaseOperations!;sendJson(response,202,{operation:await found.execute(input,operator(context),context.requestId)},DatabaseOperationResponseSchema);return;
    }
  }
  if(parts[2]==="operations"&&parts.length===4&&method==="GET"){
    const operation=operations.get(id(context,3),scope),canReadCredentials=context.principal?.type==="session"&&context.principal.permissions.has("databases:install");
    sendJson(response,200,{operation:canReadCredentials?operation:{...operation,credentialEnvelope:null}},DatabaseOperationResponseSchema);return;
  }
  if(parts.length===3&&method==="GET"){const includeSql=Boolean(context.principal?.permissions.has("databases:sql:read"));sendJson(response,200,inventory.detail(id(context,2,true),scope,includeSql),DatabaseInstanceDetailSchema);return;}
  throw notFound("数据库接口不存在");
}
export async function routeDatabaseRequest(context:RequestContext){try{return await routeDatabaseRequestInner(context);}catch(error){if(error instanceof DatabaseRepositoryError)throw new ServiceError(error.status,error.code,error.message);throw error;}}
