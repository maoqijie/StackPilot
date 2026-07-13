import { createHash } from "node:crypto";
import { DatabaseInstancesPayloadSchema } from "@stackpilot/contracts";
import type { AgentDatabaseInstance, DatabaseInstanceRecord, DatabaseInstancesPayload } from "@stackpilot/contracts";
import type { AgentControlRepository, AgentNodeState } from "../../repositories/agentControlRepository.js";

export type DatabaseAccess = { nodeScope: "all" | string[] };
const STALE_AFTER_MS = 150_000;
const MAX_DATABASE_INSTANCES = 10_000;

function isStale(collectedAt: string, now = Date.now()) {
  const age = now - Date.parse(collectedAt);
  return age < 0 || age > STALE_AFTER_MS;
}

export function publicDatabaseId(nodeId: string, instanceId: string) {
  return `database-${createHash("sha256").update(`${nodeId}\0${instanceId}`).digest("hex").slice(0, 32)}`;
}

function runtimeRecord(node: AgentNodeState, instance: AgentDatabaseInstance): DatabaseInstanceRecord {
  const collectedAt = node.databaseSnapshot!.collectedAt;
  return {
    ...instance, managed: instance.managed ?? false,
    historicalSlowQueriesAvailable: instance.historicalSlowQueriesAvailable ?? false,
    volumes: instance.volumes ?? [],
    id: publicDatabaseId(node.nodeId, instance.id), nodeId: node.nodeId, nodeName: node.nodeName,
    address: node.telemetry?.primaryIp ?? null, collectedAt,
    freshness: isStale(collectedAt) ? "stale" : "current",
  };
}

export class DatabaseMonitoringService {
  constructor(private readonly repository: AgentControlRepository) {}
  async getInstances(access: DatabaseAccess): Promise<DatabaseInstancesPayload> {
    const state = await this.repository.read();
    const authorizedNodes = state.nodes.filter((node) => !node.revokedAt && (access.nodeScope === "all" || access.nodeScope.includes(node.nodeId)));
    const nodes = authorizedNodes.filter((node) => node.databaseSnapshot);
    const pendingNodes = authorizedNodes.filter((node) => !node.databaseSnapshot);
    const snapshots = nodes.map((node) => node.databaseSnapshot!);
    const staleNodes = nodes.filter((node) => isStale(node.databaseSnapshot!.collectedAt));
    const statuses = snapshots.map((snapshot) => snapshot.collectionStatus);
    let collectionStatus = !snapshots.length || statuses.every((status) => status === "unavailable") ? "unavailable"
      : !pendingNodes.length && !staleNodes.length && statuses.every((status) => status === "complete") ? "complete" : "partial";
    const collectedAt = snapshots.map((snapshot) => snapshot.collectedAt).sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? new Date().toISOString();
    const allInstances = nodes.flatMap((node) => node.databaseSnapshot!.instances.map((instance) => runtimeRecord(node, instance)));
    const truncated = allInstances.length > MAX_DATABASE_INSTANCES;
    if (truncated) collectionStatus = "partial";
    const truncationWarning = truncated ? [`数据库实例超过 ${MAX_DATABASE_INSTANCES} 条，响应已截断`] : [];
    return DatabaseInstancesPayloadSchema.parse({
      collectedAt, collectionStatus,
      warnings: [...truncationWarning, ...snapshots.flatMap((snapshot) => snapshot.warnings), ...pendingNodes.map((node) => `节点 ${node.nodeName} 尚未上报数据库服务清单`), ...staleNodes.map((node) => `节点 ${node.nodeName} 的数据库清单已过期`), ...(!authorizedNodes.length ? ["授权节点尚未上报数据库服务清单"] : [])].slice(0, 20),
      instances: allInstances.slice(0, MAX_DATABASE_INSTANCES),
    });
  }
}
