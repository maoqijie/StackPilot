import { mkdir, readFile, rm, unlink } from "node:fs/promises";
import type { HelperConfig } from "./config.js";
import { atomicWrite, within } from "./io.js";
import { activeConfiguration, assertDomainsUnclaimed, challengeConfiguration, serviceUnit } from "./nginx.js";
import { copyPreparedRelease } from "./repository.js";
import { runFixedCommand, type FixedCommandRunner } from "./runner.js";
import { assertPortAvailable, currentTarget, siteId, SiteStateStore, stagingId, swapLink, waitForManagedPortOwner } from "./siteState.js";
import { HelperError, type ManagedSite, type PreparedPlan } from "./types.js";
import { issueCertificate } from "./certificates.js";

type Dependencies = { run?: FixedCommandRunner; issue?: typeof issueCertificate; now?: () => Date };
const nginxName = (siteIdValue: string) => `stackpilot-${siteIdValue}.conf`;
const unitName = (siteIdValue: string) => `stackpilot-site-${siteIdValue}.service`;

async function oldContent(path: string) { try { return await readFile(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
async function restoreFile(path: string, content: string | null) { if (content === null) await rm(path, { force: true }); else await atomicWrite(path, content, 0o644); }

function environmentFile(plan: PreparedPlan) {
  return plan.environmentVariables.map(({ name, value }) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n";
}

export async function activatePlan(plan: PreparedPlan, config: HelperConfig, dependencies: Dependencies = {}) {
  const run = dependencies.run ?? runFixedCommand; const now = (dependencies.now ?? (() => new Date()))().toISOString(); const store = new SiteStateStore(config);
  const id = siteId(plan.nodeId, plan.domains[0]!); const root = within(config.sitesRoot, id); const release = within(root, "releases", plan.releaseId); const current = within(root, "current");
  const nginxPath = within(config.nginxRoot, nginxName(id)); const envPath = within(config.environmentRoot, `${id}.env`); const unitPath = within(config.unitRoot, unitName(id));
  return store.withSiteLock(id, async () => {
    const existing = await store.site(id);
    if (existing?.planId === plan.planId && existing.releaseId === plan.releaseId && await currentTarget(current) === `releases/${plan.releaseId}`) {
      return { siteId: id, releaseId: plan.releaseId };
    }
    const previous = { nginx: await oldContent(nginxPath), env: await oldContent(envPath), unit: await oldContent(unitPath), current: await currentTarget(current) };
    const certificateName = plan.domains[0]!;
    const port = plan.manifest.runtime === "static" ? null : await store.allocatePort(id, existing?.port ?? null);
    const site: ManagedSite = { siteId: id, planId: plan.planId, domains: plan.domains, manifest: plan.manifest, releaseId: plan.releaseId, port, desiredState: "running", protected: plan.domains.some((domain) => config.protectedDomains.has(domain)), version: (existing?.version ?? 0) + 1, certificateName, runtimePath: plan.runtimePath, createdAt: existing?.createdAt ?? now, updatedAt: now };
    try {
    const loadedNginx = await run("/usr/sbin/nginx", ["-T"], 30_000);
    assertDomainsUnclaimed(`${loadedNginx.stdout}\n${loadedNginx.stderr}`, plan.domains, nginxPath);
    await mkdir(within(root, "releases"), { recursive: true, mode: 0o755 });
    await copyPreparedRelease(plan, config, release);
    await mkdir(config.challengeRoot, { recursive: true, mode: 0o755 });
    await atomicWrite(nginxPath, challengeConfiguration(plan, config.challengeRoot), 0o644);
    await run("/usr/sbin/nginx", ["-t"], 30_000); await run("/usr/bin/systemctl", ["reload", "nginx.service"], 20_000);
    await (dependencies.issue ?? issueCertificate)(plan, config.challengeRoot, run);
    await atomicWrite(envPath, environmentFile(plan), 0o600);
    const unit = serviceUnit(site, config.sitesRoot, envPath); if (unit) await atomicWrite(unitPath, unit, 0o644);
    await atomicWrite(nginxPath, activeConfiguration(site, config.sitesRoot, config.challengeRoot), 0o644);
    await run("/usr/sbin/nginx", ["-t"], 30_000);
    if (unit && existing?.manifest.runtime !== "static") await run("/usr/bin/systemctl", ["stop", unitName(id)], 30_000);
    if (unit) await assertPortAvailable(site.port);
    await swapLink(current, `releases/${plan.releaseId}`);
    if (unit) {
      await run("/usr/bin/systemctl", ["daemon-reload"], 20_000); await run("/usr/bin/systemctl", ["enable", unitName(id)], 30_000); await run("/usr/bin/systemctl", ["start", unitName(id)], 30_000);
      const state = await run("/usr/bin/systemctl", ["show", "--property=ActiveState", "--property=SubState", "--property=MainPID", "--property=ControlGroup", unitName(id)], 20_000);
      await waitForManagedPortOwner(site.port, state.stdout);
    }
    await run("/usr/bin/systemctl", ["reload", "nginx.service"], 20_000);
    await run("/usr/bin/curl", ["--fail", "--silent", "--show-error", "--max-time", "10", "--max-redirs", "0", "--unix-socket", `/run/stackpilot-sites/${id}.sock`, `http://localhost${plan.manifest.healthCheckPath ?? "/"}`], 15_000);
    await store.saveSite(site);
    return { siteId: id, releaseId: plan.releaseId };
    } catch (error) {
      await restoreFile(nginxPath, previous.nginx); await restoreFile(envPath, previous.env); await restoreFile(unitPath, previous.unit);
      if (previous.current) await swapLink(current, previous.current); else await unlink(current).catch(() => undefined);
      await run("/usr/bin/systemctl", ["daemon-reload"], 20_000).catch(() => undefined);
      if (previous.unit) await run("/usr/bin/systemctl", ["restart", unitName(id)], 30_000).catch(() => undefined); else await run("/usr/bin/systemctl", ["stop", unitName(id)], 30_000).catch(() => undefined);
      await run("/usr/sbin/nginx", ["-t"], 30_000).catch(() => undefined); await run("/usr/bin/systemctl", ["reload", "nginx.service"], 20_000).catch(() => undefined);
      if (port !== null && existing?.port !== port) await store.releasePort(id, port);
      throw error;
    }
  });
}

export function preview(plan: PreparedPlan) {
  return { stagingId: stagingId(plan.planId), planPreview: { runtime: plan.manifest.runtime, healthCheckPath: plan.manifest.healthCheckPath, changes: ["repository", "runtime", "nginx", "certificate", "environment", "traffic_switch"] } };
}

export async function verifyActivation(plan: PreparedPlan | null, requestedStagingId: string, digest: string) {
  if (!plan || stagingId(plan.planId) !== requestedStagingId || plan.expectedPlanDigest !== digest) throw new HelperError("STALE_PLAN", "Prepared plan identity or digest changed");
  return plan;
}
