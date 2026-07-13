import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseHelperServer } from "../../apps/database-helper/dist/server.js";
import { DatabaseHelperClient } from "../../apps/agent/dist/databases/helperClient.js";

test("Unix socket exchanges one strict bounded request without exposing arbitrary actions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-helper-socket-")), path = join(directory, "helper.sock");
  const collection = { snapshot: { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], instances: [] }, queryUpload: { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], sessions: [], queries: [] } };
  const server = new DatabaseHelperServer({ async collect() { return collection; } }, { async execute() { throw new Error("unexpected"); } });
  const socket = server.listen({ path });
  try {
    await new Promise((resolve, reject) => { socket.once("listening", resolve); socket.once("error", reject); });
    const response = await new DatabaseHelperClient(path).request({ action: "collect" });
    assert.deepEqual(response, { ok: true, result: collection });
    assert.equal((await server.handle({ action: "shell", command: "id" })).code, "INVALID_REQUEST");
  } finally { await new Promise((resolve) => socket.close(resolve)); await rm(directory, { recursive: true, force: true }); }
});
