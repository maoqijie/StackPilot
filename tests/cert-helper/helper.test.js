import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import selfsigned from "selfsigned";
import { buildCertificateInventory, buildCertificateMap, certificateIdForName, certificateSourceId, publicCertificatePaths } from "../../apps/cert-helper/dist/certificateMap.js";
import { handleCertificateRequest, parseCertificateRequest } from "../../apps/cert-helper/dist/certificateProtocol.js";
import { renewCertbotCertificate } from "../../apps/cert-helper/dist/certificates.js";

test("certificate helper accepts only status and opaque renewal", async () => {
  const certificateId = `cert_${"a".repeat(32)}`;
  assert.deepEqual(parseCertificateRequest('{"operation":"status"}'), { operation: "status" });
  assert.deepEqual(parseCertificateRequest(JSON.stringify({ operation: "renew", certificateId })), { operation: "renew", certificateId });
  for (const request of [
    { operation: "renew", certificateId, path: "/etc/letsencrypt/live/example/fullchain.pem" },
    { operation: "renew", certificateId, executable: "/bin/sh" },
    { operation: "prepare", domains: ["example.test"] },
    { operation: "shell", command: "id" },
  ]) assert.throws(() => parseCertificateRequest(JSON.stringify(request)));

  const renewed = [];
  const response = await handleCertificateRequest(JSON.stringify({ operation: "renew", certificateId }), {
    renew: async (id) => renewed.push(id),
  });
  assert.equal(response.ok, true);
  assert.deepEqual(renewed, [certificateId]);
});

test("certificate helper readiness returns bounded public metadata and fails closed", async () => {
  const certificate = { status: "valid", notBefore: "2026-01-01T00:00:00.000Z", expiresAt: "2026-09-01T00:00:00.000Z", issuer: "Test CA", subjectAlternativeNames: ["example.test"], fingerprintSha256: null, renewalMode: "automatic", renewable: true, unavailableReason: null, certificateId: `cert_${"a".repeat(32)}` };
  const ready = await handleCertificateRequest('{"operation":"status"}', { ready: async () => true, inventory: async () => [{ sourceId: `source_${"b".repeat(32)}`, certificate }] });
  assert.equal(ready.ok, true);
  assert.deepEqual(ready.data.certificates, [{ sourceId: `source_${"b".repeat(32)}`, certificate }]);
  assert.doesNotMatch(JSON.stringify(ready), /\/etc\/|privkey|fullchain/);
  const unavailable = await handleCertificateRequest('{"operation":"status"}', { ready: async () => false });
  assert.equal(unavailable.ok, false);
  assert.equal(unavailable.errorCode, "HELPER_NOT_READY");
});

test("renewal executes only fixed absolute Certbot, Nginx and systemctl commands", async () => {
  const calls = [];
  const run = async (executable, args, timeoutMs) => {
    calls.push({ executable, args, timeoutMs });
    return { stdout: "", stderr: "" };
  };
  await renewCertbotCertificate("app.example.test", run);
  assert.deepEqual(calls, [
    { executable: "/usr/bin/certbot", args: ["renew", "--cert-name", "app.example.test", "--non-interactive", "--no-random-sleep-on-renew"], timeoutMs: 540_000 },
    { executable: "/usr/sbin/nginx", args: ["-t"], timeoutMs: 30_000 },
    { executable: "/usr/bin/systemctl", args: ["reload", "nginx.service"], timeoutMs: 20_000 },
  ]);
  await assert.rejects(() => renewCertbotCertificate("../../etc/passwd", run), /Certificate name is invalid/);
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

test("certificate inventory rejects private-key symlinks and mixed PEM files", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-cert-helper-"));
  const nginxRoot = join(root, "sites-enabled");
  const liveRoot = join(root, "letsencrypt", "live");
  const domainRoot = join(liveRoot, "bad.example.test");
  await mkdir(nginxRoot, { recursive: true });
  await mkdir(domainRoot, { recursive: true });
  const privateKey = join(domainRoot, "privkey.pem");
  const publicLink = join(domainRoot, "fullchain.pem");
  try {
    const pair = await selfsigned.generate([{ name: "commonName", value: "bad.example.test" }], { days: 30, keySize: 2048 });
    await writeFile(privateKey, pair.private);
    await symlink(privateKey, publicLink);
    await writeFile(join(nginxRoot, "bad.conf"), `ssl_certificate ${publicLink};`);
    assert.deepEqual(await buildCertificateInventory([nginxRoot], liveRoot), []);
    assert.equal((await buildCertificateMap([nginxRoot], liveRoot)).has(certificateIdForName("bad.example.test")), false);
    await rm(publicLink);
    await writeFile(publicLink, `${pair.cert}\n${pair.private}`);
    assert.deepEqual(await buildCertificateInventory([nginxRoot], liveRoot), []);
    assert.equal((await buildCertificateMap([nginxRoot], liveRoot)).has(certificateIdForName("bad.example.test")), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("certificate mapping accepts the standard Certbot live-to-archive public link", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-cert-helper-"));
  const nginxRoot = join(root, "sites-enabled");
  const liveRoot = join(root, "letsencrypt", "live");
  const archiveRoot = join(root, "letsencrypt", "archive", "valid.example.test");
  const liveDomainRoot = join(liveRoot, "valid.example.test");
  await mkdir(nginxRoot, { recursive: true });
  await mkdir(archiveRoot, { recursive: true });
  await mkdir(liveDomainRoot, { recursive: true });
  const archived = join(archiveRoot, "fullchain1.pem");
  const live = join(liveDomainRoot, "fullchain.pem");
  try {
    const pair = await selfsigned.generate([{ name: "commonName", value: "valid.example.test" }], { days: 30, keySize: 2048 });
    await writeFile(archived, pair.cert);
    await symlink("../../archive/valid.example.test/fullchain1.pem", live);
    await writeFile(join(nginxRoot, "valid.conf"), `ssl_certificate ${live};`);
    assert.equal((await buildCertificateMap([nginxRoot], liveRoot)).get(certificateIdForName("valid.example.test")), "valid.example.test");
    assert.equal((await buildCertificateInventory([nginxRoot], liveRoot)).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});
