export type AgentLogRecord = { level: "info" | "warn" | "error"; time: string; message: string } & Record<string, unknown>;
const sensitive = /authorization|cookie|token|secret|password|private|key|environment|stdout|stderr/i;
function redact(value: unknown): unknown { if (Array.isArray(value)) return value.map(redact); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? "[REDACTED]" : redact(item)])); return value; }
export const agentLogger = { log(record: AgentLogRecord) { process.stdout.write(`${JSON.stringify(redact(record))}\n`); } };
