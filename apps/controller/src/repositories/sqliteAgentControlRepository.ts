import type Database from "better-sqlite3";
import { AgentNodeStateSchema, type AgentControlRepository, type AgentControlState, type AgentNodeState, type AgentNonceRequest, type AuditEvent } from "./agentControlRepository.js";
import type { AuditRepository } from "../audit/auditRepository.js";

const empty = (): AgentControlState => ({ enrollments: [], credentials: [], nodes: [], nonces: [], tasks: [], audits: [] });
export class SqliteAgentControlRepository implements AgentControlRepository {
  private queue=Promise.resolve();
  constructor(private readonly database: Database.Database,private readonly audit?:AuditRepository) {}
  async read(): Promise<AgentControlState> {
    const state = empty();
    state.enrollments = (this.database.prepare("SELECT * FROM agent_enrollments").all() as Array<Record<string, unknown>>).map((r) => ({ enrollmentId:r.enrollment_id as string,tokenDigest:r.token_digest as string,nodeName:r.node_name as string,expiresAt:r.expires_at as string,usedAt:r.used_at as string|null,revokedAt:r.revoked_at as string|null }));
    state.credentials = (this.database.prepare("SELECT * FROM agent_credentials").all() as Array<Record<string, unknown>>).map((r)=>({credentialId:r.credential_id as string,nodeId:r.node_id as string,publicKey:r.public_key as string,createdAt:r.created_at as string,revokedAt:r.revoked_at as string|null,replacedBy:r.replaced_by as string|null,rotationId:r.rotation_id as string|null}));
    state.nodes = (this.database.prepare("SELECT payload FROM agent_nodes").all() as Array<{payload:string}>).map((r)=>JSON.parse(r.payload));
    state.nonces = (this.database.prepare("SELECT credential_id,nonce,expires_at FROM agent_nonces WHERE expires_at>?").all(new Date().toISOString()) as Array<{credential_id:string;nonce:string;expires_at:string}>).map((r)=>({credentialId:r.credential_id,nonce:r.nonce,expiresAt:r.expires_at}));
    state.tasks = (this.database.prepare("SELECT payload FROM remote_tasks").all() as Array<{payload:string}>).map((r)=>JSON.parse(r.payload));
    state.audits = (this.database.prepare("SELECT payload FROM agent_protocol_audits ORDER BY occurred_at").all() as Array<{payload:string}>).map((r)=>JSON.parse(r.payload));
    return structuredClone(state);
  }
  async update(mutate:(state:AgentControlState)=>void):Promise<AgentControlState>{
    const operation=this.queue.catch(()=>undefined).then(async()=>{const state=await this.read();const previousAudits=new Set(state.audits.map(x=>x.eventId));mutate(state);state.nonces=state.nonces.filter(x=>Date.parse(x.expiresAt)>Date.now());state.audits=state.audits.slice(-10_000);
    this.database.transaction(()=>{
      for(const table of ["agent_credentials","agent_enrollments","agent_nonces","remote_tasks","agent_protocol_audits","agent_nodes"])this.database.exec(`DELETE FROM ${table}`);
      for(const x of state.enrollments)this.database.prepare("INSERT INTO agent_enrollments VALUES(?,?,?,?,?,?)").run(x.enrollmentId,x.tokenDigest,x.nodeName,x.expiresAt,x.usedAt,x.revokedAt);
      for(const x of state.nodes)this.database.prepare("INSERT INTO agent_nodes(node_id,payload,revoked_at,updated_at)VALUES(?,?,?,?)").run(x.nodeId,JSON.stringify(x),x.revokedAt,x.lastSeenAt??x.enrolledAt);
      for(const x of state.credentials)this.database.prepare("INSERT INTO agent_credentials VALUES(?,?,?,?,?,?,?)").run(x.credentialId,x.nodeId,x.publicKey,x.createdAt,x.revokedAt,x.replacedBy,x.rotationId);
      for(const x of state.nonces)this.database.prepare("INSERT INTO agent_nonces VALUES(?,?,?)").run(x.credentialId,x.nonce,x.expiresAt);
      for(const x of state.tasks)this.database.prepare("INSERT INTO remote_tasks(task_id,node_id,payload,status,updated_at)VALUES(?,?,?,?,?)").run(x.taskId,x.targetNodeId,JSON.stringify(x),x.status,x.updatedAt);
      for(const x of state.audits)this.database.prepare("INSERT INTO agent_protocol_audits VALUES(?,?,?)").run(x.eventId,JSON.stringify(x),x.timestamp);
    })();for(const event of state.audits.filter(x=>!previousAudits.has(x.eventId)))this.appendAudit(event);return structuredClone(state);});this.queue=operation.then(()=>undefined,()=>undefined);return operation;
  }

  async consumeNonce(request:AgentNonceRequest){
    const operation=this.queue.catch(()=>undefined).then(async()=>this.database.transaction(()=>{
      this.database.prepare("DELETE FROM agent_nonces WHERE expires_at<=?").run(new Date().toISOString());
      const node=this.database.prepare("SELECT revoked_at FROM agent_nodes WHERE node_id=?").get(request.nodeId) as {revoked_at:string|null}|undefined;
      const credential=this.database.prepare("SELECT revoked_at,replaced_by,rotation_id FROM agent_credentials WHERE credential_id=? AND node_id=?").get(request.credentialId,request.nodeId) as {revoked_at:string|null;replaced_by:string|null;rotation_id:string|null}|undefined;
      const revokedCredentialAllowed=request.allowRevokedCredential&&Boolean(credential?.revoked_at&&credential.replaced_by&&credential.rotation_id);
      if(!node||node.revoked_at||!credential||(credential.revoked_at&&!revokedCredentialAllowed))return "unauthorized" as const;
      try{
        this.database.prepare("INSERT INTO agent_nonces VALUES(?,?,?)").run(request.credentialId,request.nonce,request.expiresAt);
        return "accepted" as const;
      }catch(error){
        if((error as {code?:string}).code?.startsWith("SQLITE_CONSTRAINT"))return "replayed" as const;
        throw error;
      }
    })());
    this.queue=operation.then(()=>undefined,()=>undefined);
    return operation;
  }

  async updateNodeWithAudit(nodeId:string,mutate:(node:AgentNodeState)=>AuditEvent):Promise<AgentNodeState|null>{
    const operation=this.queue.catch(()=>undefined).then(async()=>{
      const row=this.database.prepare("SELECT payload FROM agent_nodes WHERE node_id=?").get(nodeId) as {payload:string}|undefined;
      if(!row)return null;
      const node=AgentNodeStateSchema.parse(JSON.parse(row.payload)) as AgentNodeState;
      const event=mutate(node);
      this.database.transaction(()=>{
        this.database.prepare("UPDATE agent_nodes SET payload=?,revoked_at=?,updated_at=? WHERE node_id=?").run(JSON.stringify(node),node.revokedAt,node.lastSeenAt??node.enrolledAt,nodeId);
        this.database.prepare("INSERT INTO agent_protocol_audits VALUES(?,?,?)").run(event.eventId,JSON.stringify(event),event.timestamp);
      })();
      this.appendAudit(event);
      return structuredClone(node);
    });
    this.queue=operation.then(()=>undefined,()=>undefined);
    return operation;
  }

  private appendAudit(event:AuditEvent){
    this.audit?.append({actorType:event.requester.startsWith("agent:")?"agent":"user",actorId:event.requester,source:"controller-agent",targetType:event.taskId?"remote-task":"node",targetId:event.taskId??event.nodeId,action:event.event,parameters:event.parameters,outcome:event.toStatus??"recorded",authorization:"controller-agent-policy",requestId:event.traceId,traceId:event.traceId});
  }
}
