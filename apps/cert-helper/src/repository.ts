import { createHash } from "node:crypto";
import { chmod, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, readlink, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import type { HelperConfig, RuntimeDefinition } from "./config.js";
import { readRuntimeCatalog } from "./config.js";
import { immutableTree, within } from "./io.js";
import { readManifest } from "./manifest.js";
import { builderArgs, runFixedCommand, type FixedCommandRunner } from "./runner.js";
import { HelperError, type PreparedPlan } from "./types.js";
import type { HelperRequest } from "./types.js";

const MAX_REPOSITORY_FILES = 100_000;
const MAX_REPOSITORY_BYTES = 2 * 1024 * 1024 * 1024;

async function inspectTree(root: string) {
  let files = 0; let bytes = 0; const queue = [root];
  while (queue.length) {
    const current = queue.pop()!;
    for (const entry of await readdir(current, { withFileTypes: true })) {
      if (current === root && entry.name === ".git") continue;
      const path = join(current, entry.name); const info = await lstat(path);
      if (info.isSymbolicLink()) {
        const target = await readlink(path); const resolved = await realpath(path).catch(() => ""); const base = await realpath(root);
        if (target.startsWith("/") || !resolved || resolved !== base && !resolved.startsWith(`${base}${sep}`)) throw new HelperError("REPOSITORY_SYMLINK_FORBIDDEN", "Repository symlink escapes its root or is dangling");
        continue;
      }
      if (info.isDirectory()) queue.push(path);
      else if (info.isFile()) {
        files += 1; bytes += info.size;
        if (files > MAX_REPOSITORY_FILES || bytes > MAX_REPOSITORY_BYTES) throw new HelperError("REPOSITORY_TOO_LARGE", "Repository exceeds fixed limits");
        if (info.size <= 256) {
          const prefix = await readFile(path, "utf8").catch(() => "");
          if (prefix.startsWith("version https://git-lfs.github.com/spec/")) throw new HelperError("GIT_LFS_FORBIDDEN", "Git LFS objects are unsupported");
        }
      }
    }
  }
  try { await stat(join(root, ".gitmodules")); throw new HelperError("SUBMODULES_FORBIDDEN", "Git submodules are unsupported"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}

async function installRuntime(definition: RuntimeDefinition, config: HelperConfig, run: FixedCommandRunner) {
  const target = within(config.runtimeRoot, `${definition.runtime}-${definition.version}`);
  try { if ((await stat(within(target, "bin", "node"))).isFile()) return target; } catch { /* Download below. */ }
  await mkdir(config.runtimeRoot, { recursive: true, mode: 0o755 });
  const temporary = await mkdtemp(within(config.runtimeRoot, ".install-")); const archive = within(temporary, "runtime.tar.xz");
  try {
    await run("/usr/bin/curl", ["--fail", "--silent", "--show-error", "--proto", "=https", "--tlsv1.2", "--location", "--max-redirs", "0", "--output", archive, definition.url], 300_000);
    const digest = createHash("sha256").update(await readFile(archive)).digest("hex");
    if (digest !== definition.sha256) throw new HelperError("RUNTIME_DIGEST_MISMATCH", "Node.js runtime checksum mismatch");
    await mkdir(target, { recursive: false, mode: 0o755 });
    await run("/usr/bin/tar", ["-xJf", archive, "--strip-components=1", "--no-same-owner", "--no-same-permissions", "-C", target], 120_000);
    await immutableTree(target);
  } catch (error) { await rm(target, { recursive: true, force: true }); throw error; }
  finally { await rm(temporary, { recursive: true, force: true }); }
  return target;
}

export type PrepareDependencies = { run?: FixedCommandRunner; now?: () => Date };

export async function prepareRepository(request: Extract<HelperRequest, { operation: "prepare" }>, config: HelperConfig, dependencies: PrepareDependencies = {}): Promise<PreparedPlan> {
  const run = dependencies.run ?? runFixedCommand;
  const workspaceParent = within(config.stateRoot, "workspaces"); await mkdir(workspaceParent, { recursive: true, mode: 0o711 });
  const workspace = within(workspaceParent, request.planId); await rm(workspace, { recursive: true, force: true }); await mkdir(workspace, { mode: 0o770 }); await chmod(workspace, 0o770);
  const repository = within(workspace, "repository");
  const gitArgs = ["-c", "http.followRedirects=false", "-c", "credential.helper=", "clone", "--depth=1", "--single-branch", "--no-tags", "--branch", request.repositoryRef, "--", request.repositoryUrl, repository];
  await run("/usr/bin/systemd-run", builderArgs(workspace, "/usr/bin/git", gitArgs), 300_000);
  await inspectTree(repository);
  const manifest = await readManifest(repository); const project = manifest.workingDirectory === "." ? repository : within(repository, manifest.workingDirectory);
  if (!manifest.outputDirectory) throw new HelperError("INVALID_MANIFEST", "Every deployable runtime must declare outputDirectory");
  const commit = await run("/usr/bin/systemd-run", builderArgs(repository, "/usr/bin/git", ["rev-parse", "HEAD"]), 30_000);
  const commitSha = commit.stdout.trim(); if (!/^[a-f0-9]{40}$/.test(commitSha)) throw new HelperError("INVALID_COMMIT", "Repository commit could not be verified");
  let runtimePath: string | null = null;
  if (manifest.runtime !== "static") {
    const runtime = (await readRuntimeCatalog(config.runtimeCatalogPath)).get(manifest.runtime);
    if (!runtime) throw new HelperError("RUNTIME_UNAVAILABLE", "Requested Node.js runtime is not pinned");
    runtimePath = await installRuntime(runtime, config, run); const path = `${within(runtimePath, "bin")}:/usr/bin:/bin`;
    await run("/usr/bin/systemd-run", builderArgs(project, within(runtimePath, "bin", "npm"), ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], path), 600_000);
    if (manifest.buildScript) await run("/usr/bin/systemd-run", builderArgs(project, within(runtimePath, "bin", "npm"), ["run", manifest.buildScript], path), 600_000);
  }
  const artifact = manifest.outputDirectory ? within(project, manifest.outputDirectory) : project; if (!(await stat(artifact).catch(() => null))?.isDirectory()) throw new HelperError("ARTIFACT_DIRECTORY_MISSING", "Manifest output directory does not exist");
  await inspectTree(repository);
  const bundle = within(workspace, "bundle"); const content = within(bundle, manifest.runtime === "static" ? "public" : "app");
  await mkdir(bundle, { mode: 0o770 }); await cp(artifact, content, { recursive: true, dereference: false, verbatimSymlinks: true }); await inspectTree(bundle);
  if (manifest.runtime !== "static") {
    for (const file of ["package.json", "package-lock.json"]) if (!(await stat(within(content, file)).catch(() => null))?.isFile()) throw new HelperError("RUNTIME_BUNDLE_INVALID", "Node outputDirectory must contain package.json and package-lock.json");
    const path = `${within(runtimePath!, "bin")}:/usr/bin:/bin`;
    await run("/usr/bin/systemd-run", builderArgs(content, within(runtimePath!, "bin", "npm"), ["ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"], path), 600_000);
  }
  await inspectTree(bundle); await chmod(workspace, 0o700);
  const releaseId = `release_${createHash("sha256").update(`${request.planId}\0${commitSha}`).digest("hex").slice(0, 32)}`;
  return { planId: request.planId, nodeId: request.nodeId, domains: request.domains, repositoryUrl: request.repositoryUrl, repositoryRef: request.repositoryRef, certificateEmail: request.certificateEmail, certificateEnvironment: request.certificateEnvironment, expectedPlanDigest: request.expectedPlanDigest, environmentVariables: request.environmentVariables, manifest, commitSha, releaseId, runtimePath, preparedAt: (dependencies.now ?? (() => new Date()))().toISOString() };
}

export async function copyPreparedRelease(plan: PreparedPlan, config: HelperConfig, destination: string) {
  const source = within(config.stateRoot, "workspaces", plan.planId, "bundle");
  const marker = within(destination, ".stackpilot-release.json");
  const existing = await readFile(marker, "utf8").catch(() => null);
  if (existing) {
    const parsed = JSON.parse(existing) as { releaseId?: string; commitSha?: string };
    if (parsed.releaseId === plan.releaseId && parsed.commitSha === plan.commitSha) return;
    throw new HelperError("RELEASE_CONFLICT", "Existing release marker does not match the prepared plan");
  }
  if (await stat(destination).catch(() => null)) throw new HelperError("INCOMPLETE_RELEASE", "Existing release is missing its immutable marker");
  const temporary = `${destination}.${process.pid}.tmp`; await rm(temporary, { recursive: true, force: true });
  try {
    await cp(source, temporary, { recursive: true, force: false, dereference: false, verbatimSymlinks: true, filter: (path) => basename(path) !== ".git" });
    await writeFile(within(temporary, ".stackpilot-release.json"), `${JSON.stringify({ releaseId: plan.releaseId, commitSha: plan.commitSha })}\n`, { mode: 0o444 });
    await immutableTree(temporary); await rename(temporary, destination);
  } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
}
