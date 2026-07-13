import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HelperError, type ManagedInstance, type InstanceCredential } from "../domain.js";
import type { QueryClient } from "../collection/queryClient.js";
import type { HelperRunner } from "../platform/runner.js";

type Manifest = { version: 1; id: string; instanceId: string; engine: string; databaseVersion: string | null; createdAt: string; files: Array<{ name: string; sizeBytes: number; sha256: string }> };
const hashFile = (path: string) => new Promise<string>((resolve, reject) => { const hash = createHash("sha256"); createReadStream(path).on("error", reject).on("data", (chunk) => hash.update(chunk)).on("end", () => resolve(hash.digest("hex"))); });

export class DatabaseBackupService {
  constructor(private readonly runner: HelperRunner, private readonly queries: QueryClient) {}
  async create(instance: ManagedInstance, credential: InstanceCredential, retentionCount: number) {
    const id = randomUUID(), directory = join(instance.backupDirectory, id); await mkdir(instance.backupDirectory, { recursive: true, mode: 0o700 }); await chmod(instance.backupDirectory, 0o700); await this.capacityPreflight(instance, credential);
    await mkdir(directory, { recursive: false, mode: 0o700 });
    try {
      const files = instance.engine === "postgresql" ? await this.postgres(instance, credential, directory) : await this.mysql(instance, credential, directory);
      const entries = await Promise.all(files.map(async (name) => { const path = join(directory, name), metadata = await stat(path); return { name, sizeBytes: metadata.size, sha256: await hashFile(path) }; }));
      const manifest: Manifest = { version: 1, id, instanceId: instance.id, engine: instance.engine, databaseVersion: instance.version, createdAt: new Date().toISOString(), files: entries };
      await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 }); await chmod(join(directory, "manifest.json"), 0o600);
      await this.enforceRetention(instance.backupDirectory, retentionCount, id); return manifest;
    } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
  }
  private async capacityPreflight(instance: ManagedInstance, credential: InstanceCredential) {
    const { stdout } = await this.runner.run("df", ["-Pk", instance.backupDirectory]); const rows = stdout.trim().split(/\r?\n/); const fields = rows.at(-1)?.trim().split(/\s+/); const available = Number(fields?.[3]) * 1024;
    if (!Number.isSafeInteger(available) || available <= 0) throw new HelperError("CAPACITY_UNKNOWN", "无法确认备份目录剩余容量");
    const estimate = await this.queries.query<{ storageBytes: number }>(instance, credential, instance.engine === "postgresql" ? "SELECT json_build_object('storageBytes',COALESCE((SELECT sum(pg_database_size(datname)) FROM pg_database WHERE datallowconn AND NOT datistemplate),0))::text" : "SELECT JSON_OBJECT('storageBytes',COALESCE((SELECT SUM(data_length+index_length) FROM information_schema.tables),0))");
    if (available < Math.max(512 * 1024 * 1024, estimate.storageBytes * 1.2)) throw new HelperError("INSUFFICIENT_CAPACITY", "备份目录剩余容量不足");
  }
  private async postgres(instance: ManagedInstance, credential: InstanceCredential, directory: string) {
    const env = { PGPASSWORD: credential.password }; const common = ["--host", instance.host, "--port", String(instance.port), "--username", credential.username];
    await this.runner.run("pg_dumpall", [...common, "--globals-only", "--no-role-passwords"], { outputPath: join(directory, "globals.sql"), credentialEnvironment: env });
    const names = await this.queries.query<string[]>(instance, credential, "SELECT coalesce(json_agg(datname ORDER BY datname),'[]'::json)::text FROM pg_database WHERE datallowconn AND NOT datistemplate");
    const files = ["globals.sql"];
    for (const name of names) {
      if (!/^[\p{L}\p{N}_.-]{1,128}$/u.test(name)) throw new HelperError("UNSAFE_DATABASE_NAME", "数据库名称无法安全备份");
      const file = `database-${Buffer.from(name).toString("base64url")}.dump`;
      await this.runner.run("pg_dump", [...common, "--format=custom", name], { outputPath: join(directory, file), credentialEnvironment: env, timeoutMs: 30 * 60_000 }); files.push(file);
    }
    return files;
  }
  private async mysql(instance: ManagedInstance, credential: InstanceCredential, directory: string) {
    const command = instance.engine === "mariadb" ? "mariadb-dump" : "mysqldump";
    await this.runner.run(command, ["--protocol=TCP", "--host", instance.host, "--port", String(instance.port), "--user", credential.username,
      "--all-databases", "--single-transaction", "--routines", "--events", "--triggers", "--hex-blob"],
    { outputPath: join(directory, "all-databases.sql"), credentialEnvironment: { MYSQL_PWD: credential.password }, timeoutMs: 30 * 60_000 });
    return ["all-databases.sql"];
  }
  private async enforceRetention(root: string, count: number, current: string) {
    const directories = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && /^[a-f0-9-]{36}$/.test(entry.name));
    const dated = await Promise.all(directories.map(async (entry) => ({ name: entry.name, time: (await stat(join(root, entry.name))).mtimeMs })));
    for (const item of dated.sort((a, b) => b.time - a.time).slice(count)) if (item.name !== current) await rm(join(root, item.name), { recursive: true, force: true });
  }
}
