import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("database-helper uses root-only Unix socket activation with Agent group access", async () => {
  const service = await read("deploy/systemd/stackpilot-database-helper.service");
  const socket = await read("deploy/systemd/stackpilot-database-helper.socket");
  assert.match(service, /User=root/); assert.match(service, /Requires=stackpilot-database-helper\.socket/);
  assert.match(service, /RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK/);
  assert.match(socket, /ListenStream=\/run\/stackpilot\/database-helper\.sock/);
  assert.match(socket, /SocketUser=root/); assert.match(socket, /SocketGroup=stackpilot-agent/); assert.match(socket, /SocketMode=0660/);
  assert.doesNotMatch(service + socket, /ListenStream=.*(?:0\.0\.0\.0|\[::\])|TCP|privileged/);
});

test("OpenRC helper is supervised and installer enables helper plus local scheduling", async () => {
  const openrc = await read("deploy/openrc/stackpilot-database-helper");
  const installer = await read("deploy/scripts/install-database-helper.sh");
  const mode = (await stat(new URL("../../deploy/scripts/install-database-helper.sh", import.meta.url))).mode;
  assert.ok(mode & 0o100); assert.match(openrc, /supervisor="supervise-daemon"/); assert.match(openrc, /STACKPILOT_DATABASE_HELPER_SOCKET=/);
  assert.match(installer, /^\s*systemctl enable --now stackpilot-database-helper\.socket$/m);
  assert.match(installer, /^\s*rc-service stackpilot-database-helper start$/m);
  assert.match(installer, /backup-plan install-scheduler/);
  assert.match(installer, /apps\/database-helper\/dist/); assert.match(installer, /packages\/contracts\/dist/);
  assert.doesNotMatch(installer, /cp -a "\$root\/\."|cp -R "\$root\/\."|copy_path .*\.git|copy_path .*\.env/);
});

test("helper package mapper never exposes a shell command interface", async () => {
  const runner = await read("apps/database-helper/src/platform/runner.ts");
  const contracts = await read("packages/contracts/src/agent/databases.ts");
  assert.match(runner, /execFileAsync\(executable, \[\.\.\.args\]/); assert.doesNotMatch(runner, /exec\(|shell:\s*true|"sh"|"bash"/);
  assert.match(contracts, /z\.discriminatedUnion\("action"/); assert.doesNotMatch(contracts, /command:\s*z\.|path:\s*z\./);
});

test("helper release contains real install and rollback drivers without simulated success fallbacks", async () => {
  const operations = await read("apps/database-helper/src/operations/operationService.ts");
  const provisioner = await read("apps/database-helper/src/operations/provisioner.ts");
  const restore = await read("apps/database-helper/src/operations/restore.ts");
  assert.doesNotMatch(operations, /INSTALL_REQUIRES_PROVISIONER|RESTORE_REQUIRES_OFFLINE_DRIVER/);
  assert.match(provisioner, /await this\.assertAvailable\(plan, selectedPort, request\.name\)/);
  assert.match(provisioner, /encryptCredentials\(request\.credentialPublicKey/);
  assert.match(provisioner, /listen_addresses = '\*'/); assert.match(provisioner, /require_secure_transport=ON/);
  assert.match(restore, /RESTORE_CHECKSUM_MISMATCH/); assert.match(restore, /rollbackExpiresAt/);
});
