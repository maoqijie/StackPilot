import { BusinessDatabaseBackupsPayloadSchema, type AgentDatabaseScheduledBackupReport, type CreateBusinessDatabaseBackupPlanRequest, type NodeScope, type UpdateBusinessDatabaseBackupPlanRequest } from "@stackpilot/contracts";
import type { AuditRepository } from "../../audit/auditRepository.js";
import type { DatabaseRepository } from "../../repositories/databaseRepository.js";
import { ServiceError } from "../serviceError.js";

export class DatabaseBackupWorkspaceService {
  constructor(private readonly repository: DatabaseRepository,private readonly audit?:AuditRepository) {}
  list(nodeScope: NodeScope) {
    const plans=this.repository.listBackupPlans(nodeScope),jobs=this.repository.listBackupJobs(nodeScope),restorePoints=this.repository.listRestorePoints(nodeScope);
    return BusinessDatabaseBackupsPayloadSchema.parse({ collectedAt:new Date().toISOString(),collectionStatus:"complete",warnings:[],plans,jobs,restorePoints });
  }
  create(input:CreateBusinessDatabaseBackupPlanRequest,nodeScope:NodeScope){
    const instance=this.repository.findInstance(input.instanceId,nodeScope);if(!instance)throw new ServiceError(404,"NOT_FOUND","数据库实例不存在或超出节点授权范围");
    return this.repository.createBackupPlan(input,new Date().toISOString());
  }
  update(id:string,input:UpdateBusinessDatabaseBackupPlanRequest,nodeScope:NodeScope){
    const existing=this.repository.listBackupPlans(nodeScope).find((item)=>item.id===id);if(!existing)throw new ServiceError(404,"NOT_FOUND","备份计划不存在或超出节点授权范围");
    const updated=this.repository.updateBackupPlan(id,input,new Date().toISOString());if(!updated)throw new ServiceError(404,"NOT_FOUND","备份计划不存在");return updated;
  }
  plansForAgent(nodeId:string){return this.repository.listBackupPlansForAgent(nodeId);}
  saveAgentReports(nodeId:string,reports:AgentDatabaseScheduledBackupReport[],requestId:string){const accepted=this.repository.saveScheduledBackupReports(nodeId,reports);for(const report of reports)this.audit?.append({actorType:"agent",actorId:nodeId,source:"database-agent",targetType:"database-backup-plan",targetId:report.planId,action:"database.backup.scheduled",parameters:{reportId:report.reportId,status:report.status,instanceLocalId:report.instanceLocalId,scheduledFor:report.scheduledFor,errorCode:report.errorCode},outcome:report.status,authorization:"signed-agent+capability+node-match",requestId});return accepted;}
  run(id:string,userId:string,idempotencyKey:string,requestId:string,nodeScope:NodeScope){
    const plan=this.repository.listBackupPlans(nodeScope).find((item)=>item.id===id);if(!plan)throw new ServiceError(404,"NOT_FOUND","备份计划不存在或超出节点授权范围");
    const instance=this.repository.findInstance(plan.instanceId,nodeScope);if(!instance)throw new ServiceError(404,"NOT_FOUND","数据库实例不存在");
    const operation=this.repository.createDirectOperation("backup",instance.nodeId,instance.id,userId,idempotencyKey,requestId,new Date().toISOString(),{planId:plan.id});
    const existing=this.repository.findBackupJobByOperation(operation.id);
    return { operationId:operation.id,status:operation.status,job:existing??this.repository.createBackupJob(plan,operation.id,new Date().toISOString()) };
  }
}
