

type DatabaseInstance = {
  id: string;
  name: string;
  engine: string;
  host: string;
  port: string;
  connectionHealth: string;
  backupStatus: "成功" | "失败" | "等待确认" | "运行中" | "暂不可用";
  slowQueries: number | null;
  lastBackup: string;
  access: "读写" | "只读" | "仅备份" | "未知";
  owner: string;
  storage: string;
  connections: string;
  latency: string;
  region: string;
  autoBackup: boolean;
  remoteAccess: boolean;
  nodeName?: string;
  source?: string;
  collectedAt?: string;
  freshness?: "current" | "stale";
};

export type { DatabaseInstance };
