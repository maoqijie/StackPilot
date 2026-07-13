import type { AgentCapability } from "@stackpilot/contracts";

export const BASE_AGENT_CAPABILITIES: readonly AgentCapability[] = ["system.summary.read", "service.status.read", "sites.inventory.read"];
const HELPER_CAPABILITIES: readonly AgentCapability[] = ["sites.logs.read", "sites.deploy", "sites.lifecycle.manage", "sites.certificates.renew", "runtime.install"];

export function activeAgentCapabilities(platform: "linux" | "darwin" | "win32", certificateHelperReady: boolean): AgentCapability[] {
  return platform === "linux" && certificateHelperReady
    ? [...BASE_AGENT_CAPABILITIES, ...HELPER_CAPABILITIES]
    : [...BASE_AGENT_CAPABILITIES];
}
