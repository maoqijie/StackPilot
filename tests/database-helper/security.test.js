import assert from "node:assert/strict";
import { constants, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertRootHelper } from "../../apps/database-helper/dist/security/privilege.js";
import { encryptCredentials } from "../../apps/database-helper/dist/operations/credentials.js";
import { DatabaseRegistry } from "../../apps/database-helper/dist/state/registry.js";
import { LocalDatabaseQueryClient } from "../../apps/database-helper/dist/collection/queryClient.js";

test("database-helper requires root", () => {
  assert.throws(() => assertRootHelper(() => 1000), /必须以 root/);
  assert.doesNotThrow(() => assertRootHelper(() => 0));
});

test("root-only registry stores credentials separately and never writes password to inventory", async () => {
  const root = await mkdtemp(join(tmpdir(), "stackpilot-registry-")); const registry = new DatabaseRegistry(root);
  const instance = { id: "orders", name: "orders", engine: "postgresql", version: "16", port: 5432, managed: false, serviceName: "postgresql@16-main", dataDirectory: "/var/lib/postgresql/16/main", backupDirectory: join(root, "backups", "orders"), host: "127.0.0.1", username: "stackpilot", initialDatabase: "postgres", historicalSlowQueriesAvailable: false, createdAt: new Date().toISOString() };
  const password = "this-is-a-long-test-password";
  try {
    await registry.save(instance, { instanceId: "orders", username: "stackpilot", password });
    const inventory = await readFile(join(root, "instances.json"), "utf8"); assert.equal(inventory.includes(password), false);
    assert.equal((await stat(join(root, "instances.json"))).mode & 0o777, 0o600);
    assert.equal((await stat(join(root, "credentials", "orders.json"))).mode & 0o777, 0o600);
    assert.equal((await registry.credential("orders")).password, password);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("credential envelope uses RSA-OAEP SHA-256 and is decryptable only with browser private key", () => {
  const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
  const envelope = encryptCredentials(publicKey, { username: "admin", password: "one-time-secret" });
  const clear = privateDecrypt({ key: pair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(envelope.ciphertext, "base64"));
  assert.deepEqual(JSON.parse(clear.toString("utf8")), { username: "admin", password: "one-time-secret" });
  assert.throws(() => encryptCredentials("-----BEGIN PUBLIC KEY-----\nbad\n-----END PUBLIC KEY-----", { password: "x" }));
});

test("complete SQL travels through stdin and never appears in process arguments", async () => {
  let invocation; const runner = { async run(executable, args, options) { invocation = { executable, args, options }; return { stdout: "[]", stderr: "" }; } };
  const instance = { id: "orders", name: "orders", engine: "postgresql", version: "16", port: 5432, managed: false, serviceName: "postgresql@16-main", dataDirectory: "/var/lib/postgresql/16/main", backupDirectory: "/tmp/backups", host: "127.0.0.1", username: "stackpilot", initialDatabase: "postgres", historicalSlowQueriesAvailable: false, createdAt: new Date().toISOString() };
  const sql = "SELECT * FROM confidential_customer_table";
  await new LocalDatabaseQueryClient(runner).query(instance, { instanceId: "orders", username: "stackpilot", password: "this-is-a-long-test-password" }, sql);
  assert.equal(invocation.args.some((arg) => arg.includes("confidential_customer_table")), false);
  assert.equal(invocation.options.input, `${sql}\n`); assert.equal(invocation.args.at(-1), "-");
});
