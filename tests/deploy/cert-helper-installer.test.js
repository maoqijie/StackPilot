import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installerPath = new URL("../../deploy/scripts/install-systemd.sh", import.meta.url);

test("cert-helper release integrity requires both privileged helper entrypoints", async () => {
  const source = await readFile(installerPath, "utf8");

  assert.match(source, /required_entries=\$entry/);
  assert.match(source, /required_entries="\$required_entries apps\/cert-helper\/dist\/firewallMain\.js"/);
  assert.match(source, /\[ -f "\$candidate\/package\.json" \]/);
  assert.match(source, /for required_entry in \$required_entries/);
  assert.match(source, /\[ -f "\$candidate\/\$required_entry" \]/);
});

test("installed and staged releases share the integrity check without dropping Web assets", async () => {
  const source = await readFile(installerPath, "utf8");

  assert.match(source, /verify_component_release "\$release" "Existing release"/);
  assert.match(source, /verify_component_release "\$staging" "Staged release"/);
  assert.match(source, /\[ -f "\$candidate\/apps\/web\/dist\/index\.html" \]/);
});
