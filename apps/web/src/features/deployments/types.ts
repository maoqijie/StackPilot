

type DeployJob = {
  id: string;
  app: string;
  env: string;
  version: string;
  status: "成功" | "运行中" | "失败" | "待发布";
  operator: string;
  duration: string;
};

type RollbackRecord = {
  id: string;
  app: string;
  env: string;
  fromVersion: string;
  targetVersion: string;
  status: "可回滚" | "回滚中" | "已回滚";
  operator: string;
  reason: string;
  createdAt: string;
};

export type { DeployJob, RollbackRecord };
