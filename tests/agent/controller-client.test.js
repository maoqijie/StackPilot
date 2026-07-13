import assert from "node:assert/strict";
import test from "node:test";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import selfsigned from "selfsigned";
import { ControllerClient } from "../../apps/agent/dist/transport/controllerClient.js";

test("Controller client enables database inventory only while advertised", async () => {
  const work = await mkdtemp(join(tmpdir(), "stackpilot-agent-features-"));
  const certificate = await selfsigned.generate([{ name: "commonName", value: "localhost" }], { keySize: 2048, days: 1, algorithm: "sha256", extensions: [{ name: "basicConstraints", cA: true }, { name: "keyUsage", keyCertSign: true, digitalSignature: true, keyEncipherment: true }, { name: "subjectAltName", altNames: [{ type: 2, value: "localhost" }, { type: 7, ip: "127.0.0.1" }] }] });
  const caPath = join(work, "ca.crt"); await writeFile(caPath, certificate.cert);
  let advertise = true;
  const server = createServer({ cert: certificate.cert, key: certificate.private }, (request, response) => {
    request.resume(); request.on("end", () => {
      if (advertise) response.setHeader("X-StackPilot-Agent-Features", "database-inventory-v1");
      response.writeHead(advertise ? 200 : 400, { "Content-Type": "application/json" });
      response.end(advertise ? "{}" : '{"error":"unsupported"}');
    });
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const client = new ControllerClient(`https://127.0.0.1:${server.address().port}`, caPath);
  try {
    assert.equal(client.supportsDatabaseInventory(), false);
    await client.json("/api/agent/heartbeat", {}); assert.equal(client.supportsDatabaseInventory(), true);
    advertise = false; await assert.rejects(client.json("/api/agent/heartbeat", {}));
    assert.equal(client.supportsDatabaseInventory(), false);
  } finally { server.close(); await once(server, "close"); }
});
