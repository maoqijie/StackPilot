import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { AgentDatabaseBackupPlanSchema, AgentDatabaseScheduledBackupReportSchema, parseDatabaseBackupCron } from "@stackpilot/contracts";
import { HelperError } from "../domain.js";
import type { DatabaseRegistry } from "../state/registry.js";
import type { DatabaseBackupService, BackupManifest } from "./backup.js";
import { acquireProcessLock } from "./instanceLock.js";

export const BackupScheduleSchema = AgentDatabaseBackupPlanSchema;
const SchedulesSchema = z.object({ version: z.literal(1), plans: z.array(BackupScheduleSchema).max(1_000) }).strict();
const BackupResultSchema = AgentDatabaseScheduledBackupReportSchema;
const ResultsSchema = z.object({ version: z.literal(1), results: z.array(BackupResultSchema).max(2_000) }).strict();
const ReceiptSchema = z.object({ planId: z.string().uuid(), planVersion: z.number().int().positive(), scheduledFor: z.string().datetime() }).strict();
const ReceiptsSchema = z.object({ version: z.literal(1), receipts: z.array(ReceiptSchema).max(4_000) }).strict();
export type BackupSchedule = z.infer<typeof BackupScheduleSchema>;
export type LocalBackupResult = z.infer<typeof BackupResultSchema>;

const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]] as const;
function atomMatches(atom: string, value: number, minimum: number, maximum: number) {
  const [base, stepText] = atom.split("/"), step = stepText === undefined ? 1 : Number(stepText);
  if (!Number.isInteger(step) || step < 1 || step > maximum - minimum + 1 || !base) return false;
  const interval = base === "*" ? [minimum, maximum] : base.includes("-") ? base.split("-").map(Number) : [Number(base), Number(base)];
  const [start, end] = interval; return interval.length === 2 && Number.isInteger(start) && Number.isInteger(end) && start! >= minimum && end! <= maximum && start! <= end! && value >= start! && value <= end! && (value - start!) % step === 0;
}
function fieldMatches(field: string, value: number, index: number) {
  const [minimum, maximum] = ranges[index]!; const normalized = index === 4 && value === 0 ? [0, 7] : [value];
  return field.split(",").every(Boolean) && normalized.some((candidate) => field.split(",").some((atom) => atomMatches(atom, candidate, minimum, maximum)));
}
export function parseCron(expression: string) {
  try { return parseDatabaseBackupCron(expression); } catch { throw new HelperError("INVALID_BACKUP_CRON", "备份计划必须是有效的五字段 cron 表达式"); }
}
export function cronMatches(expression: string, date: Date) {
  const fields = parseCron(expression), values = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];
  const basic = [0, 1, 3].every((index) => fieldMatches(fields[index]!, values[index]!, index));
  const dayOfMonth = fieldMatches(fields[2]!, values[2]!, 2), dayOfWeek = fieldMatches(fields[4]!, values[4]!, 4);
  const day = fields[2] === "*" || fields[4] === "*" ? dayOfMonth && dayOfWeek : dayOfMonth || dayOfWeek;
  return basic && day;
}

export class BackupScheduleStore {
  private readonly plansPath: string; private readonly resultsPath: string; private readonly receiptsPath: string;
  constructor(readonly stateDir: string) { this.plansPath = join(stateDir, "backup-schedules.json"); this.resultsPath = join(stateDir, "backup-schedule-results.json"); this.receiptsPath = join(stateDir, "backup-schedule-receipts.json"); }
  async list(): Promise<BackupSchedule[]> { return (await this.read(this.plansPath, SchedulesSchema, { version: 1, plans: [] })).plans; }
  async sync(raw: unknown) {
    const plan = BackupScheduleSchema.parse(raw); parseCron(plan.cron); const plans = await this.list(), current = plans.find((item) => item.id === plan.id);
    if (current && plan.version <= current.version) throw new HelperError("BACKUP_PLAN_VERSION_CONFLICT", "备份计划版本必须递增");
    const next = [...plans.filter((item) => item.id !== plan.id), plan]; await this.atomic(this.plansPath, JSON.stringify({ version: 1, plans: next }, null, 2)); return plan;
  }
  async replace(raw: unknown) {
    const plans = z.array(BackupScheduleSchema).max(1_000).parse(raw); plans.forEach((plan) => parseCron(plan.cron));
    if (new Set(plans.map((plan) => plan.id)).size !== plans.length) throw new HelperError("DUPLICATE_BACKUP_PLAN", "备份计划 ID 不能重复");
    const current = new Map((await this.list()).map((plan) => [plan.id, plan]));
    for (const plan of plans) if ((current.get(plan.id)?.version ?? 0) > plan.version) throw new HelperError("BACKUP_PLAN_VERSION_CONFLICT", "备份计划版本不能回退");
    await this.atomic(this.plansPath, JSON.stringify({ version: 1, plans }, null, 2)); return plans;
  }
  async remove(id: string) { const parsed = z.string().uuid().parse(id); await this.atomic(this.plansPath, JSON.stringify({ version: 1, plans: (await this.list()).filter((item) => item.id !== parsed) }, null, 2)); }
  async results(): Promise<LocalBackupResult[]> { return (await this.read(this.resultsPath, ResultsSchema, { version: 1, results: [] })).results; }
  async receipts() { return (await this.read(this.receiptsPath, ReceiptsSchema, { version: 1, receipts: [] })).receipts; }
  async append(raw: unknown) { const result = BackupResultSchema.parse(raw), values = [...(await this.results()).filter((item) => item.reportId !== result.reportId), result].slice(-2_000); await this.atomic(this.resultsPath, JSON.stringify({ version: 1, results: values }, null, 2)); const receipts = [...await this.receipts(), { planId: result.planId, planVersion: result.planVersion, scheduledFor: result.scheduledFor }].slice(-4_000); await this.atomic(this.receiptsPath, JSON.stringify({ version: 1, receipts }, null, 2)); }
  async acknowledge(raw: unknown) { const ids = new Set(z.array(z.string().uuid()).min(1).max(100).parse(raw)), current = await this.results(); const acknowledgedReportIds = current.filter((item) => ids.has(item.reportId)).map((item) => item.reportId); await this.atomic(this.resultsPath, JSON.stringify({ version: 1, results: current.filter((item) => !ids.has(item.reportId)) }, null, 2)); return acknowledgedReportIds; }
  private async read<T>(path: string, schema: z.ZodType<T>, fallback: T) { try { return schema.parse(JSON.parse(await readFile(path, "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; } }
  private async atomic(path: string, contents: string) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await chmod(dirname(path), 0o700); const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, contents, { mode: 0o600 }); await rename(temporary, path); await chmod(path, 0o600); }
}

export class ScheduledBackupExecutor {
  constructor(private readonly store: BackupScheduleStore, private readonly registry: DatabaseRegistry, private readonly backups: DatabaseBackupService) {}
  async runDue(now = new Date()) {
    let release; try { release = await acquireProcessLock(this.store.stateDir, ".backup-scheduler.lock"); } catch (error) { if (error instanceof HelperError && error.code === "DATABASE_OPERATION_IN_PROGRESS") return []; throw error; }
    try {
      const scheduledFor = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString(), receipts = await this.store.receipts(), output: LocalBackupResult[] = [];
      for (const plan of await this.store.list()) {
        if (!plan.enabled || !cronMatches(plan.cron, now) || receipts.some((item) => item.planId === plan.id && item.planVersion === plan.version && item.scheduledFor === scheduledFor)) continue;
        let result: LocalBackupResult;
        try {
          const instance = await this.registry.get(plan.instanceLocalId), credential = await this.registry.credential(plan.instanceLocalId);
          const manifest: BackupManifest = await this.backups.create(instance, credential, plan.retentionCount), completedAt = new Date().toISOString();
          const sizeBytes = manifest.files.reduce((sum, file) => sum + file.sizeBytes, 0);
          const checksum = (await import("node:crypto")).createHash("sha256").update(JSON.stringify(manifest, null, 2)).digest("hex");
          result = { reportId: randomUUID(), planId: plan.id, planVersion: plan.version, instanceLocalId: plan.instanceLocalId, scheduledFor, status: "succeeded", result: { kind: "backup", restorePointId: manifest.id, createdAt: manifest.createdAt, sizeBytes, checksum, databaseVersion: manifest.databaseVersion ?? "unknown", manifestVersion: manifest.version }, errorCode: null, completedAt };
        } catch (error) { result = { reportId: randomUUID(), planId: plan.id, planVersion: plan.version, instanceLocalId: plan.instanceLocalId, scheduledFor, status: "failed", result: null, errorCode: error instanceof HelperError ? error.code : "SCHEDULED_BACKUP_FAILED", completedAt: new Date().toISOString() }; }
        await this.store.append(result); output.push(result);
      }
      return output;
    } finally { await release(); }
  }
}
