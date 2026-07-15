import { FirewallDenyRecordsPayloadSchema, type FirewallDenyRecordsPayload, type NodeScope } from "@stackpilot/contracts";
import type { AgentControlRepository } from "../../repositories/agentControlRepository.js";

const EVENT_WINDOW_MS = 24 * 60 * 60 * 1_000;

function boundedWarning(value: string) {
  return [...value].slice(0, 256).join("");
}

export class FirewallDenyService {
  constructor(
    private readonly repository: AgentControlRepository,
    private readonly staleAfterMs = 90_000,
    private readonly now = () => Date.now(),
  ) {}

  async list(nodeScope: NodeScope): Promise<FirewallDenyRecordsPayload> {
    const state = await this.repository.read(); const now = this.now();
    const nodes = state.nodes.filter((node) => !node.revokedAt && (nodeScope === "all" || nodeScope.includes(node.nodeId)));
    const snapshots = nodes.flatMap((node) => node.firewallDenySnapshot ? [{ node, snapshot: node.firewallDenySnapshot }] : []);
    const staleSnapshots = snapshots.filter(({ node, snapshot }) => node.status !== "online"
      || !node.lastSeenAt
      || now - Date.parse(node.lastSeenAt) > this.staleAfterMs
      || now - Date.parse(snapshot.collectedAt) > this.staleAfterMs);
    const warnings = [
      ...nodes.filter((node) => !node.firewallDenySnapshot).map((node) => `${node.nodeName}: firewall deny snapshot is awaiting collection`),
      ...snapshots.flatMap(({ node, snapshot }) => snapshot.warnings.map((warning) => `${node.nodeName}: ${warning}`)),
      ...staleSnapshots.map(({ node }) => `${node.nodeName}: firewall deny snapshot is stale`),
    ].map(boundedWarning).slice(0, 100);
    const collectionStatus = snapshots.length === 0 || snapshots.every(({ snapshot }) => snapshot.collectionStatus === "unavailable")
      ? "unavailable" as const
      : snapshots.length !== nodes.length || staleSnapshots.length > 0 || snapshots.some(({ snapshot }) => snapshot.collectionStatus !== "complete")
        ? "partial" as const
        : "complete" as const;
    const cutoff = now - EVENT_WINDOW_MS;
    const records = snapshots.flatMap(({ node, snapshot }) => snapshot.events.filter((event) => Date.parse(event.occurredAt) >= cutoff).map((event) => ({
      ...event,
      id: `${node.nodeId}:${event.id}`,
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      sourceCollectedAt: snapshot.collectedAt,
    }))).sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt)).slice(0, 10_000);
    const collectedAt = snapshots.map(({ snapshot }) => snapshot.collectedAt).sort().at(-1) ?? null;
    return FirewallDenyRecordsPayloadSchema.parse({ collectedAt, collectionStatus, warnings, records });
  }
}
