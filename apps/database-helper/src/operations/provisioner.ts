import { chown, chmod, lstat, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DatabaseEngine } from "@stackpilot/contracts";
import { DatabaseIdentifierSchema, HelperError, ManagedInstanceSchema, type InstanceCredential, type ManagedInstance } from "../domain.js";
import { encryptCredentials, generateStrongPassword } from "./credentials.js";
import { instancePlatformPlan, packagePlan, readSupportedOs, type InstancePlatformPlan, type SupportedOs } from "../platform/osSupport.js";
import { selectAvailablePort } from "../platform/ports.js";
import type { HelperRunner } from "../platform/runner.js";
import type { QueryClient } from "../collection/queryClient.js";
import type { DatabaseRegistry } from "../state/registry.js";
import { BackupSchedulerInstaller } from "./backupSchedulerInstaller.js";

type InstallRequest = { engine: DatabaseEngine; name: string; port: number | null; initialDatabase: string; credentialPublicKey: string };
type Identity = { uid: number; gid: number; user: "postgres" | "mysql" };
export type InstallResult = { localInstanceId: string; engine: DatabaseEngine; port: number; serviceName: string };

export type ProvisionerOptions = {
  systemRoot?: string; os?: SupportedOs; readOs?: () => Promise<SupportedOs>;
  readNow?: () => Date;
};

const pgIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`;
const mysqlIdentifier = (value: string) => `\`${value.replaceAll("`", "``")}\``;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

export class DatabaseProvisioner {
  private readonly systemRoot: string; private readonly readNow: () => Date;
  constructor(
    private readonly stateDir: string, private readonly registry: DatabaseRegistry,
    private readonly runner: HelperRunner, private readonly queries: QueryClient,
    private readonly options: ProvisionerOptions = {},
  ) { this.systemRoot = options.systemRoot ?? "/"; this.readNow = options.readNow ?? (() => new Date()); }

  async install(request: InstallRequest) {
    const os = await this.operatingSystem();
    const initialDatabase = DatabaseIdentifierSchema.parse(request.initialDatabase);
    if (initialDatabase.length > (request.engine === "postgresql" ? 63 : 64)) throw new HelperError("DATABASE_NAME_TOO_LONG", "初始数据库名称超过引擎限制");
    let selectedPort = await selectAvailablePort(this.runner, request.engine, request.port);
    const plan = instancePlatformPlan(os, request.engine, request.name, this.systemRoot);
    await this.assertAvailable(plan, selectedPort, request.name);
    const credential: InstanceCredential = {
      instanceId: request.name, username: "stackpilot", password: generateStrongPassword(),
      initialUsername: "app_user", initialPassword: generateStrongPassword(),
    };
    const credentialEnvelope = encryptCredentials(request.credentialPublicKey, {
      username: credential.username, password: credential.password,
      initialUsername: credential.initialUsername!, initialPassword: credential.initialPassword!,
    });
    await this.installPackages(os, request.engine);
    await new BackupSchedulerInstaller(this.runner, this.systemRoot).install(os);
    if (request.port === null) selectedPort = await selectAvailablePort(this.runner, request.engine, null);
    await this.assertAvailable(plan, selectedPort, request.name);
    const identity = await this.identity(request.engine);
    const instance = ManagedInstanceSchema.parse({
      id: request.name, name: request.name, engine: plan.toolFamily, version: await this.version(plan), port: selectedPort,
      managed: true, serviceName: plan.serviceName, dataDirectory: plan.dataDirectory,
      backupDirectory: join(this.stateDir, "backups", request.name), host: "127.0.0.1", username: credential.username,
      initialDatabase, historicalSlowQueriesAvailable: true, createdAt: this.readNow().toISOString(),
      operatingSystem: os, configDirectory: plan.configDirectory, runtimeDirectory: plan.runtimeDirectory, toolFamily: plan.toolFamily,
    });
    try {
      await this.prepareDirectories(plan, identity);
      await this.initialize(instance, plan, identity);
      await this.writeConfiguration(instance, plan, identity);
      await this.writeService(plan, identity);
      await this.start(plan);
      await this.waitReady(instance, plan);
      await this.bootstrap(instance, credential, identity);
      await this.health(instance, credential);
      await this.registry.save(instance, credential);
    } catch (error) { await this.cleanupFailedInstall(plan); throw error; }
    return {
      credentialEnvelope,
      result: { localInstanceId: instance.id, engine: instance.engine, port: instance.port, serviceName: instance.serviceName } satisfies InstallResult,
    };
  }

  async initialize(instance: ManagedInstance, plan: InstancePlatformPlan, identity: Identity, postgresqlAdmin = "postgres") {
    if (instance.engine === "postgresql") {
      await this.runner.run(plan.initExecutable, ["--pgdata", plan.dataDirectory, `--username=${postgresqlAdmin}`, "--auth-local=peer", "--auth-host=scram-sha-256", "--no-instructions"], { uid: identity.uid, gid: identity.gid, timeoutMs: 120_000 });
      return;
    }
    const args = plan.toolFamily === "mariadb"
      ? ["--datadir", plan.dataDirectory, "--user=mysql", "--auth-root-authentication-method=normal", "--skip-test-db"]
      : ["--initialize-insecure", "--user=mysql", `--datadir=${plan.dataDirectory}`];
    await this.runner.run(plan.initExecutable, args, { timeoutMs: 120_000 });
  }

  async writeConfiguration(instance: ManagedInstance, plan: InstancePlatformPlan, identity: Identity) {
    const certificate = join(plan.configDirectory, "server.crt"), key = join(plan.configDirectory, "server.key");
    await this.runner.run("openssl", ["req", "-x509", "-newkey", "rsa:3072", "-nodes", "-keyout", key, "-out", certificate, "-subj", `/CN=stackpilot-${instance.id}`, "-days", "3650"], { timeoutMs: 30_000 });
    await Promise.all([chown(certificate, identity.uid, identity.gid), chown(key, identity.uid, identity.gid), chmod(certificate, 0o644), chmod(key, 0o600)]);
    if (instance.engine === "postgresql") {
      const hba = join(plan.configDirectory, "pg_hba.conf");
      await this.secureWrite(hba, "local all all peer\nhostssl all all 0.0.0.0/0 scram-sha-256\nhostssl all all ::/0 scram-sha-256\n", 0o640, identity);
      const config = [
        `data_directory = '${plan.dataDirectory}'`, `hba_file = '${hba}'`, `port = ${instance.port}`,
        "listen_addresses = '*'", `unix_socket_directories = '${plan.runtimeDirectory}'`, "password_encryption = 'scram-sha-256'",
        "ssl = on", `ssl_cert_file = '${certificate}'`, `ssl_key_file = '${key}'`,
        "logging_collector = on", "log_min_duration_statement = 1000", "log_statement = 'none'", "log_connections = off",
      ].join("\n");
      await this.secureWrite(join(plan.configDirectory, "postgresql.conf"), `${config}\n`, 0o640, identity);
      return;
    }
    const config = [
      "[mysqld]", "user=mysql", `datadir=${plan.dataDirectory}`, `port=${instance.port}`, "bind-address=*",
      `socket=${join(plan.runtimeDirectory, "mysql.sock")}`, `pid-file=${join(plan.runtimeDirectory, "mysql.pid")}`,
      "skip-name-resolve=ON", "require_secure_transport=ON", `ssl-cert=${certificate}`, `ssl-key=${key}`,
      "performance_schema=ON", "slow_query_log=ON", "long_query_time=1", "log_output=FILE",
    ].join("\n");
    await this.secureWrite(join(plan.configDirectory, "my.cnf"), `${config}\n`, 0o640, identity);
  }

  async writeService(plan: InstancePlatformPlan, identity: Identity) {
    const executable = plan.serverExecutable;
    const args = plan.toolFamily === "postgresql" ? `-D ${plan.dataDirectory} -c config_file=${join(plan.configDirectory, "postgresql.conf")}` : `--defaults-file=${join(plan.configDirectory, "my.cnf")}`;
    const runtimeRelative = `stackpilot-databases/${plan.serviceName.replace(/^stackpilot-(?:postgresql|mysql|mariadb)-/, "")}`;
    const content = plan.serviceManager === "systemd"
      ? `[Unit]\nDescription=StackPilot managed database ${plan.serviceName}\nAfter=network.target\n\n[Service]\nType=simple\nUser=${identity.user}\nGroup=${identity.user}\nRuntimeDirectory=${runtimeRelative}\nRuntimeDirectoryMode=0700\nExecStart=${executable} ${args}\nRestart=on-failure\nRestartSec=5s\nLimitNOFILE=65536\nPrivateTmp=true\nNoNewPrivileges=true\n\n[Install]\nWantedBy=multi-user.target\n`
      : `#!/sbin/openrc-run\nname="StackPilot managed database ${plan.serviceName}"\ncommand="${executable}"\ncommand_args="${args}"\ncommand_user="${identity.user}:${identity.user}"\npidfile="${join(plan.runtimeDirectory, "service.pid")}"\nsupervisor="supervise-daemon"\nstart_pre() { checkpath --directory --mode 0700 --owner ${identity.user}:${identity.user} ${plan.runtimeDirectory}; }\ndepend() { need net; }\n`;
    await writeFile(plan.serviceFile, content, { flag: "wx", mode: plan.serviceManager === "systemd" ? 0o644 : 0o755 });
  }

  async start(plan: InstancePlatformPlan) {
    if (plan.serviceManager === "systemd") {
      await this.runner.run("systemctl", ["daemon-reload"]); await this.runner.run("systemctl", ["enable", plan.serviceName]); await this.runner.run("systemctl", ["start", plan.serviceName]);
    } else { await this.runner.run("rc-update", ["add", plan.serviceName, "default"]); await this.runner.run("rc-service", [plan.serviceName, "start"]); }
  }

  async stop(plan: InstancePlatformPlan) {
    if (plan.serviceManager === "systemd") await this.runner.run("systemctl", ["stop", plan.serviceName]);
    else await this.runner.run("rc-service", [plan.serviceName, "stop"]);
  }

  async waitReady(instance: ManagedInstance, plan: InstancePlatformPlan) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        if (instance.engine === "postgresql") await this.runner.run("pg_isready", ["--host", plan.runtimeDirectory, "--port", String(instance.port), "--dbname", "postgres"], { timeoutMs: 3_000 });
        else await this.runner.run(plan.toolFamily === "mariadb" ? "mariadb-admin" : "mysqladmin", ["--protocol=SOCKET", `--socket=${join(plan.runtimeDirectory, "mysql.sock")}`, "ping"], { timeoutMs: 3_000 });
        return;
      } catch (error) { lastError = error; await new Promise((resolve) => setTimeout(resolve, 250)); }
    }
    throw new HelperError("DATABASE_START_TIMEOUT", `数据库实例启动超时${lastError ? "" : ""}`);
  }

  async health(instance: ManagedInstance, credential: InstanceCredential) {
    await this.queries.execute(instance, credential, "SELECT 1", 5_000);
  }

  async identity(engine: DatabaseEngine): Promise<Identity> {
    const user = engine === "postgresql" ? "postgres" : "mysql";
    const passwd = await readFile(join(this.systemRoot, "etc/passwd"), "utf8");
    const row = passwd.split(/\r?\n/).find((line) => line.startsWith(`${user}:`)); const fields = row?.split(":");
    const uid = Number(fields?.[2]), gid = Number(fields?.[3]);
    if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(gid) || uid <= 0 || gid <= 0) throw new HelperError("DATABASE_USER_MISSING", `系统数据库用户 ${user} 不存在`);
    return { uid, gid, user };
  }

  platform(instance: ManagedInstance) {
    if (!instance.operatingSystem) throw new HelperError("MANAGED_METADATA_MISSING", "受管实例缺少操作系统元数据");
    return instancePlatformPlan(instance.operatingSystem, instance.engine, instance.id, this.systemRoot);
  }

  private async bootstrap(instance: ManagedInstance, credential: InstanceCredential, identity: Identity) {
    const initialUsername = credential.initialUsername!, initialPassword = credential.initialPassword!;
    if (instance.engine === "postgresql") {
      const sql = `CREATE ROLE ${pgIdentifier(credential.username)} LOGIN SUPERUSER PASSWORD ${literal(credential.password)};\nCREATE ROLE ${pgIdentifier(initialUsername)} LOGIN PASSWORD ${literal(initialPassword)};\nCREATE DATABASE ${pgIdentifier(instance.initialDatabase)} OWNER ${pgIdentifier(initialUsername)};\n`;
      await this.runner.run("psql", ["--no-psqlrc", "--set", "ON_ERROR_STOP=on", "--host", instance.runtimeDirectory!, "--username", "postgres", "--dbname", "postgres", "--file", "-"], { input: sql, uid: identity.uid, gid: identity.gid, timeoutMs: 30_000 });
      return;
    }
    const sql = `ALTER USER 'root'@'localhost' IDENTIFIED BY ${literal(credential.password)};\nCREATE USER ${literal(credential.username)}@'%' IDENTIFIED BY ${literal(credential.password)} REQUIRE SSL;\nGRANT ALL PRIVILEGES ON *.* TO ${literal(credential.username)}@'%' WITH GRANT OPTION;\nCREATE DATABASE ${mysqlIdentifier(instance.initialDatabase)};\nCREATE USER ${literal(initialUsername)}@'%' IDENTIFIED BY ${literal(initialPassword)} REQUIRE SSL;\nGRANT ALL PRIVILEGES ON ${mysqlIdentifier(instance.initialDatabase)}.* TO ${literal(initialUsername)}@'%';\nFLUSH PRIVILEGES;\n`;
    const command = instance.toolFamily === "mariadb" ? "mariadb" : "mysql";
    await this.runner.run(command, ["--protocol=SOCKET", `--socket=${join(instance.runtimeDirectory!, "mysql.sock")}`, "--user=root"], { input: sql, timeoutMs: 30_000 });
  }

  private async operatingSystem() { return this.options.os ?? await (this.options.readOs ?? readSupportedOs)(); }
  private async installPackages(os: SupportedOs, engine: DatabaseEngine) {
    const plan = packagePlan(os, engine); if (plan.updateArgs) await this.runner.run(plan.manager, plan.updateArgs, { timeoutMs: 10 * 60_000 });
    await this.runner.run(plan.manager, plan.installArgs, { timeoutMs: 10 * 60_000 });
  }
  private async version(plan: InstancePlatformPlan) {
    const output = await this.runner.run(plan.serverExecutable, ["--version"]), value = `${output.stdout} ${output.stderr}`;
    return value.match(/\b(\d+(?:\.\d+){0,2})\b/)?.[1] ?? null;
  }
  private async assertAvailable(plan: InstancePlatformPlan, port: number, id: string) {
    const instances = await this.registry.list();
    if (instances.some((item) => item.id === id || item.serviceName === plan.serviceName || item.port === port)) throw new HelperError("INSTANCE_CONFLICT", "实例 ID、服务名或端口已注册，未执行实例修改");
    await selectAvailablePort(this.runner, plan.toolFamily, port);
    for (const path of [plan.dataDirectory, plan.configDirectory, plan.runtimeDirectory, plan.serviceFile]) {
      try { await lstat(path); throw new HelperError("INSTANCE_PATH_CONFLICT", "实例目录或服务名已存在，未执行实例修改"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  }
  private async prepareDirectories(plan: InstancePlatformPlan, identity: Identity) {
    for (const path of [plan.dataDirectory, plan.configDirectory, plan.runtimeDirectory]) { await mkdir(path, { recursive: true, mode: 0o700 }); await chmod(path, 0o700); await chown(path, identity.uid, identity.gid); }
    await mkdir(dirname(plan.serviceFile), { recursive: true, mode: 0o755 });
  }
  private async secureWrite(path: string, contents: string, mode: number, identity: Identity) {
    await writeFile(path, contents, { flag: "wx", mode }); await chmod(path, mode); await chown(path, identity.uid, identity.gid);
  }
  private async cleanupFailedInstall(plan: InstancePlatformPlan) {
    try { await this.stop(plan); } catch { /* Service may not have been created or started. */ }
    if (plan.serviceManager === "systemd") {
      try { await this.runner.run("systemctl", ["disable", plan.serviceName]); } catch { /* Unit may not be enabled. */ }
    } else { try { await this.runner.run("rc-update", ["del", plan.serviceName, "default"]); } catch { /* Service may not be registered. */ } }
    await Promise.all([rm(plan.dataDirectory, { recursive: true, force: true }), rm(plan.configDirectory, { recursive: true, force: true }), rm(plan.runtimeDirectory, { recursive: true, force: true }), rm(plan.serviceFile, { force: true })]);
    if (plan.serviceManager === "systemd") { try { await this.runner.run("systemctl", ["daemon-reload"]); } catch { /* Cleanup is best effort. */ } }
  }
}
