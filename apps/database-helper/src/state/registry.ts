import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { InstanceCredentialSchema, RegistrySchema, type InstanceCredential, type ManagedInstance, HelperError } from "../domain.js";

export class DatabaseRegistry {
  private readonly registryPath: string;
  private readonly credentialDirectory: string;
  constructor(readonly stateDir: string) {
    this.registryPath = join(stateDir, "instances.json"); this.credentialDirectory = join(stateDir, "credentials");
  }
  private async prepare() {
    await mkdir(this.stateDir, { recursive: true, mode: 0o700 }); await chmod(this.stateDir, 0o700);
    await mkdir(this.credentialDirectory, { recursive: true, mode: 0o700 }); await chmod(this.credentialDirectory, 0o700);
  }
  async list(): Promise<ManagedInstance[]> {
    try { return RegistrySchema.parse(JSON.parse(await readFile(this.registryPath, "utf8"))).instances; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  }
  async get(id: string) {
    const instance = (await this.list()).find((item) => item.id === id);
    if (!instance) throw new HelperError("INSTANCE_NOT_FOUND", "数据库实例未在节点本机注册");
    return instance;
  }
  async save(instance: ManagedInstance, credential: InstanceCredential) {
    if (credential.instanceId !== instance.id) throw new HelperError("CREDENTIAL_MISMATCH", "凭据与实例不匹配");
    await this.prepare(); const instances = await this.list();
    if (instances.some((item) => item.id === instance.id || item.serviceName === instance.serviceName || item.port === instance.port)) throw new HelperError("INSTANCE_CONFLICT", "实例 ID、服务名或端口已注册");
    const credentialPath = join(this.credentialDirectory, `${instance.id}.json`);
    await this.atomicWrite(credentialPath, JSON.stringify(InstanceCredentialSchema.parse(credential)), 0o600);
    try { await this.atomicWrite(this.registryPath, JSON.stringify({ version: 1, instances: [...instances, instance] }, null, 2), 0o600); }
    catch (error) { await rm(credentialPath, { force: true }); throw error; }
  }
  async credential(id: string) {
    try { return InstanceCredentialSchema.parse(JSON.parse(await readFile(join(this.credentialDirectory, `${id}.json`), "utf8"))); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new HelperError("CREDENTIAL_NOT_FOUND", "实例凭据未在节点本机配置"); throw error; }
  }
  async assertSecure() {
    await this.prepare();
    for (const name of await readdir(this.credentialDirectory)) if (!/^[A-Za-z0-9_-]+\.json$/.test(name)) throw new HelperError("UNSAFE_STATE", "凭据目录包含未知文件");
  }
  private async atomicWrite(path: string, contents: string, mode: number) {
    const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, contents, { mode }); await rename(temporary, path); await chmod(path, mode);
  }
}
