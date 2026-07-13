import {
  DatabaseInstanceDetailSchema, DatabaseInstancesPayloadSchema, DatabaseSlowQueriesPayloadSchema,
  type AgentDatabaseQueryUpload, type AgentDatabaseSnapshot, type DatabaseInstanceDetail,
  type DatabaseInstancesPayload, type DatabaseSlowQueriesPayload, type NodeScope,
} from "@stackpilot/contracts";
import type { DatabaseRepository } from "../../repositories/databaseRepository.js";
import { ServiceError } from "../serviceError.js";

export class DatabaseInventoryService {
  constructor(private readonly repository: DatabaseRepository) {}

  ingestSnapshot(nodeId: string, snapshot: AgentDatabaseSnapshot): void {
    this.repository.saveSnapshot(nodeId, snapshot);
  }
  ingestQueryUpload(nodeId: string, upload: AgentDatabaseQueryUpload): void {
    this.repository.saveQueryUpload(nodeId, upload);
  }
  list(nodeScope: NodeScope): DatabaseInstancesPayload {
    const instances = this.repository.listInstances(nodeScope);
    const collectedAt = instances.reduce((latest, item) => item.collectedAt > latest ? item.collectedAt : latest, new Date(0).toISOString());
    const stale = instances.filter((item) => item.freshness === "stale").length;
    return DatabaseInstancesPayloadSchema.parse({
      collectedAt: instances.length ? collectedAt : new Date().toISOString(),
      collectionStatus: instances.length === 0 ? "unavailable" : stale ? "partial" : "complete",
      warnings: instances.length === 0 ? ["尚未收到授权节点的数据库快照"] : stale ? [`${stale} 个实例的采集数据已过期`] : [], instances,
    });
  }
  detail(id: string, nodeScope: NodeScope, includeSql: boolean): DatabaseInstanceDetail {
    const instance = this.repository.findInstance(id, nodeScope);
    if (!instance) throw new ServiceError(404, "NOT_FOUND", "数据库实例不存在或超出节点授权范围");
    return DatabaseInstanceDetailSchema.parse({
      instance, sessions: this.repository.listSessions(id),
      recentQueries: this.repository.listQueries(nodeScope, "24h", includeSql).filter((query) => query.instanceId === id).slice(0, 1_000),
    });
  }
  slowQueries(nodeScope: NodeScope, range: "24h" | "7d", includeSql: boolean): DatabaseSlowQueriesPayload {
    const instances = this.repository.listInstances(nodeScope);
    const queries = this.repository.listQueries(nodeScope, range, includeSql);
    const collectedAt = instances.reduce((latest, item) => item.collectedAt > latest ? item.collectedAt : latest, new Date(0).toISOString());
    return DatabaseSlowQueriesPayloadSchema.parse({
      collectedAt: instances.length ? collectedAt : new Date().toISOString(), range, thresholdMs: 1_000,
      collectionStatus: instances.length ? "complete" : "unavailable",
      warnings: instances.length ? [] : ["尚未收到授权节点的数据库查询快照"],
      instances: instances.map((item) => ({ id:item.id,name:item.name,engine:item.engine,host:item.host,port:item.port,activeConnections:item.activeConnections,slowQueryCount:item.slowQueryCount,collectedAt:item.collectedAt,historicalSlowQueriesAvailable:item.historicalSlowQueriesAvailable })), queries,
    });
  }
  resolveQuery(id: string, nodeScope: NodeScope) {
    if (!this.repository.findQuery(id, nodeScope, false)) throw new ServiceError(404, "NOT_FOUND", "慢查询不存在或超出节点授权范围");
    const query = this.repository.resolveQuery(id, new Date().toISOString());
    if (!query) throw new ServiceError(404, "NOT_FOUND", "慢查询不存在");
    return query;
  }
}
