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
    for (const site of await this.sites()) if (site.port === port) return site.siteId;
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

  async allocatePort(id: string, preferred: number | null = null, available: (port: number) => Promise<boolean> = async () => true) {
    const allocated = await this.allocatedPort(id);
    if (allocated !== null) {
      const owner = await this.existingPortOwner(allocated);
      if (!owner || owner === id) return allocated;
      await this.releasePort(id, allocated);
    }
    if (preferred !== null && preferred >= 20_000 && preferred < 40_000 && await this.claimPort(preferred, id)) {
      try { if (await available(preferred)) return preferred; } catch (error) { await this.releasePort(id, preferred); throw error; }
      await this.releasePort(id, preferred);
    }
    const start = Number.parseInt(id.slice(-4), 16) % 20_000;
    for (let offset = 0; offset < 20_000; offset += 1) {
      const port = 20_000 + (start + offset) % 20_000; if (port === preferred) continue;
      if (!await this.claimPort(port, id)) continue;
      try { if (await available(port)) return port; } catch (error) { await this.releasePort(id, port); throw error; }
      await this.releasePort(id, port);
    }
    throw new HelperError("SITE_PORTS_EXHAUSTED", "No managed-site ports remain available");
  }

  async releasePort(id: string, port: number) {
    const path = this.allocationPath(port); const allocation = await readJson<{ siteId?: unknown }>(path).catch(() => null);
    if (allocation?.siteId === id) await rm(path, { force: true });
  }

  async withSiteLock<T>(id: string, operation: () => Promise<T>) {
    const root = within(this.config.stateRoot, "locks"); const path = within(root, `${id}.lock`); const recovery = within(root, `${id}.recovery`); const owner = await currentLockOwner();
    await mkdir(root, { recursive: true, mode: 0o700 });
    while (true) {
      try { await symlink(owner.descriptor, path); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const recoveryDescriptor = await acquireRecovery(recovery);
        if (recoveryDescriptor) {
          try {
            const staleOwner = await lockOwner(path); if (staleOwner && !await sameProcess(staleOwner)) await removeOwnedLock(path, staleOwner);
          } finally { await removeOwnedLock(recovery, await descriptorOwner(recoveryDescriptor)); }
        }
        await wait(25); continue;
      }
    }
    try { return await operation(); }
    finally { await removeOwnedLock(path, owner); }
  }
  async sites() {
    const root = within(this.config.stateRoot, "sites");
    let names: string[];
    try { names = await readdir(root); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
    const sites = await Promise.all(names.filter((name) => name.endsWith(".json")).sort().map((name) => readJson<ManagedSite>(within(root, name))));
    return sites.filter((site): site is ManagedSite => site !== null);
  }
}

type LockOwner = { descriptor: string; pid: number; processStart: string | null; symbolic: boolean };

async function lockOwner(path: string): Promise<LockOwner | null> {
  const info = await lstat(path).catch(() => null); if (!info) return null;
  if (info.isSymbolicLink()) {
    const descriptor = await readlink(path); return descriptorOwner(descriptor).catch(() => null);
  }
  if (!info.isDirectory()) return null;
  const owner = await readJson<{ token?: unknown; pid?: unknown }>(within(path, "owner.json")).catch(() => null);
  return typeof owner?.token === "string" && typeof owner.pid === "number" ? { descriptor: owner.token, pid: owner.pid, processStart: null, symbolic: false } : null;
}

async function removeOwnedLock(path: string, owner: LockOwner) {
  const current = await lockOwner(path); if (!current || current.descriptor !== owner.descriptor || current.pid !== owner.pid || current.processStart !== owner.processStart || current.symbolic !== owner.symbolic) return;
  await rm(path, { recursive: true, force: true });
}

async function acquireRecovery(path: string) {
  const owner = await currentLockOwner();
  try { await symlink(owner.descriptor, path); return owner.descriptor; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const staleOwner = await lockOwner(path); if (staleOwner && !await sameProcess(staleOwner)) await removeOwnedLock(path, staleOwner);
    return null;
  }
}

async function processStart(pid: number) {
  const source = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => null); if (!source) return null;
  const end = source.lastIndexOf(")"); const value = end >= 0 ? source.slice(end + 2).trim().split(/\s+/)[19] : undefined;
  return /^\d+$/.test(value ?? "") ? value! : null;
}

async function descriptorOwner(descriptor: string): Promise<LockOwner> {
  const match = descriptor.match(/^([1-9]\d*):(\d+|unknown):([0-9a-f-]{36})$/i); if (!match) throw new Error("INVALID_LOCK_OWNER");
  return { descriptor, pid: Number(match[1]), processStart: match[2] === "unknown" ? null : match[2]!, symbolic: true };
}

async function currentLockOwner() {
  const start = await processStart(process.pid); return descriptorOwner(`${process.pid}:${start ?? "unknown"}:${randomUUID()}`);
}

async function sameProcess(owner: LockOwner) {
  if (!processRunning(owner.pid)) return false;
  return owner.processStart === null || await processStart(owner.pid) === owner.processStart;
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
