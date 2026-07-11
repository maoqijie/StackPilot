

type AuditRecord = {
  id: string;
  time: string;
  ip: string;
  user: string;
  action: string;
  object: string;
  result: "成功" | "失败";
  traceId: string;
  summary: string;
};

type AuditExportRecord = {
  id: string;
  name: string;
  format: "CSV" | "JSON" | "ZIP";
  range: string;
  status: "可下载" | "生成中" | "失败";
  rows: number;
  size: string;
  creator: string;
  createdAt: string;
  expiresAt: string;
  traceId: string;
};

export type { AuditRecord, AuditExportRecord };
