import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { activatePlan, preview } from "../../apps/cert-helper/dist/activation.js";
import { loadConfig } from "../../apps/cert-helper/dist/config.js";
import { issueCertificate, renewCertbotCertificate } from "../../apps/cert-helper/dist/certificates.js";
import { updateLifecycle } from "../../apps/cert-helper/dist/lifecycle.js";
import { fitLogBudget, parseAccessLine } from "../../apps/cert-helper/dist/logs.js";
import { assertDomainsUnclaimed } from "../../apps/cert-helper/dist/nginx.js";
import { prepareRepository } from "../../apps/cert-helper/dist/repository.js";
import { SiteStateStore, stagingId } from "../../apps/cert-helper/dist/siteState.js";
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
  assert.equal((await handleRequest('{"operation":"status"}', { config: config(root), ready: async () => true })).ok, true);
  const unsafe = await handleRequest('{"operation":"status"}', { config: config(root, new Set()), ready: async () => true }); assert.equal(unsafe.ok, false); assert.equal(unsafe.errorCode, "HELPER_NOT_READY");
  assert.equal(loadConfig({ STACKPILOT_CORE_SITE_DOMAINS: "panel.example.invalid" }).protectedDomains.size, 0);
  await rm(root, { recursive: true, force: true });
});
