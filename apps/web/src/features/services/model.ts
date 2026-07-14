import type { SystemdUnit } from "@stackpilot/contracts";

function formatBytes(value: number | null) {
  if (value === null) return "暂不可用";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value; let index = 0;
  while (amount >= 1024 && index < units.length - 1) { amount /= 1024; index += 1; }
  return `${amount.toFixed(index < 2 ? 0 : 1)} ${units[index]}`;
}

function systemdStatusMeta(unit: SystemdUnit) {
  if (unit.state === "active") return { label: "运行中", tone: "green" } as const;
  if (unit.state === "failed") return { label: "故障", tone: "red" } as const;
  return { label: "未运行", tone: "gray" } as const;
}

export { formatBytes, systemdStatusMeta };
