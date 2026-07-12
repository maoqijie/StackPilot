import type { OverviewNode, OverviewTaskRecord } from "@stackpilot/contracts";

export type CommandResult = { ok: boolean; stdout: string; stderr: string; elapsedMs: number };
export type DiskVolume = { label: string; mount: string; totalBytes: number; freeBytes: number; usedBytes: number; percent: number };
export type PlatformSnapshot = {
  node: OverviewNode;
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  loadPercent: number;
  changedFiles: string[];
  branch: string;
  commit: string;
  behind: number;
  version: string;
  cpuCorePercents: number[];
  loadAverages: number[];
  totalMemoryGb: number;
  freeMemoryGb: number;
  diskFreeGb: number;
  disks: DiskVolume[];
  platformLabel: string;
  auditRows: Array<[string, string, string, string, string, "成功" | "失败", string]>;
};

export interface PlatformAdapter {
  readonly nodeId: string;
  collectSnapshot(): Promise<PlatformSnapshot>;
  collectDeviceTasks(snapshot: PlatformSnapshot, collectedAt: string): Promise<OverviewTaskRecord[]>;
  readCrontab(): Promise<string>;
  writeCrontab(content: string): Promise<void>;
  runScheduledCommand(command: string): Promise<CommandResult>;
  restartNode(): Promise<{ ok: boolean; status: number; message: string }>;
  readiness(): Promise<boolean>;
}
