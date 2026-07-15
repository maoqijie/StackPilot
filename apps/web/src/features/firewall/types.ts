

type FirewallRule = {
  id: string;
  name: string;
  port: string;
  protocol: string;
  source: string;
  target: string;
  enabled: boolean;
};

export type { FirewallRule };
