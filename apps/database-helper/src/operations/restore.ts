import { chown, chmod, cp, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { DatabaseIdentifierSchema, HelperError, type InstanceCredential, type ManagedInstance } from "../domain.js";
import type { QueryClient } from "../collection/queryClient.js";
import type { HelperRunner } from "../platform/runner.js";
import type { DatabaseProvisioner } from "./provisioner.js";
import { hashFile, type BackupManifest } from "./backup.js";
import { acquireInstanceLock } from "./instanceLock.js";

const FileSchema = z.object({
  name: z.string().min(1).max(256).regex(/^[A-Za-z0-9_.-]+$/), sizeBytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), databaseName: DatabaseIdentifierSchema.nullable(),
}).strict();
const ManifestSchema = z.object({
  version: z.literal(1), id: z.string().uuid(), instanceId: z.string().min(1).max(80), engine: z.enum(["postgresql", "mysql", "mariadb"]),
  databaseVersion: z.string().nullable(), createdAt: z.string().datetime(), files: z.array(FileSchema).min(1).max(512),
}).strict();

export type RestoreResult = { recoveryPointId: string; healthy: true; rollbackExpiresAt: string };

export class DatabaseRestoreService {
  constructor(private readonly runner: HelperRunner, private readonly queries: QueryClient, private readonly provisioner: DatabaseProvisioner) {}

  async restore(instance: ManagedInstance, credential: InstanceCredential, restorePointId: string): Promise<RestoreResult> {
    if (!instance.managed) throw new HelperError("RESTORE_UNMANAGED_DENIED", "非 StackPilot 受管实例禁止原地恢复");
    if (!instance.configDirectory || !instance.runtimeDirectory || !instance.operatingSystem) throw new HelperError("MANAGED_METADATA_MISSING", "受管实例缺少恢复元数据");
    const release = await acquireInstanceLock(instance.backupDirectory);
    try { return await this.restoreLocked(instance, credential, restorePointId); } finally { await release(); }
  }

  private async restoreLocked(instance: ManagedInstance, credential: InstanceCredential, restorePointId: string): Promise<RestoreResult> {
    const configDirectory = instance.configDirectory!;
    const source = join(instance.backupDirectory, restorePointId), manifest = await this.readManifest(source, instance, restorePointId); await this.verifyFiles(source, manifest);
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "");
    const dataRollback = `${instance.dataDirectory}.rollback-${stamp}`;
    const rollbackRoot = join(dirname(instance.dataDirectory), "rollbacks", stamp), configRollback = join(rollbackRoot, "config");
    const rollbackExpiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const plan = this.provisioner.platform(instance), identity = await this.provisioner.identity(instance.engine);
    await this.assertAbsent(dataRollback); await this.assertAbsent(rollbackRoot);
    await mkdir(dirname(rollbackRoot), { recursive: true, mode: 0o700 }); await mkdir(rollbackRoot, { recursive: false, mode: 0o700 });
    await cp(configDirectory, configRollback, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    await writeFile(join(rollbackRoot, "rollback.json"), JSON.stringify({ instanceId: instance.id, restorePointId, createdAt: new Date().toISOString(), expiresAt: rollbackExpiresAt }, null, 2), { mode: 0o600 });
    let originalMoved = false;
    try {
      await this.provisioner.stop(plan); await rename(instance.dataDirectory, dataRollback); originalMoved = true;
      await mkdir(instance.dataDirectory, { recursive: false, mode: 0o700 }); await chmod(instance.dataDirectory, 0o700); await chown(instance.dataDirectory, identity.uid, identity.gid);
      await this.provisioner.initialize(instance, plan, identity, instance.engine === "postgresql" ? "stackpilot_restore_admin" : undefined);
      await this.provisioner.start(plan); await this.provisioner.waitReady(instance, plan);
      await this.apply(instance, credential, source, manifest, identity);
      await this.provisioner.health(instance, credential);
      if (instance.engine === "postgresql") await this.queries.execute(instance, credential, 'DROP ROLE "stackpilot_restore_admin"', 10_000);
      await rename(dataRollback, join(rollbackRoot, "data"));
      return { recoveryPointId: restorePointId, healthy: true, rollbackExpiresAt };
    } catch (error) {
      try { await this.provisioner.stop(plan); } catch { /* A failed restore may not have a running service. */ }
      if (originalMoved) { await rm(instance.dataDirectory, { recursive: true, force: true }); await rename(dataRollback, instance.dataDirectory); }
      try { await this.provisioner.start(plan); await this.provisioner.waitReady(instance, plan); } catch { throw new HelperError("RESTORE_ROLLBACK_FAILED", "恢复失败且旧数据回滚后服务未恢复"); }
      throw error;
    }
  }

  private async readManifest(root: string, instance: ManagedInstance, restorePointId: string) {
    let value: BackupManifest;
    try { value = ManifestSchema.parse(JSON.parse(await readFile(join(root, "manifest.json"), "utf8"))) as BackupManifest; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HelperError("RESTORE_POINT_NOT_FOUND", "恢复点不存在"); throw new HelperError("RESTORE_MANIFEST_INVALID", "恢复点 manifest 无效"); }
    if (value.id !== restorePointId || value.instanceId !== instance.id || value.engine !== instance.engine) throw new HelperError("RESTORE_POINT_MISMATCH", "恢复点不属于目标实例或引擎");
    const expected = instance.engine === "postgresql" ? ["globals.sql"] : ["all-databases.sql"];
    if (expected.some((name) => !value.files.some((file) => file.name === name))) throw new HelperError("RESTORE_MANIFEST_INCOMPLETE", "恢复点缺少必要文件");
    return value;
  }

  private async verifyFiles(root: string, manifest: BackupManifest) {
    const names = new Set<string>();
    for (const file of manifest.files) {
      if (names.has(file.name)) throw new HelperError("RESTORE_MANIFEST_INVALID", "恢复点包含重复文件"); names.add(file.name);
      const path = join(root, file.name), metadata = await stat(path);
      if (!metadata.isFile() || metadata.size !== file.sizeBytes || await hashFile(path) !== file.sha256) throw new HelperError("RESTORE_CHECKSUM_MISMATCH", "恢复点文件校验失败");
    }
  }

  private async apply(instance: ManagedInstance, credential: InstanceCredential, root: string, manifest: BackupManifest, identity: { uid: number; gid: number }) {
    if (instance.engine === "postgresql") {
      const socket = instance.runtimeDirectory!, admin = "stackpilot_restore_admin";
      await this.runner.run("psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=on", "--host", socket, "--username", admin, "--dbname", "postgres", "--file", "-"], { inputPath: join(root, "globals.sql"), uid: identity.uid, gid: identity.gid, timeoutMs: 10 * 60_000 });
      for (const file of manifest.files.filter((item) => item.databaseName !== null)) {
        if (file.databaseName === "postgres") await this.runner.run("psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=on", "--host", socket, "--username", admin, "--dbname", "postgres", "--file", "-"], { input: 'ALTER DATABASE "postgres" OWNER TO "stackpilot";', uid: identity.uid, gid: identity.gid });
        else await this.runner.run("createdb", ["--host", socket, "--username", admin, "--owner", "stackpilot", file.databaseName!], { uid: identity.uid, gid: identity.gid, timeoutMs: 30_000 });
        await this.runner.run("pg_restore", ["--host", socket, "--username", admin, "--role", "stackpilot", "--dbname", file.databaseName!, "--no-owner", "--no-tablespaces", "--exit-on-error", join(root, file.name)], { uid: identity.uid, gid: identity.gid, timeoutMs: 30 * 60_000 });
      }
      const initial = credential.initialUsername && credential.initialPassword ? ` ALTER ROLE "${credential.initialUsername.replaceAll('"', '""')}" WITH LOGIN PASSWORD '${credential.initialPassword.replaceAll("'", "''")}';` : "";
      const sql = `ALTER ROLE "${credential.username.replaceAll('"', '""')}" WITH LOGIN SUPERUSER PASSWORD '${credential.password.replaceAll("'", "''")}';${initial}`;
      await this.runner.run("psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=on", "--host", socket, "--username", admin, "--dbname", "postgres", "--file", "-"], { input: sql, uid: identity.uid, gid: identity.gid });
      return;
    }
    const command = instance.toolFamily === "mariadb" ? "mariadb" : "mysql";
    await this.runner.run(command, ["--protocol=SOCKET", `--socket=${join(instance.runtimeDirectory!, "mysql.sock")}`, "--user=root"], { inputPath: join(root, "all-databases.sql"), timeoutMs: 30 * 60_000 });
    const initial = credential.initialUsername && credential.initialPassword ? ` ALTER USER '${credential.initialUsername.replaceAll("'", "''")}'@'%' IDENTIFIED BY '${credential.initialPassword.replaceAll("'", "''")}' REQUIRE SSL;` : "";
    const sql = `ALTER USER '${credential.username.replaceAll("'", "''")}'@'%' IDENTIFIED BY '${credential.password.replaceAll("'", "''")}' REQUIRE SSL;${initial} FLUSH PRIVILEGES;`;
    await this.queries.execute(instance, credential, sql, 30_000);
  }

  private async assertAbsent(path: string) {
    try { await lstat(path); throw new HelperError("ROLLBACK_PATH_CONFLICT", "回滚目录已存在"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
}

const RollbackSchema = z.object({ instanceId: z.string().min(1).max(80), restorePointId: z.string().uuid(), createdAt: z.string().datetime(), expiresAt: z.string().datetime() }).strict();
export async function cleanupExpiredRollbackCopies(instances: ManagedInstance[], now = new Date()) {
  let removed = 0;
  for (const instance of instances.filter((item) => item.managed)) {
    const root = join(dirname(instance.dataDirectory), "rollbacks"); let entries;
    try { entries = await readdir(root, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") continue; throw error; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^\d{17}$/.test(entry.name)) continue;
      try { const metadata = RollbackSchema.parse(JSON.parse(await readFile(join(root, entry.name, "rollback.json"), "utf8"))); if (metadata.instanceId === instance.id && Date.parse(metadata.expiresAt) <= now.getTime()) { await rm(join(root, entry.name), { recursive: true, force: true }); removed += 1; } }
      catch { /* Unknown or malformed directories are never removed automatically. */ }
    }
  }
  return removed;
}
