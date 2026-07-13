import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import selfsigned from "selfsigned";
import { AgentSiteSnapshotSchema } from "@stackpilot/contracts";
import { certificateSourceIdForPath } from "../../apps/agent/dist/sites/certificateIdentity.js";
import { NginxSiteCollector, SiteSnapshotCache } from "../../apps/agent/dist/sites/nginxCollector.js";

const nodeId = "11111111-1111-4111-8111-111111111111";

test("Linux inventory reads only the configured public PEM and emits opaque stable identifiers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-sites-"));
  try {
    const nginxRoot = join(directory, "sites-enabled"); const liveRoot = join(directory, "letsencrypt", "live"); const certDir = join(liveRoot, "example.test");
    await mkdir(nginxRoot, { recursive: true }); await mkdir(certDir, { recursive: true });
    const pair = await selfsigned.generate([{ name: "commonName", value: "example.test" }], { days: 30, keySize: 2048, extensions: [{ name: "subjectAltName", altNames: [{ type: 2, value: "example.test" }, { type: 2, value: "www.example.test" }] }] });
    const publicPath = join(certDir, "fullchain.pem"); const privatePath = join(certDir, "privkey.pem"); const configPath = join(nginxRoot, "site.conf");
    await writeFile(publicPath, pair.cert); await writeFile(privatePath, pair.private);
    await writeFile(join(nginxRoot, "misplaced-private.key"), pair.private);
    await writeFile(configPath, `
      server { listen 80; server_name example.test; proxy_pass http://127.0.0.1:3000; }
      server { listen 443 ssl; server_name example.test; ssl_certificate ${publicPath}; ssl_certificate_key ${privatePath}; proxy_pass http://127.0.0.1:3000; }
    `);
    const reads = [];
    const certificateId = `cert_${"a".repeat(32)}`;
    const helperCertificate = { status: "valid", notBefore: "2026-01-01T00:00:00.000Z", expiresAt: "2026-09-01T00:00:00.000Z", issuer: "Test CA", subjectAlternativeNames: ["example.test", "www.example.test"], fingerprintSha256: null, renewalMode: "automatic", renewable: true, unavailableReason: null, certificateId };
    const collector = new NginxSiteCollector(nodeId, { roots: [nginxRoot], hostName: "node-a", helperCertificates: async () => new Map([[certificateSourceIdForPath(publicPath), helperCertificate]]), readText: async (path) => { reads.push(path); return readFile(path, "utf8"); } });
    const snapshot = AgentSiteSnapshotSchema.parse(await collector.collect("linux"));
    assert.equal(snapshot.collectionStatus, "complete"); assert.equal(snapshot.sites.length, 1);
    assert.match(snapshot.sites[0].id, /^site_[a-f0-9]{32}$/); assert.equal(snapshot.sites[0].domain, "example.test");
    assert.equal(snapshot.sites[0].certificate.renewable, true); assert.equal(snapshot.sites[0].certificate.renewalMode, "automatic");
    assert.equal(snapshot.sites[0].certificate.certificateId, certificateId);
    assert.deepEqual(snapshot.sites[0].certificate.subjectAlternativeNames.sort(), ["example.test", "www.example.test"]);
    assert.ok(!reads.includes(publicPath)); assert.ok(!reads.includes(privatePath)); assert.ok(!reads.some((path) => path.endsWith("misplaced-private.key")));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("inventory marks non-Linux and unavailable helper states without inventing renewability", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackpilot-sites-"));
  try {
    const collector = new NginxSiteCollector(nodeId, { roots: [directory], helperCertificates: async () => new Map() });
    const nonLinux = await collector.collect("darwin"); assert.equal(nonLinux.collectionStatus, "unavailable"); assert.deepEqual(nonLinux.sites, []);
    const empty = await collector.collect("linux"); assert.equal(empty.collectionStatus, "unavailable"); assert.deepEqual(empty.sites, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("site snapshot cache prevents overlap and collects at most once per minute", async () => {
  let calls = 0; let release;
  const snapshot = { collectedAt: new Date().toISOString(), collectionStatus: "complete", warnings: [], sites: [] };
  const collector = { collect: async () => { calls += 1; await new Promise((resolve) => { release = resolve; }); return snapshot; } };
  const cache = new SiteSnapshotCache(collector, "linux", 60_000);
  const first = cache.refreshIfDue(100_000); const second = cache.refreshIfDue(100_001); assert.equal(calls, 1); release(); await Promise.all([first, second]);
  await cache.refreshIfDue(159_999); assert.equal(calls, 1);
});
