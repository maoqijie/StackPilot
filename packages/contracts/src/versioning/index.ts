import { z } from "zod";

export const AGENT_PROTOCOL_VERSION = "1.1" as const;
export const SUPPORTED_AGENT_PROTOCOL_VERSIONS = ["1.0", AGENT_PROTOCOL_VERSION] as const;
export const ProtocolVersionSchema = z.enum(SUPPORTED_AGENT_PROTOCOL_VERSIONS);

export function isAgentProtocolCompatible(version: string): boolean {
  return ProtocolVersionSchema.safeParse(version).success;
}
