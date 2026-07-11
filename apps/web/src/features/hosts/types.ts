

type HostRecord = {
  id: string;
  name: string;
  ip: string;
  env: string;
  health: "健康" | "警告" | "离线";
  cpu: string;
  memory: string;
  disk: string;
  os: string;
  uptime: string;
  backup: string;
  update: string;
  services: string[];
};

type HostPageMode = "inventory" | "production" | "alerts";

type HostPagePreset = {
  mode: HostPageMode;
  env: string;
  health: string;
  search: string;
  subtitle: string;
};

export type { HostRecord, HostPageMode, HostPagePreset };
