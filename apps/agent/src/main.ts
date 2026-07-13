import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  AGENT_PROTOCOL_VERSION, AgentEnrollmentResponseSchema, AgentHeartbeatResponseSchema, RemoteTaskPollResponseSchema, RotateCredentialResponseSchema,
  type AgentEnrollmentRequest,
} from "@stackpilot/contracts";
import { activeAgentCapabilities } from "./capabilities/index.js";
import { loadAgentConfig } from "./config/environment.js";
import { createHeartbeat } from "./heartbeat/heartbeat.js";
import { IdentityStore, type AgentIdentity } from "./identity/identityStore.js";
import { agentLogger } from "./logging/logger.js";
import { collectAgentTelemetry } from "./telemetry/collector.js";
import { NginxSiteCollector, SiteSnapshotCache } from "./sites/nginxCollector.js";
import { certHelperAvailable } from "./sites/helperClient.js";
import { TaskExecutor } from "./tasks/executor.js";
import { ControllerClient } from "./transport/controllerClient.js";

const sleep = (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const backoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)) + Math.floor(Math.random() * 500);

async function ensureIdentity(store: IdentityStore, client: ControllerClient, config: ReturnType<typeof loadAgentConfig>, capabilities: AgentEnrollmentRequest["capabilities"]): Promise<AgentIdentity> {
  const existing = await store.read(); if (existing) return existing;
  if (!config.enrollmentToken) throw new Error("Agent identity is missing and no enrollment token was provided");
  const pair = store.createKeyPair();
  const request: AgentEnrollmentRequest = { enrollmentToken: config.enrollmentToken, nodeName: config.nodeName, publicKey: pair.publicKey, agentVersion: config.agentVersion, protocolVersion: AGENT_PROTOCOL_VERSION, platform: config.platform, capabilities };
  const enrolled = AgentEnrollmentResponseSchema.parse(await client.enroll(request));
  const identity = { nodeId: enrolled.nodeId, credentialId: enrolled.credentialId, privateKey: pair.privateKey, publicKey: pair.publicKey, protocolVersion: enrolled.protocolVersion, createdAt: new Date().toISOString() };
  await store.write(identity); return identity;
}

export async function rotateIdentity(store: IdentityStore, client: ControllerClient, current: AgentIdentity): Promise<AgentIdentity> {
  let pending = await store.readPendingRotation();
  if (!pending) { const pair = store.createKeyPair(); pending = { ...pair, rotationId: randomUUID(), createdAt: new Date().toISOString() }; await store.writePendingRotation(pending); }
  const response = RotateCredentialResponseSchema.parse(await client.json("/api/agent/credentials/rotate", { rotationId: pending.rotationId, publicKey: pending.publicKey }, current));
  const next = { ...current, credentialId: response.credentialId, privateKey: pending.privateKey, publicKey: pending.publicKey, createdAt: response.rotatedAt };
  await store.write(next); await store.clearPendingRotation(); return next;
}

export async function runAgent(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env, signal?: AbortSignal) {
  const config = loadAgentConfig(env);
  if (env === process.env) delete process.env.STACKPILOT_AGENT_ENROLLMENT_TOKEN;
  if (typeof process.getuid === "function" && process.getuid() === 0 && !config.allowRoot) throw new Error("StackPilot Agent refuses to run as root; use a dedicated unprivileged user");
  const store = new IdentityStore(config.stateDir); const client = new ControllerClient(config.controllerUrl, config.caPath);
  let capabilities = activeAgentCapabilities(config.platform, config.platform === "linux" && await certHelperAvailable());
  let identity = await ensureIdentity(store, client, config, capabilities);
  if (config.rotateCredential) { identity = await rotateIdentity(store, client, identity); if (env === process.env) delete process.env.STACKPILOT_AGENT_ROTATE_CREDENTIAL; }
  const executor = new TaskExecutor(store.receiptPath, identity.nodeId, config.platform, capabilities); await executor.load();
  const siteSnapshots = new SiteSnapshotCache(new NginxSiteCollector(identity.nodeId), config.platform);
  let failures = 0;
  while (!signal?.aborted) {
    try {
      capabilities = activeAgentCapabilities(config.platform, config.platform === "linux" && await certHelperAvailable());
      executor.setCapabilities(capabilities);
      let telemetryCollectionFailed = false;
      const telemetry = await collectAgentTelemetry(config.platform).catch(() => { telemetryCollectionFailed = true; return undefined; });
      void siteSnapshots.refreshIfDue().catch((error) => agentLogger.log({ level: "warn", time: new Date().toISOString(), message: "Site inventory collection failed", errorName: error instanceof Error ? error.name : "UnknownError" }));
      AgentHeartbeatResponseSchema.parse(await client.json("/api/agent/heartbeat", createHeartbeat(config, identity.nodeId, capabilities, telemetry, telemetryCollectionFailed, siteSnapshots.current), identity));
      for (const pending of executor.pendingUpdates()) { await client.json("/api/agent/tasks/status", pending, identity); await executor.markReported(pending.taskId); }
      const poll = RemoteTaskPollResponseSchema.parse(await client.json("/api/agent/tasks/poll", {}, identity));
      for (const taskId of poll.cancelledTaskIds) executor.cancel(taskId);
      for (const task of poll.tasks) {
        if (executor.activeCount >= 4) break;
        void executor.execute(task, (running) => client.json("/api/agent/tasks/status", running, identity)).then(async (result) => {
          if (result.status !== "running") { await client.json("/api/agent/tasks/status", result, identity); await executor.markReported(task.taskId); }
        }).catch((error) => agentLogger.log({ level: "warn", time: new Date().toISOString(), message: "Task execution or result delivery failed", taskId: task.taskId, errorName: error instanceof Error ? error.name : "UnknownError" }));
      }
      failures = 0; await sleep(config.heartbeatSeconds * 1000);
    } catch (error) {
      failures += 1;
      if ((failures & (failures - 1)) === 0) agentLogger.log({ level: "warn", time: new Date().toISOString(), message: "Agent cycle failed", errorName: error instanceof Error ? error.name : "UnknownError", attempt: failures });
      await sleep(backoff(failures));
    }
  }
}

const isMainModule = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMainModule) {
  const controller = new AbortController(); process.once("SIGINT", () => controller.abort()); process.once("SIGTERM", () => controller.abort());
  runAgent(process.env, controller.signal).catch(() => { process.stderr.write("StackPilot Agent could not start; inspect safe structured logs.\n"); process.exitCode = 1; });
}
