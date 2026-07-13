import type { AgentCapability } from "@stackpilot/contracts";

export const LEGACY_AGENT_CAPABILITIES: readonly AgentCapability[] = ["system.summary.read", "service.status.read"];
export const BASE_AGENT_CAPABILITIES: readonly AgentCapability[] = [...LEGACY_AGENT_CAPABILITIES, "sites.inventory.read"];
const HELPER_CAPABILITIES: readonly AgentCapability[] = ["sites.logs.read", "sites.deploy", "sites.lifecycle.manage", "sites.certificates.renew", "runtime.install"];
export const AGENT_CAPABILITIES: readonly AgentCapability[] = [...BASE_AGENT_CAPABILITIES, ...HELPER_CAPABILITIES, "databases.inventory.read"];

export function activeAgentCapabilities(
  platform: "linux" | "darwin" | "win32",
  siteHelperReady: boolean,
  databaseInventorySupported = false,
): AgentCapability[] {
  return [
    ...BASE_AGENT_CAPABILITIES,
    ...(platform === "linux" && siteHelperReady ? HELPER_CAPABILITIES : []),
    ...(databaseInventorySupported ? ["databases.inventory.read" as const] : []),
  ];
}
