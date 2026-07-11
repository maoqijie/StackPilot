import type { LucideIcon } from "lucide-react";

type MobileTab = "首页" | "主机" | "网站" | "任务" | "我的";

type MobileTaskStatus = "成功" | "运行中" | "警告" | "信息";

type MobileHostRecord = {
  id: string;
  name: string;
  env: string;
  ip: string;
  os: string;
  cpu: string;
  memory: string;
  uptime: string;
  health: "健康" | "告警";
};

type MobileSiteRecord = {
  id: string;
  domain: string;
  runtime: string;
  host: string;
  status: "运行中" | "已停止" | "证书告警";
  certDays: number;
  traffic: string;
};

type MobileTaskRecord = {
  id: string;
  icon: LucideIcon;
  title: string;
  operator: string;
  status: MobileTaskStatus;
  time: string;
};

type MobileAuditRecord = {
  id: string;
  action: string;
  object: string;
  result: "成功" | "失败";
  ip: string;
  time: string;
};

type MobileQuickAction = {
  label: string;
  target: MobileTab | "数据库" | "文件" | "终端" | "系统服务" | "防火墙";
  targetHint: string;
  draft: string;
};

type MobileActionKind =
  | "host-restart"
  | "host-backup"
  | "site-toggle"
  | "site-renew"
  | "task-rerun"
  | "task-complete"
  | "profile-refresh"
  | "push-toggle"
  | "mfa-toggle"
  | "audit-view"
  | "diagnostics"
  | "notification-open"
  | "terminal-open";

type MobileSheetState =
  | { type: "menu" }
  | { type: "system" }
  | { type: "notifications" }
  | { type: "audit" }
  | { type: "quick"; action: string }
  | { type: "module"; action: string }
  | { type: "action"; action: MobileActionKind; targetId?: string; label?: string }
  | { type: "host"; hostId: string }
  | { type: "site"; siteId: string }
  | { type: "task"; taskId: string };

type MobileTabIcon = (props: { size?: number }) => React.ReactNode;

export type { MobileTab, MobileTaskStatus, MobileHostRecord, MobileSiteRecord, MobileTaskRecord, MobileAuditRecord, MobileQuickAction, MobileActionKind, MobileSheetState, MobileTabIcon };
