type AuditRecord = {
  id: string;
  time: string;
  source: string;
  user: string;
  actorType: string;
  action: string;
  object: string;
  targetType: string;
  result: "成功" | "失败" | "已记录";
  outcome: string;
  authorization: string;
  traceId: string;
  requestId: string;
  parameters: string;
  eventHash: string;
  summary: string;
};

export type { AuditRecord };
