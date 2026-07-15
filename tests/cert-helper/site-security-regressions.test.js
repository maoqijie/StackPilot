import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { activatePlan } from "../../apps/cert-helper/dist/activation.js";
import { parseAccessLine } from "../../apps/cert-helper/dist/logs.js";
import { assertDomainsUnclaimed } from "../../apps/cert-helper/dist/nginx.js";
import { assertManagedPortOwner, assertPortAvailable, siteId, SiteStateStore } from "../../apps/cert-helper/dist/siteState.js";

const nodeId = "33333333-3333-4333-8333-333333333333";
const digest = "a".repeat(64);

function config(root) {
  return { stateRoot: join(root, "state"), sitesRoot: join(root, "sites"), nginxRoot: join(root, "nginx"), environmentRoot: join(root, "env"), unitRoot: join(root, "units"), challengeRoot: join(root, "challenges"), runtimeRoot: join(root, "runtimes"), runtimeCatalogPath: join(root, "runtimes.json"), protectedDomains: new Set(["panel.example.com"]) };
}

function plan(planId, releaseCharacter) {
  return { planId, nodeId, domains: ["app.example.com"], repositoryUrl: "https://github.com/example/site.git", repositoryRef: "main", certificateEmail: "ops@example.com", certificateEnvironment: "staging", expectedPlanDigest: digest, environmentVariables: [], manifest: { schemaVersion: 1, runtime: "static", workingDirectory: ".", buildScript: null, outputDirectory: "dist", startScript: null, healthCheckPath: null }, commitSha: releaseCharacter.repeat(40), releaseId: `release_${releaseCharacter.repeat(32)}`, runtimePath: null, preparedAt: "2026-07-14T00:00:00.000Z" };
}

function managedSite(id, port) {
  const now = new Date().toISOString();
  return { siteId: id, planId: "11111111-1111-4111-8111-111111111111", domains: ["app.example.com"], manifest: plan("11111111-1111-4111-8111-111111111111", "a").manifest, releaseId: `release_${"a".repeat(32)}`, port, desiredState: "running", protected: false, version: 1, certificateName: "app.example.com", runtimePath: "/opt/node", createdAt: now, updatedAt: now };
}

async function writableTree(path) {
  const info = await lstat(path).catch(() => null); if (!info) return;
  if (info.isDirectory()) { await chmod(path, 0o755); for (const name of await readdir(path)) await writableTree(join(path, name)); }
  else if (!info.isSymbolicLink()) await chmod(path, 0o644);
}

const nginx = (body, path = "/etc/nginx/conf.d/existing.conf") => `# configuration file ${path}:\nserver {\n${body}\n}\n`;

test("Nginx ownership rejects exact, wildcard and regex claims and fails closed", () => {
  for (const claim of ["app.example.com", "*.example.com", ".example.com", "app.*", "~^app\\.example\\.com$", "~*^APP\\.EXAMPLE\\.COM$"]) {
    assert.throws(() => assertDomainsUnclaimed(nginx(`server_name ${claim};`), ["app.example.com"], "/etc/nginx/conf.d/owned.conf"), (error) => error.code === "DOMAIN_ALREADY_CLAIMED");
  }
  for (const claim of ["$host", "~^(app|api)\\.example\\.com$", "~app\\.example\\.com", "~^app[.]example[.]com$", "api*example.com", "app.example.com { }"]) {
    assert.throws(() => assertDomainsUnclaimed(nginx(`server_name ${claim};`), ["app.example.com"], "/etc/nginx/conf.d/owned.conf"), (error) => error.code === "DOMAIN_OWNERSHIP_UNDETERMINED");
  }
  assert.doesNotThrow(() => assertDomainsUnclaimed(nginx("server_name api.example.net docs.example.net;"), ["app.example.com"], "/etc/nginx/conf.d/owned.conf"));
  assert.doesNotThrow(() => assertDomainsUnclaimed(nginx("server_name ~^api\\.example\\.com$;"), ["app.example.com"], "/etc/nginx/conf.d/owned.conf"));
  assert.doesNotThrow(() => assertDomainsUnclaimed(nginx("server_name $host;", "/etc/nginx/conf.d/owned.conf"), ["app.example.com"], "/etc/nginx/conf.d/owned.conf"));
});

test("client masking uses one concurrent-safe persistent 0600 HMAC key", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-security-")); const store = new SiteStateStore(config(root));
  try {
    const keys = await Promise.all(Array.from({ length: 12 }, () => store.logMaskingKey()));
    assert.equal(new Set(keys.map((key) => key.toString("hex"))).size, 1);
    const keyPath = join(root, "state", "secrets", "log-masking.key"); assert.equal((await stat(keyPath)).mode & 0o777, 0o600);
    const line = '192.0.2.1 - - [14/Jul/2026:00:00:00 +0000] "GET /health HTTP/1.1" 200 12';
    const first = parseAccessLine(line, keys[0]).clientAddressMasked; const afterRestart = parseAccessLine(line, await new SiteStateStore(config(root)).logMaskingKey()).clientAddressMasked;
    assert.equal(first, afterRestart); assert.match(first, /^client_[a-f0-9]{12}$/);
    assert.notEqual(first, `client_${createHash("sha256").update("192.0.2.1").digest("hex").slice(0, 12)}`);
    assert.doesNotMatch(JSON.stringify(parseAccessLine(line, keys[0])), new RegExp(keys[0].toString("hex")));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("port allocations are persistent and unique across concurrent stores and upgrades", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-security-")); const cfg = config(root); const first = new SiteStateStore(cfg); const second = new SiteStateStore(cfg);
  const firstId = `site-${"1".repeat(32)}`; const secondId = `site-${"2".repeat(32)}`; const legacyId = `site-${"3".repeat(32)}`;
  try {
    const [firstPort, secondPort] = await Promise.all([first.allocatePort(firstId, 31_345), second.allocatePort(secondId, 31_345)]);
    assert.notEqual(firstPort, secondPort); assert.equal(await new SiteStateStore(cfg).allocatePort(firstId), firstPort);
    await first.saveSite(managedSite(legacyId, 31_346)); assert.notEqual(await second.allocatePort(secondId, 31_346), 31_346); assert.equal(await first.allocatePort(legacyId, 31_346), 31_346);
    await first.saveSite({ ...managedSite(firstId, firstPort), desiredState: "deleted" }); assert.equal(await new SiteStateStore(cfg).allocatePort(firstId), firstPort);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("failed availability probes release a new port lease", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-security-")); const cfg = config(root); const first = new SiteStateStore(cfg); const second = new SiteStateStore(cfg);
  const firstId = `site-${"6".repeat(32)}`; const secondId = `site-${"7".repeat(32)}`;
  try {
    const port = await first.allocatePort(firstId, 31_347, async (candidate) => candidate !== 31_347);
    assert.notEqual(port, 31_347); assert.equal(await second.allocatePort(secondId, 31_347), 31_347);
    const throwingId = `site-${"8".repeat(32)}`; await assert.rejects(() => first.allocatePort(throwingId, 31_348, async () => { throw new Error("probe failed"); }), /probe failed/);
    assert.equal(await second.allocatePort(`site-${"9".repeat(32)}`, 31_348), 31_348);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("site lock serializes concurrent holders and recovers a dead process owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-security-")); const cfg = config(root); const first = new SiteStateStore(cfg); const second = new SiteStateStore(cfg); const id = `site-${"4".repeat(32)}`;
  let release; const gate = new Promise((resolve) => { release = resolve; }); const order = [];
  try {
    const holding = first.withSiteLock(id, async () => { order.push("first-start"); await gate; order.push("first-end"); });
    while (order.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
    const waiting = second.withSiteLock(id, async () => { order.push("second"); }); await new Promise((resolve) => setTimeout(resolve, 30)); assert.deepEqual(order, ["first-start"]);
    release(); await Promise.all([holding, waiting]); assert.deepEqual(order, ["first-start", "first-end", "second"]);
    let active = 0; let maximum = 0;
    await Promise.all(Array.from({ length: 20 }, (_, index) => second.withSiteLock(id, async () => {
      active += 1; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, index % 3)); active -= 1;
    })));
    assert.equal(maximum, 1);
    const lock = join(cfg.stateRoot, "locks", `${id}.lock`); await mkdir(lock); await writeFile(join(lock, "owner.json"), JSON.stringify({ token: "dead", pid: 2_147_483_647 }));
    await second.withSiteLock(id, async () => { order.push("recovered"); }); assert.equal(order.at(-1), "recovered");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("site lock never evicts a live owner based only on elapsed time", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-security-")); const cfg = config(root); const store = new SiteStateStore(cfg); const id = `site-${"5".repeat(32)}`;
  const lockRoot = join(cfg.stateRoot, "locks"); const lock = join(lockRoot, `${id}.lock`); await mkdir(lockRoot, { recursive: true }); await symlink(`${process.pid}:unknown:11111111-1111-4111-8111-111111111111`, lock); let entered = false;
  try {
    const waiting = store.withSiteLock(id, async () => { entered = true; }); await new Promise((resolve) => setTimeout(resolve, 50)); assert.equal(entered, false);
    await rm(lock, { recursive: true, force: true }); await waiting; assert.equal(entered, true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("activation preflight rejects a port already listening for another service", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-security-")); const proc = join(root, "proc"); const port = 31_345;
  try {
    await mkdir(join(proc, "net"), { recursive: true });
    const header = "sl local_address rem_address st tx_queue tr tm->when retrnsmt uid timeout inode\n";
    await writeFile(join(proc, "net", "tcp"), `${header}0: 0100007F:7A71 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 999\n`); await writeFile(join(proc, "net", "tcp6"), header);
    await assert.rejects(() => assertPortAvailable(port, proc), (error) => error.code === "SITE_PORT_IN_USE");
    await assert.doesNotReject(() => assertPortAvailable(port + 1, proc));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("managed port ownership accepts only listeners in the systemd cgroup", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-security-")); const proc = join(root, "proc"); const cgroup = join(root, "cgroup"); const port = 31_345; const state = "ActiveState=active\nSubState=running\nMainPID=123\nControlGroup=/system.slice/site.service\n";
  try {
    await mkdir(join(proc, "net"), { recursive: true }); await mkdir(join(proc, "123", "fd"), { recursive: true }); await mkdir(join(cgroup, "system.slice", "site.service"), { recursive: true });
    const header = "sl local_address rem_address st tx_queue tr tm->when retrnsmt uid timeout inode\n";
    await writeFile(join(proc, "net", "tcp"), `${header}0: 0100007F:7A71 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 999\n`); await writeFile(join(proc, "net", "tcp6"), header);
    await writeFile(join(cgroup, "system.slice", "site.service", "cgroup.procs"), "123\n"); await symlink("socket:[999]", join(proc, "123", "fd", "7"));
    await assert.doesNotReject(() => assertManagedPortOwner(port, state, { procRoot: proc, cgroupRoot: cgroup }));
    await rm(join(proc, "123", "fd", "7")); await symlink("socket:[998]", join(proc, "123", "fd", "7"));
    await assert.rejects(() => assertManagedPortOwner(port, state, { procRoot: proc, cgroupRoot: cgroup }), (error) => error.code === "PORT_OWNERSHIP_UNVERIFIED");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("a failed activation cannot roll back a later activation for the same site", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-security-")); const cfg = config(root);
  const first = plan("11111111-1111-4111-8111-111111111111", "b"); const second = plan("22222222-2222-4222-8222-222222222222", "c");
  for (const value of [first, second]) { const bundle = join(cfg.stateRoot, "workspaces", value.planId, "bundle", "public"); await mkdir(bundle, { recursive: true }); await writeFile(join(bundle, "index.html"), value.releaseId); }
  let releaseFailure; const failureGate = new Promise((resolve) => { releaseFailure = resolve; }); let secondStarted = false;
  const firstRun = async (executable, args) => { if (executable === "/usr/bin/curl" && args.includes("--unix-socket")) { await failureGate; throw new Error("late health failure"); } return { stdout: "", stderr: "" }; };
  const secondRun = async (executable) => { if (executable === "/usr/sbin/nginx") secondStarted = true; return { stdout: "", stderr: "" }; };
  try {
    const failed = activatePlan(first, cfg, { run: firstRun, issue: async () => {} });
    while (!(await lstat(join(cfg.sitesRoot, siteId(nodeId, "app.example.com"), "current")).catch(() => null))) await new Promise((resolve) => setTimeout(resolve, 5));
    const succeeded = activatePlan(second, cfg, { run: secondRun, issue: async () => {} }); await new Promise((resolve) => setTimeout(resolve, 50)); assert.equal(secondStarted, false);
    releaseFailure(); await assert.rejects(() => failed, /late health failure/); const result = await succeeded; assert.equal(result.releaseId, second.releaseId);
    assert.equal(await readlink(join(cfg.sitesRoot, result.siteId, "current")), `releases/${second.releaseId}`); assert.equal((await new SiteStateStore(cfg).site(result.siteId)).releaseId, second.releaseId);
  } finally { await writableTree(root); await rm(root, { recursive: true, force: true }); }
});
