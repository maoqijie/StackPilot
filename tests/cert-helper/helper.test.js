import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import selfsigned from "selfsigned";
import { activatePlan, preview } from "../../apps/cert-helper/dist/activation.js";
import { buildCertificateInventory, buildCertificateMap, certificateIdForName, certificateSourceId, publicCertificatePaths } from "../../apps/cert-helper/dist/certificateMap.js";
import { loadConfig } from "../../apps/cert-helper/dist/config.js";
import { issueCertificate, renewCertbotCertificate } from "../../apps/cert-helper/dist/certificates.js";
import { updateLifecycle } from "../../apps/cert-helper/dist/lifecycle.js";
import { fitLogBudget, parseAccessLine } from "../../apps/cert-helper/dist/logs.js";
import { assertDomainsUnclaimed } from "../../apps/cert-helper/dist/nginx.js";
import { prepareRepository } from "../../apps/cert-helper/dist/repository.js";
import { siteId, SiteStateStore, stagingId } from "../../apps/cert-helper/dist/siteState.js";
import { handleRequest, parseRequest } from "../../apps/cert-helper/dist/protocol.js";

const planId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const nodeId = "33333333-3333-4333-8333-333333333333";
const digest = "a".repeat(64);
const prepareRequest = { operation: "prepare", requestId, planId, nodeId, domains: ["app.example.com"], repositoryUrl: "https://github.com/example/site.git", repositoryRef: "main", certificateEmail: "ops@example.com", certificateEnvironment: "staging", environmentVariables: [{ name: "PUBLIC_NAME", value: "example" }], expectedPlanDigest: digest };

function config(root, protectedDomains = new Set(["panel.example.com"])) {
  return { stateRoot: join(root, "state"), sitesRoot: join(root, "sites"), nginxRoot: join(root, "nginx"), environmentRoot: join(root, "env"), unitRoot: join(root, "units"), challengeRoot: join(root, "challenges"), runtimeRoot: join(root, "runtimes"), runtimeCatalogPath: join(root, "runtimes.json"), protectedDomains };
}

function prepared(overrides = {}) {
  return { planId, nodeId, domains: ["app.example.com"], repositoryUrl: prepareRequest.repositoryUrl, repositoryRef: "main", certificateEmail: "ops@example.com", certificateEnvironment: "staging", expectedPlanDigest: digest, environmentVariables: [], manifest: { schemaVersion: 1, runtime: "static", workingDirectory: ".", buildScript: null, outputDirectory: "dist", startScript: null, healthCheckPath: null }, commitSha: "b".repeat(40), releaseId: `release_${"c".repeat(32)}`, runtimePath: null, preparedAt: "2026-07-14T00:00:00.000Z", ...overrides };
}

async function writableTree(path) {
  const info = await lstat(path).catch(() => null); if (!info) return; if (info.isDirectory()) { await chmod(path, 0o755); for (const name of await readdir(path)) await writableTree(join(path, name)); } else if (!info.isSymbolicLink()) await chmod(path, 0o644);
}

test("helper protocol accepts only fixed operation schemas and public GitHub HTTPS", () => {
  assert.deepEqual(parseRequest('{"operation":"status"}'), { operation: "status" });
  assert.deepEqual(parseRequest(JSON.stringify(prepareRequest)), prepareRequest);
  const invalid = [
    { ...prepareRequest, repositoryUrl: "https://user:token@github.com/example/site.git" },
    { ...prepareRequest, repositoryUrl: "https://192.0.2.10/example/site.git" },
    { ...prepareRequest, repositoryUrl: "https://github.com/example/site.git?token=x" },
    { ...prepareRequest, environmentVariables: [{ name: "SAFE", value: "line1\nline2" }] },
    { operation: "lifecycle", requestId, siteId: "/etc/passwd", action: "deleted", expectedVersion: 1 },
    { operation: "shell", command: "id" },
  ];
  for (const value of invalid) assert.throws(() => parseRequest(JSON.stringify(value)));
});

test("prepare runs a fixed non-root Git clone and enforces strict prebuilt manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const cfg = config(root); const calls = [];
  const run = async (executable, args) => {
    calls.push({ executable, args });
    if (args.includes("clone")) {
      const repo = join(cfg.stateRoot, "workspaces", planId, "repository"); await mkdir(join(repo, ".stackpilot"), { recursive: true }); await mkdir(join(repo, "dist")); await mkdir(join(repo, ".git"));
      await writeFile(join(repo, ".stackpilot", "site.json"), JSON.stringify({ schemaVersion: 1, runtime: "static", workingDirectory: ".", buildScript: null, outputDirectory: "dist", startScript: null, healthCheckPath: null })); await writeFile(join(repo, "dist", "index.html"), "ok");
    }
    return { stdout: args.includes("rev-parse") ? "b".repeat(40) : "", stderr: "" };
  };
  try {
    const result = await prepareRepository(prepareRequest, cfg, { run });
    assert.equal(result.manifest.runtime, "static"); assert.equal(result.runtimePath, null);
    assert.equal(await readFile(join(cfg.stateRoot, "workspaces", planId, "bundle", "public", "index.html"), "utf8"), "ok");
    const clone = calls[0].args.join(" "); assert.match(clone, /--uid=stackpilot-builder/); assert.match(clone, /http.followRedirects=false/); assert.match(clone, /GIT_TERMINAL_PROMPT=0/); assert.doesNotMatch(clone, /submodule|lfs/);
  } finally { await writableTree(root); await rm(root, { recursive: true, force: true }); }
});

test("Certbot HTTP-01 staging and renewal use only fixed absolute commands", async () => {
  const calls = []; const run = async (executable, args, timeoutMs) => { calls.push({ executable, args, timeoutMs }); return { stdout: "", stderr: "" }; };
  await issueCertificate(prepared(), "/tmp/challenge", run); await renewCertbotCertificate("app.example.com", run);
  assert.deepEqual(calls.map((call) => call.executable), ["/usr/bin/certbot", "/usr/bin/certbot", "/usr/sbin/nginx", "/usr/bin/systemctl"]);
  assert.ok(calls[0].args.includes("--webroot")); assert.ok(calls[0].args.includes("--staging")); assert.ok(calls[0].args.includes("--domain"));
  assert.deepEqual(calls[1].args.slice(0, 3), ["renew", "--cert-name", "app.example.com"]);
  await assert.rejects(() => renewCertbotCertificate("../../etc/passwd", run), /Certificate name is invalid/);
});

test("activation atomically publishes an immutable release and rolls Nginx back on failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const cfg = config(root); const value = prepared();
  const bundle = join(cfg.stateRoot, "workspaces", planId, "bundle", "public"); await mkdir(bundle, { recursive: true }); await writeFile(join(bundle, "index.html"), "ok");
  try {
    const calls = []; const run = async (executable, args) => { calls.push([executable, args]); return { stdout: "", stderr: "" }; };
    const result = await activatePlan(value, cfg, { run, issue: async () => {} });
    assert.match(result.siteId, /^site-[a-f0-9]{32}$/); assert.equal(await readlink(join(cfg.sitesRoot, result.siteId, "current")), `releases/${value.releaseId}`);
    assert.match(await readFile(join(cfg.nginxRoot, `stackpilot-${result.siteId}.conf`), "utf8"), /listen 443 ssl/);
    assert.equal(await readFile(join(cfg.sitesRoot, result.siteId, "current", "public", "index.html"), "utf8"), "ok");
    const health = calls.find(([executable, args]) => executable === "/usr/bin/curl" && args.includes("--unix-socket")); assert.ok(health); assert.match(health[1].join(" "), /\/run\/stackpilot-sites\/site-[a-f0-9]{32}\.sock/);
    const callsAfterFirstActivation = calls.length;
    assert.deepEqual(await activatePlan(value, cfg, { run, issue: async () => { throw new Error("must not reissue"); } }), result);
    assert.equal(calls.length, callsAfterFirstActivation);
  } finally { await writableTree(root); await rm(root, { recursive: true, force: true }); }
});

test("activation rejects domains claimed by another loaded Nginx configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const cfg = config(root); const value = prepared();
  const bundle = join(cfg.stateRoot, "workspaces", planId, "bundle", "public"); await mkdir(bundle, { recursive: true }); await writeFile(join(bundle, "index.html"), "ok");
  const run = async (executable, args) => ({ stdout: "", stderr: executable === "/usr/sbin/nginx" && args[0] === "-T" ? "# configuration file /etc/nginx/conf.d/existing.conf:\nserver {\n  server_name app.example.com\n    alias.example.com;\n}\n" : "" });
  try { await assert.rejects(() => activatePlan(value, cfg, { run, issue: async () => {} }), /already present/); }
  finally { await writableTree(root); await rm(root, { recursive: true, force: true }); }
});

test("activation checks every loaded Nginx server_name outside the exact managed path", async () => {
  const ownedPath = "/etc/nginx/conf.d/stackpilot-site-owned.conf";
  assert.doesNotThrow(() => assertDomainsUnclaimed(`# configuration file ${ownedPath}:\nserver { server_name app.example.com; }\n`, ["app.example.com"], ownedPath));
  assert.throws(() => assertDomainsUnclaimed("# configuration file /tmp/other/stackpilot-site-owned.conf:\nserver { server_name app.example.com; }\n", ["app.example.com"], ownedPath), /already present/);
  assert.throws(() => assertDomainsUnclaimed("# configuration file /etc/nginx/conf.d/shared.conf:\nserver { server_name unrelated.example.com; server_name app.example.com; }\n", ["app.example.com"], ownedPath), /already present/);
});

test("failed static health check restores the previous release", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const cfg = config(root);
  const bundle = join(cfg.stateRoot, "workspaces", planId, "bundle", "public"); await mkdir(bundle, { recursive: true }); await writeFile(join(bundle, "index.html"), "ok");
  try {
    const first = await activatePlan(prepared(), cfg, { run: async () => ({ stdout: "", stderr: "" }), issue: async () => {} });
    const current = join(cfg.sitesRoot, first.siteId, "current"); const previousTarget = await readlink(current); const nginxPath = join(cfg.nginxRoot, `stackpilot-${first.siteId}.conf`); const previousNginx = await readFile(nginxPath, "utf8");
    const next = prepared({ releaseId: `release_${"e".repeat(32)}`, commitSha: "f".repeat(40) });
    const failedRun = async (executable, args) => { if (executable === "/usr/bin/curl" && args.includes("--unix-socket")) throw new Error("health failed"); return { stdout: "", stderr: "" }; };
    await assert.rejects(() => activatePlan(next, cfg, { run: failedRun, issue: async () => {} }), /health failed/);
    assert.equal(await readlink(current), previousTarget); assert.equal(await readFile(nginxPath, "utf8"), previousNginx);
  } finally { await writableTree(root); await rm(root, { recursive: true, force: true }); }
});

test("lifecycle serves 503, 410 and recovery while protecting core domains", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const cfg = config(root); await mkdir(cfg.nginxRoot, { recursive: true });
  const site = { siteId: `site-${"d".repeat(32)}`, planId, domains: ["app.example.com"], manifest: prepared().manifest, releaseId: prepared().releaseId, port: null, desiredState: "running", protected: false, version: 1, certificateName: "app.example.com", runtimePath: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const run = async () => ({ stdout: "", stderr: "" }); const store = new SiteStateStore(cfg); await store.saveSite(site); await writeFile(join(cfg.nginxRoot, `stackpilot-${site.siteId}.conf`), "initial");
  try {
    await assert.rejects(() => updateLifecycle(site.siteId, "stopped", 2, cfg, run), /version changed/);
    await updateLifecycle(site.siteId, "stopped", 1, cfg, run); assert.match(await readFile(join(cfg.nginxRoot, `stackpilot-${site.siteId}.conf`), "utf8"), /return 503/);
    await updateLifecycle(site.siteId, "deleted", 2, cfg, run); assert.match(await readFile(join(cfg.nginxRoot, `stackpilot-${site.siteId}.conf`), "utf8"), /return 410/);
    await updateLifecycle(site.siteId, "restored", 3, cfg, run); assert.match(await readFile(join(cfg.nginxRoot, `stackpilot-${site.siteId}.conf`), "utf8"), /listen 443 ssl/);
    await store.saveSite({ ...site, protected: true }); await assert.rejects(() => updateLifecycle(site.siteId, "stopped", 1, cfg, run), /Core StackPilot sites/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("protocol is idempotent for prepare and access logs drop query and mask clients", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const cfg = config(root); let preparedCount = 0;
  const response = await handleRequest(JSON.stringify(prepareRequest), { config: cfg, prepare: async () => { preparedCount += 1; return prepared(); } });
  const repeat = await handleRequest(JSON.stringify(prepareRequest), { config: cfg, prepare: async () => { preparedCount += 1; return prepared(); } });
  assert.equal(response.ok, true); assert.equal(repeat.ok, true); assert.equal(preparedCount, 1); assert.equal(response.data.stagingId, stagingId(planId));
  const row = parseAccessLine('192.0.2.1 - - [14/Jul/2026:00:00:00 +0000] "GET /health?token=secret HTTP/1.1" 200 12');
  assert.equal(row.path, "/health"); assert.match(row.clientAddressMasked, /^client_[a-f0-9]{12}$/); assert.doesNotMatch(JSON.stringify(row), /192\.0\.2\.1|secret/);
  const bounded = fitLogBudget(Array.from({ length: 200 }, (_, index) => ({ ...row, path: `/${index}-${"x".repeat(1900)}` })));
  const responseBytes = Buffer.byteLength(JSON.stringify({ ok: true, operation: "logs", data: { operationId: requestId, siteId: `site-${"a".repeat(32)}`, logs: bounded } }), "utf8");
  assert.ok(bounded.length > 0); assert.ok(bounded.length < 200); assert.ok(responseBytes < 16_384);
  await rm(root, { recursive: true, force: true });
});

test("prepare and activate independently reject protected core domains", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const cfg = config(root, new Set(["panel.example.com"]));
  const protectedRequest = { ...prepareRequest, domains: ["panel.example.com"] };
  const prepareResponse = await handleRequest(JSON.stringify(protectedRequest), { config: cfg, prepare: async () => prepared({ domains: ["panel.example.com"] }) });
  assert.equal(prepareResponse.ok, false); assert.equal(prepareResponse.errorCode, "CORE_SITE_PROTECTED");
  await new SiteStateStore(cfg).savePlan(prepared({ domains: ["panel.example.com"] }));
  const activateResponse = await handleRequest(JSON.stringify({ operation: "activate", requestId, planId, stagingId: stagingId(planId), expectedPlanDigest: digest }), { config: cfg, activate: async () => { throw new Error("must not activate"); } });
  assert.equal(activateResponse.ok, false); assert.equal(activateResponse.errorCode, "CORE_SITE_PROTECTED");
  await rm(root, { recursive: true, force: true });
});

test("helper readiness requires explicit core-site protection configuration", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-"));
  const certificate = { status: "valid", notBefore: "2026-01-01T00:00:00.000Z", expiresAt: "2026-09-01T00:00:00.000Z", issuer: "Test CA", subjectAlternativeNames: ["example.test"], fingerprintSha256: null, renewalMode: "automatic", renewable: true, unavailableReason: null, certificateId: `cert_${"a".repeat(32)}` };
  const ready = await handleRequest('{"operation":"status"}', { config: config(root), ready: async () => true, inventory: async () => [{ sourceId: `source_${"b".repeat(32)}`, certificate }] });
  assert.equal(ready.ok, true); assert.deepEqual(ready.data.certificates, [{ sourceId: `source_${"b".repeat(32)}`, certificate }]); assert.doesNotMatch(JSON.stringify(ready), /\/etc\/|privkey|fullchain/);
  const unsafe = await handleRequest('{"operation":"status"}', { config: config(root, new Set()), ready: async () => true }); assert.equal(unsafe.ok, false); assert.equal(unsafe.errorCode, "HELPER_NOT_READY");
  assert.equal(loadConfig({ STACKPILOT_CORE_SITE_DOMAINS: "panel.example.invalid" }).protectedDomains.size, 0);
  await rm(root, { recursive: true, force: true });
});

test("certificate mapping reads active public certificates and ignores private key directives", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-cert-helper-"));
  const nginxRoot = join(root, "sites-enabled");
  const liveRoot = join(root, "letsencrypt", "live");
  await mkdir(nginxRoot, { recursive: true });
  await mkdir(join(liveRoot, "app.example.test"), { recursive: true });
  const fullchain = join(liveRoot, "app.example.test", "fullchain.pem");
  const privateKey = join(liveRoot, "app.example.test", "privkey.pem");
  try {
    const source = `server { ssl_certificate ${fullchain}; ssl_certificate_key ${privateKey}; }`;
    const pair = await selfsigned.generate([{ name: "commonName", value: "app.example.test" }], { days: 30, keySize: 2048, extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: "app.example.test" }] }] });
    await writeFile(join(nginxRoot, "app.conf"), source);
    await writeFile(fullchain, pair.cert);
    await writeFile(join(nginxRoot, "disabled.conf.bak"), `ssl_certificate ${join(liveRoot, "disabled", "fullchain.pem")};`);
    assert.deepEqual(publicCertificatePaths(source), [fullchain]);
    const mapping = await buildCertificateMap([nginxRoot], liveRoot);
    assert.equal(mapping.get(certificateIdForName("app.example.test")), "app.example.test");
    assert.equal([...mapping.values()].includes("disabled"), false);
    assert.doesNotMatch(JSON.stringify([...mapping]), /privkey/);
    const inventory = await buildCertificateInventory([nginxRoot], liveRoot);
    assert.equal(inventory[0].sourceId, certificateSourceId(fullchain));
    assert.equal(inventory[0].certificate.certificateId, certificateIdForName("app.example.test"));
    assert.equal(inventory[0].certificate.renewable, true);
    assert.doesNotMatch(JSON.stringify(inventory), /fullchain|privkey|\/etc\//);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Node activation skips managed and system-occupied ports", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const cfg = config(root);
  const value = prepared({ manifest: { ...prepared().manifest, runtime: "node22", outputDirectory: ".", startScript: "start", healthCheckPath: "/health" }, runtimePath: "/opt/stackpilot-runtimes/node22" });
  const bundle = join(cfg.stateRoot, "workspaces", planId, "bundle", "app"); await mkdir(bundle, { recursive: true }); await writeFile(join(bundle, "package.json"), "{}");
  const id = siteId(nodeId, value.domains[0]); const first = 20_000 + Number.parseInt(id.slice(-4), 16) % 20_000; const second = 20_000 + (first - 20_000 + 1) % 20_000; const third = 20_000 + (first - 20_000 + 2) % 20_000;
  const occupied = { siteId: `site-${"d".repeat(32)}`, planId, domains: ["other.example.com"], manifest: value.manifest, releaseId: value.releaseId, port: first, desiredState: "running", protected: false, version: 1, certificateName: "other.example.com", runtimePath: value.runtimePath, createdAt: value.preparedAt, updatedAt: value.preparedAt };
  const store = new SiteStateStore(cfg); await store.saveSite(occupied); const probed = [];
  const run = async (_executable, args) => { assert.notEqual(args[0], "show", "a new unit has no previous enabled state"); return { stdout: "", stderr: "" }; };
  try {
    const result = await activatePlan(value, cfg, { run, issue: async () => {}, isPortAvailable: async (port) => { probed.push(port); return port !== second; } });
    assert.deepEqual(probed, [second, third]); assert.equal((await store.site(result.siteId)).port, third);
  } finally { await writableTree(root); await rm(root, { recursive: true, force: true }); }
});

test("failed Node activation restores the previous enabled state", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const cfg = config(root);
  const nodeManifest = { ...prepared().manifest, runtime: "node22", outputDirectory: ".", startScript: "start", healthCheckPath: "/health" }; const runtimePath = "/opt/stackpilot-runtimes/node22";
  const bundle = join(cfg.stateRoot, "workspaces", planId, "bundle", "app"); await mkdir(bundle, { recursive: true }); await writeFile(join(bundle, "package.json"), "{}");
  let enabled = false; let failHealth = false; const calls = [];
  const run = async (executable, args) => { calls.push([executable, ...args]); if (executable === "/usr/bin/systemctl" && args[0] === "show") return { stdout: `${enabled ? "enabled" : "disabled"}\n`, stderr: "" }; if (executable === "/usr/bin/systemctl" && args[0] === "enable") enabled = true; if (executable === "/usr/bin/systemctl" && args[0] === "disable") enabled = false; if (executable === "/usr/bin/curl" && failHealth) throw new Error("health failed"); return { stdout: "", stderr: "" }; };
  try {
    const first = prepared({ manifest: nodeManifest, runtimePath }); const activated = await activatePlan(first, cfg, { run, issue: async () => {}, isPortAvailable: async () => true });
    const unitPath = join(cfg.unitRoot, `stackpilot-site-${activated.siteId}.service`); const previousUnit = await readFile(unitPath, "utf8"); failHealth = true;
    const next = prepared({ manifest: nodeManifest, runtimePath, releaseId: `release_${"e".repeat(32)}`, commitSha: "f".repeat(40) });
    await assert.rejects(() => activatePlan(next, cfg, { run, issue: async () => {}, isPortAvailable: async () => { throw new Error("existing port must be retained"); } }), /health failed/);
    assert.equal(enabled, true); assert.equal(await readFile(unitPath, "utf8"), previousUnit); enabled = false; const start = calls.length;
    await assert.rejects(() => activatePlan(next, cfg, { run, issue: async () => {}, isPortAvailable: async () => { throw new Error("existing port must be retained"); } }), /health failed/);
    assert.equal(enabled, false); assert.equal(await readFile(unitPath, "utf8"), previousUnit);
    const attempt = calls.slice(start); assert.ok(attempt.findLastIndex((call) => call[1] === "disable") > attempt.findLastIndex((call) => call[1] === "enable"));
  } finally { await writableTree(root); await rm(root, { recursive: true, force: true }); }
});

test("failed first Node activation stops and disables the new unit", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-helper-")); const cfg = config(root);
  const value = prepared({ manifest: { ...prepared().manifest, runtime: "node22", outputDirectory: ".", startScript: "start", healthCheckPath: "/health" }, runtimePath: "/opt/stackpilot-runtimes/node22" });
  const bundle = join(cfg.stateRoot, "workspaces", planId, "bundle", "app"); await mkdir(bundle, { recursive: true }); await writeFile(join(bundle, "package.json"), "{}");
  const calls = []; const run = async (executable, args) => { calls.push([executable, ...args]); assert.notEqual(args[0], "show", "a new unit has no previous enabled state"); if (executable === "/usr/bin/curl") throw new Error("health failed"); return { stdout: "", stderr: "" }; };
  try {
    await assert.rejects(() => activatePlan(value, cfg, { run, issue: async () => {}, isPortAvailable: async () => true }), /health failed/);
    const enable = calls.findIndex((call) => call[1] === "enable"); const stop = calls.findLastIndex((call) => call[1] === "stop"); const disable = calls.findLastIndex((call) => call[1] === "disable"); const daemonReload = calls.findLastIndex((call) => call[1] === "daemon-reload");
    assert.ok(enable >= 0); assert.ok(stop > enable); assert.ok(disable > stop); assert.ok(daemonReload > disable);
  } finally { await writableTree(root); await rm(root, { recursive: true, force: true }); }
});
