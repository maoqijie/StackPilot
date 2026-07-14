import { lstat, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { HelperConfig } from "./config.js";
import { atomicWrite, within } from "./io.js";
import { activeConfiguration, serviceUnit } from "./nginx.js";
import { environmentFile, isPortAvailable, selectPort } from "./activation.js";
import { runFixedCommand, type FixedCommandRunner } from "./runner.js";
import { currentTarget, siteId as expectedSiteId, SiteStateStore, swapLink } from "./siteState.js";
import { HelperError, type ManagedSite } from "./types.js";

const unitName = (siteId: string) => `stackpilot-site-${siteId}.service`;

async function oldContent(path: string) {
  try { return await readFile(path, "utf8"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}

async function restoreFile(path: string, content: string | null, mode: number) {
  if (content === null) await rm(path, { force: true }); else await atomicWrite(path, content, mode);
}

async function assertRelease(root: string, releaseId: string, commitSha: string) {
  const release = within(root, "releases", releaseId);
  const info = await lstat(release).catch(() => null);
  if (!info?.isDirectory() || info.isSymbolicLink()) throw new HelperError("RELEASE_NOT_FOUND", "Rollback release is not installed on this host");
  const markerPath = within(release, ".stackpilot-release.json"); const markerInfo = await lstat(markerPath).catch(() => null);
  if (!markerInfo?.isFile() || markerInfo.isSymbolicLink()) throw new HelperError("RELEASE_MARKER_INVALID", "Rollback release marker is invalid");
  const marker = JSON.parse(await readFile(markerPath, "utf8").catch(() => "{}")) as { releaseId?: unknown; commitSha?: unknown };
  if (marker.releaseId !== releaseId || marker.commitSha !== commitSha || !/^[a-f0-9]{40}$/.test(marker.commitSha)) {
    throw new HelperError("RELEASE_MARKER_INVALID", "Rollback release marker is invalid");
  }
}

async function assertRuntime(plan: { manifest: ManagedSite["manifest"]; runtimePath: string | null }, runtimeRootValue: string) {
  if (plan.manifest.runtime === "static") return;
  if (!plan.runtimePath) throw new HelperError("RUNTIME_UNAVAILABLE", "Rollback runtime is unavailable");
  const runtimePath = resolve(plan.runtimePath); const runtimeRoot = resolve(runtimeRootValue);
  if (runtimePath !== runtimeRoot && !runtimePath.startsWith(`${runtimeRoot}/`)) throw new HelperError("RUNTIME_UNAVAILABLE", "Rollback runtime is outside the managed runtime root");
  const executable = await lstat(within(runtimePath, "bin", "node")).catch(() => null);
  if (!executable?.isFile() || executable.isSymbolicLink()) throw new HelperError("RUNTIME_UNAVAILABLE", "Rollback runtime is unavailable");
}

async function healthCheck(siteId: string, path: string, run: FixedCommandRunner) {
  await run("/usr/bin/curl", ["--fail", "--silent", "--show-error", "--max-time", "10", "--max-redirs", "0", "--unix-socket", `/run/stackpilot-sites/${siteId}.sock`, `http://localhost${path}`], 15_000);
}

async function applyRuntime(previous: ManagedSite, target: ManagedSite, run: FixedCommandRunner) {
  await run("/usr/bin/systemctl", ["daemon-reload"], 20_000);
  if (target.manifest.runtime === "static") {
    if (previous.manifest.runtime !== "static") {
      await run("/usr/bin/systemctl", ["stop", unitName(target.siteId)], 30_000);
      await run("/usr/bin/systemctl", ["disable", unitName(target.siteId)], 30_000);
    }
    return;
  }
  await run("/usr/bin/systemctl", ["enable", unitName(target.siteId)], 30_000);
  await run("/usr/bin/systemctl", ["restart", unitName(target.siteId)], 30_000);
}

async function recoverRuntime(previous: ManagedSite, target: ManagedSite, run: FixedCommandRunner) {
  await run("/usr/bin/systemctl", ["daemon-reload"], 20_000);
  if (previous.manifest.runtime === "static") {
    if (target.manifest.runtime !== "static") {
      await run("/usr/bin/systemctl", ["stop", unitName(previous.siteId)], 30_000).catch(() => undefined);
      await run("/usr/bin/systemctl", ["disable", unitName(previous.siteId)], 30_000);
    }
    return;
  }
  await run("/usr/bin/systemctl", ["enable", unitName(previous.siteId)], 30_000);
  await run("/usr/bin/systemctl", ["restart", unitName(previous.siteId)], 30_000);
}

async function unitEnabled(siteId: string, run: FixedCommandRunner) {
  return new Set(["enabled", "enabled-runtime", "linked", "linked-runtime", "alias"]).has((await run("/usr/bin/systemctl", ["show", "--property=UnitFileState", "--value", unitName(siteId)], 20_000)).stdout.trim());
}

export async function rollbackRelease(siteId: string, targetPlanId: string, targetReleaseId: string, expectedVersion: number, config: HelperConfig, run: FixedCommandRunner = runFixedCommand) {
  const store = new SiteStateStore(config); const currentSite = await store.site(siteId); const targetPlan = await store.plan(targetPlanId);
  if (!currentSite) throw new HelperError("SITE_NOT_FOUND", "Managed site is not registered on this host");
  if (!targetPlan || targetPlan.releaseId !== targetReleaseId || expectedSiteId(targetPlan.nodeId, targetPlan.domains[0]!) !== siteId) {
    throw new HelperError("RELEASE_IDENTITY_MISMATCH", "Rollback release does not belong to this managed site");
  }
  if (currentSite.version !== expectedVersion) throw new HelperError("STALE_SITE_VERSION", "Managed site version changed");
  if (currentSite.protected || currentSite.domains.some((domain) => config.protectedDomains.has(domain))) throw new HelperError("CORE_SITE_PROTECTED", "Core StackPilot sites cannot be rolled back");
  if (currentSite.desiredState !== "running") throw new HelperError("SITE_NOT_RUNNING", "Only running sites can be rolled back");
  if (currentSite.releaseId === targetReleaseId) throw new HelperError("RELEASE_ALREADY_ACTIVE", "Rollback release is already active");

  const root = within(config.sitesRoot, siteId); const current = within(root, "current");
  const nginxPath = within(config.nginxRoot, `stackpilot-${siteId}.conf`); const envPath = within(config.environmentRoot, `${siteId}.env`); const unitPath = within(config.unitRoot, unitName(siteId));
  await assertRelease(root, targetReleaseId, targetPlan.commitSha);
  await assertRuntime(targetPlan, config.runtimeRoot);
  const previousTarget = await currentTarget(current);
  if (previousTarget !== `releases/${currentSite.releaseId}`) throw new HelperError("CURRENT_RELEASE_MISMATCH", "Current release pointer does not match managed state");
  const previous = { nginx: await oldContent(nginxPath), env: await oldContent(envPath), unit: await oldContent(unitPath) };
  const previousUnitEnabled = currentSite.manifest.runtime === "static" ? false : await unitEnabled(siteId, run);
  const port = targetPlan.manifest.runtime === "static" ? null : await selectPort(siteId, currentSite, store, isPortAvailable);
  const targetSite: ManagedSite = {
    ...currentSite, planId: targetPlanId, domains: targetPlan.domains, manifest: targetPlan.manifest,
    releaseId: targetReleaseId, port, runtimePath: targetPlan.runtimePath,
    version: currentSite.version + 1, updatedAt: new Date().toISOString(),
  };
  const unit = serviceUnit(targetSite, config.sitesRoot, envPath);
  try {
    await atomicWrite(envPath, environmentFile(targetPlan), 0o600);
    if (unit) await atomicWrite(unitPath, unit, 0o644); else await rm(unitPath, { force: true });
    await atomicWrite(nginxPath, activeConfiguration(targetSite, config.sitesRoot, config.challengeRoot), 0o644);
    await run("/usr/sbin/nginx", ["-t"], 30_000);
    await swapLink(current, `releases/${targetReleaseId}`);
    await applyRuntime(currentSite, targetSite, run);
    await run("/usr/bin/systemctl", ["reload", "nginx.service"], 20_000);
    await healthCheck(siteId, targetPlan.manifest.healthCheckPath ?? "/", run);
    await store.saveSite(targetSite);
    return { siteId, releaseId: targetReleaseId, version: targetSite.version };
  } catch (error) {
    try {
      await restoreFile(nginxPath, previous.nginx, 0o644); await restoreFile(envPath, previous.env, 0o600); await restoreFile(unitPath, previous.unit, 0o644);
      await swapLink(current, previousTarget); await recoverRuntime(currentSite, targetSite, run);
      if (currentSite.manifest.runtime !== "static" && !previousUnitEnabled) await run("/usr/bin/systemctl", ["disable", unitName(siteId)], 30_000);
      await run("/usr/sbin/nginx", ["-t"], 30_000); await run("/usr/bin/systemctl", ["reload", "nginx.service"], 20_000);
      await healthCheck(siteId, currentSite.manifest.healthCheckPath ?? "/", run);
    } catch { throw new HelperError("ROLLBACK_RECOVERY_FAILED", "Rollback failed and the previous release could not be verified"); }
    throw error;
  }
}
