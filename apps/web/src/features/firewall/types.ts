

type FirewallRule = {
  id: string;
  name: string;
  port: string;
  protocol: string;
  source: string;
  target: string;
  enabled: boolean;
};

type FirewallDenyRecord = {
  id: string;
  time: string;
  source: string;
  target: string;
  port: string;
  protocol: string;
  rule: string;
  result: "拒绝" | "放行";
  status: "待处理" | "已生效";
  reason: string;
};

export type { FirewallRule, FirewallDenyRecord };
