import { runFixedCommand } from "../../platform/commandRunner.js";
import { FileScheduleExecutionRepository, scheduleCommandDigest, scheduleExecution } from "./scheduleExecutionRepository.js";
import { fileURLToPath } from "node:url";

async function main() {
  const [stateDir, workDir, jobId, commandDigest, encodedCommand] = process.argv.slice(2);
  if (!stateDir || !workDir || !jobId || !commandDigest || !encodedCommand) throw new Error("缺少定时任务执行参数");
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(jobId)) throw new Error("定时任务 ID 非法");
  if (!/^[a-f0-9]{64}$/.test(commandDigest)) throw new Error("定时任务版本非法");
  const command = Buffer.from(encodedCommand, "base64url").toString("utf8");
  if (!command || command.length > 400 || /[\r\n]/.test(command)) throw new Error("定时任务命令非法");
  if (scheduleCommandDigest(command) !== commandDigest) throw new Error("定时任务版本不匹配");
  const startedAt = new Date().toISOString();
  const result = await runFixedCommand("/bin/sh", ["-lc", command], { cwd: workDir, timeoutMs: 120_000, killProcessGroup: true });
  const repository = new FileScheduleExecutionRepository(stateDir, fileURLToPath(import.meta.url));
  await repository.write(jobId, scheduleExecution("cron", commandDigest, startedAt, result));
  process.exitCode = result.ok ? 0 : result.exitCode ?? 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "定时任务执行器失败");
  process.exitCode = 1;
});
