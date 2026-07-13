import type {
  AgentDatabaseOperationUpdate, CreateDatabaseOperationPlanRequest, DatabaseOperation, ExecuteDatabaseOperationPlanRequest, NodeScope, Permission,
} from "@stackpilot/contracts";
import type { AuditRepository } from "../../audit/auditRepository.js";
import type { DatabaseRepository } from "../../repositories/databaseRepository.js";
import { ServiceError } from "../serviceError.js";

export type DatabaseOperator = { userId: string; principalType: "session" | "api-token"; nodeScope: NodeScope; permissions: ReadonlySet<Permission> };
export type DatabaseOperationDispatcher = { dispatch(operation: DatabaseOperation, input: CreateDatabaseOperationPlanRequest | { kind:"backup"|"explain" }): Promise<void> };
type NodeLookup = { list(): Promise<Array<{nodeId:string;revokedAt:string|null}>> };

function ensureNodeScope(scope:NodeScope,nodeId:string){if(scope!=="all"&&!scope.includes(nodeId))throw new ServiceError(403,"FORBIDDEN","节点超出授权范围");}
function requireSession(operator:DatabaseOperator){if(operator.principalType!=="session")throw new ServiceError(403,"FORBIDDEN","高风险数据库操作必须使用用户会话");}
function permissionFor(kind:CreateDatabaseOperationPlanRequest["kind"]):Permission{return kind==="install"?"databases:install":kind==="restore"?"databases:restore":"databases:operate";}
function requirePermission(operator:DatabaseOperator,kind:CreateDatabaseOperationPlanRequest["kind"]){if(!operator.permissions.has(permissionFor(kind)))throw new ServiceError(403,"FORBIDDEN","数据库操作权限不足");}

export class DatabaseOperationService {
  constructor(private readonly repository:DatabaseRepository,private readonly nodes:NodeLookup,private readonly audit?:AuditRepository,private readonly dispatcher?:DatabaseOperationDispatcher){}
  async createPlan(input:CreateDatabaseOperationPlanRequest,operator:DatabaseOperator,requestId:string){
    requireSession(operator);requirePermission(operator,input.kind);let nodeId:string,instanceId:string|null=null,target:string,impact:string[];
    if(input.kind==="install"){
      nodeId=input.nodeId;ensureNodeScope(operator.nodeScope,nodeId);if(!(await this.nodes.list()).some((node)=>node.nodeId===nodeId&&!node.revokedAt))throw new ServiceError(404,"NOT_FOUND","目标节点不存在或已撤销");
      target=`${input.engine} / ${input.name}`;impact=["将在目标节点安装发行版数据库包并创建独立实例",`实例将监听全部地址${input.port?`，端口 ${input.port}`:"，端口由节点选择最低空闲值"}`,"StackPilot 不修改主机防火墙，执行前必须确认公网暴露风险"];
    }else{
      const instance=this.repository.findInstance(input.instanceId,operator.nodeScope);if(!instance)throw new ServiceError(404,"NOT_FOUND","数据库实例不存在或超出节点授权范围");
      nodeId=instance.nodeId;instanceId=instance.id;target=`${instance.name} / ${instance.host}:${instance.port??"未知端口"}`;
      if(input.kind==="restore"){
        if(!instance.managed)throw new ServiceError(409,"BAD_REQUEST","非 StackPilot 受管实例禁止原地恢复");
        const point=this.repository.findRestorePoint(input.restorePointId,operator.nodeScope);if(!point||point.instanceId!==instance.id)throw new ServiceError(404,"NOT_FOUND","恢复点不存在或不属于目标实例");
        impact=["将停止数据库服务并替换数据目录","恢复失败会自动回滚旧目录","成功后回滚副本保留 24 小时"];
      }else if(input.kind==="terminate-session"){
        const session=this.repository.listSessions(instance.id).find((item)=>item.id===input.sessionId);if(!session)throw new ServiceError(404,"NOT_FOUND","数据库会话不存在");
        if(session.protected)throw new ServiceError(409,"BAD_REQUEST",`受保护的系统会话不能终止：${session.protectedReason??"系统连接"}`);
        impact=["目标数据库会话将立即终止","未提交事务将回滚"];
      }else if(input.kind==="create-index"){
        const query=this.repository.findQuery(input.queryId,operator.nodeScope,false);if(!query||query.instanceId!==instance.id)throw new ServiceError(404,"NOT_FOUND","慢查询不存在或不属于目标实例");
        impact=["将在目标表创建固定列索引",instance.engine==="postgresql"?"使用 CREATE INDEX CONCURRENTLY":"仅在引擎支持无阻塞算法时执行，否则任务失败且不修改结构"];
      }else impact=input.kind==="set-read-only"?["新事务将切换为只读","业务连接可能需要重新建立"]:["新事务将恢复读写","业务连接可能需要重新建立"];
    }
    const now=new Date().toISOString(),plan=this.repository.createOperationPlan({actorUserId:operator.userId,nodeId,instanceId,input,target,impact,now,expiresAt:new Date(Date.now()+5*60_000).toISOString()});
    this.audit?.append({actorType:"user",actorId:operator.userId,source:"database-controller",targetType:"database-operation-plan",targetId:plan.id,action:"database.plan.created",parameters:{kind:plan.kind,nodeId,instanceId},outcome:"created",authorization:"session+rbac+node-scope",requestId});return plan;
  }
  async execute(input:ExecuteDatabaseOperationPlanRequest,operator:DatabaseOperator,requestId:string){
    requireSession(operator);const found=this.repository.findOperationPlan(input.planId);if(!found)throw new ServiceError(404,"NOT_FOUND","确认计划不存在");requirePermission(operator,found.input.kind);ensureNodeScope(operator.nodeScope,found.plan.nodeId);
    const operation=this.repository.executeOperationPlan(input.planId,input.version,operator.userId,input.idempotencyKey,requestId,new Date().toISOString());
    this.audit?.append({actorType:"user",actorId:operator.userId,source:"database-controller",targetType:"database-operation",targetId:operation.id,action:"database.operation.queued",parameters:{kind:operation.kind,nodeId:operation.nodeId,instanceId:operation.instanceId},outcome:"queued",authorization:"session+csrf+rbac+node-scope+plan",requestId});
    if(this.dispatcher)await this.dispatcher.dispatch(operation,found.input);return operation;
  }
  get(id:string,nodeScope:NodeScope){const operation=this.repository.findOperation(id,nodeScope);if(!operation)throw new ServiceError(404,"NOT_FOUND","数据库操作不存在或超出节点授权范围");return operation;}
  async poll(nodeId:string,limit:number){const node=(await this.nodes.list()).find((item)=>item.nodeId===nodeId&&!item.revokedAt);if(!node)throw new ServiceError(401,"UNAUTHORIZED","节点不存在或已撤销");
    const declared="declaredCapabilities" in node&&Array.isArray(node.declaredCapabilities)?node.declaredCapabilities:[],allowed="allowedCapabilities" in node&&Array.isArray(node.allowedCapabilities)?node.allowedCapabilities:[];
    const has=(capability:string)=>declared.includes(capability)&&allowed.includes(capability),kinds:DatabaseOperation["kind"][]=[];
    if(has("database.backup"))kinds.push("backup");if(has("database.operate"))kinds.push("set-read-only","set-read-write","terminate-session","create-index","explain");if(has("database.install"))kinds.push("install");if(has("database.restore"))kinds.push("restore");
    return this.repository.pollOperations(nodeId,limit,kinds);
  }
  updateFromAgent(nodeId:string,update:AgentDatabaseOperationUpdate){const operation=this.repository.updateOperation(nodeId,update);this.audit?.append({actorType:"agent",actorId:nodeId,source:"database-agent",targetType:"database-operation",targetId:operation.id,action:"database.operation.status",parameters:{kind:operation.kind,status:operation.status},outcome:operation.status,authorization:"signed-agent+node-match",requestId:operation.requestId});return operation;}
  async explain(queryId:string,operator:DatabaseOperator,idempotencyKey:string,requestId:string){
    if(!operator.permissions.has("databases:operate"))throw new ServiceError(403,"FORBIDDEN","数据库操作权限不足");
    const query=this.repository.findQuery(queryId,operator.nodeScope,false);if(!query)throw new ServiceError(404,"NOT_FOUND","慢查询不存在或超出节点授权范围");const instance=this.repository.findInstance(query.instanceId,operator.nodeScope);if(!instance)throw new ServiceError(404,"NOT_FOUND","数据库实例不存在");
    const operation=this.repository.createDirectOperation("explain",instance.nodeId,instance.id,operator.userId,idempotencyKey,requestId,new Date().toISOString(),{queryId});if(this.dispatcher)await this.dispatcher.dispatch(operation,{kind:"explain"});return operation;
  }
}
