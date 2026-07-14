import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { once } from "node:events";
import { request as httpsRequest } from "node:https";
import test from "node:test";
import selfsigned from "selfsigned";
import { AGENT_PROTOCOL_VERSION, agentSignaturePayload } from "@stackpilot/contracts";
import { createControllerServices } from "../../apps/controller/dist/app.js";
import { loadControllerConfig } from "../../apps/controller/dist/config/environment.js";
import { createMemoryLogger } from "../../apps/controller/dist/logging/logger.js";
import { MemoryAgentControlRepository } from "../../apps/controller/dist/repositories/agentControlRepository.js";
import { createStackPilotAgentServer, createStackPilotServer } from "../../apps/controller/dist/server.js";
import { FakePlatformAdapter } from "./support/fakePlatform.js";

const administratorToken = "agent-integration-administrator-token";
const keyPair = () => { const pair = generateKeyPairSync("ed25519"); return { privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString() }; };

async function certificate(commonName = "localhost") {
  return selfsigned.generate([{ name: "commonName", value: commonName }], { keySize: 2048, days: 1, algorithm: "sha256", extensions: [{ name: "basicConstraints", cA: true }, { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true }, { name: "subjectAltName", altNames: [{ type: 2, value: commonName }, { type: 7, ip: "127.0.0.1" }] }] });
}

async function httpsJson(baseUrl, path, body, ca, identity, overrides = {}) {
  const raw = Buffer.from(JSON.stringify(body)); const url = new URL(path, baseUrl); const timestamp = overrides.timestamp ?? new Date().toISOString(); const nonce = overrides.nonce ?? randomBytes(18).toString("base64url");
  const headers = { "content-type": "application/json", "content-length": String(raw.length), "x-stackpilot-protocol": overrides.protocolVersion ?? AGENT_PROTOCOL_VERSION };
  if (identity) {
    const payload = agentSignaturePayload({ protocolVersion: headers["x-stackpilot-protocol"], nodeId: identity.nodeId, credentialId: identity.credentialId, method: "POST", path: url.pathname, timestamp, nonce, bodySha256: createHash("sha256").update(raw).digest("hex") });
    Object.assign(headers, { "x-stackpilot-node-id": identity.nodeId, "x-stackpilot-credential-id": identity.credentialId, "x-stackpilot-timestamp": timestamp, "x-stackpilot-nonce": nonce, "x-stackpilot-signature": overrides.signature ?? sign(null, Buffer.from(payload), identity.privateKey).toString("base64url") });
  }
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { method: "POST", ca, rejectUnauthorized: true, headers }, (response) => { const chunks = []; response.on("data", (chunk) => chunks.push(chunk)); response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) })); });
    request.on("error", reject); request.end(raw);
  });
}

test("TLS Agent API supports two independent identities and rejects replay, revocation, wrong CA and plaintext", async () => {
  const cert = await certificate(); const wrongCert = await certificate("wrong.local");
  const repository = new MemoryAgentControlRepository(); const platform = new FakePlatformAdapter(); const config = loadControllerConfig({});
  const services = createControllerServices(platform, process.cwd(), config, repository); const logger = createMemoryLogger();
  const tlsServer = createStackPilotAgentServer({ cert: cert.cert, key: cert.private }, { config, services, platform, logger });
  const httpServer = createStackPilotServer({ config, services, platform, logger });
  tlsServer.listen(0, "127.0.0.1"); httpServer.listen(0, "127.0.0.1"); await Promise.all([once(tlsServer, "listening"), once(httpServer, "listening")]);
  const tlsUrl = `https://127.0.0.1:${tlsServer.address().port}`; const httpUrl = `http://127.0.0.1:${httpServer.address().port}`;
  try {
    const agents = [];
    for (const name of ["agent-one", "agent-two"]) {
      const pair = keyPair(); const credential = await services.enrollments.create({ nodeName: name, expiresInSeconds: 300 }, "admin", crypto.randomUUID());
      const response = await httpsJson(tlsUrl, "/api/agent/enroll", { enrollmentToken: credential.token, nodeName: name, publicKey: pair.publicKey, agentVersion: "0.1.0", protocolVersion: AGENT_PROTOCOL_VERSION, platform: "linux", capabilities: ["system.summary.read", "service.status.read"] }, cert.cert);
      assert.equal(response.status, 201); agents.push({ ...pair, ...response.body });
    }
    assert.notEqual(agents[0].credentialId, agents[1].credentialId);
    const heartbeat = (agent) => ({ nodeId: agent.nodeId, agentVersion: "0.1.0", protocolVersion: AGENT_PROTOCOL_VERSION, timestamp: new Date().toISOString(), platform: "linux", capabilities: ["system.summary.read", "service.status.read"], health: { status: "healthy", uptimeSeconds: 5 } });
    assert.equal((await httpsJson(tlsUrl, "/api/agent/heartbeat", heartbeat(agents[0]), cert.cert, agents[0])).status, 200);
    assert.equal((await httpsJson(tlsUrl, "/api/agent/heartbeat", heartbeat(agents[1]), cert.cert, agents[1])).status, 200);
    const emptyDatabaseSnapshot = { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], instances: [] };
    assert.equal((await httpsJson(tlsUrl, "/api/agent/databases/snapshot", emptyDatabaseSnapshot, cert.cert, agents[0], { protocolVersion: "1.0" })).status, 409);
    const largeTelemetry = {
      collectedAt: new Date().toISOString(), hostname: "large-agent", primaryIp: "192.0.2.10",
      cpu: { usagePercent: 20, coreUsagePercents: Array(512).fill(20) }, memory: { totalBytes: 1024, availableBytes: 512 },
      loadAverage: [1, 2, 3], uptimeSeconds: 5,
      disks: Array.from({ length: 256 }, (_, index) => ({ label: `disk-${index}`, mount: `/${"m".repeat(480)}-${index}`, totalBytes: 1024, usedBytes: 512 })),
    };
    const largeHeartbeat = { ...heartbeat(agents[0]), telemetry: largeTelemetry };
    assert.ok(Buffer.byteLength(JSON.stringify(largeHeartbeat)) > 64 * 1024);
    assert.equal((await httpsJson(tlsUrl, "/api/agent/heartbeat", largeHeartbeat, cert.cert, agents[0])).status, 200);

    const nonce = randomBytes(18).toString("base64url"); const replayBody = heartbeat(agents[0]);
    assert.equal((await httpsJson(tlsUrl, "/api/agent/heartbeat", replayBody, cert.cert, agents[0], { nonce })).status, 200);
    assert.equal((await httpsJson(tlsUrl, "/api/agent/heartbeat", replayBody, cert.cert, agents[0], { nonce })).status, 409);

    const task = await services.remoteTasks.create(agents[0].nodeId, { type: "system.summary.read", parameters: { includeLoad: false }, expiresInSeconds: 60, idempotencyKey: "tls-agent-summary-1" }, "admin", crypto.randomUUID());
    const poll = await httpsJson(tlsUrl, "/api/agent/tasks/poll", {}, cert.cert, agents[0]); assert.equal(poll.status, 200); assert.equal(poll.body.tasks[0].taskId, task.taskId);
    assert.equal((await httpsJson(tlsUrl, "/api/agent/tasks/status", { taskId: task.taskId, attempt: 1, status: "running", timestamp: new Date().toISOString() }, cert.cert, agents[0])).status, 200);
    assert.equal((await httpsJson(tlsUrl, "/api/agent/tasks/status", { taskId: task.taskId, attempt: 1, status: "succeeded", timestamp: new Date().toISOString(), result: { message: "summary collected", truncated: false } }, cert.cert, agents[0])).status, 200);

    await services.nodes.revoke(agents[1].nodeId, "admin", crypto.randomUUID()); assert.equal((await httpsJson(tlsUrl, "/api/agent/heartbeat", heartbeat(agents[1]), cert.cert, agents[1])).status, 401);
    await assert.rejects(() => httpsJson(tlsUrl, "/api/agent/enroll", {}, wrongCert.cert), /certificate|self-signed|verify|issuer/i);
    const plaintext = await fetch(`${httpUrl}/api/agent/enroll`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); assert.equal(plaintext.status, 426);
    assert.equal((await httpsJson(tlsUrl, "/api/nodes", {}, cert.cert)).status, 404);
    assert.ok(logger.records.every((record) => !JSON.stringify(record).includes(administratorToken)));
  } finally {
    tlsServer.close(); httpServer.close(); await Promise.all([once(tlsServer, "close"), once(httpServer, "close")]);
  }
});
