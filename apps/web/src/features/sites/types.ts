

type SiteRecord = {
  id: string;
  domain: string;
  status: "运行中" | "已停止" | "告警";
  runtime: string;
  host: string;
  certDays: number;
  traffic: string;
  owner: string;
  latency: string;
  errorRate: string;
  upstream: string;
  lastDeploy: string;
  certIssuer: string;
  certMode: string;
};

type SiteRuntimeGroup = {
  runtime: string;
  sites: SiteRecord[];
  running: number;
  warning: number;
  stopped: number;
  certDue: number;
  traffic: string;
  avgLatency: string;
  hosts: string;
};

export type { SiteRecord, SiteRuntimeGroup };
