import type { AgentCapability } from "@stackpilot/contracts";

export const LEGACY_AGENT_CAPABILITIES: readonly AgentCapability[] = ["system.summary.read", "service.status.read"];
export const BASE_AGENT_CAPABILITIES: readonly AgentCapability[] = [...LEGACY_AGENT_CAPABILITIES, "sites.inventory.read"];
const HELPER_CAPABILITIES: readonly AgentCapability[] = ["sites.logs.read", "sites.deploy", "sites.lifecycle.manage", "sites.certificates.renew", "runtime.install"];
const LINUX_CAPABILITIES: readonly AgentCapability[] = ["terminal.command.execute"];
export const AGENT_CAPABILITIES: readonly AgentCapability[] = [...BASE_AGENT_CAPABILITIES, ...HELPER_CAPABILITIES, ...LINUX_CAPABILITIES, "databases.inventory.read"];

export function activeAgentCapabilities(
  platform: "linux" | "darwin" | "win32",
  siteHelperReady: boolean,
  databaseInventorySupported = false,
  terminalCommandsReady = false,
): AgentCapability[] {
  const capabilities: AgentCapability[] = [...BASE_AGENT_CAPABILITIES];
  if (platform === "linux" && terminalCommandsReady) capabilities.push(...LINUX_CAPABILITIES);
  if (platform === "linux" && siteHelperReady) capabilities.push(...HELPER_CAPABILITIES);
  if (databaseInventorySupported) capabilities.push("databases.inventory.read");
  return capabilities;
}
