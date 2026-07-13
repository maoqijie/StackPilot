import assert from "node:assert/strict";
import test from "node:test";
import { detectSupportedOs, packagePlan } from "../../apps/database-helper/dist/platform/osSupport.js";
import { parseListeningPorts, selectAvailablePort } from "../../apps/database-helper/dist/platform/ports.js";
import { FixedCommandRunner } from "../../apps/database-helper/dist/platform/runner.js";

test("fixed OS matrix maps only declared package managers and packages", () => {
  const fixtures = [
    ["ID=debian\nVERSION_ID=\"12\"", "debian12", "apt-get", "postgresql"],
    ["ID=ubuntu\nVERSION_ID=\"24.04\"", "ubuntu24.04", "apt-get", "mysql-server"],
    ["ID=rocky\nVERSION_ID=\"9.5\"", "rocky9", "dnf", "mariadb-server"],
    ["ID=almalinux\nVERSION_ID=\"9.5\"", "alma9", "dnf", "postgresql-server"],
    ["ID=fedora\nVERSION_ID=\"42\"", "fedora42", "dnf", "community-mysql-server"],
    ["ID=alpine\nVERSION_ID=\"3.22.1\"", "alpine3.22", "apk", "mariadb"],
    ["ID=arch\nVERSION_ID=rolling", "arch", "pacman", "postgresql"],
  ];
  for (const [raw, os, manager, packageName] of fixtures) {
    assert.equal(detectSupportedOs(raw), os); const plan = packagePlan(os, packageName.includes("mysql") ? "mysql" : packageName.includes("maria") ? "mariadb" : "postgresql");
    assert.equal(plan.manager, manager); assert.ok(plan.installArgs.includes(packageName));
  }
  assert.throws(() => detectSupportedOs("ID=debian\nVERSION_ID=11"), /不支持/);
});

test("port selection returns lowest free port and conflicts have no side effects", async () => {
  const calls = []; const runner = { async run(executable, args) { calls.push([executable, args]); return { stdout: "LISTEN 0 1 127.0.0.1:5432 0.0.0.0:*\nLISTEN 0 1 [::]:5434 [::]:*", stderr: "" }; } };
  assert.deepEqual([...parseListeningPorts((await runner.run()).stdout)], [5432, 5434]);
  assert.equal(await selectAvailablePort(runner, "postgresql", null), 5433);
  await assert.rejects(() => selectAvailablePort(runner, "postgresql", 5432), (error) => error.code === "PORT_CONFLICT");
  assert.deepEqual(calls.map(([executable]) => executable), [undefined, "ss", "ss"]);
});

test("runner refuses arbitrary executables before spawning", async () => {
  await assert.rejects(() => new FixedCommandRunner().run("sh", ["-c", "id"]), (error) => error.code === "COMMAND_DENIED");
  await assert.rejects(() => new FixedCommandRunner().run("psql", ["bad\0arg"]), (error) => error.code === "ARGUMENT_DENIED");
});
