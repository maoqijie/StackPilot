import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { HelperError } from "../domain.js";
import type { DatabaseRegistry } from "../state/registry.js";
import type { DatabaseBackupService, BackupManifest } from "./backup.js";
import { acquireProcessLock } from "./instanceLock.js";

const BackupScheduleSchema = z.object({
  id: z.string().uuid(), instanceLocalId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  cron: z.string().min(9).max(120), retentionCount: z.number().int().min(1).max(30), enabled: z.boolean(),
  version: z.number().int().positive(), updatedAt: z.string().datetime(),
}).strict();
const SchedulesSchema = z.object({ version: z.literal(1), plans: z.array(BackupScheduleSchema).max(1_000) }).strict();
const BackupResultSchema = z.object({
  planId: z.string().uuid(), instanceLocalId: z.string(), scheduledFor: z.string().datetime(),
  status: z.enum(["succeeded", "failed"]), restorePointId: z.string().uuid().nullable(),
  errorCode: z.string().min(1).max(100).nullable(), completedAt: z.string().datetime(),
}).strict();
const ResultsSchema = z.object({ version: z.literal(1), results: z.array(BackupResultSchema).max(2_000) }).strict();
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
function validAtom(atom: string, minimum: number, maximum: number) {
  const [base, stepText] = atom.split("/"); if (!base || atom.split("/").length > 2 || (stepText !== undefined && (!/^\d+$/.test(stepText) || Number(stepText) < 1 || Number(stepText) > maximum - minimum + 1))) return false;
  if (base === "*") return true;
  if (/^\d+$/.test(base)) { const value = Number(base); return value >= minimum && value <= maximum; }
  const match = base.match(/^(\d+)-(\d+)$/); if (!match) return false; const start = Number(match[1]), end = Number(match[2]); return start >= minimum && end <= maximum && start <= end;
}
export function parseCron(expression: string) {
  const fields = expression.trim().split(/\s+/); if (fields.length !== 5 || fields.some((field, index) => { const [minimum, maximum] = ranges[index]!; return !field.split(",").every((atom) => validAtom(atom, minimum, maximum)); })) throw new HelperError("INVALID_BACKUP_CRON", "备份计划必须是有效的五字段 cron 表达式");
  return fields;
}
export function cronMatches(expression: string, date: Date) {
  const fields = parseCron(expression), values = [date.getMinutes(), date.getHours(), date.getDate(), date.getMonth() + 1, date.getDay()];
  const basic = [0, 1, 3].every((index) => fieldMatches(fields[index]!, values[index]!, index));
  const dayOfMonth = fieldMatches(fields[2]!, values[2]!, 2), dayOfWeek = fieldMatches(fields[4]!, values[4]!, 4);
  const day = fields[2] === "*" || fields[4] === "*" ? dayOfMonth && dayOfWeek : dayOfMonth || dayOfWeek;
  return basic && day;
}

export class BackupScheduleStore {
  private readonly plansPath: string; private readonly resultsPath: string;
  constructor(readonly stateDir: string) { this.plansPath = join(stateDir, "backup-schedules.json"); this.resultsPath = join(stateDir, "backup-schedule-results.json"); }
  async list(): Promise<BackupSchedule[]> { return (await this.read(this.plansPath, SchedulesSchema, { version: 1, plans: [] })).plans; }
  async sync(raw: unknown) {
    const plan = BackupScheduleSchema.parse(raw); parseCron(plan.cron); const plans = await this.list(), current = plans.find((item) => item.id === plan.id);
    if (current && plan.version <= current.version) throw new HelperError("BACKUP_PLAN_VERSION_CONFLICT", "备份计划版本必须递增");
    const next = [...plans.filter((item) => item.id !== plan.id), plan]; await this.atomic(this.plansPath, JSON.stringify({ version: 1, plans: next }, null, 2)); return plan;
  }
  async remove(id: string) { const parsed = z.string().uuid().parse(id); await this.atomic(this.plansPath, JSON.stringify({ version: 1, plans: (await this.list()).filter((item) => item.id !== parsed) }, null, 2)); }
  async results(): Promise<LocalBackupResult[]> { return (await this.read(this.resultsPath, ResultsSchema, { version: 1, results: [] })).results; }
  async append(raw: unknown) { const result = BackupResultSchema.parse(raw), values = [...await this.results(), result].slice(-2_000); await this.atomic(this.resultsPath, JSON.stringify({ version: 1, results: values }, null, 2)); }
  private async read<T>(path: string, schema: z.ZodType<T>, fallback: T) { try { return schema.parse(JSON.parse(await readFile(path, "utf8"))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw error; } }
  private async atomic(path: string, contents: string) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await chmod(dirname(path), 0o700); const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, contents, { mode: 0o600 }); await rename(temporary, path); await chmod(path, 0o600); }
}

export class ScheduledBackupExecutor {
  constructor(private readonly store: BackupScheduleStore, private readonly registry: DatabaseRegistry, private readonly backups: DatabaseBackupService) {}
  async runDue(now = new Date()) {
    let release; try { release = await acquireProcessLock(this.store.stateDir, ".backup-scheduler.lock"); } catch (error) { if (error instanceof HelperError && error.code === "DATABASE_OPERATION_IN_PROGRESS") return []; throw error; }
    try {
      const scheduledFor = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString(), previous = await this.store.results(), output: LocalBackupResult[] = [];
      for (const plan of await this.store.list()) {
        if (!plan.enabled || !cronMatches(plan.cron, now) || previous.some((item) => item.planId === plan.id && item.scheduledFor === scheduledFor)) continue;
        let result: LocalBackupResult;
        try {
          const instance = await this.registry.get(plan.instanceLocalId), credential = await this.registry.credential(plan.instanceLocalId);
          const manifest: BackupManifest = await this.backups.create(instance, credential, plan.retentionCount);
          result = { planId: plan.id, instanceLocalId: plan.instanceLocalId, scheduledFor, status: "succeeded", restorePointId: manifest.id, errorCode: null, completedAt: new Date().toISOString() };
        } catch (error) { result = { planId: plan.id, instanceLocalId: plan.instanceLocalId, scheduledFor, status: "failed", restorePointId: null, errorCode: error instanceof HelperError ? error.code : "SCHEDULED_BACKUP_FAILED", completedAt: new Date().toISOString() }; }
        await this.store.append(result); output.push(result);
      }
      return output;
    } finally { await release(); }
  }
}
