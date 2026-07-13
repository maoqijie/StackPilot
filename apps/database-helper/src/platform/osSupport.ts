import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { DatabaseEngine } from "@stackpilot/contracts";
import { HelperError } from "../domain.js";
import { join } from "node:path";

export const SupportedOsSchema = z.enum(["debian12", "ubuntu24.04", "rocky9", "alma9", "fedora42", "alpine3.22", "arch"]);
export type SupportedOs = z.infer<typeof SupportedOsSchema>;
export type PackagePlan = { manager: "apt-get" | "dnf" | "apk" | "pacman"; updateArgs: readonly string[] | null; installArgs: readonly string[] };
export type ServiceManager = "systemd" | "openrc";
export type InstancePlatformPlan = {
  os: SupportedOs; serviceManager: ServiceManager; serviceName: string; serviceFile: string;
  dataDirectory: string; configDirectory: string; runtimeDirectory: string; ownerRoot: string;
  initExecutable: string; serverExecutable: string; toolFamily: DatabaseEngine;
};

const packageNames: Record<SupportedOs, Record<DatabaseEngine, readonly string[]>> = {
  debian12: { postgresql: ["postgresql", "postgresql-contrib"], mysql: ["default-mysql-server"], mariadb: ["mariadb-server"] },
  "ubuntu24.04": { postgresql: ["postgresql", "postgresql-contrib"], mysql: ["mysql-server"], mariadb: ["mariadb-server"] },
  rocky9: { postgresql: ["postgresql-server", "postgresql-contrib"], mysql: ["mysql-server"], mariadb: ["mariadb-server"] },
  alma9: { postgresql: ["postgresql-server", "postgresql-contrib"], mysql: ["mysql-server"], mariadb: ["mariadb-server"] },
  fedora42: { postgresql: ["postgresql-server", "postgresql-contrib"], mysql: ["community-mysql-server"], mariadb: ["mariadb-server"] },
  "alpine3.22": { postgresql: ["postgresql", "postgresql-contrib"], mysql: ["mariadb", "mariadb-client"], mariadb: ["mariadb", "mariadb-client"] },
  arch: { postgresql: ["postgresql"], mysql: ["mariadb"], mariadb: ["mariadb"] },
};

export function packagePlan(os: SupportedOs, engine: DatabaseEngine): PackagePlan {
  const packages = packageNames[os][engine];
  if (os === "debian12" || os === "ubuntu24.04") return { manager: "apt-get", updateArgs: ["update"], installArgs: ["install", "-y", "--no-install-recommends", ...packages] };
  if (os === "rocky9" || os === "alma9" || os === "fedora42") return { manager: "dnf", updateArgs: null, installArgs: ["install", "-y", ...packages] };
  if (os === "alpine3.22") return { manager: "apk", updateArgs: null, installArgs: ["add", "--no-cache", ...packages] };
  return { manager: "pacman", updateArgs: null, installArgs: ["-S", "--noconfirm", "--needed", ...packages] };
}

export function instancePlatformPlan(os: SupportedOs, engine: DatabaseEngine, id: string, systemRoot = "/"): InstancePlatformPlan {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) throw new HelperError("INVALID_INSTANCE_ID", "数据库实例 ID 无效");
  const root = systemRoot === "/" ? "" : systemRoot.replace(/\/$/, "");
  const serviceManager: ServiceManager = os === "alpine3.22" ? "openrc" : "systemd";
  const toolFamily = (os === "alpine3.22" || os === "arch" || (os === "debian12" && engine === "mysql")) && engine === "mysql" ? "mariadb" : engine;
  const pgVersion = os === "debian12" ? "15" : "16";
  const initExecutable = engine === "postgresql"
    ? os === "debian12" || os === "ubuntu24.04" ? `/usr/lib/postgresql/${pgVersion}/bin/initdb` : "/usr/bin/initdb"
    : toolFamily === "mariadb" ? "/usr/bin/mariadb-install-db" : os === "rocky9" || os === "alma9" || os === "fedora42" ? "/usr/libexec/mysqld" : "/usr/sbin/mysqld";
  const serverExecutable = engine === "postgresql"
    ? os === "debian12" || os === "ubuntu24.04" ? `/usr/lib/postgresql/${pgVersion}/bin/postgres` : "/usr/bin/postgres"
    : toolFamily === "mariadb" ? os === "rocky9" || os === "alma9" || os === "fedora42" ? "/usr/libexec/mariadbd" : os === "arch" || os === "alpine3.22" ? "/usr/bin/mariadbd" : "/usr/sbin/mariadbd"
      : os === "rocky9" || os === "alma9" || os === "fedora42" ? "/usr/libexec/mysqld" : "/usr/sbin/mysqld";
  const serviceName = `stackpilot-${toolFamily}-${id}`;
  return {
    os, serviceManager, serviceName,
    serviceFile: serviceManager === "systemd" ? join(root || "/", "etc/systemd/system", `${serviceName}.service`) : join(root || "/", "etc/init.d", serviceName),
    dataDirectory: join(root || "/", "var/lib/stackpilot-databases", id, "data"),
    configDirectory: join(root || "/", "etc/stackpilot-databases", id),
    runtimeDirectory: join(root || "/", "run/stackpilot-databases", id),
    ownerRoot: join(root || "/", engine === "postgresql" ? "var/lib/postgresql" : "var/lib/mysql"),
    initExecutable, serverExecutable, toolFamily,
  };
}

export function detectSupportedOs(raw: string): SupportedOs {
  const values = Object.fromEntries(raw.split(/\r?\n/).map((line) => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((match) => [match![1], match![2]!.replace(/^"|"$/g, "")])) as Record<string, string>;
  const id = values.ID?.toLowerCase(); const version = values.VERSION_ID;
  const key = id === "debian" && version?.startsWith("12") ? "debian12"
    : id === "ubuntu" && version?.startsWith("24.04") ? "ubuntu24.04"
      : id === "rocky" && version?.startsWith("9") ? "rocky9"
        : id === "almalinux" && version?.startsWith("9") ? "alma9"
          : id === "fedora" && version?.startsWith("42") ? "fedora42"
            : id === "alpine" && version?.startsWith("3.22") ? "alpine3.22"
              : id === "arch" ? "arch" : null;
  if (!key) throw new HelperError("UNSUPPORTED_OS", "database-helper 不支持当前操作系统版本");
  return SupportedOsSchema.parse(key);
}

export async function readSupportedOs(path = "/etc/os-release") { return detectSupportedOs(await readFile(path, "utf8")); }
