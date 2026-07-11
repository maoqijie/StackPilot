export type LogLevel = "info" | "warn" | "error";
export type LogRecord = Record<string, unknown> & { level: LogLevel; time: string; message: string };
export interface Logger { log(record: LogRecord): void }

const sensitiveKeys = /authorization|cookie|token|secret|password|commandOutput|stdout|stderr/i;

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sensitiveKeys.test(key) ? "[REDACTED]" : redactValue(nested)]));
  }
  return value;
}

export function redactRecord(record: LogRecord): LogRecord {
  return redactValue(record) as LogRecord;
}

export const consoleLogger: Logger = {
  log(record) {
    process.stdout.write(`${JSON.stringify(redactRecord(record))}\n`);
  },
};

export function createMemoryLogger(): Logger & { records: LogRecord[] } {
  const records: LogRecord[] = [];
  return { records, log: (record) => records.push(redactRecord(record)) };
}
