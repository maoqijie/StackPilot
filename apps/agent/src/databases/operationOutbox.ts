import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { AgentDatabaseOperationUpdateSchema, type AgentDatabaseOperationUpdate } from "@stackpilot/contracts";

const OutboxSchema = z.array(AgentDatabaseOperationUpdateSchema).max(1_000);
export interface DatabaseOperationOutbox {
  pending(): Promise<AgentDatabaseOperationUpdate[]>;
  save(update: AgentDatabaseOperationUpdate): Promise<void>;
  markReported(operationId: string): Promise<void>;
}

export class FileDatabaseOperationOutbox implements DatabaseOperationOutbox {
  private values = new Map<string, AgentDatabaseOperationUpdate>(); private loaded = false;
  constructor(private readonly path: string) {}
  async pending() { await this.load(); return [...this.values.values()]; }
  async save(update: AgentDatabaseOperationUpdate) { await this.load(); this.values.set(update.operationId, update); await this.persist(); }
  async markReported(operationId: string) { await this.load(); if (this.values.delete(operationId)) await this.persist(); }
  private async load() {
    if (this.loaded) return;
    try { this.values = new Map(OutboxSchema.parse(JSON.parse(await readFile(this.path, "utf8"))).map((value) => [value.operationId, value])); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    this.loaded = true;
  }
  private async persist() {
    const directory = dirname(this.path); await mkdir(directory, { recursive: true, mode: 0o700 }); await chmod(directory, 0o700);
    const temporary = `${this.path}.${process.pid}.tmp`; await writeFile(temporary, JSON.stringify([...this.values.values()], null, 2), { mode: 0o600 }); await rename(temporary, this.path); await chmod(this.path, 0o600);
  }
}

export class MemoryDatabaseOperationOutbox implements DatabaseOperationOutbox {
  private readonly values = new Map<string, AgentDatabaseOperationUpdate>();
  async pending() { return [...this.values.values()]; }
  async save(update: AgentDatabaseOperationUpdate) { this.values.set(update.operationId, update); }
  async markReported(operationId: string) { this.values.delete(operationId); }
}
