import type { ManagedInstance, InstanceCredential } from "../domain.js";
import type { HelperRunner } from "../platform/runner.js";

export type QueryClient = {
  query<T>(instance: ManagedInstance, credential: InstanceCredential, sql: string, timeoutMs?: number): Promise<T>;
  execute(instance: ManagedInstance, credential: InstanceCredential, sql: string, timeoutMs?: number): Promise<string>;
};

export class LocalDatabaseQueryClient implements QueryClient {
  constructor(private readonly runner: HelperRunner) {}
  async query<T>(instance: ManagedInstance, credential: InstanceCredential, sql: string, timeoutMs = 10_000): Promise<T> {
    return JSON.parse((await this.execute(instance, credential, sql, timeoutMs)).trim()) as T;
  }
  async execute(instance: ManagedInstance, credential: InstanceCredential, sql: string, timeoutMs = 10_000): Promise<string> {
    const command = instance.engine === "postgresql" ? "psql" : instance.engine === "mariadb" ? "mariadb" : "mysql";
    const args = instance.engine === "postgresql"
      ? ["--no-psqlrc", "--tuples-only", "--no-align", "--quiet", "--host", instance.host, "--port", String(instance.port), "--username", credential.username, "--dbname", instance.initialDatabase, "--file", "-"]
      : ["--batch", "--raw", "--skip-column-names", "--protocol=TCP", "--host", instance.host, "--port", String(instance.port), "--user", credential.username, instance.initialDatabase];
    const credentialEnvironment = instance.engine === "postgresql" ? { PGPASSWORD: credential.password } : { MYSQL_PWD: credential.password };
    return (await this.runner.run(command, args, { timeoutMs, credentialEnvironment, input: `${sql}\n` })).stdout;
  }
}
