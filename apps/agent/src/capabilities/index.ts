import type { AgentCapability } from "@stackpilot/contracts";
export const AGENT_CAPABILITIES: readonly AgentCapability[] = [
  "system.summary.read", "service.status.read", "database.inventory.read", "database.sql.read",
  "database.backup", "database.operate", "database.install", "database.restore",
];
