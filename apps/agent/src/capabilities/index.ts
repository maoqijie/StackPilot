import type { AgentCapability } from "@stackpilot/contracts";

export const LEGACY_AGENT_CAPABILITIES: readonly AgentCapability[] = ["system.summary.read", "service.status.read"];
export const BASE_AGENT_CAPABILITIES: readonly AgentCapability[] = [...LEGACY_AGENT_CAPABILITIES, "sites.inventory.read"];
export const AGENT_CAPABILITIES: readonly AgentCapability[] = [...BASE_AGENT_CAPABILITIES, "databases.inventory.read"];
const CERTIFICATE_HELPER_CAPABILITIES: readonly AgentCapability[] = ["sites.certificates.renew"];
const DATABASE_HELPER_CAPABILITIES: readonly AgentCapability[] = [
  "database.inventory.read", "database.sql.read", "database.backup", "database.operate", "database.install", "database.restore",
];

export function activeAgentCapabilities(
  platform: "linux" | "darwin" | "win32",
  certificateHelperReady: boolean,
  databaseInventorySupported = false,
  databaseHelperReady = false,
): AgentCapability[] {
  const capabilities = databaseInventorySupported ? [...AGENT_CAPABILITIES] : [...BASE_AGENT_CAPABILITIES];
  if (platform === "linux" && certificateHelperReady) capabilities.push(...CERTIFICATE_HELPER_CAPABILITIES);
  if (platform === "linux" && databaseInventorySupported && databaseHelperReady) capabilities.push(...DATABASE_HELPER_CAPABILITIES);
  return capabilities;
}
