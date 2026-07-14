import { resolve } from "node:path";
import { z } from "zod";

const ConfigSchema = z.object({
  STACKPILOT_DATABASE_HELPER_STATE_DIR: z.string().default("/var/lib/stackpilot-database-helper"),
  STACKPILOT_DATABASE_HELPER_SOCKET: z.string().default("/run/stackpilot/database-helper.sock"),
  STACKPILOT_DATABASE_HELPER_SOCKET_FD: z.coerce.number().int().min(3).max(64).optional(),
  STACKPILOT_DATABASE_HELPER_SOCKET_GID: z.coerce.number().int().nonnegative().optional(),
}).passthrough();

export function loadHelperConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {
  const value = ConfigSchema.parse(env);
  const activatedFd = value.STACKPILOT_DATABASE_HELPER_SOCKET_FD ?? (
    env.LISTEN_PID === String(process.pid) && env.LISTEN_FDS === "1" ? 3 : undefined
  );
  return {
    stateDir: resolve(value.STACKPILOT_DATABASE_HELPER_STATE_DIR), socketPath: resolve(value.STACKPILOT_DATABASE_HELPER_SOCKET),
    socketFd: activatedFd, socketGid: value.STACKPILOT_DATABASE_HELPER_SOCKET_GID,
  };
}
