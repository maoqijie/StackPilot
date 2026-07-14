import { SystemdServicesPayloadSchema, type NodeScope, type SystemdServicesPayload } from "@stackpilot/contracts";
import type { AgentControlRepository } from "../../repositories/agentControlRepository.js";

export class SystemdService {
  constructor(private readonly repository: AgentControlRepository, private readonly staleAfterMs = 45_000) {}

  async list(nodeScope: NodeScope): Promise<SystemdServicesPayload> {
    const state = await this.repository.read(); const now = Date.now(); const warnings: string[] = []; const timestamps: string[] = [];
    const nodes = state.nodes.filter((node) => !node.revokedAt && (nodeScope === "all" || nodeScope.includes(node.nodeId)));
    const services = nodes.flatMap((node) => {
      const snapshot = node.systemdSnapshot;
      if (!snapshot) { warnings.push(`${node.nodeName}: awaiting systemd collection`); return []; }
      timestamps.push(snapshot.collectedAt); warnings.push(...snapshot.warnings.map((warning) => `${node.nodeName}: ${warning}`));
      const freshness = node.status === "online" && now - Date.parse(snapshot.collectedAt) <= this.staleAfterMs ? "current" as const : "stale" as const;
      if (freshness === "stale") warnings.push(`${node.nodeName}: systemd snapshot is stale`);
      return snapshot.services.map((service) => ({
        ...service, id: `${node.nodeId}:${service.unit}`, nodeId: node.nodeId, host: node.nodeName,
        platform: node.platform, sourceCollectedAt: snapshot.collectedAt, freshness,
      }));
    });
    const snapshots = nodes.filter((node) => node.systemdSnapshot);
    const unavailable = snapshots.length === 0 || snapshots.every((node) => node.systemdSnapshot?.collectionStatus === "unavailable");
    const partial = snapshots.length !== nodes.length || snapshots.some((node) => node.systemdSnapshot?.collectionStatus !== "complete") || warnings.some((warning) => warning.endsWith("snapshot is stale"));
    return SystemdServicesPayloadSchema.parse({
      collectedAt: timestamps.sort().at(-1) ?? new Date().toISOString(), collectionStatus: unavailable ? "unavailable" : partial ? "partial" : "complete",
      warnings: warnings.slice(0, 100), services,
    });
  }
}
