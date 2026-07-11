

type BackupDraft = {
  frequency: string;
  runAt: string;
  retention: string;
  target: string;
  location: string;
  encryption: string;
};

type SettingsChangeRow = [string, string, string, string, string, string];

type TokenStatus = "已启用" | "已停用";

type TokenAccess = "读写" | "只读";

type TokenRisk = "正常" | "即将过期";

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  createdAt: string;
  lastUsed: string;
  status: TokenStatus;
  access: TokenAccess;
  risk: TokenRisk;
};

type GeneratedTokenSecret = { token: TokenRow; secret: string };

type ProxyEndpoint = {
  id: string;
  name: string;
  protocol: "HTTP" | "HTTPS" | "SOCKS5";
  url: string;
  scope: "全局" | "部署" | "终端" | "仓库";
  enabled: boolean;
  latency: string;
  status: "可用" | "告警" | "停用" | "未验证";
  lastCheck: string;
};

type ProxyRouteRule = {
  id: string;
  target: string;
  type: "直连" | "代理";
  endpointId: string;
  note: string;
  enabled: boolean;
};

export type { BackupDraft, SettingsChangeRow, TokenStatus, TokenAccess, TokenRisk, TokenRow, GeneratedTokenSecret, ProxyEndpoint, ProxyRouteRule };
