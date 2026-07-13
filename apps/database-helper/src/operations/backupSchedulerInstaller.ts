import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { SupportedOs } from "../platform/osSupport.js";
import type { HelperRunner } from "../platform/runner.js";

export class BackupSchedulerInstaller {
  constructor(private readonly runner: HelperRunner, private readonly systemRoot = "/", private readonly executableRoot = "/opt/stackpilot-database-helper/current") {}
  async install(os: SupportedOs) {
    const root = this.systemRoot === "/" ? "" : this.systemRoot.replace(/\/$/, ""), entry = `${this.executableRoot}/apps/database-helper/dist/scheduledBackup.js`;
    if (os === "alpine3.22") {
      const path = join(root || "/", "etc/crontabs/root"); await mkdir(join(root || "/", "etc/crontabs"), { recursive: true, mode: 0o755 });
      let current = ""; try { current = await readFile(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const marker = "# stackpilot-database-backups"; const lines = current.split(/\r?\n/).filter((line) => line && !line.endsWith(marker));
      const temporary = `${path}.${process.pid}.tmp`; await writeFile(temporary, `${lines.join("\n")}${lines.length ? "\n" : ""}* * * * * /usr/bin/node ${entry} ${marker}\n`, { mode: 0o600 }); await rename(temporary, path); await chmod(path, 0o600);
      await this.runner.run("rc-update", ["add", "crond", "default"]); await this.runner.run("rc-service", ["crond", "start"]); return { scheduler: "cron" as const, path };
    }
    const unitRoot = join(root || "/", "etc/systemd/system"); await mkdir(unitRoot, { recursive: true, mode: 0o755 });
    const service = join(unitRoot, "stackpilot-database-backups.service"), timer = join(unitRoot, "stackpilot-database-backups.timer");
    await writeFile(service, `[Unit]\nDescription=StackPilot scheduled database backups\n\n[Service]\nType=oneshot\nUser=root\nGroup=root\nUMask=0077\nExecStart=/usr/bin/node ${entry}\n`, { mode: 0o644 });
    await writeFile(timer, "[Unit]\nDescription=Run StackPilot database backup scheduler\n\n[Timer]\nOnCalendar=*-*-* *:*:00\nPersistent=true\nAccuracySec=1s\n\n[Install]\nWantedBy=timers.target\n", { mode: 0o644 });
    await this.runner.run("systemctl", ["daemon-reload"]); await this.runner.run("systemctl", ["enable", "--now", "stackpilot-database-backups.timer"]);
    return { scheduler: "systemd" as const, path: timer };
  }
}
