import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { rm, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import selfsigned from "selfsigned";
import { ControllerClient } from "../../apps/agent/dist/transport/controllerClient.js";

test("Controller client enables advertised Agent features only while present", async () => {
  const work = await mkdtemp(join(tmpdir(), "stackpilot-agent-features-"));
  const certificate = await selfsigned.generate([{ name: "commonName", value: "localhost" }], { keySize: 2048, days: 1, algorithm: "sha256", extensions: [{ name: "basicConstraints", cA: true }, { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true }, { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }] });
  const caPath = join(work, "ca.crt"); await writeFile(caPath, certificate.cert);
  let advertise = true;
  const server = createServer({ cert: certificate.cert, key: certificate.private }, (request, response) => {
    request.resume(); request.on("end", () => {
      if (advertise) response.setHeader("X-StackPilot-Agent-Features", "database-inventory-v1, physical-host-identity-v1");
      response.writeHead(advertise ? 200 : 400, { "Content-Type": "application/json" });
      response.end(advertise ? "{}" : '{"error":"unsupported"}');
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const client = new ControllerClient(`https://127.0.0.1:${server.address().port}`, caPath);
  try {
    assert.equal(client.supportsDatabaseInventory(), false);
    assert.equal(client.supportsPhysicalHostIdentity(), false);
    await client.json("/api/agent/heartbeat", {}); assert.equal(client.supportsDatabaseInventory(), true); assert.equal(client.supportsPhysicalHostIdentity(), true);
    advertise = false; await assert.rejects(client.json("/api/agent/heartbeat", {}));
    assert.equal(client.supportsDatabaseInventory(), false);
    assert.equal(client.supportsPhysicalHostIdentity(), false);
  } finally { server.close(); await once(server, "close"); }
  await rm(work, { recursive: true, force: true });
});

test("Controller client retries a physical identity heartbeat against a legacy Controller", async () => {
  const work = await mkdtemp(join(tmpdir(), "stackpilot-agent-compat-"));
  const certificate = await selfsigned.generate([{ name: "commonName", value: "localhost" }], { keySize: 2048, days: 1, algorithm: "sha256", extensions: [{ name: "basicConstraints", cA: true }, { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true }, { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }] });
  const caPath = join(work, "ca.crt"); await writeFile(caPath, certificate.cert);
  const requests = [];
  const server = createServer({ cert: certificate.cert, key: certificate.private }, (request, response) => {
    const chunks = []; request.on("data", (chunk) => chunks.push(chunk)); request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); requests.push(body);
      response.writeHead("physicalHostId" in body ? 400 : 200, { "Content-Type": "application/json" }); response.end("{}");
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const client = new ControllerClient(`https://127.0.0.1:${server.address().port}`, caPath);
  const pair = generateKeyPairSync("ed25519");
  const identity = { nodeId: "11111111-1111-4111-8111-111111111111", credentialId: "22222222-2222-4222-8222-222222222222", privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(), protocolVersion: "1.0", createdAt: new Date().toISOString() };
  try {
    await client.json("/api/agent/heartbeat", { physicalHostId: `ph_${"a".repeat(64)}` }, identity);
    assert.deepEqual(requests.map((body) => "physicalHostId" in body), [true, false]);
  } finally { server.close(); await once(server, "close"); await rm(work, { recursive: true, force: true }); }
});

test("Controller client does not replay a physical identity heartbeat after a server failure", async () => {
  const work = await mkdtemp(join(tmpdir(), "stackpilot-agent-no-replay-"));
  const certificate = await selfsigned.generate([{ name: "commonName", value: "localhost" }], { keySize: 2048, days: 1, algorithm: "sha256", extensions: [{ name: "basicConstraints", cA: true }, { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true }, { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }] });
  const caPath = join(work, "ca.crt"); await writeFile(caPath, certificate.cert);
  let requests = 0;
  const server = createServer({ cert: certificate.cert, key: certificate.private }, (request, response) => {
    request.resume(); request.on("end", () => { requests += 1; response.writeHead(503, { "Content-Type": "application/json" }); response.end("{}"); });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const client = new ControllerClient(`https://127.0.0.1:${server.address().port}`, caPath);
  const pair = generateKeyPairSync("ed25519");
  const identity = { nodeId: "11111111-1111-4111-8111-111111111111", credentialId: "22222222-2222-4222-8222-222222222222", privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString(), protocolVersion: "1.0", createdAt: new Date().toISOString() };
  try {
    await assert.rejects(client.json("/api/agent/heartbeat", { physicalHostId: `ph_${"a".repeat(64)}` }, identity));
    assert.equal(requests, 1);
  } finally { server.close(); await once(server, "close"); await rm(work, { recursive: true, force: true }); }
});
