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
  sites: SiteRuntimeView[];
  running: number;
  warning: number;
  stopped: number;
  unknown: number;
  certDue: number;
  certificateDataAvailable: boolean;
  traffic: string;
  avgLatency: string;
  hosts: string;
};

type SiteRuntimeView = {
  id: string;
  domain: string;
  status: "运行中" | "已停止" | "告警" | "待采集";
  runtime: string;
  host: string;
  upstream: string;
  source: string;
  certDays: number | null;
  certificateIssuer: string;
  trafficBytes: number | null;
  traffic: string;
  latencyMs: number | null;
  latency: string;
};

export type { SiteRecord, SiteRuntimeGroup, SiteRuntimeView };
