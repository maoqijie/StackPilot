import assert from "node:assert/strict";
import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { DatabaseProvisioner } from "../../apps/database-helper/dist/operations/provisioner.js";
import { DatabaseRegistry } from "../../apps/database-helper/dist/state/registry.js";

const identity = { uid: process.getuid?.() ?? 501, gid: process.getgid?.() ?? 20 };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-provisioner-"));
  await mkdir(join(root, "etc"), { recursive: true });
  await writeFile(join(root, "etc/passwd"), `postgres:x:${identity.uid}:${identity.gid}:Postgres:/tmp:/bin/false\nmysql:x:${identity.uid}:${identity.gid}:MySQL:/tmp:/bin/false\n`);
  const stateDir = join(root, "state"), registry = new DatabaseRegistry(stateDir), calls = [];
  const runner = { async run(executable, args, options = {}) {
    calls.push({ executable, args, options });
    if (executable === "ss") return { stdout: "", stderr: "" };
    if (args[0] === "--version") return { stdout: `${executable} 16.4`, stderr: "" };
    if (executable === "openssl") {
      const key = args[args.indexOf("-keyout") + 1], cert = args[args.indexOf("-out") + 1];
      await mkdir(dirname(key), { recursive: true }); await writeFile(key, "private"); await writeFile(cert, "certificate");
    }
    return { stdout: "", stderr: "" };
  } };
  const queries = { async execute(_instance, credential) { assert.ok(credential.password.length >= 32); return "1"; } };
  return { root, stateDir, registry, calls, runner, queries };
}

test("provisioner installs an isolated TLS instance, stores root-only secrets and returns an RSA envelope", async () => {
  const value = await fixture(), pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  try {
    const provisioner = new DatabaseProvisioner(value.stateDir, value.registry, value.runner, value.queries, { systemRoot: value.root, os: "ubuntu24.04" });
    const installed = await provisioner.install({ engine: "postgresql", name: "orders", port: null, initialDatabase: "app", credentialPublicKey: publicKey });
    assert.equal(installed.result.port, 5432); assert.equal(installed.result.serviceName, "stackpilot-postgresql-orders");
    const clear = privateDecrypt({ key: pair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(installed.credentialEnvelope.ciphertext, "base64"));
    const credentials = JSON.parse(clear.toString("utf8")); assert.equal(credentials.username, "stackpilot"); assert.ok(credentials.password.length >= 32);
    const instance = await value.registry.get("orders"); assert.equal(instance.managed, true); assert.equal(instance.port, 5432);
    assert.match(await readFile(join(instance.configDirectory, "postgresql.conf"), "utf8"), /listen_addresses = '\*'/);
    assert.match(await readFile(join(instance.configDirectory, "pg_hba.conf"), "utf8"), /0\.0\.0\.0\/0 scram-sha-256/);
    assert.match(await readFile(join(value.root, "etc/systemd/system/stackpilot-postgresql-orders.service"), "utf8"), /RuntimeDirectory=stackpilot-databases\/orders/);
    assert.ok(value.calls.some((call) => call.executable === "apt-get" && call.args.includes("postgresql")));
    assert.ok(value.calls.some((call) => call.executable === "systemctl" && call.args[0] === "start"));
    for (const call of value.calls) assert.equal(call.args.some((arg) => arg === credentials.password || arg === credentials.initialPassword), false);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("provisioner repeats conflict checks after package installation and leaves no instance files", async () => {
  const value = await fixture(), pair = generateKeyPairSync("rsa", { modulusLength: 2048 }); let listens = 0;
  value.runner.run = async (executable, args, options = {}) => {
    value.calls.push({ executable, args, options });
    if (executable === "ss") { listens += 1; return { stdout: listens >= 3 ? "LISTEN 0 1 0.0.0.0:5432 0.0.0.0:*\n" : "", stderr: "" }; }
    return { stdout: args[0] === "--version" ? "postgres 16" : "", stderr: "" };
  };
  try {
    const provisioner = new DatabaseProvisioner(value.stateDir, value.registry, value.runner, value.queries, { systemRoot: value.root, os: "ubuntu24.04" });
    await assert.rejects(() => provisioner.install({ engine: "postgresql", name: "orders", port: 5432, initialDatabase: "app", credentialPublicKey: pair.publicKey.export({ type: "spki", format: "pem" }).toString() }), (error) => error.code === "PORT_CONFLICT");
    assert.deepEqual(await value.registry.list(), []); assert.equal(value.calls.some((call) => call.executable === "openssl"), false);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});

test("invalid RSA credential key is rejected before package installation", async () => {
  const value = await fixture();
  try {
    const provisioner = new DatabaseProvisioner(value.stateDir, value.registry, value.runner, value.queries, { systemRoot: value.root, os: "ubuntu24.04" });
    await assert.rejects(() => provisioner.install({ engine: "postgresql", name: "orders", port: 5432, initialDatabase: "app", credentialPublicKey: "x".repeat(64) }));
    assert.equal(value.calls.some((call) => call.executable === "apt-get"), false); assert.deepEqual(await value.registry.list(), []);
  } finally { await rm(value.root, { recursive: true, force: true }); }
});
