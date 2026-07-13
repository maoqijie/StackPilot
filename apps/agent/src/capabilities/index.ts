import type { AgentCapability } from "@stackpilot/contracts";

export const LEGACY_AGENT_CAPABILITIES: readonly AgentCapability[] = ["system.summary.read", "service.status.read"];
export const BASE_AGENT_CAPABILITIES: readonly AgentCapability[] = [...LEGACY_AGENT_CAPABILITIES, "sites.inventory.read"];
export const AGENT_CAPABILITIES: readonly AgentCapability[] = [...BASE_AGENT_CAPABILITIES, "databases.inventory.read"];
const HELPER_CAPABILITIES: readonly AgentCapability[] = ["sites.certificates.renew"];
const LINUX_CAPABILITIES: readonly AgentCapability[] = ["terminal.command.execute"];

export function activeAgentCapabilities(
  platform: "linux" | "darwin" | "win32",
  certificateHelperReady: boolean,
  databaseInventorySupported = false,
  terminalCommandsReady = false,
): AgentCapability[] {
  const capabilities = databaseInventorySupported ? [...AGENT_CAPABILITIES] : [...BASE_AGENT_CAPABILITIES];
  if (platform === "linux" && terminalCommandsReady) capabilities.push(...LINUX_CAPABILITIES);
  if (platform === "linux" && certificateHelperReady) capabilities.push(...HELPER_CAPABILITIES);
  return capabilities;
}
