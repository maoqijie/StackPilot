import { z } from "zod";

const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]] as const;

function validAtom(atom: string, minimum: number, maximum: number) {
  const [base, stepText] = atom.split("/");
  if (!base || atom.split("/").length > 2 || (stepText !== undefined && (!/^\d+$/.test(stepText) || Number(stepText) < 1 || Number(stepText) > maximum - minimum + 1))) return false;
  if (base === "*") return true;
  if (/^\d+$/.test(base)) { const value = Number(base); return value >= minimum && value <= maximum; }
  const match = base.match(/^(\d+)-(\d+)$/); if (!match) return false;
  const start = Number(match[1]), end = Number(match[2]); return start >= minimum && end <= maximum && start <= end;
}

export function parseDatabaseBackupCron(expression: string) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5 || fields.some((field, index) => { const [minimum, maximum] = ranges[index]!; return !field.split(",").every((atom) => validAtom(atom, minimum, maximum)); })) throw new Error("invalid five-field database backup cron expression");
  return fields;
}

export const DatabaseBackupCronSchema = z.string().trim().min(9).max(120).refine((value) => {
  try { parseDatabaseBackupCron(value); return true; } catch { return false; }
}, "invalid five-field database backup cron expression");
