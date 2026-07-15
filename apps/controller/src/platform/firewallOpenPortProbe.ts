import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export type SocketProbe = () => Promise<string>;

export async function probeListeningSockets() {
  const result = await execFileAsync("/usr/bin/ss", ["-H", "-lntu"], { timeout: 8_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  return result.stdout;
}
