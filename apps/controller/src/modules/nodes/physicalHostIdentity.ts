import type { AgentNodeState } from "../../repositories/agentControlRepository.js";
import type { PlatformSnapshot } from "../../platform/types.js";

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? null;
}

export function controllerMirrorAgents(snapshot: PlatformSnapshot, nodes: AgentNodeState[]) {
  if (!snapshot.physicalHostId) return [];
  const localName = normalized(snapshot.node.name);
  const localAddress = normalized(snapshot.node.ip === "暂不可用" ? null : snapshot.node.ip);
  if (!localName || !localAddress) return [];
  const matches = nodes.filter((node) =>
    node.physicalHostId === snapshot.physicalHostId
    && normalized(node.telemetry?.hostname) === localName
    && normalized(node.telemetry?.primaryIp) === localAddress,
  );
  return matches.length === 1 ? matches : [];
}

export function agentControlState(node: AgentNodeState, now = Date.now(), staleAfterMs = 45_000) {
  const heartbeatStale = node.lastSeenAt === null || now - Date.parse(node.lastSeenAt) > staleAfterMs || node.status === "offline";
  const telemetryStale = !node.telemetry || now - Date.parse(node.telemetry.collectedAt) > staleAfterMs;
  const healthy = !heartbeatStale && !telemetryStale && node.heartbeatHealthStatus !== "degraded";
  return {
    healthy,
    status: healthy ? "健康" as const : heartbeatStale ? "离线" as const : "警告" as const,
    detail: healthy ? `Agent ${node.agentVersion} 在线` : heartbeatStale ? `最后心跳 ${node.lastSeenAt ?? "未知"}` : "Agent 遥测不可用或已过期",
  };
}
