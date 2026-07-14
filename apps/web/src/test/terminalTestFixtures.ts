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
  declaredCapabilities: ["system.summary.read", "service.status.read", "terminal.command.execute"],
  allowedCapabilities: ["system.summary.read", "service.status.read", "terminal.command.execute"],
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
  type: "terminal.command.execute",
  targetNodeId: terminalNode.nodeId,
  parameters: { command: "uptime" },
  createdAt: "2026-07-13T12:30:02.000Z",
  expiresAt: "2026-07-13T12:31:02.000Z",
  idempotencyKey: "terminal-test-real",
  requester: "user:test",
  traceId: "33333333-3333-4333-8333-333333333333",
  requiredCapability: "terminal.command.execute",
  attempt: 1,
  maxAttempts: 1,
  status: "succeeded",
  updatedAt: "2026-07-13T12:30:03.000Z",
  result: { message: " 12:30:03 up 1 day, 1:01, 1 user, load average: 0.10, 0.20, 0.30", truncated: false, data: { exitCode: 0 } },
  errorCode: null,
  retryable: false,
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
