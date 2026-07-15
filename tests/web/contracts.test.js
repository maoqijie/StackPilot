import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("web API clients consume the public contracts package", async () => {
  const sources = await Promise.all([
    readFile(new URL("../../apps/web/src/api/overviewApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/scheduleApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/agentApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/hostsApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/sitesApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/databasesApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/filesApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/systemdApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/firewallApi.ts", import.meta.url), "utf8"),
  ]);
  assert.ok(sources.every((source) => source.includes("@stackpilot/contracts")));
});

test("Web authentication uses Cookie credentials and memory-only CSRF/reauth values", async () => {
  const [agentSource, clientSource, sitesSource] = await Promise.all([
    readFile(new URL("../../apps/web/src/api/agentApi.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/client.ts", import.meta.url), "utf8"),
    readFile(new URL("../../apps/web/src/api/sitesApi.ts", import.meta.url), "utf8"),
  ]);
  assert.match(clientSource, /credentials: "include"/);
  assert.match(agentSource, /"X-Reauth-Proof":reauthProof/);
  assert.match(sitesSource, /"X-Reauth-Proof": reauthProof/);
  assert.doesNotMatch(`${agentSource}\n${clientSource}\n${sitesSource}`, /localStorage|sessionStorage|document\.cookie|VITE_|Authorization/);
});

test("Vite proxies API and health routes to the Controller", async () => {
  const config = await readFile(new URL("../../apps/web/vite.config.ts", import.meta.url), "utf8");
  assert.match(config, /"\/api": apiProxy/);
  assert.match(config, /"\/healthz": apiProxy/);
});

test("Web tests rely on the jsdom environment instead of unsupported Node options", async () => {
  const packageJson = JSON.parse(await readFile(new URL("../../apps/web/package.json", import.meta.url), "utf8"));
  assert.match(packageJson.scripts.test, /^vitest run/);
  assert.doesNotMatch(packageJson.scripts.test, /NODE_OPTIONS|webstorage/);
});
