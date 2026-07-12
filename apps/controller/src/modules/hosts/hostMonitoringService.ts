import { platform as runtimePlatform } from "node:os";
import { HostMonitoringPayloadSchema } from "@stackpilot/contracts";
import type { AgentPlatform, AgentTelemetrySnapshot, HostMonitoringPayload, HostMonitoringRecord } from "@stackpilot/contracts";
import type { PlatformAdapter, PlatformSnapshot } from "../../platform/types.js";
import type { AgentControlRepository, AgentNodeState } from "../../repositories/agentControlRepository.js";
import type { NodeScope } from "@stackpilot/contracts";
import { hasResourceWarning } from "../../platform/resourceHealth.js";

const LOCAL_ENVIRONMENT = "本机";
const LOCAL_OWNER = "Controller";

function percentage(used: number, total: number) {
  return total > 0 ? Math.min(100, Math.max(0, Math.round(used / total * 1000) / 10)) : 0;
}

function controllerPlatform(): AgentPlatform {
  const current = runtimePlatform();
  return current === "win32" || current === "darwin" ? current : "linux";
}

function localRecord(snapshot: PlatformSnapshot, collectedAt: string): HostMonitoringRecord {
  const totalMemoryBytes = snapshot.totalMemoryBytes;
  const availableMemoryBytes = snapshot.availableMemoryBytes;
  const totalDiskBytes = snapshot.disks.reduce((sum, volume) => sum + volume.totalBytes, 0);
  const usedDiskBytes = snapshot.disks.reduce((sum, volume) => sum + volume.usedBytes, 0);
  const latency = Number.parseFloat(snapshot.node.latency);
  return {
    id: snapshot.node.id,
    source: "controller",
    name: snapshot.node.name,
    platform: controllerPlatform(),
    address: snapshot.node.ip || null,
    environment: snapshot.node.env || LOCAL_ENVIRONMENT,
    owner: snapshot.node.owner || LOCAL_OWNER,
    connectionStatus: "local",
    healthStatus: snapshot.node.status === "健康" && snapshot.node.availability.cpu && snapshot.node.availability.memory && snapshot.node.availability.disk ? "healthy" : "degraded",
    telemetryFreshness: "current",
    telemetryCollectedAt: collectedAt,
    lastSeenAt: collectedAt,
    cpuPercent: snapshot.node.availability.cpu ? snapshot.cpuPercent : null,
    memory: snapshot.node.availability.memory && totalMemoryBytes > 0 ? { totalBytes: totalMemoryBytes, usedBytes: totalMemoryBytes - Math.min(totalMemoryBytes, availableMemoryBytes), percent: snapshot.memoryPercent } : null,
    disk: snapshot.node.availability.disk && totalDiskBytes > 0 ? {
      totalBytes: totalDiskBytes,
      usedBytes: usedDiskBytes,
      percent: percentage(usedDiskBytes, totalDiskBytes),
      volumes: snapshot.disks.map((volume) => ({ label: volume.label, mountPath: volume.mount, totalBytes: volume.totalBytes, usedBytes: volume.usedBytes, percent: volume.percent })),
    } : null,
    uptimeSeconds: parseUptime(snapshot.node.uptime),
    backup: { status: snapshot.node.backupStatus === "健康" ? "healthy" : "degraded", latestAt: null, detail: snapshot.node.backup },
    services: snapshot.node.services.slice(0, 20).map((service) => ({ name: service.id, status: service.status === "健康" ? "running" : "stopped" })),
    version: snapshot.version,
    latency: Number.isFinite(latency) ? latency : null,
    updateStatus: snapshot.node.update || null,
  };
}

function parseUptime(value: string) {
  const hours = Number(value.match(/(\d+)\s*小时/)?.[1] ?? 0);
  const minutes = Number(value.match(/(\d+)\s*分钟/)?.[1] ?? 0);
  return hours * 3600 + minutes * 60;
}

function aggregateDisk(telemetry: AgentTelemetrySnapshot) {
  const totalBytes = telemetry.disks.reduce((sum, volume) => sum + volume.totalBytes, 0);
  if (!totalBytes) return null;
  const usedBytes = telemetry.disks.reduce((sum, volume) => sum + volume.usedBytes, 0);
  return {
    totalBytes, usedBytes, percent: percentage(usedBytes, totalBytes),
    volumes: telemetry.disks.map((volume) => ({ label: volume.label, mountPath: volume.mount, totalBytes: volume.totalBytes, usedBytes: volume.usedBytes, percent: percentage(volume.usedBytes, volume.totalBytes) })),
  };
}

function remoteHealth(telemetry: AgentTelemetrySnapshot | undefined): "healthy" | "degraded" | "unknown" {
  if (!telemetry) return "unknown";
  const memory = telemetry.memory ? percentage(telemetry.memory.totalBytes - telemetry.memory.availableBytes, telemetry.memory.totalBytes) : null;
  const disk = aggregateDisk(telemetry)?.percent ?? null;
  return hasResourceWarning({ cpu: telemetry.cpu?.usagePercent ?? null, memory, disk }) ? "degraded" : "healthy";
}

function remoteRecord(node: AgentNodeState, now: number, offlineAfterMs: number): HostMonitoringRecord {
  const telemetry = node.telemetry;
  const heartbeatStale = node.lastSeenAt !== null && now - Date.parse(node.lastSeenAt) > offlineAfterMs;
  const telemetryStale = Boolean(telemetry && now - Date.parse(telemetry.collectedAt) > offlineAfterMs);
  const freshness = !telemetry ? "awaiting" : heartbeatStale || telemetryStale ? "stale" : "current";
  const connectionStatus = node.lastSeenAt === null ? "pending" : heartbeatStale || node.status === "offline" ? "offline" : "online";
  return {
    id: node.nodeId,
    source: "agent",
    name: telemetry?.hostname ?? node.nodeName,
    platform: node.platform,
    address: telemetry?.primaryIp ?? null,
    environment: "受管节点",
    owner: "StackPilot Agent",
    connectionStatus,
    healthStatus: freshness === "current" ? remoteHealth(telemetry) : freshness === "stale" ? "degraded" : "unknown",
    telemetryFreshness: freshness,
    telemetryCollectedAt: telemetry?.collectedAt ?? null,
    lastSeenAt: node.lastSeenAt,
    cpuPercent: telemetry?.cpu?.usagePercent ?? null,
    memory: telemetry?.memory ? { totalBytes: telemetry.memory.totalBytes, usedBytes: telemetry.memory.totalBytes - telemetry.memory.availableBytes, percent: percentage(telemetry.memory.totalBytes - telemetry.memory.availableBytes, telemetry.memory.totalBytes) } : null,
    disk: telemetry ? aggregateDisk(telemetry) : null,
    uptimeSeconds: telemetry?.uptimeSeconds ?? null,
    backup: null,
    services: [],
    version: node.agentVersion,
    latency: null,
    updateStatus: null,
  };
}

export class HostMonitoringService {
  constructor(private readonly platform: PlatformAdapter, private readonly repository: AgentControlRepository, private readonly offlineAfterMs = 45_000) {}

  async getHosts(includeAgents: boolean, nodeScope: NodeScope): Promise<HostMonitoringPayload> {
    const collectedAt = new Date().toISOString();
    const snapshot = await this.platform.collectSnapshot();
    const hosts = [localRecord(snapshot, collectedAt)];
    if (includeAgents) {
      const state = await this.repository.read();
      const allowed = nodeScope === "all" ? state.nodes : state.nodes.filter((node) => nodeScope.includes(node.nodeId));
      hosts.push(...allowed.filter((node) => !node.revokedAt).map((node) => remoteRecord(node, Date.now(), this.offlineAfterMs)));
    }
    return HostMonitoringPayloadSchema.parse({ collectedAt, hosts });
  }
}
