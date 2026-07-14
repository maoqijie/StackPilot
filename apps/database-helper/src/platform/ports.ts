import { HelperError } from "../domain.js";
import type { HelperRunner } from "./runner.js";
import type { DatabaseEngine } from "@stackpilot/contracts";

export const portRange = (engine: DatabaseEngine) => engine === "postgresql" ? [5432, 5499] as const : [3306, 3399] as const;
export function parseListeningPorts(output: string) {
  const ports = new Set<number>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/(?:\]|:)(\d+)\s/); const port = Number(match?.[1]);
    if (Number.isInteger(port) && port > 0 && port <= 65_535) ports.add(port);
  }
  return ports;
}
export async function listeningPorts(runner: HelperRunner) { return parseListeningPorts((await runner.run("ss", ["-H", "-ltn"])).stdout); }
export async function selectAvailablePort(runner: HelperRunner, engine: DatabaseEngine, requested: number | null) {
  const [minimum, maximum] = portRange(engine); const used = await listeningPorts(runner);
  if (requested !== null) {
    if (requested < minimum || requested > maximum) throw new HelperError("PORT_OUT_OF_RANGE", `端口必须位于 ${minimum}-${maximum}`);
    if (used.has(requested)) throw new HelperError("PORT_CONFLICT", "端口已被占用，未执行任何修改");
    return requested;
  }
  for (let port = minimum; port <= maximum; port += 1) if (!used.has(port)) return port;
  throw new HelperError("PORTS_EXHAUSTED", "数据库端口范围没有空闲端口");
}
