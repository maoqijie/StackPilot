import assert from "node:assert/strict";
import test from "node:test";
import {
  collectPhysicalHostId,
  derivePhysicalHostId,
  parsePhysicalMachineIdentifier,
} from "../../packages/host-telemetry/dist/index.js";

const linuxId = "0123456789abcdef0123456789abcdef";
const uuid = "12345678-90ab-cdef-1234-567890abcdef";

test("physical identity parsers accept platform sources and reject invalid identifiers", () => {
  assert.equal(parsePhysicalMachineIdentifier("linux", `${linuxId}\n`), linuxId);
  assert.equal(parsePhysicalMachineIdentifier("darwin", `    "IOPlatformUUID" = "${uuid.toUpperCase()}"`), uuid);
  assert.equal(parsePhysicalMachineIdentifier("win32", `MachineGuid    REG_SZ    {${uuid.toUpperCase()}}\r\n`), uuid);
  for (const [target, output] of [["linux", "0".repeat(32)], ["linux", "host-name"], ["darwin", "IOPlatformUUID missing"], ["win32", "MachineGuid REG_SZ host-name"]]) {
    assert.equal(parsePhysicalMachineIdentifier(target, output), null);
  }
});

test("Linux collection falls back to the D-Bus machine id and never uses another host signal", async () => {
  const paths = [];
  const physicalHostId = await collectPhysicalHostId("linux", {
    readText: async (path) => {
      paths.push(path);
      if (path === "/etc/machine-id") return "invalid";
      if (path === "/var/lib/dbus/machine-id") return linuxId;
      throw new Error("unexpected path");
    },
  });
  assert.deepEqual(paths, ["/etc/machine-id", "/var/lib/dbus/machine-id"]);
  assert.equal(physicalHostId, derivePhysicalHostId("linux", linuxId));
  assert.match(physicalHostId, /^ph_[a-f0-9]{64}$/);
  assert.equal(physicalHostId.includes(linuxId), false);
});

test("macOS and Windows collection use fixed commands and bounded execution", async () => {
  const invocations = [];
  const runCommand = async (executable, args, options) => {
    invocations.push({ executable, args, options });
    return { stdout: executable === "/usr/sbin/ioreg" ? `"IOPlatformUUID" = "${uuid}"` : `MachineGuid    REG_SZ    ${uuid}` };
  };
  assert.equal(await collectPhysicalHostId("darwin", { runCommand }), derivePhysicalHostId("darwin", uuid));
  assert.equal(await collectPhysicalHostId("win32", { runCommand }), derivePhysicalHostId("win32", uuid));
  assert.deepEqual(invocations, [
    { executable: "/usr/sbin/ioreg", args: ["-rd1", "-c", "IOPlatformExpertDevice"], options: { timeout: 4_000, maxBuffer: 64 * 1024, windowsHide: true } },
    { executable: "reg.exe", args: ["QUERY", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"], options: { timeout: 4_000, maxBuffer: 64 * 1024, windowsHide: true } },
  ]);
});

test("physical identity collection fails closed without hostname, IP or MAC fallback", async () => {
  assert.equal(await collectPhysicalHostId("linux", { readText: async () => { throw new Error("denied"); } }), null);
  assert.equal(await collectPhysicalHostId("darwin", { runCommand: async () => { throw new Error("denied"); } }), null);
  assert.equal(await collectPhysicalHostId("win32", { runCommand: async () => ({ stdout: "unexpected output" }) }), null);
  assert.equal(derivePhysicalHostId("linux", linuxId), derivePhysicalHostId("linux", linuxId));
  assert.notEqual(derivePhysicalHostId("linux", linuxId), derivePhysicalHostId("linux", "f".repeat(32)));
  assert.notEqual(derivePhysicalHostId("linux", linuxId), derivePhysicalHostId("darwin", linuxId));
});
