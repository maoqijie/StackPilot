import { mkdir, readFile, rm, unlink } from "node:fs/promises";
import { createServer } from "node:net";
import type { HelperConfig } from "./config.js";
import { atomicWrite, within } from "./io.js";
import { activeConfiguration, assertDomainsUnclaimed, challengeConfiguration, serviceUnit } from "./nginx.js";
import { copyPreparedRelease } from "./repository.js";
import { runFixedCommand, type FixedCommandRunner } from "./runner.js";
import { currentTarget, siteId, SiteStateStore, stagingId, swapLink } from "./siteState.js";
import { HelperError, type ManagedSite, type PreparedPlan } from "./types.js";
import { issueCertificate } from "./certificates.js";

type Dependencies = { run?: FixedCommandRunner; issue?: typeof issueCertificate; now?: () => Date; isPortAvailable?: (port: number) => Promise<boolean> };
const nginxName = (siteIdValue: string) => `stackpilot-${siteIdValue}.conf`;
const unitName = (siteIdValue: string) => `stackpilot-site-${siteIdValue}.service`;
const PORT_BASE = 20_000;
const PORT_COUNT = 20_000;

async function oldContent(path: string) { try { return await readFile(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
async function restoreFile(path: string, content: string | null) { if (content === null) await rm(path, { force: true }); else await atomicWrite(path, content, 0o644); }

export function environmentFile(plan: PreparedPlan) {
  return plan.environmentVariables.map(({ name, value }) => `${name}=${JSON.stringify(value)}`).join("\n") + "\n";
}

async function canBind(port: number, host: string, ipv6Only = false) {
  return new Promise<boolean | null>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE" || error.code === "EACCES") resolve(false);
      else if (error.code === "EADDRNOTAVAIL" || error.code === "EAFNOSUPPORT") resolve(null);
      else reject(error);
    });
    server.listen({ host, port, exclusive: true, ipv6Only }, () => {
      server.close((error) => error ? reject(error) : resolve(true));
    });
  });
}

export async function isPortAvailable(port: number) {
  if (await canBind(port, "0.0.0.0") !== true) return false;
  return await canBind(port, "::", true) !== false;
}

export async function selectPort(id: string, existing: ManagedSite | null, store: SiteStateStore, available: (port: number) => Promise<boolean>) {
  const used = new Set((await store.sites()).filter((site) => site.siteId !== id && site.port !== null).map((site) => site.port!));
  if (existing?.port !== null && existing?.port !== undefined && !used.has(existing.port)) return existing.port;
  const offset = Number.parseInt(id.slice(-4), 16) % PORT_COUNT;
  for (let index = 0; index < PORT_COUNT; index += 1) {
    const port = PORT_BASE + (offset + index) % PORT_COUNT;
    if (!used.has(port) && await available(port)) return port;
  }
  throw new HelperError("SITE_PORT_EXHAUSTED", "No available managed site port remains");
}

async function unitEnabled(run: FixedCommandRunner, name: string) {
  let stdout: string;
  try { ({ stdout } = await run("/usr/bin/systemctl", ["show", "--property=UnitFileState", "--value", name], 20_000)); }
  catch { throw new HelperError("UNIT_STATE_UNAVAILABLE", "Existing managed site unit state could not be read"); }
  return new Set(["enabled", "enabled-runtime", "linked", "linked-runtime", "alias"]).has(stdout.trim());
}

export async function activatePlan(plan: PreparedPlan, config: HelperConfig, dependencies: Dependencies = {}) {
  const run = dependencies.run ?? runFixedCommand; const now = (dependencies.now ?? (() => new Date()))().toISOString(); const store = new SiteStateStore(config);
  const id = siteId(plan.nodeId, plan.domains[0]!); const root = within(config.sitesRoot, id); const release = within(root, "releases", plan.releaseId); const current = within(root, "current");
  const nginxPath = within(config.nginxRoot, nginxName(id)); const envPath = within(config.environmentRoot, `${id}.env`); const unitPath = within(config.unitRoot, unitName(id));
  const existing = await store.site(id);
  if (existing?.planId === plan.planId && existing.releaseId === plan.releaseId && await currentTarget(current) === `releases/${plan.releaseId}`) {
    return { siteId: id, releaseId: plan.releaseId };
  }
  const previous = { nginx: await oldContent(nginxPath), env: await oldContent(envPath), unit: await oldContent(unitPath), current: await currentTarget(current) };
  const certificateName = plan.domains[0]!;
  const port = plan.manifest.runtime === "static" ? null : await selectPort(id, existing, store, dependencies.isPortAvailable ?? isPortAvailable);
  const site: ManagedSite = { siteId: id, planId: plan.planId, domains: plan.domains, manifest: plan.manifest, releaseId: plan.releaseId, port, desiredState: "running", protected: plan.domains.some((domain) => config.protectedDomains.has(domain)), version: (existing?.version ?? 0) + 1, certificateName, runtimePath: plan.runtimePath, createdAt: existing?.createdAt ?? now, updatedAt: now };
  const unit = serviceUnit(site, config.sitesRoot, envPath);
  const wasUnitEnabled = unit && previous.unit ? await unitEnabled(run, unitName(id)) : false;
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
    if (unit) await atomicWrite(unitPath, unit, 0o644);
    await atomicWrite(nginxPath, activeConfiguration(site, config.sitesRoot, config.challengeRoot), 0o644);
    await run("/usr/sbin/nginx", ["-t"], 30_000);
    await swapLink(current, `releases/${plan.releaseId}`);
    if (unit) {
      await run("/usr/bin/systemctl", ["daemon-reload"], 20_000); await run("/usr/bin/systemctl", ["enable", unitName(id)], 30_000); await run("/usr/bin/systemctl", ["restart", unitName(id)], 30_000);
    }
    await run("/usr/bin/systemctl", ["reload", "nginx.service"], 20_000);
    await run("/usr/bin/curl", ["--fail", "--silent", "--show-error", "--max-time", "10", "--max-redirs", "0", "--unix-socket", `/run/stackpilot-sites/${id}.sock`, `http://localhost${plan.manifest.healthCheckPath ?? "/"}`], 15_000);
    await store.saveSite(site);
    return { siteId: id, releaseId: plan.releaseId };
  } catch (error) {
    if (unit) {
      await run("/usr/bin/systemctl", ["stop", unitName(id)], 30_000).catch(() => undefined);
      if (!wasUnitEnabled) await run("/usr/bin/systemctl", ["disable", unitName(id)], 30_000).catch(() => undefined);
    }
    await restoreFile(nginxPath, previous.nginx); await restoreFile(envPath, previous.env); await restoreFile(unitPath, previous.unit);
    if (previous.current) await swapLink(current, previous.current); else await unlink(current).catch(() => undefined);
    await run("/usr/bin/systemctl", ["daemon-reload"], 20_000).catch(() => undefined);
    if (previous.unit) {
      await run("/usr/bin/systemctl", [wasUnitEnabled ? "enable" : "disable", unitName(id)], 30_000).catch(() => undefined);
      await run("/usr/bin/systemctl", ["restart", unitName(id)], 30_000).catch(() => undefined);
    }
    await run("/usr/sbin/nginx", ["-t"], 30_000).catch(() => undefined); await run("/usr/bin/systemctl", ["reload", "nginx.service"], 20_000).catch(() => undefined);
    throw error;
  }
}

export function preview(plan: PreparedPlan) {
  return { stagingId: stagingId(plan.planId), planPreview: { runtime: plan.manifest.runtime, healthCheckPath: plan.manifest.healthCheckPath, changes: ["repository", "runtime", "nginx", "certificate", "environment", "traffic_switch"] } };
}

export async function verifyActivation(plan: PreparedPlan | null, requestedStagingId: string, digest: string) {
  if (!plan || stagingId(plan.planId) !== requestedStagingId || plan.expectedPlanDigest !== digest) throw new HelperError("STALE_PLAN", "Prepared plan identity or digest changed");
  return plan;
}
