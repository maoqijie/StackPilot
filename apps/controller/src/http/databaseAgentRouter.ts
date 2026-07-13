import { AgentDatabaseOperationPollRequestSchema, AgentDatabaseOperationPollResponseSchema, AgentDatabaseOperationStatusResponseSchema, AgentDatabaseOperationUpdateSchema, AgentDatabaseQueryUploadSchema, AgentDatabaseSnapshotSchema, AgentDatabaseUploadResponseSchema } from "@stackpilot/contracts";
import type { RequestContext } from "./types.js";
import { ServiceError } from "../modules/serviceError.js";
import { notFound } from "./errors/ApiError.js";
import { sendJson } from "./response/json.js";
import { parseSchema } from "./validation.js";
import { DatabaseRepositoryError } from "../repositories/databaseRepository.js";

async function routeDatabaseAgentRequestInner(context:RequestContext){
  const service=context.services.databaseInventory;if(!service)throw new ServiceError(503,"NOT_READY","数据库控制面尚未就绪");
  if(!context.agentIdentity)throw new ServiceError(401,"UNAUTHORIZED","Agent 身份不可用");const method=context.request.method??"GET";
  if(context.url.pathname==="/api/agent/databases/snapshot"&&method==="POST")service.ingestSnapshot(context.agentIdentity.nodeId,parseSchema(AgentDatabaseSnapshotSchema,context.body,"数据库快照"));
  else if(context.url.pathname==="/api/agent/databases/queries"&&method==="POST")service.ingestQueryUpload(context.agentIdentity.nodeId,parseSchema(AgentDatabaseQueryUploadSchema,context.body,"数据库查询上传"));
  else if(context.url.pathname==="/api/agent/databases/operations/status"&&method==="POST"){
    const operations=context.services.databaseOperations;if(!operations)throw new ServiceError(503,"NOT_READY","数据库操作控制面尚未就绪");
    const update=parseSchema(AgentDatabaseOperationUpdateSchema,context.body,"数据库操作状态");
    operations.updateFromAgent(context.agentIdentity.nodeId,update);sendJson(context.response,200,{acceptedAt:new Date().toISOString()},AgentDatabaseOperationStatusResponseSchema);return;
  }
  else if(context.url.pathname==="/api/agent/databases/operations/poll"&&method==="POST"){
    const operations=context.services.databaseOperations;if(!operations)throw new ServiceError(503,"NOT_READY","数据库操作控制面尚未就绪");
    const input=parseSchema(AgentDatabaseOperationPollRequestSchema,context.body,"数据库操作拉取请求");
    sendJson(context.response,200,{operations:await operations.poll(context.agentIdentity.nodeId,input.limit),controllerTime:new Date().toISOString()},AgentDatabaseOperationPollResponseSchema);return;
  }
  else throw notFound("Agent 数据库接口不存在");
  sendJson(context.response,202,{acceptedAt:new Date().toISOString()},AgentDatabaseUploadResponseSchema);
}
export async function routeDatabaseAgentRequest(context:RequestContext){try{return await routeDatabaseAgentRequestInner(context);}catch(error){if(error instanceof DatabaseRepositoryError)throw new ServiceError(error.status,error.code,error.message);throw error;}}
