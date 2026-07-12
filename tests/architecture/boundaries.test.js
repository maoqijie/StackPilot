import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const controllerRoot = join(repoRoot, "apps", "controller");

async function sourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }));
  return files.flat().filter((path) => [".js", ".ts", ".tsx"].includes(extname(path)));
}

test("web never imports controller internals", async () => {
  const files = await sourceFiles(join(repoRoot, "apps", "web"));
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const specifiers = [...source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of specifiers) {
      assert.notEqual(specifier, "@stackpilot/controller", file);
      assert.ok(!specifier.startsWith("@stackpilot/controller/"), file);
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        assert.ok(target !== controllerRoot && !target.startsWith(`${controllerRoot}\\`) && !target.startsWith(`${controllerRoot}/`), file);
      }
    }
  }
});

test("public packages do not depend on concrete applications", async () => {
  for (const name of ["contracts", "config", "host-telemetry"]) {
    const packageRoot = join(repoRoot, "packages", name);
    const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies };
    assert.ok(Object.keys(dependencies).every((dependency) => !dependency.startsWith("@stackpilot/web") && !dependency.startsWith("@stackpilot/controller") && !dependency.startsWith("@stackpilot/agent")));

    for (const file of await sourceFiles(packageRoot)) {
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(source, /apps[\\/](web|controller|agent)|@stackpilot\/(web|controller|agent)/, file);
    }
  }
});

test("agent never imports controller internals", async () => {
  for (const file of await sourceFiles(join(repoRoot, "apps", "agent", "src"))) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /@stackpilot\/controller|apps[\\/]controller|\.\.\/[.\/]*controller/, file);
  }
});
