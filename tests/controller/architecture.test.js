import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import test from "node:test";

const sourceRoot = resolve(import.meta.dirname, "../../apps/controller/src");

async function files(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)]))).flat().filter((file) => extname(file) === ".ts");
}

test("HTTP routes and business modules never execute platform commands directly", async () => {
  for (const area of ["http", "modules"]) {
    for (const file of await files(join(sourceRoot, area))) {
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(source, /node:child_process|execFile|spawn\(/, relative(sourceRoot, file));
    }
  }
});

test("business modules do not depend on the HTTP layer", async () => {
  for (const file of await files(join(sourceRoot, "modules"))) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /from\s+["'][^"']*\/http\//, relative(sourceRoot, file));
  }
});

test("platform and repository layers do not depend on HTTP routing or business modules", async () => {
  for (const area of ["platform", "repositories"]) {
    for (const file of await files(join(sourceRoot, area))) {
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(source, /from\s+["'][^"']*\/(http|modules)\//, relative(sourceRoot, file));
    }
  }
});

test("legacy JavaScript Controller implementation has been removed", async () => {
  const source = await files(sourceRoot);
  assert.ok(source.length > 0);
  const allEntries = await readdir(sourceRoot, { recursive: true });
  assert.equal(allEntries.some((entry) => String(entry).endsWith(".js")), false);
});

test("site TLS probes do not reuse sessions that omit peer certificate metadata", async () => {
  const source = await readFile(join(sourceRoot, "platform", "siteCollector.ts"), "utf8");
  assert.match(source, /new HttpsAgent\(\{ keepAlive: false, maxCachedSessions: 0 \}\)/);
  assert.match(source, /agent: siteProbeHttpsAgent/);
});
