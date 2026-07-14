import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("CI pins third-party Actions and gates code, E2E, deployment and image security", async () => {
  const ci = await read(".github/workflows/ci.yml");
  for (const line of ci.split(/\r?\n/).filter((entry) => entry.trim().startsWith("uses:"))) {
    assert.match(line, /@[a-f0-9]{40}$/);
  }
  for (const command of ["npm ci", "npm run lint", "npm run typecheck", "npm test", "npm run test:e2e", "npm audit --audit-level=high", "systemd-analyze verify"]) assert.match(ci, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal((ci.match(/trivy-action@/g) ?? []).length, 4);
  assert.match(ci, /Run clean Compose HTTPS smoke installation/);
});

test("release signs only after scans and uses OIDC without a stored signing key", async () => {
  const release = await read(".github/workflows/release.yml");
  const packageJson = JSON.parse(await read("package.json"));
  const notes = await read(`docs/upgrades/${packageJson.version}.md`);
  for (const line of release.split(/\r?\n/).filter((entry) => entry.trim().startsWith("uses:"))) {
    assert.match(line, /@[a-f0-9]{40}$/);
  }
  assert.match(notes, new RegExp(`^# Upgrade to ${packageJson.version.replaceAll(".", "\\.")}$`, "m"));
  assert.match(release, /--notes-file "docs\/upgrades\/\$\{VERSION\}\.md"/);
  assert.ok(release.indexOf("Scan published Agent image") < release.indexOf("Sign image digests"));
  assert.match(release, /id-token: write/);
  assert.match(release, /cosign sign --yes/);
  assert.doesNotMatch(release, /COSIGN_PRIVATE_KEY|password:.*COSIGN|latest/);
});
