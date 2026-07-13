import { z } from "zod";

export const AGENT_PROTOCOL_VERSION = "1.1" as const;
export const SUPPORTED_AGENT_PROTOCOL_MAJOR = 1;
export const ProtocolVersionSchema = z.string().regex(/^\d+\.\d+$/);

export function isAgentProtocolCompatible(version: string): boolean {
  const parsed = ProtocolVersionSchema.safeParse(version);
  return parsed.success && Number(version.split(".")[0]) === SUPPORTED_AGENT_PROTOCOL_MAJOR;
}
