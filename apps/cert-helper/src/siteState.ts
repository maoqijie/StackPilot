import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, readdir, readlink, rename, rm, symlink } from "node:fs/promises";
import { dirname } from "node:path";
import type { HelperConfig } from "./config.js";
import { atomicWrite, readJson, within } from "./io.js";
import { HelperError, type ManagedSite, type PreparedPlan } from "./types.js";

export const stagingId = (planId: string) => `staging_${createHash("sha256").update(`staging:${planId}`).digest("hex").slice(0, 32)}`;
export const agentSiteId = (nodeId: string, domain: string) => `site_${createHash("sha256").update(`${nodeId}\x00${domain.toLowerCase()}`).digest("hex").slice(0, 32)}`;
export const siteId = (nodeId: string, domain: string) => `site-${createHash("sha256").update(`${nodeId}\x00${agentSiteId(nodeId, domain)}`).digest("hex").slice(0, 32)}`;
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class SiteStateStore {
  constructor(private readonly config: HelperConfig) {}
  private planPath(id: string) { return within(this.config.stateRoot, "plans", `${id}.json`); }
  private sitePath(id: string) { return within(this.config.stateRoot, "sites", `${id}.json`); }
  private allocationPath(port: number) { return within(this.config.stateRoot, "port-allocations", `${port}.json`); }
  async savePlan(plan: PreparedPlan) { await atomicWrite(this.planPath(plan.planId), `${JSON.stringify(plan)}\n`); }
  async plan(id: string) { return readJson<PreparedPlan>(this.planPath(id)); }
  async saveSite(site: ManagedSite) { await atomicWrite(this.sitePath(site.siteId), `${JSON.stringify(site)}\n`); }
  async site(id: string) { return readJson<ManagedSite>(this.sitePath(id)); }

  async logMaskingKey() {
    const path = within(this.config.stateRoot, "secrets", "log-masking.key"); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const candidate = randomBytes(32).toString("hex");
    try {
      const handle = await open(path, "wx", 0o600);
      try { await handle.writeFile(`${candidate}\n`, "utf8"); await handle.chmod(0o600); await handle.sync(); } finally { await handle.close(); }
      return Buffer.from(candidate, "hex");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink()) throw new HelperError("LOG_MASKING_KEY_INVALID", "Log masking key must be a regular file");
      await chmod(path, 0o600); const value = (await readFile(path, "utf8")).trim();
      if (/^[a-f0-9]{64}$/.test(value)) return Buffer.from(value, "hex");
      if (value) throw new HelperError("LOG_MASKING_KEY_INVALID", "Log masking key is invalid");
      await wait(10);
    }
    throw new HelperError("LOG_MASKING_KEY_INVALID", "Log masking key creation did not complete");
  }

  private async existingPortOwner(port: number) {
    const root = within(this.config.stateRoot, "sites"); const names = await readdir(root).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [] as string[]; throw error;
    });
    for (const name of names) {
      if (!/^site-[a-f0-9]{32}\.json$/.test(name)) continue;
      const site = await readJson<ManagedSite>(within(root, name)); if (site?.port === port) return site.siteId;
    }
    return null;
  }

  private async allocatedPort(id: string) {
    const root = within(this.config.stateRoot, "port-allocations"); const names = await readdir(root).catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [] as string[]; throw error;
    });
    for (const name of names) {
      const match = name.match(/^(2\d{4}|3\d{4})\.json$/); if (!match) continue;
      const allocation = await readJson<{ siteId?: unknown }>(within(root, name)).catch(() => null);
      if (allocation?.siteId === id) return Number(match[1]);
    }
    return null;
  }

  private async claimPort(port: number, id: string) {
    const path = this.allocationPath(port); await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const existingOwner = await this.existingPortOwner(port); if (existingOwner && existingOwner !== id) return false;
    try {
      const handle = await open(path, "wx", 0o600);
      try { await handle.writeFile(`${JSON.stringify({ siteId: id })}\n`, "utf8"); await handle.sync(); } finally { await handle.close(); }
      return true;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const allocation = await readJson<{ siteId?: unknown }>(path).catch(() => null); if (allocation?.siteId === id) return true;
      if (allocation) return false; await wait(10);
    }
    return false;
  }

  async allocatePort(id: string, preferred: number | null = null) {
    const allocated = await this.allocatedPort(id); if (allocated !== null) return allocated;
    if (preferred !== null && preferred >= 20_000 && preferred < 40_000 && await this.claimPort(preferred, id)) return preferred;
    const start = Number.parseInt(createHash("sha256").update(`port:${id}`).digest("hex").slice(0, 8), 16) % 20_000;
    for (let offset = 0; offset < 20_000; offset += 1) {
      const port = 20_000 + (start + offset) % 20_000; if (port === preferred) continue;
      if (await this.claimPort(port, id)) return port;
    }
    throw new HelperError("SITE_PORTS_EXHAUSTED", "No managed-site ports remain available");
  }

  async releasePort(id: string, port: number) {
    const path = this.allocationPath(port); const allocation = await readJson<{ siteId?: unknown }>(path).catch(() => null);
    if (allocation?.siteId === id) await rm(path, { force: true });
  }

  async withSiteLock<T>(id: string, operation: () => Promise<T>) {
    const root = within(this.config.stateRoot, "locks"); const path = within(root, `${id}.lock`); const recovery = within(root, `${id}.recovery`); const ownerPath = within(path, "owner.json"); const token = randomUUID();
    await mkdir(root, { recursive: true, mode: 0o700 });
    while (true) {
      try { await mkdir(path, { mode: 0o700 }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (await acquireRecovery(recovery)) {
          try {
            const owner = await readJson<{ pid?: unknown }>(ownerPath).catch(() => null); const info = await lstat(path).catch(() => null);
            const stale = typeof owner?.pid === "number"
              ? !processRunning(owner.pid)
              : Boolean(info && Date.now() - info.mtimeMs > 5_000);
            if (stale) await rm(path, { recursive: true, force: true });
          } finally { await rm(recovery, { recursive: true, force: true }); }
        }
        await wait(25); continue;
      }
      try { await atomicWrite(ownerPath, `${JSON.stringify({ token, pid: process.pid })}\n`); break; }
      catch (error) { await rm(path, { recursive: true, force: true }); throw error; }
    }
    try { return await operation(); }
    finally {
      const owner = await readJson<{ token?: unknown }>(ownerPath).catch(() => null);
      if (owner?.token === token) await rm(path, { recursive: true, force: true });
    }
  }
}

async function acquireRecovery(path: string) {
  try { await mkdir(path, { mode: 0o700 }); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const info = await lstat(path).catch(() => null); if (info && Date.now() - info.mtimeMs > 5_000) await rm(path, { recursive: true, force: true });
    return false;
  }
}

function processRunning(pid: number) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
}

export async function assertPortAvailable(port: number | null, procRoot = "/proc") {
  if (!Number.isSafeInteger(port) || port === null || port < 1 || port > 65_535) throw new HelperError("SITE_PORT_INVALID", "Managed service port is invalid");
  for (const tableName of ["tcp", "tcp6"] as const) {
    const table = await readFile(within(procRoot, "net", tableName), "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HelperError("PORT_STATE_UNAVAILABLE", "Kernel listening-port state is unavailable"); throw error;
    });
    for (const line of table.split(/\r?\n/).slice(1)) {
      const fields = line.trim().split(/\s+/); const local = fields[1]?.split(":").at(-1);
      if (fields[3] === "0A" && local && Number.parseInt(local, 16) === port) throw new HelperError("SITE_PORT_IN_USE", "Managed service port is already owned by another listener");
    }
  }
}

type PortOwnerRoots = { procRoot?: string; cgroupRoot?: string };

async function listeningSocketInodes(port: number, procRoot: string) {
  const result = new Set<string>();
  for (const tableName of ["tcp", "tcp6"] as const) {
    const table = await readFile(within(procRoot, "net", tableName), "utf8").catch((error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HelperError("PORT_STATE_UNAVAILABLE", "Kernel listening-port state is unavailable"); throw error;
    });
    for (const line of table.split(/\r?\n/).slice(1)) {
      const fields = line.trim().split(/\s+/); const local = fields[1]?.split(":").at(-1); const inode = fields[9];
      if (fields[3] === "0A" && local && Number.parseInt(local, 16) === port && /^\d+$/.test(inode ?? "")) result.add(inode!);
    }
  }
  return result;
}

export async function assertManagedPortOwner(port: number | null, systemdState: string, roots: PortOwnerRoots = {}) {
  if (!Number.isSafeInteger(port) || port === null || port < 1 || port > 65_535) throw new HelperError("SITE_PORT_INVALID", "Managed service port is invalid");
  const mainPid = Number(systemdState.match(/^MainPID=(\d+)$/m)?.[1] ?? "0");
  const controlGroup = systemdState.match(/^ControlGroup=(\/[\x21-\x7e]+)$/m)?.[1] ?? "";
  if (!/^ActiveState=active$/m.test(systemdState) || !/^SubState=running$/m.test(systemdState) || !Number.isSafeInteger(mainPid) || mainPid <= 0 || controlGroup === "/") {
    throw new HelperError("SERVICE_START_UNVERIFIED", "Managed service did not reach a verifiable running state");
  }
  const procRoot = roots.procRoot ?? "/proc"; const cgroupRoot = roots.cgroupRoot ?? "/sys/fs/cgroup";
  const processIds = (await readFile(within(cgroupRoot, controlGroup.slice(1), "cgroup.procs"), "utf8").catch(() => {
    throw new HelperError("PORT_OWNERSHIP_UNVERIFIED", "Managed service cgroup membership is unavailable");
  })).split(/\s+/).filter((value) => /^[1-9]\d*$/.test(value));
  if (!processIds.includes(String(mainPid))) throw new HelperError("PORT_OWNERSHIP_UNVERIFIED", "Managed service main process is outside its cgroup");
  const listeners = await listeningSocketInodes(port, procRoot);
  if (listeners.size === 0) throw new HelperError("PORT_OWNERSHIP_UNVERIFIED", "Managed service is not listening on its assigned port");
  const owned = new Set<string>();
  for (const processId of processIds) {
    const directory = within(procRoot, processId, "fd"); const descriptors = await readdir(directory).catch(() => [] as string[]);
    for (const descriptor of descriptors) {
      const target = await readlink(within(directory, descriptor)).catch(() => ""); const match = target.match(/^socket:\[(\d+)]$/);
      if (match) owned.add(match[1]!);
    }
  }
  if ([...listeners].some((inode) => !owned.has(inode))) throw new HelperError("PORT_OWNERSHIP_UNVERIFIED", "Assigned port is owned by a process outside the managed service cgroup");
}

export async function waitForManagedPortOwner(port: number | null, systemdState: string, roots: PortOwnerRoots = {}) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await assertManagedPortOwner(port, systemdState, roots); return; }
    catch (error) {
      if (!(error instanceof HelperError) || error.code !== "PORT_OWNERSHIP_UNVERIFIED" || attempt === 49) throw error;
      await wait(100);
    }
  }
}

export async function swapLink(link: string, target: string) {
  await mkdir(dirname(link), { recursive: true, mode: 0o755 });
  const temporary = `${link}.${process.pid}.tmp`; await symlink(target, temporary); await rename(temporary, link);
}

export async function currentTarget(link: string) {
  try { const info = await lstat(link); if (!info.isSymbolicLink()) throw new HelperError("CURRENT_LINK_INVALID", "Current release is not a symbolic link"); return readlink(link); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
