import { readFile } from "node:fs/promises";
import type { HelperConfig } from "./config.js";
import { atomicWrite, within } from "./io.js";
import { activeConfiguration } from "./nginx.js";
import { runFixedCommand, type FixedCommandRunner } from "./runner.js";
import { SiteStateStore } from "./siteState.js";
import { HelperError, type LifecycleAction } from "./types.js";

const unitName = (siteId: string) => `stackpilot-site-${siteId}.service`;

export async function updateLifecycle(siteId: string, action: LifecycleAction, expectedVersion: number, config: HelperConfig, run: FixedCommandRunner = runFixedCommand) {
  const store = new SiteStateStore(config); const site = await store.site(siteId);
  if (!site) throw new HelperError("SITE_NOT_FOUND", "Managed site is not registered on this host");
  if (site.version !== expectedVersion) throw new HelperError("STALE_SITE_VERSION", "Managed site version changed");
  if (site.protected || site.domains.some((domain) => config.protectedDomains.has(domain))) throw new HelperError("CORE_SITE_PROTECTED", "Core StackPilot sites cannot be stopped or deleted");
  const desiredState = action === "restored" ? "running" : action; const next = { ...site, desiredState, version: site.version + 1, updatedAt: new Date().toISOString() };
  const nginxPath = within(config.nginxRoot, `stackpilot-${siteId}.conf`); const previous = await readFile(nginxPath, "utf8");
  try {
    if (site.manifest.runtime !== "static" && desiredState === "running") {
      await run("/usr/bin/systemctl", ["start", unitName(siteId)], 30_000);
      await run("/usr/bin/curl", ["--fail", "--silent", "--show-error", "--max-time", "10", "--max-redirs", "0", `http://127.0.0.1:${site.port}${site.manifest.healthCheckPath ?? "/"}`], 15_000);
    }
    await atomicWrite(nginxPath, activeConfiguration(next, config.sitesRoot, config.challengeRoot), 0o644);
    await run("/usr/sbin/nginx", ["-t"], 30_000); await run("/usr/bin/systemctl", ["reload", "nginx.service"], 20_000);
    if (site.manifest.runtime !== "static" && desiredState !== "running") await run("/usr/bin/systemctl", ["stop", unitName(siteId)], 30_000);
    await store.saveSite(next); return { siteId, desiredState };
  } catch (error) {
    await atomicWrite(nginxPath, previous, 0o644);
    if (site.manifest.runtime !== "static") await run("/usr/bin/systemctl", [site.desiredState === "running" ? "start" : "stop", unitName(siteId)], 30_000).catch(() => undefined);
    await run("/usr/sbin/nginx", ["-t"], 30_000).catch(() => undefined); await run("/usr/bin/systemctl", ["reload", "nginx.service"], 20_000).catch(() => undefined); throw error;
  }
}
