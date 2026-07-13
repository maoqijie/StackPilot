import type { AgentNodeRecord, HostMonitoringPayload, RemoteTaskRecord } from "@stackpilot/contracts";
import { vi } from "vitest";
import { reauthenticate } from "../api/identityApi";
import { createTerminalTask, fetchTerminalHosts, fetchTerminalNodes, fetchTerminalTasks } from "../api/terminalApi";

const terminalNode: AgentNodeRecord = {
  nodeId: "11111111-1111-4111-8111-111111111111",
  nodeName: "real-agent-01",
  status: "online",
  agentVersion: "0.2.0",
  protocolVersion: "1.0",
  platform: "linux",
  declaredCapabilities: ["system.summary.read", "service.status.read"],
  allowedCapabilities: ["system.summary.read", "service.status.read"],
  enrolledAt: "2026-07-13T00:00:00.000Z",
  lastSeenAt: "2026-07-13T12:30:00.000Z",
  revokedAt: null,
};

const terminalHosts: HostMonitoringPayload = {
  collectedAt: "2026-07-13T12:30:01.000Z",
  hosts: [{
    id: terminalNode.nodeId,
    source: "agent",
    name: terminalNode.nodeName,
    platform: "linux",
    address: "198.18.0.10",
    environment: "生产",
    owner: "未分配",
    connectionStatus: "online",
    healthStatus: "healthy",
    telemetryFreshness: "current",
    telemetryCollectedAt: terminalNode.lastSeenAt,
    lastSeenAt: terminalNode.lastSeenAt,
    cpuPercent: 10,
    memory: null,
    disk: null,
    uptimeSeconds: 1,
    backup: null,
    services: [],
    version: "0.2.0",
    latency: null,
    updateStatus: null,
  }],
};

const terminalTask: RemoteTaskRecord = {
  protocolVersion: "1.0",
  taskId: "22222222-2222-4222-8222-222222222222",
  type: "system.summary.read",
  targetNodeId: terminalNode.nodeId,
  parameters: { includeLoad: false },
  createdAt: "2026-07-13T12:30:02.000Z",
  expiresAt: "2026-07-13T12:31:02.000Z",
  idempotencyKey: "terminal-test-real",
  requester: "user:test",
  traceId: "33333333-3333-4333-8333-333333333333",
  requiredCapability: "system.summary.read",
  attempt: 1,
  maxAttempts: 3,
  status: "succeeded",
  updatedAt: "2026-07-13T12:30:03.000Z",
  result: { message: "System summary collected", truncated: false, data: { hostname: terminalNode.nodeName, primaryIp: "198.18.0.10", uptimeSeconds: 90_060, disks: [{ label: "/dev/vda1", mount: "/", totalBytes: 64_424_509_440, usedBytes: 21_474_836_480 }] } },
  errorCode: null,
  retryable: true,
  nextAttemptAt: null,
};

function resetTerminalApiMocks() {
  vi.mocked(fetchTerminalNodes).mockReset().mockResolvedValue({ nodes: [terminalNode] });
  vi.mocked(fetchTerminalHosts).mockReset().mockResolvedValue(terminalHosts);
  vi.mocked(fetchTerminalTasks).mockReset().mockResolvedValue({ tasks: [terminalTask] });
  vi.mocked(createTerminalTask).mockReset().mockResolvedValue({ ...terminalTask, status: "queued", result: null });
  vi.mocked(reauthenticate).mockReset().mockResolvedValue({ proof: "proof-value-with-more-than-thirty-two-characters", expiresAt: "2026-07-13T12:35:00.000Z" });
}

export { resetTerminalApiMocks, terminalHosts, terminalNode, terminalTask };
