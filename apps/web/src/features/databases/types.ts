

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

type DatabaseBackupPlan = {
  id: string;
  name: string;
  database: string;
  storage: "S3" | "MinIO" | "本地";
  schedule: string;
  retention: string;
  enabled: boolean;
  health: "正常" | "告警";
  lastRun: string;
  successRate: number;
};

type DatabaseBackupTask = {
  id: string;
  planId: string;
  database: string;
  storage: string;
  status: "成功" | "运行中" | "失败" | "等待";
  startedAt: string;
  size: string;
  duration: string;
};

type DatabaseRestorePoint = {
  id: string;
  database: string;
  createdAt: string;
  storage: string;
  size: string;
  checksum: "已校验" | "待校验";
  drillStatus: "未演练" | "演练中" | "已完成";
};

type DatabaseBackupDrawer = { type: "plan"; id: string } | { type: "restore"; id: string };

type DatabaseSlowQuery = {
  id: string;
  database: string;
  fingerprint: string;
  sql: string;
  avgTime: string;
  p95Time: string;
  calls: number;
  rows: string;
  level: "高" | "中" | "低";
  status: "待处理" | "分析中" | "已处理";
  owner: string;
  firstSeen: string;
  suggestion: string;
  sessionId: string;
  explain?: string;
};

export type { DatabaseInstance, DatabaseBackupPlan, DatabaseBackupTask, DatabaseRestorePoint, DatabaseBackupDrawer, DatabaseSlowQuery };
