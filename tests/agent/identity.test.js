import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadAgentConfig } from "../../apps/agent/dist/config/environment.js";
import { IdentityStore } from "../../apps/agent/dist/identity/identityStore.js";
import { rotateIdentity, shouldUseSystemdDatabaseFallback } from "../../apps/agent/dist/main.js";

test("Agent configuration requires a verified HTTPS Controller URL", () => {
  assert.throws(() => loadAgentConfig({ STACKPILOT_CONTROLLER_URL: "http://127.0.0.1:9443", STACKPILOT_AGENT_CA_PATH: "ca.pem" }), /HTTPS/);
  assert.equal(loadAgentConfig({ STACKPILOT_CONTROLLER_URL: "https://localhost:9443", STACKPILOT_AGENT_CA_PATH: "ca.pem" }).controllerUrl, "https://localhost:9443");
});

test("database-helper inventory takes precedence over the systemd fallback", () => {
  assert.equal(shouldUseSystemdDatabaseFallback(false, false), false);
  assert.equal(shouldUseSystemdDatabaseFallback(true, false), true);
  assert.equal(shouldUseSystemdDatabaseFallback(true, true), false);
});

test("credential rotation persists one pending key and retries the same rotation id", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-identity-test-"));
  try {
    const store = new IdentityStore(directory); const pair = store.createKeyPair();
    const current = { nodeId: "11111111-1111-4111-8111-111111111111", credentialId: "22222222-2222-4222-8222-222222222222", ...pair, protocolVersion: "1.0", createdAt: new Date().toISOString() }; await store.write(current);
    const requests = [];
    const client = { async json(_path, body) { requests.push(body); if (requests.length === 1) throw new Error("lost response"); return { credentialId: "33333333-3333-4333-8333-333333333333", rotatedAt: new Date().toISOString() }; } };
    await assert.rejects(() => rotateIdentity(store, client, current), /lost response/); const pending = await store.readPendingRotation(); assert.ok(pending);
    const rotated = await rotateIdentity(store, client, current); assert.equal(rotated.credentialId, "33333333-3333-4333-8333-333333333333"); assert.equal(requests[0].rotationId, requests[1].rotationId); assert.equal(requests[0].publicKey, requests[1].publicKey); assert.equal(await store.readPendingRotation(), null);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
