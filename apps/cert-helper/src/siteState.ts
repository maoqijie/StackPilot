import { createHash } from "node:crypto";
import { lstat, mkdir, readlink, rename, symlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { HelperConfig } from "./config.js";
import { atomicWrite, readJson, within } from "./io.js";
import { HelperError, type ManagedSite, type PreparedPlan } from "./types.js";

export const stagingId = (planId: string) => `staging_${createHash("sha256").update(`staging:${planId}`).digest("hex").slice(0, 32)}`;
export const agentSiteId = (nodeId: string, domain: string) => `site_${createHash("sha256").update(`${nodeId}\x00${domain.toLowerCase()}`).digest("hex").slice(0, 32)}`;
export const siteId = (nodeId: string, domain: string) => `site-${createHash("sha256").update(`${nodeId}\x00${agentSiteId(nodeId, domain)}`).digest("hex").slice(0, 32)}`;

export class SiteStateStore {
  constructor(private readonly config: HelperConfig) {}
  private planPath(id: string) { return within(this.config.stateRoot, "plans", `${id}.json`); }
  private sitePath(id: string) { return within(this.config.stateRoot, "sites", `${id}.json`); }
  async savePlan(plan: PreparedPlan) { await atomicWrite(this.planPath(plan.planId), `${JSON.stringify(plan)}\n`); }
  async plan(id: string) { return readJson<PreparedPlan>(this.planPath(id)); }
  async saveSite(site: ManagedSite) { await atomicWrite(this.sitePath(site.siteId), `${JSON.stringify(site)}\n`); }
  async site(id: string) { return readJson<ManagedSite>(this.sitePath(id)); }
}

export async function swapLink(link: string, target: string) {
  await mkdir(dirname(link), { recursive: true, mode: 0o755 });
  const temporary = `${link}.${process.pid}.tmp`; await symlink(target, temporary); await rename(temporary, link);
}

export async function currentTarget(link: string) {
  try { const info = await lstat(link); if (!info.isSymbolicLink()) throw new HelperError("CURRENT_LINK_INVALID", "Current release is not a symbolic link"); return readlink(link); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
