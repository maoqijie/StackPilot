export const RESOURCE_THRESHOLDS = {
  cpu: { warning: 70, critical: 85 },
  memory: { warning: 76, critical: 88 },
  disk: { warning: 80, critical: 90 },
} as const;

export type ResourcePercentages = { cpu: number | null; memory: number | null; disk: number | null };

export function hasResourceWarning(resources: ResourcePercentages) {
  return resources.cpu === null || resources.memory === null || resources.disk === null
    || resources.cpu >= RESOURCE_THRESHOLDS.cpu.warning
    || resources.memory >= RESOURCE_THRESHOLDS.memory.warning
    || resources.disk >= RESOURCE_THRESHOLDS.disk.warning;
}
