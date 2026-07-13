import { createHash } from "node:crypto";
import { DatabaseInstancesPayloadSchema } from "@stackpilot/contracts";
import type { AgentDatabaseInstance, DatabaseInstanceRecord, DatabaseInstancesPayload } from "@stackpilot/contracts";
import type { AgentControlRepository, AgentNodeState } from "../../repositories/agentControlRepository.js";

export type DatabaseAccess = { nodeScope: "all" | string[] };
const STALE_AFTER_MS = 150_000;

export function publicDatabaseId(nodeId: string, instanceId: string) {
  return `database-${createHash("sha256").update(`${nodeId}\0${instanceId}`).digest("hex").slice(0, 32)}`;
}

function runtimeRecord(node: AgentNodeState, instance: AgentDatabaseInstance): DatabaseInstanceRecord {
  const collectedAt = node.databaseSnapshot!.collectedAt;
  return {
    ...instance, id: publicDatabaseId(node.nodeId, instance.id), nodeId: node.nodeId, nodeName: node.nodeName,
    address: node.telemetry?.primaryIp ?? null, collectedAt,
    freshness: Date.now() - Date.parse(collectedAt) <= STALE_AFTER_MS ? "current" : "stale",
  };
}

export class DatabaseMonitoringService {
  constructor(private readonly repository: AgentControlRepository) {}
  async getInstances(access: DatabaseAccess): Promise<DatabaseInstancesPayload> {
    const state = await this.repository.read();
    const nodes = state.nodes.filter((node) => !node.revokedAt && node.databaseSnapshot && (access.nodeScope === "all" || access.nodeScope.includes(node.nodeId)));
    const snapshots = nodes.map((node) => node.databaseSnapshot!);
    const staleNodes = nodes.filter((node) => Date.now() - Date.parse(node.databaseSnapshot!.collectedAt) > STALE_AFTER_MS);
    const statuses = snapshots.map((snapshot) => snapshot.collectionStatus);
    const collectionStatus = !snapshots.length || statuses.every((status) => status === "unavailable") ? "unavailable"
      : !staleNodes.length && statuses.every((status) => status === "complete") ? "complete" : "partial";
    const collectedAt = snapshots.map((snapshot) => snapshot.collectedAt).sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? new Date().toISOString();
    return DatabaseInstancesPayloadSchema.parse({
      collectedAt, collectionStatus,
      warnings: [...snapshots.flatMap((snapshot) => snapshot.warnings), ...staleNodes.map((node) => `节点 ${node.nodeName} 的数据库清单已过期`), ...(!snapshots.length ? ["授权节点尚未上报数据库服务清单"] : [])].slice(0, 20),
      instances: nodes.flatMap((node) => node.databaseSnapshot!.instances.map((instance) => runtimeRecord(node, instance))),
    });
  }
}
