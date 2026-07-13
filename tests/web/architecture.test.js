import assert from "node:assert/strict";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import test from "node:test";

const sourceRoot = resolve(import.meta.dirname, "..", "..", "apps", "web", "src");

async function sourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }));
  return nested.flat().filter((path) => [".ts", ".tsx"].includes(extname(path)));
}

function importSpecifiers(source) {
  return [...source.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

async function resolveSourceImport(file, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(file), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (!candidate.startsWith(sourceRoot) || candidate === file) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next TypeScript resolution candidate.
    }
  }
  return null;
}

test("web source has no circular imports", async () => {
  const files = await sourceFiles(sourceRoot);
  const graph = new Map();
  for (const file of files) {
    const source = await readFile(file, "utf8");
    graph.set(file, (await Promise.all(importSpecifiers(source).map((specifier) => resolveSourceImport(file, specifier)))).filter(Boolean));
  }

  const visited = new Set();
  const active = new Set();
  const stack = [];
  function visit(file) {
    if (active.has(file)) {
      const start = stack.indexOf(file);
      assert.fail(`Circular import: ${[...stack.slice(start), file].map((item) => relative(sourceRoot, item)).join(" -> ")}`);
    }
    if (visited.has(file)) return;
    active.add(file);
    stack.push(file);
    for (const target of graph.get(file) ?? []) visit(target);
    stack.pop();
    active.delete(file);
    visited.add(file);
  }
  for (const file of files) visit(file);
});

test("features do not deep-import other features or page implementations", async () => {
  const featureRoot = join(sourceRoot, "features");
  for (const file of await sourceFiles(featureRoot)) {
    const source = await readFile(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      const target = await resolveSourceImport(file, specifier);
      if (!target) continue;
      const targetPath = relative(sourceRoot, target).replaceAll("\\", "/");
      const sourcePath = relative(sourceRoot, file).replaceAll("\\", "/");
      assert.ok(!targetPath.startsWith("pages/"), `${sourcePath} imports page implementation ${targetPath}`);
      if (!targetPath.startsWith("features/")) continue;
      const sourceFeature = sourcePath.split("/")[1];
      const targetFeature = targetPath.split("/")[1];
      assert.equal(sourceFeature, targetFeature, `${sourcePath} deep-imports feature ${targetPath}`);
    }
  }
});

test("overview disk details use theme-responsive surface tokens", async () => {
  const source = await readFile(join(sourceRoot, "styles", "overview.css"), "utf8");
  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = [...source.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "g"))];
    const declarations = matches.map((match) => match[1]).join("\n");
    assert.ok(declarations, `Missing CSS rule: ${selector}`);
    return declarations;
  };

  const tooltip = rule(".metric-details-tooltip");
  assert.match(tooltip, /background:\s*var\(--surface\)/);
  assert.match(tooltip, /color:\s*var\(--text\)/);
  assert.doesNotMatch(tooltip, /var\(--(?:surface-dark|canvas)\)/);

  const arrow = rule(".metric-details-tooltip::after");
  assert.match(arrow, /background:\s*var\(--surface\)/);
  assert.doesNotMatch(arrow, /var\(--surface-dark\)/);

  for (const selector of [
    ".metric-details-tooltip > header strong",
    ".metric-details-tooltip p b",
    ".metric-details-tooltip p > strong",
  ]) {
    assert.match(rule(selector), /color:\s*var\(--text\)/);
  }
  assert.match(rule(".metric-details-tooltip > header span"), /color:\s*var\(--muted\)/);
  assert.match(rule(".metric-details-tooltip p small"), /color:\s*var\(--muted\)/);
});
