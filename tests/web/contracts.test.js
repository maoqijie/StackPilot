import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("web API clients consume the public contracts package", async () => {
  const sources = await Promise.all([
    readFile(new URL("../../apps/web/src/api/overviewApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/scheduleApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/agentApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/hostsApi.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(sources.every((source) => source.includes("@stackpilot/contracts")));
});

test("Web authentication uses Cookie credentials and memory-only CSRF/reauth values", async () => {
  const [agentSource, clientSource] = await Promise.all([
    readFile(new URL("../../apps/web/src/api/agentApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/client.ts", import.meta.url), "utf8"),
  ]);
  assert.match(clientSource, /credentials: "include"/);
  assert.match(agentSource, /"X-Reauth-Proof":reauthProof/);
  assert.doesNotMatch(`${agentSource}\n${clientSource}`, /localStorage|sessionStorage|document\.cookie|VITE_|Authorization/);
});

test("Vite proxies API and health routes to the Controller", async () => {
  const config = await readFile(new URL("../../apps/web/vite.config.ts", import.meta.url), "utf8");
  assert.match(config, /"\/api": apiProxy/);
  assert.match(config, /"\/healthz": apiProxy/);
});
