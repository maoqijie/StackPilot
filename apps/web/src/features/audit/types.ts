

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

export type { AuditRecord };
