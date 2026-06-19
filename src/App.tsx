import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  Activity,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleHelp,
  Clock3,
  CloudUpload,
  Code2,
  Database,
  Download,
  Edit3,
  Eye,
  FileBox,
  FileText,
  Folder,
  Globe2,
  Home,
  KeyRound,
  Lock,
  Menu,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  TerminalSquare,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  checkOverviewUpdates,
  createOverviewNode,
  createOverviewTask,
  exportOverviewRisks,
  exportOverviewTasks,
  fetchOverview,
  fetchOverviewHealth,
  fetchOverviewRisks,
  fetchOverviewTasks,
  patchOverviewNode,
  patchOverviewRisk,
  patchOverviewTask,
  refreshOverview,
  refreshOverviewHealth,
  restartOverviewNode,
  scanOverviewRisks,
  switchOverviewCluster,
  type OverviewAuditRow,
  type OverviewMetricIcon,
  type OverviewNode,
  type OverviewResourceRecord,
  type OverviewRiskRecord,
  type OverviewSummaryPayload,
  type OverviewTaskRecord,
} from "./overviewApi";

const parentPageKeys = [
  "overview",
  "hosts",
  "sites",
  "databases",
  "files",
  "terminal",
  "systemd",
  "firewall",
  "deploy",
  "schedule",
  "audit",
  "acl",
  "settings",
] as const;

type ParentPageKey = (typeof parentPageKeys)[number];
type PageKey = string;
type Tone = "green" | "blue" | "orange" | "red" | "gray" | "purple";
type ToastTone = "success" | "info" | "warning" | "danger";
type ToastState = { message: string; tone: ToastTone };
type Notify = (message: string, tone?: ToastTone) => void;
type SetPage = (page: PageKey, toast?: ToastState) => void;
type PageMeta = { title: string; breadcrumb: string; search: string };
type ViewContext = { eyebrow: string; title: string; description: string; chips: string[] };
type NavChild = { id: string; label: string; meta: string; page?: PageKey; badge?: string };
type NavItem = {
  key: ParentPageKey;
  label: string;
  icon: LucideIcon;
  badge?: string;
  children: NavChild[];
};

function currentClock() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function activateOnKeyboard(event: React.KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

const pageMeta: Record<string, PageMeta> = {
  overview: { title: "首页总览", breadcrumb: "控制台", search: "搜索主机、网站、数据库、任务..." },
  "overview-health": { title: "集群状态", breadcrumb: "首页总览", search: "搜索节点、IP、服务、版本..." },
  "overview-tasks": { title: "任务流", breadcrumb: "首页总览", search: "搜索任务、类型、操作人..." },
  "overview-risks": { title: "风险中心", breadcrumb: "首页总览", search: "搜索风险、主机、对象..." },
  hosts: { title: "主机", breadcrumb: "资源管理", search: "搜索主机名、IP、环境..." },
  sites: { title: "网站", breadcrumb: "应用管理", search: "搜索域名、运行时、证书..." },
  databases: { title: "数据库管理", breadcrumb: "资源管理", search: "搜索数据库名称" },
  files: { title: "文件", breadcrumb: "资源管理", search: "搜索文件名、路径、类型..." },
  terminal: { title: "终端", breadcrumb: "运维工具", search: "搜索会话主机或命令..." },
  systemd: { title: "systemd 服务", breadcrumb: "系统管理", search: "搜索服务、主机、状态..." },
  firewall: { title: "防火墙", breadcrumb: "安全管理", search: "搜索端口、协议、来源..." },
  deploy: { title: "部署", breadcrumb: "发布管理", search: "搜索应用、版本、提交..." },
  schedule: { title: "定时任务", breadcrumb: "自动化", search: "搜索任务名、cron、命令..." },
  audit: { title: "审计日志", breadcrumb: "安全管理", search: "搜索用户、对象、trace id..." },
  acl: { title: "权限", breadcrumb: "安全管理", search: "搜索用户、角色、权限..." },
  settings: { title: "面板设置", breadcrumb: "设置", search: "搜索主机、网站、数据库、文件..." },
  "settings-general": { title: "基础设置", breadcrumb: "设置", search: "搜索基础设置..." },
  "settings-security": { title: "安全策略", breadcrumb: "设置", search: "搜索安全设置..." },
  "settings-proxy": { title: "代理设置", breadcrumb: "设置", search: "搜索代理设置..." },
  "settings-notice": { title: "通知设置", breadcrumb: "设置", search: "搜索通知设置..." },
  "settings-backup": { title: "备份策略", breadcrumb: "设置", search: "搜索备份策略..." },
  "settings-audit": { title: "设置审计", breadcrumb: "设置", search: "搜索设置变更..." },
  mobile: { title: "移动端", breadcrumb: "预览", search: "搜索移动端模块..." },
};

const navItems: NavItem[] = [
  {
    key: "overview",
    label: "首页总览",
    icon: Home,
    children: [
      { id: "overview-health", label: "集群状态", meta: "健康 / 延迟", page: "overview-health" },
      { id: "overview-tasks", label: "任务流", meta: "7 待执行", page: "overview-tasks", badge: "7" },
      { id: "overview-risks", label: "风险中心", meta: "3 风险", page: "overview-risks", badge: "3" },
    ],
  },
  {
    key: "hosts",
    label: "主机",
    icon: Server,
    children: [
      { id: "hosts-all", label: "全部主机", meta: "23 台", badge: "23" },
      { id: "hosts-prod", label: "生产环境", meta: "8 台在线" },
      { id: "hosts-alert", label: "健康告警", meta: "3 个待处理", badge: "3" },
    ],
  },
  {
    key: "sites",
    label: "网站",
    icon: Globe2,
    children: [
      { id: "sites-running", label: "运行中站点", meta: "48 个" },
      { id: "sites-cert", label: "证书续期", meta: "5 天内", badge: "3" },
      { id: "sites-runtime", label: "运行时分组", meta: "Node / PHP" },
    ],
  },
  {
    key: "databases",
    label: "数据库",
    icon: Database,
    children: [
      { id: "databases-instances", label: "实例列表", meta: "19 个" },
      { id: "databases-backups", label: "备份计划", meta: "02:00 执行" },
      { id: "databases-slow", label: "慢查询", meta: "23 条", badge: "23" },
    ],
  },
  {
    key: "files",
    label: "文件",
    icon: Folder,
    children: [
      { id: "files-www", label: "站点目录", meta: "/var/www" },
      { id: "files-upload", label: "上传队列", meta: "2 项" },
      { id: "files-trash", label: "回收站", meta: "7 天保留" },
    ],
  },
  {
    key: "terminal",
    label: "终端",
    icon: TerminalSquare,
    children: [
      { id: "terminal-sessions", label: "会话列表", meta: "3 在线", badge: "3" },
      { id: "terminal-snippets", label: "常用命令", meta: "12 条" },
      { id: "terminal-history", label: "执行历史", meta: "今日 18 次" },
    ],
  },
  {
    key: "systemd",
    label: "systemd 服务",
    icon: Settings,
    children: [
      { id: "systemd-active", label: "Active 服务", meta: "36 个" },
      { id: "systemd-failed", label: "Failed 服务", meta: "1 个", badge: "1" },
      { id: "systemd-logs", label: "服务日志", meta: "实时追踪" },
    ],
  },
  {
    key: "firewall",
    label: "防火墙",
    icon: Shield,
    children: [
      { id: "firewall-rules", label: "规则列表", meta: "42 条" },
      { id: "firewall-open", label: "开放端口", meta: "8 个" },
      { id: "firewall-deny", label: "拦截记录", meta: "今日 12 次" },
    ],
  },
  {
    key: "deploy",
    label: "部署",
    icon: CloudUpload,
    children: [
      { id: "deploy-prod", label: "生产发布", meta: "2 待确认", badge: "2" },
      { id: "deploy-staging", label: "预发环境", meta: "v2.8.1" },
      { id: "deploy-rollbacks", label: "回滚记录", meta: "近 30 天" },
    ],
  },
  {
    key: "schedule",
    label: "定时任务",
    icon: CalendarDays,
    children: [
      { id: "schedule-enabled", label: "启用任务", meta: "7 个" },
      { id: "schedule-failed", label: "失败任务", meta: "1 个", badge: "1" },
      { id: "schedule-calendar", label: "执行日历", meta: "今日 5 次" },
    ],
  },
  {
    key: "audit",
    label: "审计日志",
    icon: FileText,
    children: [
      { id: "audit-all", label: "全部日志", meta: "只读" },
      { id: "audit-failed", label: "失败操作", meta: "4 条", badge: "4" },
      { id: "audit-export", label: "导出记录", meta: "CSV / JSON" },
    ],
  },
  {
    key: "acl",
    label: "权限",
    icon: Lock,
    children: [
      { id: "acl-users", label: "用户", meta: "12 人" },
      { id: "acl-roles", label: "角色", meta: "6 组" },
      { id: "acl-policies", label: "权限项", meta: "34 项" },
    ],
  },
  {
    key: "settings",
    label: "设置",
    icon: Settings,
    children: [
      { id: "settings-general", label: "基础设置", meta: "面板偏好" },
      { id: "settings-security", label: "安全策略", meta: "MFA / 白名单" },
      { id: "settings-backup", label: "备份策略", meta: "S3 / MinIO" },
      { id: "settings-proxy", label: "代理设置", meta: "HTTP / NO_PROXY" },
      { id: "settings-notice", label: "通知设置", meta: "Webhook / 邮件" },
      { id: "settings-audit", label: "设置审计", meta: "配置变更" },
    ],
  },
];

const overviewChildPages: Partial<Record<PageKey, string>> = {
  "overview-health": "overview-health",
  "overview-tasks": "overview-tasks",
  "overview-risks": "overview-risks",
};

function navPageFor(page: PageKey): ParentPageKey {
  if ((parentPageKeys as readonly string[]).includes(page)) return page as ParentPageKey;
  const childParent = navItems.find((item) => item.children.some((child) => (child.page ?? child.id) === page));
  return childParent?.key ?? (overviewChildPages[page] ? "overview" : "overview");
}

function activeChildForPage(page: PageKey) {
  const exactChild = navItems.flatMap((item) => item.children).find((child) => (child.page ?? child.id) === page);
  return exactChild?.id;
}

function activeNavEntryForPage(page: PageKey) {
  const parentKey = navPageFor(page);
  const parent = navItems.find((item) => item.key === parentKey);
  const child = parent?.children.find((item) => (item.page ?? item.id) === page);
  return { parent, child };
}

function viewContextForPage(page: PageKey): ViewContext | null {
  const { parent, child } = activeNavEntryForPage(page);
  if (!parent) return null;
  const eyebrow = child ? `${parent.label} / ${child.label}` : `${parent.label} / 默认视图`;
  const title = child ? child.label : parent.label;
  const baseChip = child?.meta ?? "全部";

  switch (parent.key) {
    case "overview":
      return { eyebrow, title, description: child ? "首页总览子视图已从侧栏定位。" : "首页总览默认视图。", chips: [baseChip] };
    case "hosts": {
      const preset = hostPagePreset(page);
      return { eyebrow, title, description: preset.subtitle, chips: [`环境 ${preset.env}`, `健康 ${preset.health}`] };
    }
    case "sites": {
      const preset = sitesPagePreset(page);
      const chips = [`状态 ${preset.status}`, `运行时 ${preset.runtime}`];
      if (page === "sites-cert") chips.push("证书 < 14 天");
      return { eyebrow, title, description: preset.subtitle, chips };
    }
    case "databases": {
      const preset = databasePagePreset(page);
      return { eyebrow, title, description: preset.subtitle, chips: [`类型 ${preset.type}`, `状态 ${preset.status}`, `主机 ${preset.host}`] };
    }
    case "files": {
      const preset = filesPagePreset(page);
      return { eyebrow, title, description: preset.subtitle, chips: [`路径 ${preset.path}`, `类型 ${preset.type}`] };
    }
    case "terminal": {
      const preset = terminalPagePreset(page);
      return { eyebrow, title, description: preset.subtitle, chips: [`面板 ${preset.panel === "sessions" ? "会话" : preset.panel === "snippets" ? "常用命令" : "执行历史"}`] };
    }
    case "systemd": {
      const preset = systemdPagePreset(page);
      return { eyebrow, title, description: preset.subtitle, chips: [`状态 ${preset.status}`] };
    }
    case "firewall": {
      const preset = firewallPagePreset(page);
      return { eyebrow, title, description: preset.subtitle, chips: [`协议 ${preset.protocol}`, `来源 ${preset.source}`] };
    }
    case "deploy": {
      const preset = deployPagePreset(page);
      return { eyebrow, title, description: preset.subtitle, chips: [`环境 ${preset.env}`, `模式 ${preset.mode === "rollbacks" ? "回滚" : "任务"}`] };
    }
    case "schedule": {
      const preset = schedulePagePreset(page);
      return { eyebrow, title, description: preset.subtitle, chips: [`状态 ${preset.state}`, `模式 ${preset.mode === "calendar" ? "日历" : "列表"}`] };
    }
    case "audit": {
      const preset = auditPagePreset(page);
      return { eyebrow, title, description: preset.subtitle, chips: [`用户 ${preset.user}`, `结果 ${preset.result}`, `模式 ${preset.mode === "exports" ? "导出" : "日志"}`] };
    }
    case "acl": {
      const preset = aclPagePreset(page);
      const viewName = preset.tab === "users" ? "用户" : preset.tab === "roles" ? "角色" : "权限项";
      return { eyebrow, title, description: preset.subtitle, chips: [`视图 ${viewName}`] };
    }
    case "settings": {
      const tab = settingsPagePreset(page);
      return { eyebrow, title, description: `当前定位到${tab}设置。`, chips: [`Tab ${tab}`] };
    }
    default:
      return { eyebrow, title, description: child?.meta ?? pageMeta[parent.key].breadcrumb, chips: [baseChip] };
  }
}

function resolvePageMeta(page: PageKey): PageMeta {
  const direct = pageMeta[page];
  if (direct) return direct;
  const parent = navItems.find((item) => item.children.some((child) => (child.page ?? child.id) === page));
  const child = parent?.children.find((item) => (item.page ?? item.id) === page);
  if (parent && child) {
    return {
      title: child.label,
      breadcrumb: parent.label,
      search: pageMeta[parent.key].search,
    };
  }
  return pageMeta.overview;
}

const routePageKeys = new Set<string>([
  ...parentPageKeys,
  "mobile",
  ...Object.keys(pageMeta),
  ...navItems.flatMap((item) => item.children.map((child) => child.page ?? child.id)),
]);

const groupItems = [
  ["全部主机", "23", "blue"],
  ["生产环境", "8", "green"],
  ["预发环境", "5", "blue"],
  ["开发环境", "6", "orange"],
  ["测试环境", "4", "purple"],
];

const overviewMetrics = [
  { label: "在线主机", value: "12", suffix: "/ 12", delta: "100% 在线", icon: Server, tone: "blue", line: [14, 20, 17, 24, 22, 31, 27, 29, 25, 30, 27, 29] },
  { label: "网站", value: "48", suffix: "", delta: "12% 较昨日", icon: Globe2, tone: "blue", line: [12, 13, 13, 13, 20, 28, 24, 21, 32, 22, 26, 24] },
  { label: "数据库", value: "19", suffix: "", delta: "5% 较昨日", icon: Database, tone: "blue", line: [12, 13, 12, 14, 14, 26, 25, 31, 21, 33, 34, 36] },
  { label: "待执行任务", value: "7", suffix: "", delta: "2 较昨日", icon: CalendarDays, tone: "gray", line: [26, 31, 24, 16, 22, 28, 36, 18, 34, 25, 16, 12] },
  { label: "风险项", value: "3", suffix: "", delta: "1 较昨日", icon: Shield, tone: "orange", line: [10, 20, 21, 35, 16, 25, 22, 27, 23, 12, 12, 12] },
  { label: "今日告警", value: "1", suffix: "", delta: "1 较昨日", icon: Bell, tone: "red", line: [14, 28, 16, 34, 20, 27, 35, 30, 24, 18, 46, 14] },
];

const auditRows = [
  ["05-22 10:24:31", "10.0.0.55", "李敏", "部署应用", "/api (sg-web-02)", "成功", "a1b2c3d4e5f6"],
  ["05-22 10:23:11", "10.0.1.100", "王工", "更新防火墙", "panel-bj-02", "成功", "b2c3d4e5f6g7"],
  ["05-22 10:22:05", "10.0.0.11", "系统", "备份数据库", "shop_db", "成功", "c3d4e5f6g7h8"],
  ["05-22 10:18:42", "10.0.2.77", "王强", "重启服务", "nginx", "成功", "d4e5f6g7h8i9"],
  ["05-22 10:15:19", "10.0.0.55", "系统", "上传文件", "/var/www/html", "成功", "e5f6g7h8i9j0"],
  ["05-22 10:12:08", "10.0.1.23", "赵磊", "修改配置", "php.ini", "成功", "f6g7h8i9j0k1"],
  ["05-22 10:08:33", "10.0.2.88", "陈晨", "删除文件", "/tmp/old.log", "失败", "h8i9j0k1l2m3"],
];

const dbRows = [
  ["prod-postgres-01", "PostgreSQL 15.5", "10.0.12.24", "5432", "正常", "成功", "2", "2025-03-08 02:14", "读写", "DBA"],
  ["billing-mysql-02", "MySQL 8.0.36", "10.0.12.31", "3306", "延迟 180ms", "等待确认", "9", "2025-03-07 23:10", "读写", "研发"],
  ["staging-pg-03", "PostgreSQL 16.2", "10.0.14.18", "5432", "正常", "成功", "0", "2025-03-08 01:32", "读写", "研发"],
  ["analytics-mysql-01", "MySQL 8.0.32", "10.0.13.15", "3306", "延迟 560ms", "失败", "23", "2025-03-07 20:45", "读写", "运维"],
  ["archive-pg-02", "PostgreSQL 14.9", "10.0.15.22", "5432", "正常", "成功", "1", "2025-03-07 22:30", "只读", "研发"],
  ["test-mysql-01", "MySQL 8.0.30", "10.0.16.11", "3306", "正常", "成功", "0", "2025-03-08 00:22", "读写", "仅团队"],
  ["metrics-pg-01", "PostgreSQL 15.3", "10.0.13.21", "5432", "延迟 220ms", "成功", "6", "2025-03-07 21:05", "读写", "运维"],
  ["logs-mysql-02", "MySQL 8.0.28", "10.0.17.19", "3306", "正常", "成功", "0", "2025-03-08 02:00", "仅备份", "运维"],
];

const settingsChanges = [
  ["2025-08-13 09:12:45", "管理员", "备份策略", "修改", "新增保留周期：14", "10.0.12.24"],
  ["2025-08-13 09:01:32", "管理员", "访问令牌", "创建", "创建令牌：CI 发布令牌", "10.0.12.24"],
  ["2025-08-12 18:47:09", "运维-张三", "安全设置", "修改", "会话超时时间：15 分钟 -> 30 分钟", "10.0.12.35"],
  ["2025-08-12 17:32:55", "运维-张三", "安全设置", "修改", "IP 白名单：172.16.0.0/12 -> 10.0.0.0/8, 172.16.0.0/12", "10.0.12.35"],
  ["2025-08-12 03:01:22", "系统任务", "备份策略", "验证", "备份验证成功：backup-20250812-0230", "127.0.0.1"],
];

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

type SiteRecord = {
  id: string;
  domain: string;
  status: "运行中" | "已停止" | "告警";
  runtime: string;
  host: string;
  certDays: number;
  traffic: string;
  owner: string;
};

type FileRecord = {
  id: string;
  name: string;
  type: "文件夹" | "文件";
  path: string;
  size: string;
  modified: string;
  owner: string;
};

type ServiceRecord = {
  id: string;
  name: string;
  host: string;
  status: "active" | "failed" | "inactive";
  restarts: number;
  memory: string;
  updated: string;
  handled?: boolean;
};

type FirewallRule = {
  id: string;
  name: string;
  port: string;
  protocol: string;
  source: string;
  target: string;
  enabled: boolean;
};

type DeployJob = {
  id: string;
  app: string;
  env: string;
  version: string;
  status: "成功" | "运行中" | "失败" | "待发布";
  operator: string;
  duration: string;
};

type RollbackRecord = {
  id: string;
  app: string;
  env: string;
  fromVersion: string;
  targetVersion: string;
  status: "可回滚" | "回滚中" | "已回滚";
  operator: string;
  reason: string;
  createdAt: string;
};

type ScheduleJob = {
  id: string;
  name: string;
  cron: string;
  command: string;
  enabled: boolean;
  nextRun: string;
  lastRun: string;
  result: "成功" | "失败" | "未运行";
};

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

type AclUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  enabled: boolean;
  mfa: "已启用" | "未启用" | "需重置";
  lastLogin: string;
};

type AclRole = {
  id: string;
  name: string;
  desc: string;
  permissions: string[];
};

type AclPolicy = {
  id: string;
  name: string;
  module: string;
  risk: "低" | "中" | "高";
  desc: string;
  roles: string[];
  lastUpdated: string;
};

const initialOverviewNodes: OverviewNode[] = [
  { id: "node-1", name: "panel-sg-01", ip: "10.0.0.11", env: "生产", status: "健康", latency: "38ms", cpu: "18%", memory: "42%", disk: "35%", version: "v2.8.1", uptime: "23 天 14 小时", backup: "今天 02:15", update: "已是最新", owner: "核心集群", services: ["nginx", "postgresql", "redis", "worker"] },
  { id: "node-2", name: "panel-bj-02", ip: "10.0.1.22", env: "预发", status: "健康", latency: "52ms", cpu: "27%", memory: "55%", disk: "62%", version: "v2.8.0", uptime: "18 天 9 小时", backup: "今天 02:20", update: "可更新 1", owner: "发布验证", services: ["nginx", "worker", "systemd-resolved"] },
  { id: "node-3", name: "panel-hk-03", ip: "10.0.2.33", env: "生产", status: "警告", latency: "126ms", cpu: "63%", memory: "78%", disk: "83%", version: "v2.8.0", uptime: "9 天 2 小时", backup: "昨天 02:18", update: "可更新 1", owner: "边缘站点", services: ["nginx", "mysql", "queue"] },
  { id: "node-4", name: "panel-dev-04", ip: "10.0.3.44", env: "开发", status: "维护", latency: "离线", cpu: "0%", memory: "0%", disk: "47%", version: "v2.7.9", uptime: "维护中", backup: "3 天前", update: "待检查", owner: "研发调试", services: ["docker", "node", "cron"] },
];

const initialOverviewTasks: OverviewTaskRecord[] = [
  { id: "task-1", type: "部署", title: "部署 /api 服务 v2.8.1", target: "panel-sg-01", status: "成功", priority: "中", operator: "李敏", queuedAt: "2 分钟前", duration: "1分24秒", logs: ["拉取 release v2.8.1", "执行健康检查", "发布完成"] },
  { id: "task-2", type: "备份", title: "备份 shop_db", target: "prod-postgres-01", status: "成功", priority: "低", operator: "系统", queuedAt: "8 分钟前", duration: "32秒", logs: ["创建快照", "上传到 S3", "校验成功"] },
  { id: "task-3", type: "补丁", title: "更新防火墙规则", target: "panel-bj-02", status: "运行中", priority: "高", operator: "王工", queuedAt: "15 分钟前", duration: "18秒", logs: ["生成规则差异", "应用 TCP 3306 来源限制"] },
  { id: "task-4", type: "自动化", title: "每日快照", target: "全部生产主机", status: "等待", priority: "中", operator: "系统", queuedAt: "队列 #1", duration: "预计 12 分钟", logs: ["等待前序备份任务释放锁"] },
  { id: "task-5", type: "修复", title: "重启 mysql.service", target: "panel-hk-03", status: "失败", priority: "高", operator: "张工", queuedAt: "31 分钟前", duration: "7秒", logs: ["尝试重启服务", "systemd 返回 failed", "等待人工处理"] },
  { id: "task-6", type: "同步", title: "同步静态文件", target: "admin.example.com", status: "等待", priority: "低", operator: "CI", queuedAt: "队列 #2", duration: "预计 18 分钟", logs: ["等待部署窗口"] },
];

const initialOverviewRisks: OverviewRiskRecord[] = [
  { id: "risk-1", title: "SSH 密钥过期", level: "高危", status: "待处理", target: "panel-sg-01, panel-hk-03", owner: "安全组", impact: "2 台生产主机无法完成密钥轮换", detected: "10 分钟前", suggestion: "立即轮换 deploy key 并重新验证 SSH 登录链路", traceId: "risk-a1b2c3" },
  { id: "risk-2", title: "MySQL 端口暴露到公网", level: "高危", status: "待处理", target: "0.0.0.0/0:3306", owner: "数据库组", impact: "外部来源可探测数据库端口", detected: "18 分钟前", suggestion: "收敛来源到 10.0.12.0/24 并触发防火墙重载", traceId: "risk-b2c3d4" },
  { id: "risk-3", title: "站点证书即将过期", level: "中危", status: "待处理", target: "admin.example.com", owner: "应用组", impact: "4 天后 HTTPS 证书过期", detected: "今天 09:42", suggestion: "执行证书续期并检查 Nginx reload 结果", traceId: "risk-c3d4e5" },
  { id: "risk-4", title: "systemd 服务反复重启", level: "中危", status: "待处理", target: "mysql.service / panel-hk-03", owner: "运维组", impact: "最近 30 分钟重启 6 次", detected: "8 分钟前", suggestion: "查看服务日志，必要时切换只读副本", traceId: "risk-d4e5f6" },
  { id: "risk-5", title: "开发节点备份延迟", level: "低危", status: "已暂缓", target: "panel-dev-04", owner: "研发组", impact: "备份晚于策略 3 天", detected: "昨天 18:11", suggestion: "维护窗口结束后重新开启备份计划", traceId: "risk-e5f6g7" },
];

const overviewMetricIcons: Record<OverviewMetricIcon, LucideIcon> = {
  server: Server,
  globe: Globe2,
  database: Database,
  calendar: CalendarDays,
  shield: Shield,
  bell: Bell,
};

function reportApiError(error: unknown, notify: Notify, fallback = "后端请求失败") {
  notify(error instanceof Error ? error.message : fallback, "danger");
}

function initialOverviewSummary(): OverviewSummaryPayload {
  return {
    cluster: {
      current: "panel-sg-01",
      health: "健康",
      latency: "38ms",
      version: "v2.8.1",
      uptime: "23 天 14 小时",
      lastBackup: "2025-05-22 02:15",
      pendingUpdates: 2,
    },
    metrics: overviewMetrics.map((metric, index) => ({
      label: metric.label,
      value: metric.value,
      suffix: metric.suffix,
      delta: metric.delta,
      tone: metric.tone,
      line: metric.line,
      icon: ["server", "globe", "database", "calendar", "shield", "bell"][index] as OverviewMetricIcon,
    })),
    nodes: initialOverviewNodes,
    tasks: initialOverviewTasks,
    audits: auditRows as OverviewAuditRow[],
    risks: initialOverviewRisks,
    resources: {
      今天: buildOverviewResources("今天"),
      "近7天": buildOverviewResources("近7天"),
      "近30天": buildOverviewResources("近30天"),
    },
    lastRefresh: "2025-05-22 02:15",
  };
}

function buildOverviewResources(activeTab: string): OverviewResourceRecord[] {
  const multiplier = activeTab === "近30天" ? 1.18 : activeTab === "近7天" ? 1.08 : 1;
  return [
    { label: "CPU 使用率", value: `${Math.round(18 * multiplier)}%`, delta: activeTab === "今天" ? "+3%" : "+6%", values: [18, 16, 20, 14, 26, 17, 23, 15, 21, 18] },
    { label: "内存使用率", value: `${Math.round(52 * multiplier)}%`, delta: activeTab === "今天" ? "+4%" : "+7%", values: [42, 48, 45, 52, 47, 55, 48, 52, 49, 57] },
    { label: "磁盘使用率", value: `${Math.round(61 * multiplier)}%`, delta: activeTab === "今天" ? "+1%" : "+3%", values: [59, 61, 58, 63, 57, 62, 56, 61, 58, 64] },
    { label: "网络流量", value: activeTab === "今天" ? "1.2 TB" : activeTab === "近7天" ? "8.9 TB" : "34.6 TB", delta: activeTab === "今天" ? "+8%" : "+13%", values: [20, 16, 26, 18, 30, 23, 19, 24, 21, 28] },
  ];
}

const initialHostRecords: HostRecord[] = [
  { id: "host-1", name: "panel-se-01", ip: "10.0.0.11", env: "生产", health: "健康", cpu: "18%", memory: "42%", disk: "35%", os: "Ubuntu 22.04", uptime: "23 天", backup: "今天 02:15", update: "已是最新", services: ["nginx", "postgresql", "redis"] },
  { id: "host-2", name: "panel-bj-02", ip: "10.0.1.22", env: "预发", health: "健康", cpu: "27%", memory: "55%", disk: "62%", os: "Debian 12", uptime: "18 天", backup: "今天 02:20", update: "可更新 1", services: ["nginx", "worker", "systemd-resolved"] },
  { id: "host-3", name: "panel-hk-03", ip: "10.0.2.33", env: "生产", health: "警告", cpu: "63%", memory: "78%", disk: "83%", os: "Ubuntu 20.04", uptime: "9 天", backup: "昨天 02:18", update: "可更新 1", services: ["nginx", "mysql", "queue"] },
  { id: "host-4", name: "panel-dev-04", ip: "10.0.3.44", env: "开发", health: "离线", cpu: "0%", memory: "0%", disk: "47%", os: "Rocky Linux 9", uptime: "离线", backup: "3 天前", update: "待检查", services: ["docker", "node", "cron"] },
];

const initialSiteRecords: SiteRecord[] = [
  { id: "site-1", domain: "api.stackpilot.local", status: "运行中", runtime: "Node 20", host: "panel-se-01", certDays: 68, traffic: "128 GB", owner: "后端" },
  { id: "site-2", domain: "shop.example.com", status: "运行中", runtime: "PHP 8.3", host: "panel-bj-02", certDays: 12, traffic: "420 GB", owner: "电商" },
  { id: "site-3", domain: "admin.example.com", status: "告警", runtime: "Nginx 静态", host: "panel-hk-03", certDays: 4, traffic: "86 GB", owner: "运营" },
  { id: "site-4", domain: "docs.example.com", status: "已停止", runtime: "Static", host: "panel-dev-04", certDays: 90, traffic: "14 GB", owner: "文档" },
];

const initialFileRecords: FileRecord[] = [
  { id: "file-1", name: "releases", type: "文件夹", path: "/var/www/html", size: "-", modified: "今天 10:12", owner: "deploy" },
  { id: "file-2", name: "uploads", type: "文件夹", path: "/var/www/html", size: "-", modified: "昨天 18:44", owner: "www-data" },
  { id: "file-3", name: "index.html", type: "文件", path: "/var/www/html", size: "18 KB", modified: "今天 09:31", owner: "deploy" },
  { id: "file-4", name: "nginx.conf", type: "文件", path: "/var/www/html", size: "4 KB", modified: "昨天 22:10", owner: "root" },
  { id: "file-5", name: "v2.8.1", type: "文件夹", path: "/var/www/html/releases", size: "-", modified: "今天 08:40", owner: "deploy" },
  { id: "file-6", name: "bundle.js", type: "文件", path: "/var/www/html/releases/v2.8.1", size: "418 KB", modified: "今天 08:42", owner: "deploy" },
  { id: "file-7", name: "upload-20260618.log", type: "文件", path: "/var/www/html", size: "12 KB", modified: "今天 10:21", owner: "admin" },
  { id: "file-8", name: "upload-assets.zip", type: "文件", path: "/var/www/html", size: "84 MB", modified: "今天 10:19", owner: "admin" },
  { id: "file-9", name: "old-error.log", type: "文件", path: "/tmp", size: "32 KB", modified: "昨天 23:40", owner: "root" },
  { id: "file-10", name: "old-cache.tar", type: "文件", path: "/tmp", size: "128 MB", modified: "3 天前", owner: "www-data" },
];

const initialServiceRecords: ServiceRecord[] = [
  { id: "svc-1", name: "nginx.service", host: "panel-se-01", status: "active", restarts: 0, memory: "84 MB", updated: "3 分钟前" },
  { id: "svc-2", name: "mysql.service", host: "panel-hk-03", status: "failed", restarts: 6, memory: "1.2 GB", updated: "8 分钟前" },
  { id: "svc-3", name: "worker.service", host: "panel-bj-02", status: "active", restarts: 1, memory: "256 MB", updated: "21 分钟前" },
  { id: "svc-4", name: "backup.timer", host: "panel-dev-04", status: "inactive", restarts: 0, memory: "0 MB", updated: "2 小时前" },
];

const initialFirewallRules: FirewallRule[] = [
  { id: "fw-1", name: "HTTPS 公网访问", port: "443", protocol: "TCP", source: "0.0.0.0/0", target: "全部主机", enabled: true },
  { id: "fw-2", name: "SSH 运维入口", port: "22", protocol: "TCP", source: "10.0.0.0/8", target: "生产环境", enabled: true },
  { id: "fw-3", name: "MySQL 内网", port: "3306", protocol: "TCP", source: "10.0.12.0/24", target: "数据库", enabled: true },
  { id: "fw-4", name: "UDP 探测", port: "9100", protocol: "UDP", source: "监控网段", target: "全部主机", enabled: false },
];

const initialDeployJobs: DeployJob[] = [
  { id: "dep-1", app: "stackpilot-api", env: "生产", version: "v2.8.1", status: "成功", operator: "张工", duration: "1分24秒" },
  { id: "dep-2", app: "shop-web", env: "生产", version: "2026.06.18", status: "待发布", operator: "李敏", duration: "-" },
  { id: "dep-3", app: "admin-console", env: "预发", version: "rc-18", status: "成功", operator: "王工", duration: "46秒" },
  { id: "dep-4", app: "worker", env: "开发", version: "dev-42", status: "失败", operator: "系统", duration: "18秒" },
];

const initialRollbackRecords: RollbackRecord[] = [
  { id: "rb-1", app: "stackpilot-api", env: "生产", fromVersion: "v2.8.1", targetVersion: "v2.8.0", status: "可回滚", operator: "张工", reason: "v2.8.0 为最近健康基线", createdAt: "今天 10:18" },
  { id: "rb-2", app: "shop-web", env: "生产", fromVersion: "2026.06.18", targetVersion: "2026.06.15", status: "回滚中", operator: "李敏", reason: "支付页异常率升高", createdAt: "今天 09:42" },
  { id: "rb-3", app: "admin-console", env: "预发", fromVersion: "rc-18", targetVersion: "rc-17", status: "已回滚", operator: "王工", reason: "菜单权限回归验证", createdAt: "昨天 18:30" },
  { id: "rb-4", app: "worker", env: "开发", fromVersion: "dev-42", targetVersion: "dev-40", status: "可回滚", operator: "系统", reason: "构建失败保留上一版本", createdAt: "昨天 16:12" },
];

const initialScheduleJobs: ScheduleJob[] = [
  { id: "sch-1", name: "每日数据备份", cron: "0 2 * * *", command: "backup:run --daily", enabled: true, nextRun: "02:00", lastRun: "今天 02:00", result: "成功" },
  { id: "sch-2", name: "证书续期检查", cron: "15 3 * * 1", command: "certbot renew --dry-run", enabled: true, nextRun: "周一 03:15", lastRun: "周一 03:15", result: "成功" },
  { id: "sch-3", name: "日志清理", cron: "30 1 * * 0", command: "logs:prune --days=30", enabled: false, nextRun: "停用", lastRun: "未运行", result: "未运行" },
  { id: "sch-4", name: "服务健康探测", cron: "*/10 * * * *", command: "health:check", enabled: true, nextRun: "每 10 分钟", lastRun: "10 分钟前", result: "失败" },
];

const initialAuditRecords: AuditRecord[] = auditRows.map((row) => ({
  id: row[6],
  time: row[0],
  ip: row[1],
  user: row[2],
  action: row[3],
  object: row[4],
  result: row[5] as "成功" | "失败",
  traceId: row[6],
  summary: `${row[2]} 对 ${row[4]} 执行 ${row[3]}，结果为 ${row[5]}`,
}));

const initialAuditExports: AuditExportRecord[] = [
  { id: "exp-1", name: "今日操作审计 CSV", format: "CSV", range: "今天 00:00 - 现在", status: "可下载", rows: 482, size: "318 KB", creator: "管理员", createdAt: "今天 10:24", expiresAt: "7 天后", traceId: "EXP-20260619-001" },
  { id: "exp-2", name: "失败操作 JSON", format: "JSON", range: "近 24 小时", status: "可下载", rows: 17, size: "42 KB", creator: "王工", createdAt: "今天 09:16", expiresAt: "6 天后", traceId: "EXP-20260619-002" },
  { id: "exp-3", name: "合规审计归档包", format: "ZIP", range: "近 30 天", status: "生成中", rows: 18642, size: "生成中", creator: "系统任务", createdAt: "今天 08:30", expiresAt: "永久归档", traceId: "EXP-20260619-003" },
  { id: "exp-4", name: "昨日配置变更 CSV", format: "CSV", range: "昨天", status: "失败", rows: 0, size: "-", creator: "管理员", createdAt: "昨天 18:33", expiresAt: "-", traceId: "EXP-20260618-017" },
];

const permissionOptions = ["主机读写", "网站发布", "数据库管理", "文件管理", "终端访问", "防火墙管理", "审计导出", "权限管理"];

const initialAclUsers: AclUser[] = [
  { id: "usr-1", name: "张工", email: "zhang@example.com", role: "管理员", enabled: true, mfa: "已启用", lastLogin: "今天 10:24" },
  { id: "usr-2", name: "李敏", email: "li@example.com", role: "发布经理", enabled: true, mfa: "已启用", lastLogin: "今天 09:52" },
  { id: "usr-3", name: "王工", email: "wang@example.com", role: "只读审计", enabled: true, mfa: "未启用", lastLogin: "昨天 18:33" },
  { id: "usr-4", name: "外包 CI", email: "ci@example.com", role: "发布机器人", enabled: false, mfa: "需重置", lastLogin: "7 天前" },
];

const initialAclRoles: AclRole[] = [
  { id: "role-1", name: "管理员", desc: "拥有全部控制台权限", permissions: permissionOptions },
  { id: "role-2", name: "发布经理", desc: "负责网站发布和部署回滚", permissions: ["主机读写", "网站发布", "文件管理", "审计导出"] },
  { id: "role-3", name: "只读审计", desc: "只查看日志与状态，不可变更", permissions: ["审计导出"] },
  { id: "role-4", name: "发布机器人", desc: "供 CI/CD 自动发布使用", permissions: ["网站发布", "文件管理"] },
];

const initialAclPolicies: AclPolicy[] = [
  { id: "pol-1", name: "主机读写", module: "主机", risk: "高", desc: "允许重启、备份、更新和修改主机配置。", roles: ["管理员", "发布经理"], lastUpdated: "今天 09:20" },
  { id: "pol-2", name: "网站发布", module: "网站", risk: "高", desc: "允许发布站点、启停站点和续期证书。", roles: ["管理员", "发布经理", "发布机器人"], lastUpdated: "今天 08:42" },
  { id: "pol-3", name: "数据库管理", module: "数据库", risk: "高", desc: "允许创建备份、恢复实例和查看慢查询明细。", roles: ["管理员"], lastUpdated: "昨天 22:15" },
  { id: "pol-4", name: "文件管理", module: "文件", risk: "中", desc: "允许上传、重命名、删除和恢复站点目录文件。", roles: ["管理员", "发布经理", "发布机器人"], lastUpdated: "昨天 18:10" },
  { id: "pol-5", name: "终端访问", module: "终端", risk: "高", desc: "允许连接主机终端并执行命令。", roles: ["管理员"], lastUpdated: "周一 11:06" },
  { id: "pol-6", name: "防火墙管理", module: "防火墙", risk: "高", desc: "允许新增、禁用和删除访问规则。", roles: ["管理员"], lastUpdated: "周一 10:44" },
  { id: "pol-7", name: "审计导出", module: "审计", risk: "中", desc: "允许导出审计日志和重新生成归档包。", roles: ["管理员", "发布经理", "只读审计"], lastUpdated: "昨天 16:01" },
  { id: "pol-8", name: "权限管理", module: "权限", risk: "高", desc: "允许变更用户、角色和权限项绑定。", roles: ["管理员"], lastUpdated: "今天 10:02" },
];

function hostPagePreset(page: PageKey) {
  if (page === "hosts-prod") {
    return { env: "生产", health: "全部", search: "", subtitle: "生产环境主机视图，默认筛选生产节点。" };
  }
  if (page === "hosts-alert") {
    return { env: "全部", health: "警告", search: "", subtitle: "健康告警视图，聚焦需要处理的主机。" };
  }
  return { env: "全部", health: "全部", search: "", subtitle: "统一查看各环境主机健康、资源负载、备份和系统更新状态。" };
}

function sitesPagePreset(page: PageKey) {
  if (page === "sites-cert") return { status: "全部", runtime: "全部", search: "", subtitle: "证书续期视图，优先展示即将过期的站点。" };
  if (page === "sites-runtime") return { status: "全部", runtime: "Node 20", search: "", subtitle: "运行时分组视图，按站点运行时快速筛选。" };
  return { status: page === "sites-running" ? "运行中" : "全部", runtime: "全部", search: "", subtitle: "管理域名、运行时、证书有效期和站点启停状态。" };
}

function filesPagePreset(page: PageKey) {
  if (page === "files-upload") return { path: "/var/www/html", type: "文件", search: "upload", subtitle: "上传队列视图，展示当前路径中的上传文件项。" };
  if (page === "files-trash") return { path: "/tmp", type: "全部", search: "old", subtitle: "回收站视图，模拟 7 天保留的可删除文件。" };
  return { path: "/var/www/html", type: "全部", search: "", subtitle: "模拟文件管理器，支持路径面包屑、进入文件夹、本地上传和重命名删除。" };
}

function terminalPagePreset(page: PageKey) {
  if (page === "terminal-snippets") return { panel: "snippets", subtitle: "常用命令视图，可一键填充到终端输入。" };
  if (page === "terminal-history") return { panel: "history", subtitle: "执行历史视图，展示今日命令记录并可复制会话。" };
  return { panel: "sessions", subtitle: "本地模拟 SSH 会话，命令输入会追加到终端输出。" };
}

function systemdPagePreset(page: PageKey) {
  if (page === "systemd-failed") return { status: "failed", search: "", mode: "list", subtitle: "Failed 服务视图，聚焦需要处理的异常服务。" };
  if (page === "systemd-logs") return { status: "全部", search: "", mode: "logs", subtitle: "服务日志视图，默认展开模拟 journal 输出。" };
  return { status: page === "systemd-active" ? "active" : "全部", search: "", mode: "list", subtitle: "查看服务 active/failed/inactive 状态，并在本地模拟启停、重启和处理失败服务。" };
}

function firewallPagePreset(page: PageKey) {
  if (page === "firewall-open") return { protocol: "全部", source: "0.0.0.0/0", search: "", subtitle: "开放端口视图，默认展示公网来源规则。" };
  if (page === "firewall-deny") return { protocol: "UDP", source: "全部", search: "", subtitle: "拦截记录视图，模拟查看被限制或停用的规则。" };
  return { protocol: "全部", source: "全部", search: "", subtitle: "本地维护规则列表，支持端口、协议、来源筛选和启用删除。" };
}

function deployPagePreset(page: PageKey) {
  if (page === "deploy-staging") return { env: "预发", mode: "list", subtitle: "预发环境视图，默认展示 rc 与验证发布任务。" };
  if (page === "deploy-rollbacks") return { env: "全部", mode: "rollbacks", subtitle: "回滚记录视图，聚焦可回滚基线、回滚进度和恢复原因。" };
  return { env: "生产", mode: "list", subtitle: "按环境查看发布任务，支持创建、完成、回滚、查看日志和重新部署。" };
}

function schedulePagePreset(page: PageKey) {
  if (page === "schedule-failed") return { state: "全部", search: "健康", mode: "list", subtitle: "失败任务视图，默认定位最近执行失败的自动化任务。" };
  if (page === "schedule-calendar") return { state: "全部", search: "", mode: "calendar", subtitle: "执行日历视图，按时间线展示今天的定时任务。" };
  return { state: page === "schedule-enabled" ? "已启用" : "全部", search: "", mode: "list", subtitle: "管理 cron 自动化，支持启停、立即执行、编辑和新增。" };
}

function auditPagePreset(page: PageKey) {
  if (page === "audit-failed") return { result: "失败", user: "全部", search: "", mode: "list", subtitle: "失败操作视图，默认筛选审计中的失败记录。" };
  if (page === "audit-export") return { result: "全部", user: "全部", search: "", mode: "exports", subtitle: "导出记录视图，模拟 CSV / JSON 导出历史。" };
  return { result: "全部", user: "全部", search: "", mode: "list", subtitle: "只读审计视图，支持关键字、用户和结果过滤。" };
}

function aclPagePreset(page: PageKey) {
  if (page === "acl-policies") return { tab: "policies" as const, subtitle: "权限项视图，按模块、风险级别和关联角色审查授权边界。" };
  if (page === "acl-roles") return { tab: "roles" as const, subtitle: "角色视图，管理不同角色的权限组合。" };
  return { tab: "users" as const, subtitle: "管理用户启用状态、MFA 和角色权限勾选。" };
}

function databasePagePreset(page: PageKey) {
  if (page === "databases-backups") return { type: "全部", status: "全部", host: "全部主机", search: "", mode: "backups", subtitle: "备份计划视图，聚焦备份成功率、最近任务和恢复演练。" };
  if (page === "databases-slow") return { type: "全部", status: "告警", host: "全部主机", search: "", mode: "slow", subtitle: "慢查询视图，默认筛选连接延迟或慢查询较多的实例。" };
  return { type: "全部", status: "全部", host: "全部主机", search: "", mode: "instances", subtitle: "集中管理和监控所有数据库实例的运行状态、备份与慢查询。" };
}

function settingsPagePreset(page: PageKey) {
  if (page === "settings-security") return "安全";
  if (page === "settings-proxy") return "代理";
  if (page === "settings-notice") return "通知";
  if (page === "settings-backup") return "备份";
  if (page === "settings-audit") return "审计";
  return "基础";
}

function settingsPageForTab(tab: string): PageKey {
  if (tab === "安全") return "settings-security";
  if (tab === "代理") return "settings-proxy";
  if (tab === "通知") return "settings-notice";
  if (tab === "备份") return "settings-backup";
  if (tab === "审计") return "settings-audit";
  return "settings-general";
}

function readPageFromHash(): PageKey {
  const key = window.location.hash.replace("#", "");
  return routePageKeys.has(key) ? key : "overview";
}

function App() {
  const [page, setPageState] = useState<PageKey>(readPageFromHash);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    const onHashChange = () => setPageState(readPageFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback<Notify>((message, tone = "success") => {
    setToast({ message, tone });
  }, []);

  const setPage = useCallback<SetPage>((next, nextToast) => {
    setPageState(next);
    if (nextToast) {
      setToast(nextToast);
    }
    if (window.location.hash !== `#${next}`) {
      window.location.hash = next;
    }
  }, []);

  return (
    <main className={`shot-canvas ${page === "mobile" ? "mobile-canvas" : ""}`}>
      {page === "mobile" ? (
        <MobileApp notify={notify} />
      ) : (
        <DesktopShell page={page} setPage={setPage} notify={notify} />
      )}
      {toast && <ActionToast toast={toast} />}
    </main>
  );
}

function DesktopShell({
  page,
  setPage,
  notify,
}: {
  page: PageKey;
  setPage: SetPage;
  notify: Notify;
}) {
  const activeModule = navPageFor(page);
  const whiteTop = !["overview", "overview-health", "overview-tasks", "overview-risks"].includes(page);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 773px)").matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 773px)");
    const syncSidebar = (event: MediaQueryListEvent | MediaQueryList) => {
      setSidebarCollapsed(event.matches);
    };

    syncSidebar(mediaQuery);
    mediaQuery.addEventListener("change", syncSidebar);
    return () => mediaQuery.removeEventListener("change", syncSidebar);
  }, []);

  return (
    <section className={`desktop-frame ${whiteTop ? "white-top" : "dark-top"} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        page={page}
        setPage={setPage}
        notify={notify}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      />
      <div className="desktop-main">
        <TopBar page={page} white={whiteTop} notify={notify} />
        {page === "overview" && <OverviewPage setPage={setPage} notify={notify} />}
        {page === "overview-health" && <OverviewHealthPage notify={notify} />}
        {page === "overview-tasks" && <OverviewTasksPage notify={notify} />}
        {page === "overview-risks" && <OverviewRisksPage notify={notify} />}
        {activeModule === "hosts" && <HostsPage key={page} page={page} notify={notify} />}
        {activeModule === "sites" && <SitesPage key={page} page={page} notify={notify} />}
        {activeModule === "databases" && <DatabasesPage key={page} page={page} notify={notify} />}
        {activeModule === "files" && <FilesPage key={page} page={page} notify={notify} />}
        {activeModule === "terminal" && <TerminalPage key={page} page={page} notify={notify} />}
        {activeModule === "systemd" && <SystemdPage key={page} page={page} notify={notify} />}
        {activeModule === "firewall" && <FirewallPage key={page} page={page} notify={notify} />}
        {activeModule === "deploy" && <DeployPage key={page} page={page} notify={notify} />}
        {activeModule === "schedule" && <SchedulePage key={page} page={page} notify={notify} />}
        {activeModule === "audit" && <AuditPage key={page} page={page} notify={notify} />}
        {activeModule === "acl" && <AclPage key={page} page={page} notify={notify} />}
        {activeModule === "settings" && <SettingsPage key={page} page={page} setPage={setPage} notify={notify} />}
      </div>
      {activeModule === "overview" && <DesktopFooter />}
    </section>
  );
}

function Sidebar({
  page,
  setPage,
  notify,
  collapsed,
  onToggleCollapsed,
}: {
  page: PageKey;
  setPage: SetPage;
  notify: Notify;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [openGroups, setOpenGroups] = useState<Partial<Record<NavItem["key"], boolean>>>(() => ({
    overview: true,
  }));
  const activeChild = activeChildForPage(page);
  const activeNavPage = navPageFor(page);

  const toggleGroup = (key: NavItem["key"], label: string) => {
    const currentOpen = openGroups[key] ?? key === activeNavPage;
    const nextOpen = !currentOpen;
    setOpenGroups((current) => ({ ...current, [key]: nextOpen }));
    notify(`${label} 下拉项目已${nextOpen ? "展开" : "收起"}`, "info");
  };

  const openNavPage = (key: NavItem["key"], label: string) => {
    setPage(key, { message: `已进入${label}`, tone: "info" });
    setOpenGroups((current) => ({ ...current, [key]: true }));
  };

  const openNavChild = (parent: NavItem, child: NavChild) => {
    setPage(child.page ?? child.id, { message: `已打开${parent.label} / ${child.label}`, tone: "info" });
    setOpenGroups((current) => ({ ...current, [parent.key]: true }));
  };

  return (
    <aside className={`sidebar-mock ${collapsed ? "collapsed" : ""}`}>
      <div className="side-brand">
        <div className="brand-gem" />
        <strong>StackPilot</strong>
      </div>
      <nav className="side-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeNavPage;
          const exactActive = item.key === page;
          const hasActiveChild = active && !exactActive && item.children.some((child) => child.id === activeChild);
          const open = (openGroups[item.key] ?? active) && !collapsed;
          const parentCurrent = exactActive || (!open && hasActiveChild);
          const activeChildLabel = item.children.find((child) => child.id === activeChild)?.label;
          return (
            <section
              key={item.key}
              className={[
                "side-nav-group",
                active ? "active" : "",
                exactActive ? "exact-active" : "",
                hasActiveChild ? "has-active-child" : "",
                open ? "open" : "",
              ].filter(Boolean).join(" ")}
            >
              <div className="side-nav-row">
                <button
                  className="side-main-button"
                  type="button"
                  onClick={() => openNavPage(item.key, item.label)}
                  aria-current={parentCurrent ? "page" : undefined}
                  aria-label={parentCurrent && activeChildLabel ? `${item.label}，当前页面：${activeChildLabel}` : undefined}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  {item.badge && <b>{item.badge}</b>}
                </button>
                {!collapsed && (
                  <button
                    className="side-toggle-button"
                    type="button"
                    onClick={() => toggleGroup(item.key, item.label)}
                    aria-label={`${open ? "收起" : "展开"}${item.label}下拉项目`}
                    aria-expanded={open}
                    aria-controls={`side-submenu-${item.key}`}
                  >
                    <ChevronDown className="side-chevron" size={13} />
                  </button>
                )}
              </div>
              <div
                className="side-submenu"
                id={`side-submenu-${item.key}`}
                aria-hidden={!open}
                style={{ "--side-submenu-open-height": `${item.children.length * 34 + 12}px` } as CSSProperties}
              >
                {item.children.map((child) => (
                  <button
                    key={child.id}
                    className={activeChild === child.id ? "is-child-active" : ""}
                    type="button"
                    tabIndex={open ? 0 : -1}
                    aria-current={open && activeChild === child.id ? "page" : undefined}
                    aria-label={`${child.label}${child.meta ? `，${child.meta}` : child.badge ? `，${child.badge}` : ""}`}
                    onClick={() => openNavChild(item, child)}
                  >
                    <i />
                    <span>{child.label}</span>
                    <em>{child.meta}</em>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </nav>
      <div className="host-groups" aria-hidden={collapsed}>
        <div>
          <span>主机分组</span>
          <Plus size={13} />
        </div>
        {groupItems.map(([name, count, tone]) => (
          <p key={name}>
            <i className={tone} />
            <span>{name}</span>
            <em>{count}</em>
          </p>
        ))}
      </div>
      <button
        className="collapse-side"
        type="button"
        onClick={() => {
          onToggleCollapsed();
          notify(collapsed ? "侧栏已展开" : "侧栏已收起", "info");
        }}
        aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
      >
        <ChevronLeft className="collapse-icon collapse-icon-close" size={15} />
        <Menu className="collapse-icon collapse-icon-open" size={15} />
        <span>{collapsed ? "展开侧栏" : "收起侧栏"}</span>
      </button>
    </aside>
  );
}

function TopBar({ page, white, notify }: { page: PageKey; white: boolean; notify: Notify }) {
  const [query, setQuery] = useState("");
  const meta = resolvePageMeta(page);
  const activeModule = navPageFor(page);
  const isSettings = activeModule === "settings";

  return (
    <header className={`topbar-mock ${white ? "white" : ""}`}>
      {page !== "overview" && (
        <div className="breadcrumb-title">
          {!isSettings && <Menu size={16} />}
          <span>{meta.breadcrumb}</span>
          <em>/</em>
          <strong>{meta.title}</strong>
        </div>
      )}
      <label className="mock-search">
        <Search size={13} />
        <input
          value={query}
          placeholder={meta.search}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && query.trim()) {
              notify(`已搜索：${query.trim()}`, "info");
            }
          }}
        />
        <kbd>⌘K</kbd>
      </label>
      {page !== "overview" && <div className="top-spacer" />}
      <div className="top-actions">
        {isSettings && <StatusDot text="面板运行正常" />}
        <span className="notification-wrap">
          <button type="button" className="icon-action" onClick={() => notify("暂无新的未读通知", "info")} aria-label="通知">
            <Bell size={18} />
          </button>
          <span className="red-badge">{page === "overview" ? "3" : isSettings ? "5" : "2"}</span>
        </span>
        {page !== "overview" && (
          <button type="button" className="icon-action" onClick={() => notify("已打开当前页操作记录", "info")} aria-label="操作记录">
            <FileText size={17} />
          </button>
        )}
        <button type="button" className="icon-action" onClick={() => notify("帮助中心已准备好", "info")} aria-label="帮助">
          <CircleHelp size={17} />
        </button>
        <button type="button" className="user-menu-button" onClick={() => notify("已打开用户菜单", "info")} aria-label="用户菜单">
          <span className="avatar-mini" aria-hidden="true">
            {page === "overview" ? <UserRound size={18} /> : "张"}
          </span>
          <strong>{page === "overview" ? "admin" : page === "databases" ? "张工" : "管理员"}</strong>
          <ChevronDown size={13} />
        </button>
      </div>
    </header>
  );
}

function OverviewPage({ setPage, notify }: { setPage: SetPage; notify: Notify }) {
  const [overview, setOverview] = useState<OverviewSummaryPayload>(() => initialOverviewSummary());
  const [loading, setLoading] = useState(true);
  const [taskTab, setTaskTab] = useState("最近任务");
  const [resourceTab, setResourceTab] = useState("今天");
  const clusterNames = overview.nodes.map((node) => node.name);
  const clusterIndex = Math.max(clusterNames.indexOf(overview.cluster.current), 0);
  const nextCluster = clusterNames[(clusterIndex + 1) % clusterNames.length] ?? "panel-sg-01";
  const pendingRiskCount = overview.risks.filter((risk) => risk.status === "待处理").length;

  useEffect(() => {
    const controller = new AbortController();
    fetchOverview(controller.signal)
      .then((payload) => {
        setOverview(payload);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        reportApiError(error, notify, "首页总览后端加载失败");
      });
    return () => controller.abort();
  }, [notify]);

  const reloadOverview = async (request: () => Promise<OverviewSummaryPayload>, success?: string, tone: ToastTone = "success") => {
    try {
      const payload = await request();
      setOverview(payload);
      if (success) notify(success, tone);
    } catch (error) {
      reportApiError(error, notify, "首页总览后端请求失败");
    }
  };

  const resolveOverviewRisk = async (risk: OverviewRiskRecord) => {
    try {
      await patchOverviewRisk(risk.id, { status: "已处理" });
      const payload = await fetchOverview();
      setOverview(payload);
      notify(`已处理风险：${risk.title}`);
    } catch (error) {
      reportApiError(error, notify, "风险处理失败");
    }
  };

  return (
    <div className="overview-page">
      <div className="cluster-bar">
        <button
          type="button"
          className="cluster-select"
          onClick={() => {
            void reloadOverview(() => switchOverviewCluster(nextCluster), `已切换到 ${nextCluster}`, "info");
          }}
        >
          <StatusLight tone={overview.cluster.health === "健康" ? "green" : "orange"} />
          {overview.cluster.current}
          <ChevronDown size={14} />
        </button>
        <span>集群状态：<b className={overview.cluster.health === "健康" ? "green-text" : "orange-text"}>{overview.cluster.health}</b></span>
        <span>延迟：<b className={overview.cluster.health === "健康" ? "green-text" : "orange-text"}>{overview.cluster.latency}</b></span>
        <span>版本：{overview.cluster.version}</span>
        <span>运行时间：{overview.cluster.uptime}</span>
        <span>最后备份：{overview.cluster.lastBackup} <CheckCircle2 size={13} /></span>
        <span>待更新：<b className={overview.cluster.pendingUpdates ? "red-text" : "green-text"}>{overview.cluster.pendingUpdates}</b></span>
        <div className="cluster-actions">
          <button
            className="primary small"
            type="button"
            onClick={async () => {
              try {
                await createOverviewNode();
                const payload = await fetchOverview();
                setOverview(payload);
                notify("新增主机已写入后端", "info");
              } catch (error) {
                reportApiError(error, notify, "新增主机失败");
              }
            }}
          >
            <Plus size={14} /> 新增主机
          </button>
          <button
            className="ghost small"
            type="button"
            onClick={() => {
              void reloadOverview(refreshOverview, "集群数据已刷新");
            }}
          >
            <RefreshCw size={14} /> 刷新
          </button>
          <button
            className="ghost small"
            type="button"
            onClick={async () => {
              try {
                const payload = await checkOverviewUpdates();
                setOverview(payload.overview);
                notify(payload.message, payload.tone ?? "warning");
              } catch (error) {
                reportApiError(error, notify, "检查更新失败");
              }
            }}
          >
            <RefreshCw size={14} /> 检查更新
          </button>
          <button className="warning small" type="button" onClick={() => setPage("overview-risks", { message: "已打开风险中心", tone: "warning" })}>风险中心 <b>{pendingRiskCount}</b></button>
        </div>
      </div>
      {loading && <div className="overview-inline-detail"><StatusLight tone="blue" /> 正在从后端加载首页总览...</div>}
      <section className="metric-row">
        {overview.metrics.map((item) => (
          <MetricCard key={item.label} {...item} icon={overviewMetricIcons[item.icon]} />
        ))}
      </section>
      <section className="overview-grid">
        <div className="left-stack">
          <PanelCard title="集群状态" action="查看全部" onAction={() => setPage("overview-health", { message: "已打开集群状态", tone: "info" })}>
            <HostTable nodes={overview.nodes} notify={notify} />
          </PanelCard>
          <div className="two-panels">
            <PanelCard title="任务流" tabs={["最近任务", `队列中的任务 (${overview.tasks.filter((task) => ["运行中", "等待"].includes(task.status)).length})`]} activeTab={taskTab} onTabChange={setTaskTab} action="查看全部" onAction={() => setPage("overview-tasks", { message: "已打开任务流", tone: "info" })}>
              <TaskTable tasks={overview.tasks} queued={taskTab !== "最近任务"} />
            </PanelCard>
            <PanelCard title="最近审计" action="查看全部" onAction={() => notify("已打开审计日志列表", "info")}>
              <AuditTable rows={overview.audits} />
            </PanelCard>
          </div>
        </div>
        <div className="right-stack">
          <PanelCard title="风险中心" action="查看详情" onAction={() => setPage("overview-risks", { message: "已打开风险中心", tone: "warning" })}>
            <RiskList risks={overview.risks} notify={notify} onResolve={resolveOverviewRisk} />
          </PanelCard>
          <PanelCard title="快捷操作">
            <QuickActions setPage={setPage} notify={notify} />
          </PanelCard>
          <PanelCard title="资源概览" tabs={["今天", "近7天", "近30天"]} activeTab={resourceTab} onTabChange={setResourceTab}>
            <ResourceOverview resources={overview.resources[resourceTab] ?? []} />
          </PanelCard>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  delta,
  icon: Icon,
  tone,
  line,
}: {
  label: string;
  value: string;
  suffix: string;
  delta: string;
  icon: LucideIcon;
  tone: string;
  line: number[];
}) {
  return (
    <article className="metric-card">
      <Icon className={tone} size={37} />
      <div>
        <span>{label}</span>
        <strong>{value}<em>{suffix}</em></strong>
        <p className={tone === "red" ? "orange-text" : "green-text"}>↑ {delta}</p>
      </div>
      <Sparkline values={line} tone={tone} />
    </article>
  );
}

function HostTable({ nodes, notify }: { nodes: OverviewNode[]; notify: Notify }) {
  const [selectedHost, setSelectedHost] = useState<string | null>(null);

  return (
    <>
      <table className="mini-table host-table">
        <thead>
          <tr>
            <th>主机名</th>
            <th>IP 地址</th>
            <th>CPU</th>
            <th>内存</th>
            <th>磁盘</th>
            <th>服务健康</th>
            <th>备份状态</th>
            <th>更新状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((host) => (
            <tr className={selectedHost === host.name ? "is-selected" : ""} key={host.id}>
              <td><StatusLight tone={host.status === "警告" ? "orange" : host.status === "维护" ? "gray" : "green"} /> {host.name}</td>
              <td>{host.ip}</td>
              <td><Bar value={host.cpu} tone={host.status === "警告" ? "orange" : "green"} /></td>
              <td><Bar value={host.memory} tone={host.status === "警告" ? "red" : "green"} /></td>
              <td><Bar value={host.disk} tone={host.status === "警告" ? "red" : "green"} /></td>
              <td><StatusLight tone={host.status === "警告" ? "orange" : host.status === "维护" ? "gray" : "green"} /> {host.status}</td>
              <td><StatusLight tone="green" /> {host.backup}</td>
              <td className={host.update === "已是最新" ? "" : "orange-text"}>{host.update}</td>
              <td>
                <button
                  className="icon-action inline"
                  type="button"
                  onClick={() => {
                    setSelectedHost(host.name);
                    notify(`${host.name} 详情已选中`, "info");
                  }}
                  aria-label={`${host.name} 更多操作`}
                >
                  <MoreVertical size={17} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selectedHost && <div className="overview-inline-detail"><StatusLight tone="blue" /> {selectedHost}：CPU、内存、磁盘与服务列表已准备查看。</div>}
    </>
  );
}

function TaskTable({ tasks, queued }: { tasks: OverviewTaskRecord[]; queued?: boolean }) {
  const rows = queued ? tasks.filter((row) => ["运行中", "等待"].includes(row.status)) : tasks.slice(0, 6);
  return (
    <div className="task-flow">
      {rows.map((row) => (
        <div key={row.id}>
          <StatusLight tone={taskTone(row.status)} />
          <span className="task-icon"><Code2 size={15} /></span>
          <strong>{row.type}</strong>
          <p>{row.title}</p>
          <b>{row.status}</b>
          <em>{row.queuedAt}</em>
          <small>{row.duration}</small>
        </div>
      ))}
      {rows.length === 0 && <div><StatusLight tone="gray" /><p>暂无任务</p></div>}
    </div>
  );
}

function AuditTable({ rows }: { rows: OverviewAuditRow[] }) {
  return (
    <table className="mini-table audit-table">
      <tbody>
        {rows.map((row) => (
          <tr key={row[0] + row[6]}>
            <td>{row[0]}</td>
            <td>{row[1]}</td>
            <td>{row[2]}</td>
            <td>{row[3]}</td>
            <td>{row[4]}</td>
            <td><span className={row[5] === "失败" ? "pill red" : "pill green"}>{row[5]}</span></td>
            <td>{row[6]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RiskList({ risks, onResolve }: { risks: OverviewRiskRecord[]; notify: Notify; onResolve: (risk: OverviewRiskRecord) => void }) {
  return (
    <div className="risk-list">
      {risks.map((row) => (
        <div key={row.id} className={row.status === "已处理" ? "is-resolved" : ""}>
          <KeyRound size={17} />
          <span>{row.title}</span>
          <b>{row.target}</b>
          <em className={row.level === "高危" ? "red-text" : "orange-text"}>{row.status === "待处理" ? row.level : row.status}</em>
          <button
            type="button"
            disabled={row.status === "已处理"}
            onClick={() => {
              onResolve(row);
            }}
          >
            {row.status === "已处理" ? "完成" : "立即处理"}
          </button>
        </div>
      ))}
    </div>
  );
}

function QuickActions({ setPage, notify }: { setPage: SetPage; notify: Notify }) {
  const actions = [
    [Globe2, "添加网站", () => notify("添加网站向导已打开", "info")],
    [TerminalSquare, "开启终端", () => notify("终端会话已准备就绪", "info")],
    [Database, "创建数据库", () => setPage("databases")],
    [Clock3, "新建定时任务", () => notify("定时任务模板已创建", "info")],
  ] as const;
  return (
    <div className="quick-grid">
      {actions.map(([Icon, label, onClick]) => (
        <button key={label} type="button" onClick={onClick}>
          <Icon size={28} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function ResourceOverview({ resources }: { resources: OverviewResourceRecord[] }) {
  return (
    <div className="resource-grid">
      {resources.map((resource) => (
        <article key={resource.label}>
          <div><span>{resource.label}</span><em>{resource.delta}</em></div>
          <strong>{resource.value}</strong>
          <Sparkline values={resource.values} tone="blue" />
        </article>
      ))}
    </div>
  );
}

function OverviewHealthPage({ notify }: { notify: Notify }) {
  const [nodes, setNodes] = useState(initialOverviewNodes);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [envFilter, setEnvFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [selected, setSelected] = useState<OverviewNode | null>(initialOverviewNodes[0]);
  const [lastRefresh, setLastRefresh] = useState("刚刚");
  const filteredNodes = nodes.filter((node) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || node.name.toLowerCase().includes(query) || node.ip.includes(query) || node.services.join(" ").toLowerCase().includes(query);
    const matchEnv = envFilter === "全部" || node.env === envFilter;
    const matchStatus = statusFilter === "全部" || node.status === statusFilter;
    return matchSearch && matchEnv && matchStatus;
  });
  const warningCount = nodes.filter((node) => node.status !== "健康").length;
  const updateCount = nodes.filter((node) => node.update !== "已是最新").length;

  useEffect(() => {
    const controller = new AbortController();
    fetchOverviewHealth(controller.signal)
      .then((payload) => {
        setNodes(payload.nodes);
        setLastRefresh(payload.lastRefresh);
        setSelected((current) => current ? payload.nodes.find((node) => node.id === current.id) ?? payload.nodes[0] ?? null : payload.nodes[0] ?? null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        reportApiError(error, notify, "集群状态后端加载失败");
      });
    return () => controller.abort();
  }, [notify]);

  const applyNode = (updatedNode: OverviewNode) => {
    setNodes((current) => current.map((node) => node.id === updatedNode.id ? updatedNode : node));
    setSelected((current) => current?.id === updatedNode.id ? updatedNode : current);
  };

  const syncHealth = (nextNodes: OverviewNode[], nextRefresh = lastRefresh) => {
    setNodes(nextNodes);
    setLastRefresh(nextRefresh);
    setSelected((current) => current ? nextNodes.find((node) => node.id === current.id) ?? nextNodes[0] ?? null : nextNodes[0] ?? null);
  };

  const createNodeFromApi = async () => {
    try {
      const payload = await createOverviewNode();
      syncHealth(payload.nodes, payload.lastRefresh);
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "新增节点失败");
    }
  };

  const refreshHealthFromApi = async () => {
    try {
      const payload = await refreshOverviewHealth();
      syncHealth(payload.nodes, payload.lastRefresh);
      notify("集群状态已刷新");
    } catch (error) {
      reportApiError(error, notify, "刷新集群状态失败");
    }
  };

  const patchNodeFromApi = async (id: string, patch: Partial<OverviewNode>, fallbackMessage: string) => {
    try {
      const payload = await patchOverviewNode(id, patch);
      applyNode(payload.node);
      notify(payload.message ?? fallbackMessage);
    } catch (error) {
      reportApiError(error, notify, fallbackMessage);
    }
  };

  const restartNodeFromApi = async (row: OverviewNode) => {
    try {
      const payload = await restartOverviewNode(row.id);
      const updated = { ...row, uptime: "刚刚重启" };
      applyNode(updated);
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "重启节点失败");
    }
  };

  return (
    <ModulePageShell
      title="集群状态"
      subtitle={`统一查看首页集群节点、延迟、备份和服务健康。最近刷新：${loading ? "加载中" : lastRefresh}`}
      page="overview-health"
      actions={<><button className="ghost" type="button" onClick={createNodeFromApi}><Plus size={14} /> 新增节点</button><button className="primary" type="button" onClick={refreshHealthFromApi}><RefreshCw size={14} /> 刷新状态</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索节点、IP 或服务" onChange={setSearch} /><FieldSelect label="环境" value={envFilter} options={["全部", "生产", "预发", "开发"]} onChange={setEnvFilter} /><FieldSelect label="状态" value={statusFilter} options={["全部", "健康", "警告", "维护"]} onChange={setStatusFilter} /></>}
      metrics={<><MetricTile icon={Server} label="节点总数" value={`${nodes.length}`} tone="blue" /><MetricTile icon={Activity} label="异常节点" value={`${warningCount}`} tone={warningCount ? "orange" : "green"} /><MetricTile icon={RefreshCw} label="待更新" value={`${updateCount}`} tone={updateCount ? "orange" : "green"} /></>}
      side={selected && (
        <DetailDrawer title={selected.name} subtitle={`${selected.ip} · ${selected.env}`} onClose={() => setSelected(null)}>
          <div className="detail-kv">
            <p><span>状态</span><b><StatusLight tone={selected.status === "健康" ? "green" : selected.status === "警告" ? "orange" : "gray"} /> {selected.status}</b></p>
            <p><span>延迟</span><b>{selected.latency}</b></p>
            <p><span>版本</span><b>{selected.version}</b></p>
            <p><span>运行时间</span><b>{selected.uptime}</b></p>
            <p><span>最后备份</span><b>{selected.backup}</b></p>
            <p><span>负责人</span><b>{selected.owner}</b></p>
          </div>
          <div className="resource-bars">
            <p><span>CPU</span><Bar value={selected.cpu} tone={selected.status === "警告" ? "orange" : "green"} /></p>
            <p><span>内存</span><Bar value={selected.memory} tone={selected.status === "警告" ? "red" : "green"} /></p>
            <p><span>磁盘</span><Bar value={selected.disk} tone={selected.status === "警告" ? "red" : "green"} /></p>
          </div>
          <div className="drawer-list">
            <strong>服务列表</strong>
            {selected.services.map((service) => <p key={service}><StatusLight tone="green" /> {service}<span>active</span></p>)}
          </div>
        </DetailDrawer>
      )}
    >
      <DataTable
        columns={[
          { key: "name", label: "节点", width: "170px", render: (row) => <><StatusLight tone={row.status === "健康" ? "green" : row.status === "警告" ? "orange" : "gray"} /> <b className="blue-text">{row.name}</b></> },
          { key: "ip", label: "IP", width: "118px", render: (row) => row.ip },
          { key: "env", label: "环境", width: "78px", render: (row) => row.env },
          { key: "latency", label: "延迟", width: "78px", render: (row) => row.latency },
          { key: "cpu", label: "CPU", width: "110px", render: (row) => <Bar value={row.cpu} tone={row.status === "警告" ? "orange" : "green"} /> },
          { key: "memory", label: "内存", width: "110px", render: (row) => <Bar value={row.memory} tone={row.status === "警告" ? "red" : "green"} /> },
          { key: "backup", label: "备份", width: "118px", render: (row) => row.backup },
          { key: "update", label: "更新", width: "110px", render: (row) => <span className={row.update === "已是最新" ? "green-text" : "orange-text"}>{row.update}</span> },
          { key: "actions", label: "操作", width: "190px", render: (row) => (
            <div className="table-actions">
              <button type="button" onClick={() => setSelected(row)}>详情</button>
              <button type="button" onClick={() => patchNodeFromApi(row.id, { status: "健康", update: "已是最新", latency: row.latency === "离线" ? "44ms" : row.latency }, `${row.name} 已执行修复`)}>修复</button>
              <button type="button" onClick={() => restartNodeFromApi(row)}>重启</button>
            </div>
          ) },
        ]}
        rows={filteredNodes}
        emptyText="没有匹配的集群节点"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function OverviewTasksPage({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState(initialOverviewTasks);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("全部");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OverviewTaskRecord | null>(initialOverviewTasks[2]);
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || row.title.toLowerCase().includes(query) || row.target.toLowerCase().includes(query) || row.operator.toLowerCase().includes(query);
    const matchTab = tab === "全部" || (tab === "队列中" ? ["运行中", "等待"].includes(row.status) : row.status === tab);
    return matchSearch && matchTab;
  });
  const queueCount = rows.filter((row) => ["运行中", "等待"].includes(row.status)).length;
  const failedCount = rows.filter((row) => row.status === "失败").length;

  useEffect(() => {
    const controller = new AbortController();
    fetchOverviewTasks(controller.signal)
      .then((payload) => {
        setRows(payload.tasks);
        setSelected((current) => current ? payload.tasks.find((row) => row.id === current.id) ?? payload.tasks[2] ?? payload.tasks[0] ?? null : payload.tasks[2] ?? payload.tasks[0] ?? null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        reportApiError(error, notify, "任务流后端加载失败");
      });
    return () => controller.abort();
  }, [notify]);

  const applyTask = (task: OverviewTaskRecord) => {
    setRows((current) => current.map((row) => row.id === task.id ? task : row));
    setSelected((current) => current?.id === task.id ? task : current);
  };

  const createTaskFromApi = async () => {
    try {
      const payload = await createOverviewTask();
      setRows(payload.tasks);
      setSelected(payload.tasks[0] ?? null);
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "创建任务失败");
    }
  };

  const exportTasksFromApi = async () => {
    try {
      const payload = await exportOverviewTasks();
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "导出任务流失败");
    }
  };

  const patchTask = async (id: string, patch: Partial<OverviewTaskRecord>, message: string, tone: ToastTone = "success") => {
    try {
      const payload = await patchOverviewTask(id, patch);
      applyTask(payload.task);
      notify(payload.message ?? message, tone);
    } catch (error) {
      reportApiError(error, notify, message);
    }
  };

  return (
    <ModulePageShell
      title="任务流"
      subtitle={loading ? "正在从后端加载任务流。" : "集中处理首页总览中的最近任务、排队任务和失败任务。"}
      page="overview-tasks"
      actions={<><button className="ghost" type="button" onClick={exportTasksFromApi}><Download size={14} /> 导出</button><button className="primary" type="button" onClick={createTaskFromApi}><Plus size={14} /> 新建任务</button></>}
      filters={<><div className="deploy-tabs">{["全部", "队列中", "成功", "失败", "已取消"].map((item) => <button key={item} className={tab === item ? "active" : ""} type="button" onClick={() => setTab(item)}>{item}</button>)}</div><ModuleSearch value={search} placeholder="搜索任务、目标或操作人" onChange={setSearch} /></>}
      metrics={<><MetricTile icon={CalendarDays} label="任务总数" value={`${rows.length}`} tone="blue" /><MetricTile icon={Clock3} label="队列中" value={`${queueCount}`} tone={queueCount ? "orange" : "green"} /><MetricTile icon={Bell} label="失败任务" value={`${failedCount}`} tone={failedCount ? "red" : "green"} /></>}
      side={selected && (
        <DetailDrawer title={selected.title} subtitle={`${selected.type} · ${selected.target}`} onClose={() => setSelected(null)}>
          <div className="detail-kv">
            <p><span>状态</span><b><StatusLight tone={taskTone(selected.status)} /> {selected.status}</b></p>
            <p><span>优先级</span><b>{selected.priority}</b></p>
            <p><span>操作人</span><b>{selected.operator}</b></p>
            <p><span>排队时间</span><b>{selected.queuedAt}</b></p>
            <p><span>耗时</span><b>{selected.duration}</b></p>
          </div>
          <div className="overview-event-log">
            <strong>执行日志</strong>
            {selected.logs.map((log, index) => <p key={log}><span>{index + 1}</span>{log}</p>)}
          </div>
        </DetailDrawer>
      )}
    >
      <DataTable
        columns={[
          { key: "type", label: "类型", width: "82px", render: (row) => <span className="pill blue">{row.type}</span> },
          { key: "title", label: "任务", width: "240px", render: (row) => <b>{row.title}</b> },
          { key: "target", label: "目标", width: "150px", render: (row) => row.target },
          { key: "status", label: "状态", width: "92px", render: (row) => <><StatusLight tone={taskTone(row.status)} /> {row.status}</> },
          { key: "priority", label: "优先级", width: "78px", render: (row) => row.priority },
          { key: "operator", label: "操作人", width: "86px", render: (row) => row.operator },
          { key: "queuedAt", label: "时间", width: "105px", render: (row) => row.queuedAt },
          { key: "duration", label: "耗时", width: "100px", render: (row) => row.duration },
          { key: "actions", label: "操作", width: "196px", render: (row) => (
            <div className="table-actions">
              <button type="button" onClick={() => setSelected(row)}>日志</button>
              <button type="button" onClick={() => void patchTask(row.id, { status: "成功", duration: row.duration === "运行中" ? "1分02秒" : row.duration, logs: [...row.logs, "人工标记完成"] }, `${row.title} 已完成`)}>完成</button>
              <button type="button" onClick={() => void patchTask(row.id, { status: row.status === "已取消" ? "运行中" : "已取消", logs: [...row.logs, row.status === "已取消" ? "重新进入运行队列" : "任务已取消"] }, row.status === "已取消" ? `${row.title} 已重新运行` : `${row.title} 已取消`, "info")}>{row.status === "已取消" ? "重跑" : "取消"}</button>
            </div>
          ) },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的任务"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function OverviewRisksPage({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState(initialOverviewRisks);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("全部");
  const [stateFilter, setStateFilter] = useState("全部");
  const [selected, setSelected] = useState<OverviewRiskRecord | null>(initialOverviewRisks[0]);
  const [scannedAt, setScannedAt] = useState("刚刚");
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || row.title.toLowerCase().includes(query) || row.target.toLowerCase().includes(query) || row.owner.toLowerCase().includes(query) || row.traceId.toLowerCase().includes(query);
    const matchLevel = levelFilter === "全部" || row.level === levelFilter;
    const matchState = stateFilter === "全部" || row.status === stateFilter;
    return matchSearch && matchLevel && matchState;
  });
  const openCount = rows.filter((row) => row.status === "待处理").length;
  const highCount = rows.filter((row) => row.level === "高危" && row.status === "待处理").length;
  const postponedCount = rows.filter((row) => row.status === "已暂缓").length;

  useEffect(() => {
    const controller = new AbortController();
    fetchOverviewRisks(controller.signal)
      .then((payload) => {
        setRows(payload.risks);
        setScannedAt(payload.scannedAt ?? "刚刚");
        setSelected((current) => current ? payload.risks.find((row) => row.id === current.id) ?? payload.risks[0] ?? null : payload.risks[0] ?? null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false);
        reportApiError(error, notify, "风险中心后端加载失败");
      });
    return () => controller.abort();
  }, [notify]);

  const applyRisk = (risk: OverviewRiskRecord) => {
    setRows((current) => current.map((row) => row.id === risk.id ? risk : row));
    setSelected((current) => current?.id === risk.id ? risk : current);
  };

  const patchRisk = async (id: string, patch: Partial<OverviewRiskRecord>, message: string, tone: ToastTone = "success") => {
    try {
      const payload = await patchOverviewRisk(id, patch);
      applyRisk(payload.risk);
      notify(payload.message ?? message, tone);
    } catch (error) {
      reportApiError(error, notify, message);
    }
  };

  const scanRisksFromApi = async () => {
    try {
      const payload = await scanOverviewRisks();
      setRows(payload.risks);
      setScannedAt(payload.scannedAt ?? currentClock());
      setSelected((current) => current ? payload.risks.find((row) => row.id === current.id) ?? payload.risks[0] ?? null : payload.risks[0] ?? null);
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "重新扫描失败");
    }
  };

  const exportRisksFromApi = async () => {
    try {
      const payload = await exportOverviewRisks();
      notify(payload.message, payload.tone ?? "info");
    } catch (error) {
      reportApiError(error, notify, "导出风险报告失败");
    }
  };

  return (
    <ModulePageShell
      title="风险中心"
      subtitle={loading ? "正在从后端加载风险中心。" : `集中处理首页总览暴露的安全、证书和服务健康风险。最近扫描：${scannedAt}`}
      page="overview-risks"
      actions={<><button className="ghost" type="button" onClick={exportRisksFromApi}><Download size={14} /> 导出报告</button><button className="primary" type="button" onClick={scanRisksFromApi}><RefreshCw size={14} /> 重新扫描</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索风险、目标或 trace id" onChange={setSearch} /><FieldSelect label="等级" value={levelFilter} options={["全部", "高危", "中危", "低危"]} onChange={setLevelFilter} /><FieldSelect label="状态" value={stateFilter} options={["全部", "待处理", "已处理", "已暂缓"]} onChange={setStateFilter} /></>}
      metrics={<><MetricTile icon={Shield} label="待处理风险" value={`${openCount}`} tone={openCount ? "orange" : "green"} /><MetricTile icon={KeyRound} label="高危风险" value={`${highCount}`} tone={highCount ? "red" : "green"} /><MetricTile icon={Clock3} label="暂缓项" value={`${postponedCount}`} tone="blue" /></>}
      side={selected && (
        <DetailDrawer title={selected.title} subtitle={selected.traceId} onClose={() => setSelected(null)}>
          <div className="detail-kv">
            <p><span>等级</span><b><StatusLight tone={riskTone(selected.level)} /> {selected.level}</b></p>
            <p><span>状态</span><b>{selected.status}</b></p>
            <p><span>目标</span><b>{selected.target}</b></p>
            <p><span>负责人</span><b>{selected.owner}</b></p>
            <p><span>发现时间</span><b>{selected.detected}</b></p>
            <p><span>影响</span><b>{selected.impact}</b></p>
          </div>
          <div className="overview-risk-note">
            <strong>处理建议</strong>
            <p>{selected.suggestion}</p>
          </div>
        </DetailDrawer>
      )}
    >
      <DataTable
        columns={[
          { key: "title", label: "风险", width: "240px", render: (row) => <b>{row.title}</b> },
          { key: "level", label: "等级", width: "82px", render: (row) => <span className={`pill ${row.level === "高危" ? "red" : row.level === "中危" ? "blue" : "green"}`}>{row.level}</span> },
          { key: "status", label: "状态", width: "90px", render: (row) => <><StatusLight tone={row.status === "待处理" ? riskTone(row.level) : row.status === "已暂缓" ? "blue" : "green"} /> {row.status}</> },
          { key: "target", label: "目标", width: "200px", render: (row) => row.target },
          { key: "owner", label: "负责人", width: "86px", render: (row) => row.owner },
          { key: "detected", label: "发现时间", width: "105px", render: (row) => row.detected },
          { key: "impact", label: "影响", width: "230px", render: (row) => row.impact },
          { key: "actions", label: "操作", width: "204px", render: (row) => (
            <div className="table-actions">
              <button type="button" onClick={() => setSelected(row)}>详情</button>
              <button type="button" onClick={() => void patchRisk(row.id, { status: "已处理" }, `${row.title} 已处理`)}>处理</button>
              <button type="button" onClick={() => void patchRisk(row.id, { status: "已暂缓" }, `${row.title} 已暂缓`, "warning")}>暂缓</button>
            </div>
          ) },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的风险"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function taskTone(status: OverviewTaskRecord["status"]): Tone {
  if (status === "成功") return "green";
  if (status === "运行中") return "blue";
  if (status === "失败") return "red";
  if (status === "已取消") return "gray";
  return "orange";
}

function riskTone(level: OverviewRiskRecord["level"]): Tone {
  if (level === "高危") return "red";
  if (level === "中危") return "orange";
  return "blue";
}

type TableColumn<T> = {
  key: string;
  label: string;
  width?: string;
  render: (row: T) => React.ReactNode;
};

function ModulePageShell({
  title,
  subtitle,
  page,
  viewContext,
  actions,
  filters,
  metrics,
  side,
  children,
}: {
  title: string;
  subtitle: string;
  page?: PageKey;
  viewContext?: ViewContext | null;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  metrics?: React.ReactNode;
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  const effectiveViewContext = viewContext ?? (page ? viewContextForPage(page) : null);
  return (
    <div className="module-page">
      <div className="page-head module-head">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {actions && <div>{actions}</div>}
      </div>
      <div className={`module-layout ${side ? "has-side" : ""}`}>
        <section className="module-main">
          {effectiveViewContext && <ModuleViewContext context={effectiveViewContext} />}
          {filters && <div className="module-filter-line">{filters}</div>}
          {metrics && <div className="module-metrics">{metrics}</div>}
          {children}
        </section>
        {side}
      </div>
    </div>
  );
}

function ModuleViewContext({ context }: { context: ViewContext }) {
  return (
    <div className="module-view-context">
      <div>
        <span>{context.eyebrow}</span>
        <strong>{context.title}</strong>
        <p>{context.description}</p>
      </div>
      <div>
        {context.chips.map((chip) => <em key={chip}>{chip}</em>)}
      </div>
    </div>
  );
}

function DataTable<T>({
  columns,
  rows,
  emptyText,
  getRowKey,
}: {
  columns: Array<TableColumn<T>>;
  rows: T[];
  emptyText: string;
  getRowKey: (row: T) => string;
}) {
  return (
    <table className="mini-table module-table">
      <colgroup>
        {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
      </colgroup>
      <thead>
        <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={getRowKey(row)}>{columns.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="empty-row">{emptyText}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function DetailDrawer({
  title,
  subtitle,
  onClose,
  children,
  actions,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <aside className="detail-drawer">
      <div className="drawer-head">
        <div>
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <button type="button" className="icon-action" onClick={onClose} aria-label="关闭详情"><X size={16} /></button>
      </div>
      <div className="drawer-body">{children}</div>
      {actions && <div className="drawer-actions inline">{actions}</div>}
    </aside>
  );
}

function ModuleSearch({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="module-search">
      <Search size={14} />
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function MetricTile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: Tone | string }) {
  return (
    <article>
      <Icon className={tone} size={26} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function HostsPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialHostRecords);
  const hostPreset = hostPagePreset(page);
  const [search, setSearch] = useState(hostPreset.search);
  const [envFilter, setEnvFilter] = useState(hostPreset.env);
  const [healthFilter, setHealthFilter] = useState(hostPreset.health);
  const [drawer, setDrawer] = useState<{ type: "detail" | "create"; host?: HostRecord } | null>(null);
  const [draft, setDraft] = useState({ name: "panel-new-05", ip: "10.0.4.55", env: "开发" });
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || row.name.toLowerCase().includes(query) || row.ip.includes(query);
    const matchEnv = envFilter === "全部" || row.env === envFilter;
    const matchHealth = healthFilter === "全部" || row.health === healthFilter;
    return matchSearch && matchEnv && matchHealth;
  });

  const updateHost = (id: string, patch: Partial<HostRecord>) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  };

  const addHost = () => {
    if (!draft.name.trim() || !draft.ip.trim()) {
      notify("主机名和 IP 不能为空", "danger");
      return;
    }
    const next: HostRecord = {
      id: `host-${Date.now()}`,
      name: draft.name.trim(),
      ip: draft.ip.trim(),
      env: draft.env,
      health: "健康",
      cpu: "9%",
      memory: "28%",
      disk: "18%",
      os: "Ubuntu 24.04",
      uptime: "刚刚接入",
      backup: "等待首次备份",
      update: "已是最新",
      services: ["nginx", "docker", "node"],
    };
    setRows((current) => [next, ...current]);
    setDrawer({ type: "detail", host: next });
    notify(`主机 ${next.name} 已新增`);
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={hostPreset.subtitle}
      page={page}
      actions={<><button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredRows.length} 台主机`, "info")}><Download size={15} /> 导出</button><button className="primary" type="button" onClick={() => setDrawer({ type: "create" })}><Plus size={15} /> 新增主机</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索主机名或 IP" onChange={setSearch} /><FieldSelect label="环境" value={envFilter} options={["全部", "生产", "预发", "开发"]} onChange={setEnvFilter} /><FieldSelect label="健康" value={healthFilter} options={["全部", "健康", "警告", "离线"]} onChange={setHealthFilter} /></>}
      metrics={<><MetricTile icon={Server} label="主机总数" value={`${rows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="健康" value={`${rows.filter((row) => row.health === "健康").length}`} tone="green" /><MetricTile icon={Shield} label="需关注" value={`${rows.filter((row) => row.health !== "健康").length}`} tone="orange" /></>}
      side={drawer?.type === "detail" && drawer.host ? (
        <DetailDrawer title={drawer.host.name} subtitle={`${drawer.host.ip} · ${drawer.host.env}`} onClose={() => setDrawer(null)}>
          <div className="detail-kv">
            <p><span>系统</span><b>{drawer.host.os}</b></p>
            <p><span>运行时间</span><b>{drawer.host.uptime}</b></p>
            <p><span>备份</span><b>{drawer.host.backup}</b></p>
            <p><span>更新</span><b>{drawer.host.update}</b></p>
          </div>
          <div className="resource-bars">
            <p><span>CPU</span><Bar value={drawer.host.cpu} tone={drawer.host.health === "警告" ? "orange" : "green"} /></p>
            <p><span>内存</span><Bar value={drawer.host.memory} tone={Number(drawer.host.memory.replace("%", "")) > 70 ? "red" : "green"} /></p>
            <p><span>磁盘</span><Bar value={drawer.host.disk} tone={Number(drawer.host.disk.replace("%", "")) > 80 ? "red" : "green"} /></p>
          </div>
          <div className="drawer-list">
            <strong>服务列表</strong>
            {drawer.host.services.map((service) => <p key={service}><StatusLight tone="green" /> {service}<span>active</span></p>)}
          </div>
        </DetailDrawer>
      ) : drawer?.type === "create" ? (
        <DetailDrawer
          title="新增主机"
          subtitle="本地原型会把主机插入列表"
          onClose={() => setDrawer(null)}
          actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={addHost}>保存主机</button></>}
        >
          <FormLine label="主机名" required value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
          <FormLine label="IP 地址" required value={draft.ip} onChange={(value) => setDraft((current) => ({ ...current, ip: value }))} />
          <FormSelectLine label="环境" required value={draft.env} options={["生产", "预发", "开发"]} onChange={(value) => setDraft((current) => ({ ...current, env: value }))} />
        </DetailDrawer>
      ) : null}
    >
      <DataTable
        columns={[
          { key: "name", label: "主机名", width: "170px", render: (row) => <><StatusLight tone={row.health === "健康" ? "green" : row.health === "警告" ? "orange" : "red"} /> <b className="blue-text">{row.name}</b></> },
          { key: "ip", label: "IP 地址", width: "128px", render: (row) => row.ip },
          { key: "env", label: "环境", width: "78px", render: (row) => <span className="pill blue">{row.env}</span> },
          { key: "cpu", label: "CPU", render: (row) => <Bar value={row.cpu} tone={row.health === "警告" ? "orange" : "green"} /> },
          { key: "memory", label: "内存", render: (row) => <Bar value={row.memory} tone={Number(row.memory.replace("%", "")) > 70 ? "red" : "green"} /> },
          { key: "disk", label: "磁盘", render: (row) => <Bar value={row.disk} tone={Number(row.disk.replace("%", "")) > 80 ? "red" : "green"} /> },
          { key: "status", label: "健康", width: "92px", render: (row) => <><StatusLight tone={row.health === "健康" ? "green" : row.health === "警告" ? "orange" : "red"} /> {row.health}</> },
          { key: "ops", label: "操作", width: "210px", render: (row) => <span className="table-actions"><button type="button" onClick={() => setDrawer({ type: "detail", host: row })}>查看</button><button type="button" onClick={() => { updateHost(row.id, { health: "健康", uptime: "刚刚重启" }); notify(`${row.name} 已重启`); }}>重启</button><button type="button" onClick={() => { updateHost(row.id, { backup: currentClock() }); notify(`${row.name} 已创建备份`); }}>备份</button><button type="button" onClick={() => { updateHost(row.id, { update: "已是最新" }); notify(`${row.name} 已更新`); }}>更新</button></span> },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的主机"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function SitesPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialSiteRecords);
  const sitePreset = sitesPagePreset(page);
  const [search, setSearch] = useState(sitePreset.search);
  const [statusFilter, setStatusFilter] = useState(sitePreset.status);
  const [runtimeFilter, setRuntimeFilter] = useState(sitePreset.runtime);
  const [drawer, setDrawer] = useState<{ type: "create" | "logs"; site?: SiteRecord } | null>(null);
  const [draft, setDraft] = useState({ domain: "new.example.com", runtime: "Node 20", host: "panel-se-01" });
  const runtimeOptions = ["全部", ...Array.from(new Set(rows.map((row) => row.runtime)))];
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchCert = page === "sites-cert" ? row.certDays < 14 : true;
    return (!query || row.domain.toLowerCase().includes(query)) && (statusFilter === "全部" || row.status === statusFilter) && (runtimeFilter === "全部" || row.runtime === runtimeFilter) && matchCert;
  });
  const updateSite = (id: string, patch: Partial<SiteRecord>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const addSite = () => {
    if (!draft.domain.trim()) {
      notify("域名不能为空", "danger");
      return;
    }
    const next: SiteRecord = { id: `site-${Date.now()}`, domain: draft.domain.trim(), runtime: draft.runtime, host: draft.host, status: "运行中", certDays: 90, traffic: "0 GB", owner: "未分配" };
    setRows((current) => [next, ...current]);
    setDrawer(null);
    notify(`网站 ${next.domain} 已添加`);
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={sitePreset.subtitle}
      page={page}
      actions={<><button className="ghost" type="button" onClick={() => notify("站点列表已刷新", "info")}><RefreshCw size={15} /> 刷新</button><button className="primary" type="button" onClick={() => setDrawer({ type: "create" })}><Plus size={15} /> 添加网站</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索域名" onChange={setSearch} /><FieldSelect label="状态" value={statusFilter} options={["全部", "运行中", "已停止", "告警"]} onChange={setStatusFilter} /><FieldSelect label="运行时" value={runtimeFilter} options={runtimeOptions} onChange={setRuntimeFilter} /></>}
      metrics={<><MetricTile icon={Globe2} label="站点" value={`${rows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="运行中" value={`${rows.filter((row) => row.status === "运行中").length}`} tone="green" /><MetricTile icon={Shield} label="证书告警" value={`${rows.filter((row) => row.certDays < 14).length}`} tone="orange" /></>}
      side={drawer?.type === "create" ? (
        <DetailDrawer title="添加网站" subtitle="创建本地站点记录" onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={addSite}>添加网站</button></>}>
          <FormLine label="域名" required value={draft.domain} onChange={(value) => setDraft((current) => ({ ...current, domain: value }))} />
          <FormSelectLine label="运行时" required value={draft.runtime} options={["Node 20", "PHP 8.3", "Static", "Nginx 静态"]} onChange={(value) => setDraft((current) => ({ ...current, runtime: value }))} />
          <FormSelectLine label="绑定主机" required value={draft.host} options={initialHostRecords.map((host) => host.name)} onChange={(value) => setDraft((current) => ({ ...current, host: value }))} />
        </DetailDrawer>
      ) : drawer?.type === "logs" && drawer.site ? (
        <DetailDrawer title="访问日志" subtitle={drawer.site.domain} onClose={() => setDrawer(null)}>
          <div className="terminal-log compact-log">
            <p>200 GET /api/health 38ms</p>
            <p>200 GET /assets/app.js 12ms</p>
            <p>304 GET /dashboard 8ms</p>
            <p>{drawer.site.status === "告警" ? "502 upstream response timeout" : "200 GET /login 24ms"}</p>
          </div>
        </DetailDrawer>
      ) : null}
    >
      <DataTable
        columns={[
          { key: "domain", label: "域名", width: "220px", render: (row) => <><StatusLight tone={row.status === "运行中" ? "green" : row.status === "告警" ? "orange" : "gray"} /> <b className="blue-text">{row.domain}</b></> },
          { key: "status", label: "状态", width: "90px", render: (row) => <span className={`pill ${row.status === "运行中" ? "green" : row.status === "告警" ? "red" : "blue"}`}>{row.status}</span> },
          { key: "runtime", label: "运行时", render: (row) => row.runtime },
          { key: "host", label: "主机", render: (row) => row.host },
          { key: "cert", label: "证书", render: (row) => <span className={row.certDays < 14 ? "orange-text" : "green-text"}>{row.certDays} 天</span> },
          { key: "traffic", label: "流量", render: (row) => row.traffic },
          { key: "ops", label: "操作", width: "220px", render: (row) => <span className="table-actions"><button type="button" onClick={() => { updateSite(row.id, { status: row.status === "已停止" ? "运行中" : "已停止" }); notify(`${row.domain} 已${row.status === "已停止" ? "启动" : "停止"}`); }}>{row.status === "已停止" ? "启动" : "停止"}</button><button type="button" onClick={() => { updateSite(row.id, { certDays: 90 }); notify(`${row.domain} 证书已续期`); }}>续期</button><button type="button" onClick={() => setDrawer({ type: "logs", site: row })}>日志</button></span> },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的网站"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function FilesPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialFileRecords);
  const filePreset = filesPagePreset(page);
  const [currentPath, setCurrentPath] = useState(filePreset.path);
  const [search, setSearch] = useState(filePreset.search);
  const [typeFilter, setTypeFilter] = useState(filePreset.type);
  const [drawer, setDrawer] = useState<{ type: "folder" | "rename"; file?: FileRecord } | null>(null);
  const [draftName, setDraftName] = useState("new-folder");
  const crumbs = currentPath.split("/").filter(Boolean);
  const visibleRows = rows.filter((row) => row.path === currentPath && (typeFilter === "全部" || row.type === typeFilter) && (!search.trim() || row.name.toLowerCase().includes(search.trim().toLowerCase())));
  const parentPath = crumbs.length > 1 ? `/${crumbs.slice(0, -1).join("/")}` : "/";
  const createFolder = () => {
    if (!draftName.trim()) {
      notify("文件夹名称不能为空", "danger");
      return;
    }
    setRows((current) => [{ id: `file-${Date.now()}`, name: draftName.trim(), type: "文件夹", path: currentPath, size: "-", modified: currentClock(), owner: "admin" }, ...current]);
    setDrawer(null);
    notify(`文件夹 ${draftName.trim()} 已创建`);
  };
  const renameFile = () => {
    if (!drawer?.file || !draftName.trim()) return;
    setRows((current) => current.map((row) => row.id === drawer.file?.id ? { ...row, name: draftName.trim(), modified: currentClock() } : row));
    setDrawer(null);
    notify("已重命名文件项");
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={filePreset.subtitle}
      page={page}
      actions={<><button className="ghost" type="button" onClick={() => { setRows((current) => [{ id: `file-${Date.now()}`, name: `upload-${current.length + 1}.log`, type: "文件", path: currentPath, size: "12 KB", modified: currentClock(), owner: "admin" }, ...current]); notify("文件已上传到当前路径"); }}><CloudUpload size={15} /> 上传</button><button className="primary" type="button" onClick={() => { setDraftName("new-folder"); setDrawer({ type: "folder" }); }}><Plus size={15} /> 创建文件夹</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索文件名" onChange={setSearch} /><FieldSelect label="类型" value={typeFilter} options={["全部", "文件夹", "文件"]} onChange={setTypeFilter} /></>}
      side={drawer?.type === "folder" ? (
        <DetailDrawer title="创建文件夹" subtitle={currentPath} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={createFolder}>创建</button></>}>
          <FormLine label="文件夹名" required value={draftName} onChange={setDraftName} />
        </DetailDrawer>
      ) : drawer?.type === "rename" && drawer.file ? (
        <DetailDrawer title="重命名" subtitle={drawer.file.name} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={renameFile}>保存</button></>}>
          <FormLine label="新名称" required value={draftName} onChange={setDraftName} />
        </DetailDrawer>
      ) : null}
    >
      <div className="file-breadcrumbs">
        <button type="button" disabled={currentPath === "/"} onClick={() => setCurrentPath(parentPath)}>上级</button>
        <button type="button" onClick={() => setCurrentPath("/")}>root</button>
        {crumbs.map((crumb, index) => {
          const nextPath = `/${crumbs.slice(0, index + 1).join("/")}`;
          return <button key={nextPath} type="button" className={nextPath === currentPath ? "active" : ""} onClick={() => setCurrentPath(nextPath)}>{crumb}</button>;
        })}
      </div>
      <DataTable
        columns={[
          { key: "name", label: "名称", width: "260px", render: (row) => row.type === "文件夹" ? <button className="file-link" type="button" onClick={() => setCurrentPath(`${currentPath === "/" ? "" : currentPath}/${row.name}`)}><Folder size={15} /> {row.name}</button> : <span><FileBox size={15} /> {row.name}</span> },
          { key: "type", label: "类型", width: "86px", render: (row) => <span className="pill blue">{row.type}</span> },
          { key: "size", label: "大小", render: (row) => row.size },
          { key: "modified", label: "修改时间", render: (row) => row.modified },
          { key: "owner", label: "所有者", render: (row) => row.owner },
          { key: "ops", label: "操作", width: "170px", render: (row) => <span className="table-actions"><button type="button" onClick={() => { setDraftName(row.name); setDrawer({ type: "rename", file: row }); }}>重命名</button><button type="button" onClick={() => { setRows((current) => current.filter((item) => item.id !== row.id)); notify(`${row.name} 已删除`, "warning"); }}>删除</button></span> },
        ]}
        rows={visibleRows}
        emptyText="当前路径没有匹配文件"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function TerminalPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const terminalPreset = terminalPagePreset(page);
  const [host, setHost] = useState(initialHostRecords[0].name);
  const [connected, setConnected] = useState(true);
  const [command, setCommand] = useState("");
  const [logs, setLogs] = useState<string[]>([`connected to ${initialHostRecords[0].name}`, "Last login: Thu Jun 18 10:21:03"]);
  const runCommand = () => {
    const next = command.trim();
    if (!next) return;
    if (!connected) {
      notify("终端未连接，请先连接主机", "danger");
      return;
    }
    const output = next.includes("systemctl") ? "nginx.service active (running)" : next.includes("df") ? "/dev/vda1  62G  21G  41G  35% /" : next.includes("top") ? "load average: 0.38, 0.42, 0.41" : `command '${next}' executed`;
    setLogs((current) => [...current, `$ ${next}`, output]);
    setCommand("");
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={terminalPreset.subtitle}
      page={page}
      actions={<><button className="ghost" type="button" onClick={() => { setConnected(false); notify("终端会话已断开", "warning"); }}>断开</button><button className="primary" type="button" onClick={() => { setConnected(true); setLogs((current) => [...current, `reconnected to ${host}`]); notify(`已连接 ${host}`); }}>连接</button></>}
      filters={<><FieldSelect label="主机" value={host} options={initialHostRecords.map((item) => item.name)} onChange={(value) => { setHost(value); setLogs((current) => [...current, `switch host to ${value}`]); }} /><StatusDot text={connected ? "已连接" : "未连接"} /></>}
      metrics={<><MetricTile icon={TerminalSquare} label="当前主机" value={host} tone="blue" /><MetricTile icon={Clock3} label="会话行数" value={`${logs.length}`} tone="green" /><MetricTile icon={Shield} label="权限" value="sudo" tone="orange" /></>}
    >
      <div className={`terminal-panel ${terminalPreset.panel !== "sessions" ? "has-terminal-extra" : ""}`}>
        {terminalPreset.panel === "snippets" && (
          <div className="snippet-grid">
            {["systemctl status nginx", "df -h", "top -bn1", "journalctl -u mysql --since today"].map((snippet) => (
              <button key={snippet} type="button" onClick={() => { setCommand(snippet); notify(`已填充命令：${snippet}`, "info"); }}>{snippet}</button>
            ))}
          </div>
        )}
        {terminalPreset.panel === "history" && (
          <div className="terminal-history">
            {["systemctl restart nginx", "df -h", "tail -n 100 /var/log/nginx/error.log"].map((item, index) => <p key={item}><span>{index + 1}</span>{item}<b>今天</b></p>)}
          </div>
        )}
        <div className="terminal-toolbar">
          <span><StatusLight tone={connected ? "green" : "red"} /> {connected ? "connected" : "disconnected"}</span>
          <div>
            <button type="button" onClick={() => { setLogs([]); notify("终端已清屏", "info"); }}>清屏</button>
            <button type="button" onClick={() => { void navigator.clipboard?.writeText(logs.join("\n")); notify("会话内容已复制", "info"); }}>复制会话</button>
            <button type="button" onClick={() => { setConnected(true); setLogs((current) => [...current, `reconnected to ${host}`]); notify("终端已重连"); }}>重连</button>
          </div>
        </div>
        <div className="terminal-log">
          {logs.length === 0 ? <p>terminal cleared</p> : logs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
        </div>
        <label className="terminal-input">
          <span>{host}:~$</span>
          <input value={command} disabled={!connected} placeholder={connected ? "输入命令后按 Enter" : "请先连接主机"} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") runCommand(); }} />
        </label>
      </div>
    </ModulePageShell>
  );
}

function SystemdPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialServiceRecords);
  const servicePreset = systemdPagePreset(page);
  const [search, setSearch] = useState(servicePreset.search);
  const [statusFilter, setStatusFilter] = useState(servicePreset.status);
  const [drawer, setDrawer] = useState<ServiceRecord | null>(servicePreset.mode === "logs" ? initialServiceRecords[0] : null);
  const filteredRows = rows.filter((row) => (!search.trim() || `${row.name} ${row.host}`.toLowerCase().includes(search.trim().toLowerCase())) && (statusFilter === "全部" || row.status === statusFilter));
  const updateService = (id: string, patch: Partial<ServiceRecord>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const logRows = servicePreset.mode === "logs" ? rows : drawer ? [drawer] : [];
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={servicePreset.subtitle}
      page={page}
      actions={<button className="ghost" type="button" onClick={() => notify("服务状态已刷新", "info")}><RefreshCw size={15} /> 刷新</button>}
      filters={<><ModuleSearch value={search} placeholder="搜索服务或主机" onChange={setSearch} /><FieldSelect label="状态" value={statusFilter} options={["全部", "active", "failed", "inactive"]} onChange={setStatusFilter} /></>}
      metrics={<><MetricTile icon={CheckCircle2} label="active" value={`${rows.filter((row) => row.status === "active").length}`} tone="green" /><MetricTile icon={Shield} label="failed" value={`${rows.filter((row) => row.status === "failed").length}`} tone="red" /><MetricTile icon={Clock3} label="inactive" value={`${rows.filter((row) => row.status === "inactive").length}`} tone="gray" /></>}
      side={drawer && (
        <DetailDrawer title="服务日志" subtitle={drawer.name} onClose={() => setDrawer(null)}>
          <div className="terminal-log compact-log">
            <p>systemd[1]: Started {drawer.name}</p>
            <p>{drawer.status === "failed" ? "exit-code=1 failed with result 'timeout'" : "status=0/SUCCESS"}</p>
            <p>memory current: {drawer.memory}</p>
          </div>
        </DetailDrawer>
      )}
    >
      <div className={`systemd-content ${servicePreset.mode === "logs" ? "logs-mode" : ""}`}>
        {servicePreset.mode === "logs" && (
          <div className="systemd-log-stream">
            {logRows.map((row) => (
              <article key={row.id}>
                <header><StatusLight tone={row.status === "failed" ? "red" : row.status === "active" ? "green" : "gray"} /> <strong>{row.name}</strong><span>{row.host}</span></header>
                <p>systemd[1]: {row.status === "failed" ? "service entered failed state" : `Started ${row.name}`}</p>
                <p>{row.status === "failed" ? "exit-code=1 failed with result 'timeout'" : "status=0/SUCCESS"}</p>
                <p>memory current: {row.memory} · restarts: {row.restarts}</p>
                <button type="button" onClick={() => setDrawer(row)}>打开详情</button>
              </article>
            ))}
          </div>
        )}
        <DataTable
          columns={[
            { key: "service", label: "服务", width: "220px", render: (row) => <><StatusLight tone={row.status === "active" ? "green" : row.status === "failed" ? "red" : "gray"} /> <b>{row.name}</b></> },
            { key: "host", label: "主机", render: (row) => row.host },
            { key: "status", label: "状态", render: (row) => <span className={`pill ${row.status === "active" ? "green" : row.status === "failed" ? "red" : "blue"}`}>{row.handled ? "已处理" : row.status}</span> },
            { key: "restarts", label: "重启次数", render: (row) => row.restarts },
            { key: "memory", label: "内存", render: (row) => row.memory },
            { key: "updated", label: "最近更新", render: (row) => row.updated },
            { key: "ops", label: "操作", width: "280px", render: (row) => <span className="table-actions"><button type="button" onClick={() => { updateService(row.id, { status: "active", handled: false }); notify(`${row.name} 已启动`); }}>启动</button><button type="button" onClick={() => { updateService(row.id, { status: "inactive" }); notify(`${row.name} 已停止`, "warning"); }}>停止</button><button type="button" onClick={() => { updateService(row.id, { status: "active", restarts: row.restarts + 1, handled: false }); notify(`${row.name} 已重启`); }}>重启</button><button type="button" onClick={() => setDrawer(row)}>日志</button>{row.status === "failed" && <button type="button" onClick={() => { updateService(row.id, { handled: true, status: "inactive" }); notify(`${row.name} 已标记处理`); }}>处理</button>}</span> },
          ]}
          rows={filteredRows}
          emptyText="没有匹配的服务"
          getRowKey={(row) => row.id}
        />
      </div>
    </ModulePageShell>
  );
}

function FirewallPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialFirewallRules);
  const firewallPreset = firewallPagePreset(page);
  const [search, setSearch] = useState(firewallPreset.search);
  const [protocolFilter, setProtocolFilter] = useState(firewallPreset.protocol);
  const [sourceFilter, setSourceFilter] = useState(firewallPreset.source);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "临时调试端口", port: "", protocol: "TCP", source: "10.0.0.0/8" });
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchDeny = page === "firewall-deny" ? !row.enabled || row.protocol === "UDP" : true;
    return (!query || `${row.name} ${row.port}`.toLowerCase().includes(query)) && (protocolFilter === "全部" || row.protocol === protocolFilter) && (sourceFilter === "全部" || row.source === sourceFilter) && matchDeny;
  });
  const addRule = () => {
    if (!draft.port.trim()) {
      notify("端口不能为空", "danger");
      return;
    }
    setRows((current) => [{ id: `fw-${Date.now()}`, name: draft.name.trim() || `端口 ${draft.port}`, port: draft.port.trim(), protocol: draft.protocol, source: draft.source, target: "全部主机", enabled: true }, ...current]);
    setDrawerOpen(false);
    notify(`防火墙规则 ${draft.port}/${draft.protocol} 已新增`);
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={firewallPreset.subtitle}
      page={page}
      actions={<button className="primary" type="button" onClick={() => setDrawerOpen(true)}><Plus size={15} /> 新增规则</button>}
      filters={<><ModuleSearch value={search} placeholder="搜索规则名或端口" onChange={setSearch} /><FieldSelect label="协议" value={protocolFilter} options={["全部", "TCP", "UDP"]} onChange={setProtocolFilter} /><FieldSelect label="来源" value={sourceFilter} options={["全部", ...Array.from(new Set(rows.map((row) => row.source)))]} onChange={setSourceFilter} /></>}
      metrics={<><MetricTile icon={Shield} label="规则数" value={`${rows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="启用" value={`${rows.filter((row) => row.enabled).length}`} tone="green" /><MetricTile icon={Lock} label="停用" value={`${rows.filter((row) => !row.enabled).length}`} tone="orange" /></>}
      side={drawerOpen && (
        <DetailDrawer title="新增规则" subtitle="空端口会被阻止提交" onClose={() => setDrawerOpen(false)} actions={<><button className="ghost" type="button" onClick={() => setDrawerOpen(false)}>取消</button><button className="primary" type="button" onClick={addRule}>保存规则</button></>}>
          <FormLine label="规则名" value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
          <FormLine label="端口" required value={draft.port} onChange={(value) => setDraft((current) => ({ ...current, port: value }))} />
          <FormSelectLine label="协议" value={draft.protocol} options={["TCP", "UDP"]} onChange={(value) => setDraft((current) => ({ ...current, protocol: value }))} />
          <FormLine label="来源" required value={draft.source} onChange={(value) => setDraft((current) => ({ ...current, source: value }))} />
        </DetailDrawer>
      )}
    >
      <DataTable
        columns={[
          { key: "name", label: "规则", width: "220px", render: (row) => <><StatusLight tone={row.enabled ? "green" : "gray"} /> <b>{row.name}</b></> },
          { key: "port", label: "端口", render: (row) => row.port },
          { key: "protocol", label: "协议", render: (row) => <span className="pill blue">{row.protocol}</span> },
          { key: "source", label: "来源", render: (row) => row.source },
          { key: "target", label: "目标", render: (row) => row.target },
          { key: "enabled", label: "状态", render: (row) => <span className={`pill ${row.enabled ? "green" : "blue"}`}>{row.enabled ? "启用" : "停用"}</span> },
          { key: "ops", label: "操作", width: "170px", render: (row) => <span className="table-actions"><button type="button" onClick={() => { setRows((current) => current.map((item) => item.id === row.id ? { ...item, enabled: !item.enabled } : item)); notify(`${row.name} 已${row.enabled ? "禁用" : "启用"}`); }}>{row.enabled ? "禁用" : "启用"}</button><button type="button" onClick={() => { setRows((current) => current.filter((item) => item.id !== row.id)); notify(`${row.name} 已删除`, "warning"); }}>删除</button></span> },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的防火墙规则"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function DeployPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialDeployJobs);
  const [rollbackRows, setRollbackRows] = useState(initialRollbackRecords);
  const deployPreset = deployPagePreset(page);
  const [env, setEnv] = useState(deployPreset.env);
  const [drawer, setDrawer] = useState<{ type: "deploy"; row: DeployJob } | { type: "rollback"; row: RollbackRecord } | null>(null);
  const isRollbackMode = deployPreset.mode === "rollbacks";
  const deployEnvOptions = isRollbackMode ? ["全部", "生产", "预发", "开发"] : ["生产", "预发", "开发"];
  const filteredRows = rows.filter((row) => row.env === env);
  const filteredRollbackRows = rollbackRows.filter((row) => env === "全部" || row.env === env);
  const updateDeploy = (id: string, patch: Partial<DeployJob>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const updateRollback = (id: string, patch: Partial<RollbackRecord>) => setRollbackRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const createDeploy = () => {
    const next: DeployJob = { id: `dep-${Date.now()}`, app: env === "生产" ? "shop-web" : "feature-service", env, version: `build-${rows.length + 1}`, status: "运行中", operator: "管理员", duration: "运行中" };
    setRows((current) => [next, ...current]);
    notify(`${env} 部署任务已创建`, "info");
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={deployPreset.subtitle}
      page={page}
      actions={!isRollbackMode && <button className="primary" type="button" onClick={createDeploy}><Plus size={15} /> 创建部署任务</button>}
      filters={<div className="deploy-tabs">{deployEnvOptions.map((item) => <button key={item} className={item === env ? "active" : ""} type="button" onClick={() => setEnv(item)}>{item}</button>)}</div>}
      metrics={isRollbackMode
        ? <><MetricTile icon={RefreshCw} label="可回滚" value={`${rollbackRows.filter((row) => row.status === "可回滚").length}`} tone="blue" /><MetricTile icon={Activity} label="回滚中" value={`${rollbackRows.filter((row) => row.status === "回滚中").length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="已回滚" value={`${rollbackRows.filter((row) => row.status === "已回滚").length}`} tone="green" /></>
        : <><MetricTile icon={CloudUpload} label="当前环境" value={env} tone="blue" /><MetricTile icon={Activity} label="运行中" value={`${rows.filter((row) => row.status === "运行中").length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="成功" value={`${rows.filter((row) => row.status === "成功").length}`} tone="green" /></>}
      side={drawer && (
        <DetailDrawer title={drawer.type === "rollback" ? "回滚日志" : "部署日志"} subtitle={drawer.type === "rollback" ? `${drawer.row.app} ${drawer.row.fromVersion} -> ${drawer.row.targetVersion}` : `${drawer.row.app} ${drawer.row.version}`} onClose={() => setDrawer(null)}>
          <div className="terminal-log compact-log">
            {drawer.type === "rollback" ? (
              <>
                <p>rollback requested by {drawer.row.operator}</p>
                <p>current {drawer.row.fromVersion}</p>
                <p>target {drawer.row.targetVersion}</p>
                <p>{drawer.row.reason}</p>
              </>
            ) : (
              <>
                <p>checkout {drawer.row.version}</p>
                <p>install dependencies</p>
                <p>build artifacts</p>
                <p>{drawer.row.status === "失败" ? "deploy failed: health check timeout" : "deploy finished"}</p>
              </>
            )}
          </div>
        </DetailDrawer>
      )}
    >
      {isRollbackMode ? (
        <DataTable
          columns={[
            { key: "app", label: "应用", width: "190px", render: (row) => <b className="blue-text">{row.app}</b> },
            { key: "env", label: "环境", render: (row) => <span className="pill blue">{row.env}</span> },
            { key: "from", label: "当前版本", render: (row) => row.fromVersion },
            { key: "target", label: "目标版本", render: (row) => row.targetVersion },
            { key: "status", label: "状态", render: (row) => <span className={`pill ${row.status === "已回滚" ? "green" : row.status === "回滚中" ? "blue" : "orange"}`}>{row.status}</span> },
            { key: "reason", label: "原因", render: (row) => row.reason },
            { key: "ops", label: "操作", width: "220px", render: (row) => <span className="table-actions">{row.status !== "已回滚" && <button type="button" onClick={() => { updateRollback(row.id, { status: row.status === "回滚中" ? "已回滚" : "回滚中" }); notify(`${row.app} ${row.status === "回滚中" ? "回滚已完成" : "已开始回滚"}`, row.status === "回滚中" ? "success" : "warning"); }}>{row.status === "回滚中" ? "完成" : "执行"}</button>}<button type="button" onClick={() => setDrawer({ type: "rollback", row })}>日志</button>{row.status !== "已回滚" && <button type="button" onClick={() => { updateRollback(row.id, { status: "回滚中", createdAt: currentClock() }); notify(`${row.app} 已重新执行回滚`, "info"); }}>重试</button>}</span> },
          ]}
          rows={filteredRollbackRows}
          emptyText="当前筛选没有回滚记录"
          getRowKey={(row) => row.id}
        />
      ) : (
        <DataTable
          columns={[
            { key: "app", label: "应用", width: "210px", render: (row) => <b className="blue-text">{row.app}</b> },
            { key: "env", label: "环境", render: (row) => <span className="pill blue">{row.env}</span> },
            { key: "version", label: "版本", render: (row) => row.version },
            { key: "status", label: "状态", render: (row) => <span className={`pill ${row.status === "成功" ? "green" : row.status === "失败" ? "red" : "blue"}`}>{row.status}</span> },
            { key: "operator", label: "操作人", render: (row) => row.operator },
            { key: "duration", label: "耗时", render: (row) => row.duration },
            { key: "ops", label: "操作", width: "260px", render: (row) => <span className="table-actions">{row.status === "运行中" && <button type="button" onClick={() => { updateDeploy(row.id, { status: "成功", duration: "1分02秒" }); notify(`${row.app} 部署已完成`); }}>完成</button>}<button type="button" onClick={() => { setRollbackRows((current) => [{ id: `rb-${Date.now()}`, app: row.app, env: row.env, fromVersion: row.version, targetVersion: "上一健康版本", status: "回滚中", operator: row.operator, reason: "从部署任务发起回滚", createdAt: currentClock() }, ...current]); updateDeploy(row.id, { status: "运行中", duration: "回滚中" }); notify(`${row.app} 已开始回滚`, "warning"); }}>回滚</button><button type="button" onClick={() => setDrawer({ type: "deploy", row })}>日志</button><button type="button" onClick={() => { updateDeploy(row.id, { status: "运行中", duration: "运行中" }); notify(`${row.app} 已重新部署`, "info"); }}>重部署</button></span> },
          ]}
          rows={filteredRows}
          emptyText="当前环境没有部署任务"
          getRowKey={(row) => row.id}
        />
      )}
    </ModulePageShell>
  );
}

function SchedulePage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialScheduleJobs);
  const schedulePreset = schedulePagePreset(page);
  const [search, setSearch] = useState(schedulePreset.search);
  const [stateFilter, setStateFilter] = useState(schedulePreset.state);
  const [drawer, setDrawer] = useState<{ type: "create" | "edit"; job?: ScheduleJob } | null>(null);
  const [draft, setDraft] = useState({ name: "新建任务", cron: "0 4 * * *", command: "echo ok" });
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.name} ${row.cron} ${row.command}`.toLowerCase().includes(query);
    const matchState = stateFilter === "全部" || (stateFilter === "已启用" ? row.enabled : !row.enabled);
    const matchFailed = page === "schedule-failed" ? row.result === "失败" : true;
    return matchSearch && matchState && matchFailed;
  });
  const updateJob = (id: string, patch: Partial<ScheduleJob>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const saveJob = () => {
    if (!draft.name.trim() || !draft.cron.trim()) {
      notify("任务名和 cron 不能为空", "danger");
      return;
    }
    if (drawer?.type === "edit" && drawer.job) {
      updateJob(drawer.job.id, { cron: draft.cron, command: draft.command });
      notify(`${drawer.job.name} 已保存`);
    } else {
      setRows((current) => [{ id: `sch-${Date.now()}`, name: draft.name.trim(), cron: draft.cron.trim(), command: draft.command.trim(), enabled: true, nextRun: "待计算", lastRun: "未运行", result: "未运行" }, ...current]);
      notify("定时任务已新建");
    }
    setDrawer(null);
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={schedulePreset.subtitle}
      page={page}
      actions={<button className="primary" type="button" onClick={() => { setDraft({ name: "新建任务", cron: "0 4 * * *", command: "echo ok" }); setDrawer({ type: "create" }); }}><Plus size={15} /> 新建任务</button>}
      filters={<><ModuleSearch value={search} placeholder="搜索任务、cron 或命令" onChange={setSearch} /><FieldSelect label="状态" value={stateFilter} options={["全部", "已启用", "已停用"]} onChange={setStateFilter} /></>}
      metrics={<><MetricTile icon={CalendarDays} label="任务数" value={`${rows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="启用" value={`${rows.filter((row) => row.enabled).length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${rows.filter((row) => row.result === "失败").length}`} tone="red" /></>}
      side={drawer && (
        <DetailDrawer title={drawer.type === "edit" ? "编辑 cron" : "新建任务"} subtitle={drawer.job?.name} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={saveJob}>保存</button></>}>
          <FormLine label="任务名" required value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
          <FormLine label="cron" required value={draft.cron} onChange={(value) => setDraft((current) => ({ ...current, cron: value }))} />
          <FormLine label="命令" value={draft.command} onChange={(value) => setDraft((current) => ({ ...current, command: value }))} />
        </DetailDrawer>
      )}
    >
      {schedulePreset.mode === "calendar" && (
        <div className="schedule-calendar">
          {filteredRows.map((row) => <article key={row.id}><span>{row.nextRun}</span><strong>{row.name}</strong><em>{row.cron}</em><b className={row.result === "失败" ? "red-text" : row.result === "成功" ? "green-text" : "orange-text"}>{row.enabled ? row.result : "已停用"}</b></article>)}
          {filteredRows.length === 0 && <p className="module-empty-card">当前筛选没有日历任务</p>}
        </div>
      )}
      <DataTable
        columns={[
          { key: "name", label: "任务", width: "190px", render: (row) => <b>{row.name}</b> },
          { key: "cron", label: "cron", render: (row) => <code>{row.cron}</code> },
          { key: "command", label: "命令", render: (row) => row.command },
          { key: "enabled", label: "启用", render: (row) => <span className={`pill ${row.enabled ? "green" : "blue"}`}>{row.enabled ? "启用" : "停用"}</span> },
          { key: "last", label: "最近执行", render: (row) => row.lastRun },
          { key: "result", label: "结果", render: (row) => <span className={`pill ${row.result === "成功" ? "green" : row.result === "失败" ? "red" : "blue"}`}>{row.result}</span> },
          { key: "ops", label: "操作", width: "250px", render: (row) => <span className="table-actions"><button type="button" onClick={() => { updateJob(row.id, { enabled: !row.enabled }); notify(`${row.name} 已${row.enabled ? "停用" : "启用"}`); }}>{row.enabled ? "停用" : "启用"}</button><button type="button" onClick={() => { updateJob(row.id, { lastRun: currentClock(), result: "成功" }); notify(`${row.name} 已立即执行`); }}>执行</button><button type="button" onClick={() => { setDraft({ name: row.name, cron: row.cron, command: row.command }); setDrawer({ type: "edit", job: row }); }}>编辑</button></span> },
        ]}
        rows={filteredRows}
        emptyText="没有匹配的定时任务"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function AuditPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const auditPreset = auditPagePreset(page);
  const [exportRows, setExportRows] = useState(initialAuditExports);
  const [search, setSearch] = useState(auditPreset.search);
  const [userFilter, setUserFilter] = useState(auditPreset.user);
  const [resultFilter, setResultFilter] = useState(auditPreset.result);
  const [formatFilter, setFormatFilter] = useState("全部");
  const [exportStatusFilter, setExportStatusFilter] = useState("全部");
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  const [selectedExport, setSelectedExport] = useState<AuditExportRecord | null>(null);
  const isExportMode = auditPreset.mode === "exports";
  const users = ["全部", ...Array.from(new Set(initialAuditRecords.map((row) => row.user)))];
  const filteredRows = initialAuditRecords.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.user} ${row.action} ${row.object} ${row.result} ${row.traceId} ${row.ip}`.toLowerCase().includes(query);
    return matchSearch && (userFilter === "全部" || row.user === userFilter) && (resultFilter === "全部" || row.result === resultFilter);
  });
  const filteredExports = exportRows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.name} ${row.format} ${row.range} ${row.status} ${row.creator} ${row.traceId}`.toLowerCase().includes(query);
    return matchSearch && (formatFilter === "全部" || row.format === formatFilter) && (exportStatusFilter === "全部" || row.status === exportStatusFilter);
  });
  const createExport = () => {
    const next: AuditExportRecord = {
      id: `exp-${Date.now()}`,
      name: `审计导出 ${exportRows.length + 1}`,
      format: formatFilter === "全部" ? "CSV" : formatFilter as AuditExportRecord["format"],
      range: "当前筛选范围",
      status: "生成中",
      rows: filteredRows.length,
      size: "生成中",
      creator: "管理员",
      createdAt: currentClock(),
      expiresAt: "7 天后",
      traceId: `EXP-${Date.now()}`,
    };
    setExportRows((current) => [next, ...current]);
    setExportStatusFilter("全部");
    notify(`${next.name} 已创建`, "success");
  };
  const regenerateExport = (row: AuditExportRecord) => {
    notify(`${row.name} 已加入重新生成队列`, row.status === "失败" ? "warning" : "info");
  };
  const handleExportPrimaryAction = (row: AuditExportRecord) => {
    if (row.status === "可下载") {
      notify(`${row.name} 已开始下载`, "success");
      return;
    }
    regenerateExport(row);
  };
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={auditPreset.subtitle}
      page={page}
      actions={<button className="ghost" type="button" onClick={() => isExportMode ? createExport() : notify(`已导出 ${filteredRows.length} 条审计日志`, "info")}><Download size={15} /> {isExportMode ? "新建导出" : "导出"}</button>}
      filters={isExportMode
        ? <><ModuleSearch value={search} placeholder="搜索导出名称、范围或 trace id" onChange={setSearch} /><FieldSelect label="格式" value={formatFilter} options={["全部", "CSV", "JSON", "ZIP"]} onChange={setFormatFilter} /><FieldSelect label="状态" value={exportStatusFilter} options={["全部", "可下载", "生成中", "失败"]} onChange={setExportStatusFilter} /></>
        : <><ModuleSearch value={search} placeholder="搜索关键字、对象或 trace id" onChange={setSearch} /><FieldSelect label="用户" value={userFilter} options={users} onChange={setUserFilter} /><FieldSelect label="结果" value={resultFilter} options={["全部", "成功", "失败"]} onChange={setResultFilter} /></>}
      metrics={isExportMode
        ? <><MetricTile icon={Download} label="导出任务" value={`${exportRows.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="可下载" value={`${exportRows.filter((row) => row.status === "可下载").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${exportRows.filter((row) => row.status === "失败").length}`} tone="red" /></>
        : <><MetricTile icon={FileText} label="日志" value={`${initialAuditRecords.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="成功" value={`${initialAuditRecords.filter((row) => row.result === "成功").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${initialAuditRecords.filter((row) => row.result === "失败").length}`} tone="red" /></>}
      side={selectedExport ? (
        <DetailDrawer title="导出详情" subtitle={selectedExport.traceId} onClose={() => setSelectedExport(null)}>
          <div className="detail-kv">
            <p><span>名称</span><b>{selectedExport.name}</b></p>
            <p><span>格式</span><b>{selectedExport.format}</b></p>
            <p><span>范围</span><b>{selectedExport.range}</b></p>
            <p><span>记录数</span><b>{selectedExport.rows.toLocaleString("zh-CN")}</b></p>
            <p><span>状态</span><b>{selectedExport.status}</b></p>
            <p><span>过期</span><b>{selectedExport.expiresAt}</b></p>
          </div>
        </DetailDrawer>
      ) : selected && (
        <DetailDrawer title="审计详情" subtitle={selected.traceId} onClose={() => setSelected(null)}>
          <div className="detail-kv">
            <p><span>时间</span><b>{selected.time}</b></p>
            <p><span>用户</span><b>{selected.user}</b></p>
            <p><span>IP</span><b>{selected.ip}</b></p>
            <p><span>对象</span><b>{selected.object}</b></p>
            <p><span>摘要</span><b>{selected.summary}</b></p>
          </div>
        </DetailDrawer>
      )}
    >
      {isExportMode ? (
        <>
          <div className="export-list">
            {filteredExports.map((row) => (
              <p key={row.id}>
                <Download size={14} />
                <span><b>{row.name}</b><em>{row.range} · {row.rows.toLocaleString("zh-CN")} 条 · {row.size}</em></span>
                <strong className={row.status === "可下载" ? "green-text" : row.status === "生成中" ? "blue-text" : "red-text"}>{row.status}</strong>
              </p>
            ))}
            {filteredExports.length === 0 && <div className="module-empty-card">没有匹配的导出记录</div>}
          </div>
          <DataTable
            columns={[
              { key: "name", label: "导出名称", width: "220px", render: (row) => <b>{row.name}</b> },
              { key: "format", label: "格式", render: (row) => <span className="pill blue">{row.format}</span> },
              { key: "range", label: "范围", render: (row) => row.range },
              { key: "status", label: "状态", render: (row) => <span className={`pill ${row.status === "可下载" ? "green" : row.status === "生成中" ? "blue" : "red"}`}>{row.status}</span> },
              { key: "rows", label: "记录数", render: (row) => row.rows.toLocaleString("zh-CN") },
              { key: "creator", label: "创建人", render: (row) => row.creator },
              { key: "created", label: "创建时间", render: (row) => row.createdAt },
              { key: "ops", label: "操作", width: "160px", render: (row) => <span className="table-actions export-actions"><button type="button" onClick={() => setSelectedExport(row)}>详情</button><button type="button" onClick={() => handleExportPrimaryAction(row)}>{row.status === "可下载" ? "下载" : "重试"}</button></span> },
            ]}
            rows={filteredExports}
            emptyText="没有匹配的导出记录"
            getRowKey={(row) => row.id}
          />
        </>
      ) : (
        <DataTable
          columns={[
            { key: "time", label: "时间", width: "130px", render: (row) => row.time },
            { key: "ip", label: "IP", render: (row) => row.ip },
            { key: "user", label: "用户", render: (row) => row.user },
            { key: "action", label: "动作", render: (row) => row.action },
            { key: "object", label: "对象", render: (row) => row.object },
            { key: "result", label: "结果", render: (row) => <span className={`pill ${row.result === "成功" ? "green" : "red"}`}>{row.result}</span> },
            { key: "trace", label: "trace id", render: (row) => row.traceId },
            { key: "ops", label: "操作", width: "78px", render: (row) => <span className="table-actions"><button type="button" onClick={() => setSelected(row)}>详情</button></span> },
          ]}
          rows={filteredRows}
          emptyText="没有匹配的审计日志"
          getRowKey={(row) => row.id}
        />
      )}
    </ModulePageShell>
  );
}

function AclPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const aclPreset = aclPagePreset(page);
  const [tab, setTab] = useState<"users" | "roles" | "policies">(aclPreset.tab);
  const [users, setUsers] = useState(initialAclUsers);
  const [roles, setRoles] = useState(initialAclRoles);
  const [search, setSearch] = useState("");
  const [policyModule, setPolicyModule] = useState("全部");
  const [policyRisk, setPolicyRisk] = useState("全部");
  const [selectedPolicyId, setSelectedPolicyId] = useState(initialAclPolicies[0].id);
  const [roleId, setRoleId] = useState(initialAclRoles[0].id);
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const filteredUsers = users.filter((user) => !search.trim() || `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(search.trim().toLowerCase()));
  const filteredPolicies = initialAclPolicies.filter((policy) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${policy.name} ${policy.module} ${policy.desc} ${policy.roles.join(" ")}`.toLowerCase().includes(query);
    const matchModule = policyModule === "全部" || policy.module === policyModule;
    const matchRisk = policyRisk === "全部" || policy.risk === policyRisk;
    return matchSearch && matchModule && matchRisk;
  });
  const selectedPolicy = filteredPolicies.find((policy) => policy.id === selectedPolicyId) ?? filteredPolicies[0] ?? null;
  const policyModules = ["全部", ...Array.from(new Set(initialAclPolicies.map((policy) => policy.module)))];
  const togglePermission = (permission: string) => {
    setRoles((current) => current.map((role) => {
      if (role.id !== selectedRole.id) return role;
      return role.permissions.includes(permission)
        ? { ...role, permissions: role.permissions.filter((item) => item !== permission) }
        : { ...role, permissions: [...role.permissions, permission] };
    }));
  };
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={aclPreset.subtitle}
      page={page}
      actions={tab === "roles" ? <button className="ghost" type="button" onClick={() => notify(`${selectedRole.name} 权限已保存`)}>保存角色权限</button> : undefined}
      filters={<><div className="deploy-tabs"><button className={tab === "users" ? "active" : ""} type="button" onClick={() => setTab("users")}>用户</button><button className={tab === "roles" ? "active" : ""} type="button" onClick={() => setTab("roles")}>角色</button><button className={tab === "policies" ? "active" : ""} type="button" onClick={() => setTab("policies")}>权限项</button></div>{tab === "users" && <ModuleSearch value={search} placeholder="搜索用户、邮箱或角色" onChange={setSearch} />}{tab === "policies" && <><ModuleSearch value={search} placeholder="搜索权限项、模块或角色" onChange={setSearch} /><FieldSelect label="模块" value={policyModule} options={policyModules} onChange={setPolicyModule} /><FieldSelect label="风险" value={policyRisk} options={["全部", "高", "中", "低"]} onChange={setPolicyRisk} /></>}</>}
      metrics={<><MetricTile icon={UserRound} label="用户" value={`${users.length}`} tone="blue" /><MetricTile icon={Lock} label="角色" value={`${roles.length}`} tone="purple" /><MetricTile icon={Shield} label="高风险权限" value={`${initialAclPolicies.filter((policy) => policy.risk === "高").length}`} tone="orange" /></>}
    >
      {tab === "users" ? (
        <DataTable
          columns={[
            { key: "name", label: "用户", width: "180px", render: (row) => <b>{row.name}</b> },
            { key: "email", label: "邮箱", render: (row) => row.email },
            { key: "role", label: "角色", render: (row) => <span className="pill blue">{row.role}</span> },
            { key: "enabled", label: "状态", render: (row) => <span className={`pill ${row.enabled ? "green" : "red"}`}>{row.enabled ? "启用" : "禁用"}</span> },
            { key: "mfa", label: "MFA", render: (row) => <span className={row.mfa === "已启用" ? "green-text" : "orange-text"}>{row.mfa}</span> },
            { key: "last", label: "最近登录", render: (row) => row.lastLogin },
            { key: "ops", label: "操作", width: "180px", render: (row) => <span className="table-actions"><button type="button" onClick={() => { setUsers((current) => current.map((item) => item.id === row.id ? { ...item, enabled: !item.enabled } : item)); notify(`${row.name} 已${row.enabled ? "禁用" : "启用"}`); }}>{row.enabled ? "禁用" : "启用"}</button><button type="button" onClick={() => { setUsers((current) => current.map((item) => item.id === row.id ? { ...item, mfa: "需重置" } : item)); notify(`${row.name} MFA 已重置`, "warning"); }}>重置 MFA</button></span> },
          ]}
          rows={filteredUsers}
          emptyText="没有匹配的用户"
          getRowKey={(row) => row.id}
        />
      ) : tab === "roles" ? (
        <div className="acl-role-layout">
          <PanelCard title="角色列表">
            <div className="role-list">
              {roles.map((role) => <button key={role.id} className={role.id === roleId ? "active" : ""} type="button" onClick={() => setRoleId(role.id)}><strong>{role.name}</strong><span>{role.desc}</span></button>)}
            </div>
          </PanelCard>
          <PanelCard title={`${selectedRole.name} 权限项`} action="保存" onAction={() => notify(`${selectedRole.name} 权限已保存`)}>
            <div className="permission-grid">
              {permissionOptions.map((permission) => (
                <button key={permission} className={selectedRole.permissions.includes(permission) ? "checked" : ""} type="button" onClick={() => togglePermission(permission)}>
                  <span>{permission}</span>
                  <i>{selectedRole.permissions.includes(permission) ? "已允许" : "未允许"}</i>
                </button>
              ))}
            </div>
          </PanelCard>
        </div>
      ) : (
        <div className="acl-policy-layout">
          <div className="policy-catalog">
            {filteredPolicies.map((policy) => (
              <button key={policy.id} className={policy.id === selectedPolicy?.id ? "active" : ""} type="button" onClick={() => setSelectedPolicyId(policy.id)}>
                <span><b>{policy.name}</b><i>{policy.module}</i></span>
                <em className={policy.risk === "高" ? "red-text" : policy.risk === "中" ? "orange-text" : "blue-text"}>{policy.risk}风险</em>
                <small>{policy.desc}</small>
              </button>
            ))}
            {filteredPolicies.length === 0 && <p className="module-empty-card">没有匹配的权限项</p>}
          </div>
          {selectedPolicy ? (
            <PanelCard title={`${selectedPolicy.name} 关联角色`} action="保存" onAction={() => notify(`${selectedPolicy.name} 权限项已保存`)}>
              <div className="policy-detail">
                <p><span>模块</span><b>{selectedPolicy.module}</b></p>
                <p><span>风险级别</span><b>{selectedPolicy.risk}风险</b></p>
                <p><span>最近更新</span><b>{selectedPolicy.lastUpdated}</b></p>
                <p><span>说明</span><b>{selectedPolicy.desc}</b></p>
              </div>
              <div className="policy-role-list">
                {roles.map((role) => {
                  const checked = selectedPolicy.roles.includes(role.name);
                  return (
                    <button key={role.id} className={checked ? "checked" : ""} type="button" onClick={() => notify(`${role.name} ${checked ? "已保持关联" : "需要在角色页授予"} ${selectedPolicy.name}`, checked ? "info" : "warning")}>
                      <span>{role.name}</span>
                      <i>{checked ? "已关联" : "未关联"}</i>
                    </button>
                  );
                })}
              </div>
            </PanelCard>
          ) : (
            <PanelCard title="权限项详情">
              <p className="module-empty-card">没有可展示的权限项详情</p>
            </PanelCard>
          )}
        </div>
      )}
    </ModulePageShell>
  );
}

function DatabasesPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const databasePreset = databasePagePreset(page);
  const [search, setSearch] = useState(databasePreset.search);
  const [typeFilter, setTypeFilter] = useState(databasePreset.type);
  const [statusFilter, setStatusFilter] = useState(databasePreset.status);
  const [hostFilter, setHostFilter] = useState(databasePreset.host);
  const [rows, setRows] = useState(dbRows);
  const [lastSync, setLastSync] = useState(currentClock());
  const filteredRows = rows.filter((row) => {
    const matchSearch = row[0].toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "全部" || row[1].includes(typeFilter);
    const matchStatus = statusFilter === "全部" || (statusFilter === "告警" ? row[4].startsWith("延迟") || row[5] === "失败" : row[4] === "正常");
    const matchHost = hostFilter === "全部主机" || row[2] === hostFilter;
    const matchSlow = page === "databases-slow" ? Number(row[6]) > 0 || row[4].startsWith("延迟") : true;
    return matchSearch && matchType && matchStatus && matchHost && matchSlow;
  });
  return (
    <div className="database-page">
      <div className="page-head">
        <div>
          <h1>{resolvePageMeta(page).title}</h1>
          <p>{databasePreset.subtitle} · 最近同步 {lastSync}</p>
        </div>
        <div>
          <button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredRows.length} 条数据库记录`, "info")}><Download size={15} /> 导出</button>
          <button
            className="ghost"
            type="button"
            onClick={() => {
              setLastSync(currentClock());
              notify("数据库状态已刷新");
            }}
          >
            <RefreshCw size={15} /> 刷新
          </button>
          <button className="primary" type="button" onClick={() => notify("请在右侧抽屉填写数据库信息", "info")}><Plus size={15} /> 创建数据库</button>
        </div>
      </div>
      <div className="database-layout">
        <section className="db-main">
          <ModuleViewContext context={viewContextForPage(page) ?? {
            eyebrow: "数据库 / 默认视图",
            title: resolvePageMeta(page).title,
            description: databasePreset.subtitle,
            chips: [`类型 ${typeFilter}`, `状态 ${statusFilter}`, `主机 ${hostFilter}`],
          }} />
          <div className="filter-line">
            <label>
              <Search size={14} />
              <input value={search} placeholder="搜索数据库名称" onChange={(event) => setSearch(event.target.value)} />
            </label>
            <FieldSelect label="类型" value={typeFilter} options={["全部", "PostgreSQL", "MySQL"]} onChange={setTypeFilter} />
            <FieldSelect label="状态" value={statusFilter} options={["全部", "正常", "告警"]} onChange={setStatusFilter} />
            <FieldSelect label="主机" value={hostFilter} options={["全部主机", "10.0.12.24", "10.0.12.31", "10.0.13.15"]} onChange={setHostFilter} />
          </div>
          <div className="db-metrics">
            {[
              [Database, "PostgreSQL", "8", "实例", "blue"],
              [Database, "MySQL", "6", "实例", "blue"],
              [Activity, "运行中", "13", "实例", "green"],
              [Shield, "告警", "2", "实例", "orange"],
              [Activity, "备份成功率", "96.4%", "最近 7 天", "green"],
              [Clock3, "今日慢查询", "17", "较昨日 +5", "orange"],
            ].map(([Icon, label, value, desc, tone]) => (
              <article key={label as string}>
                <Icon className={tone as string} size={34} />
                <div>
                  <span>{label as string}</span>
                  <strong>{value as string}</strong>
                  <em>{desc as string}</em>
                </div>
              </article>
            ))}
          </div>
          <DatabaseTable rows={filteredRows} notify={notify} />
          {databasePreset.mode === "backups" && (
            <div className="backup-timeline">
              {["02:00 prod-postgres-01 成功", "02:10 billing-mysql-02 等待确认", "02:20 analytics-mysql-01 失败"].map((item) => <p key={item}><StatusLight tone={item.includes("失败") ? "red" : item.includes("等待") ? "orange" : "green"} /> {item}</p>)}
            </div>
          )}
          <div className={`db-bottom ${databasePreset.mode === "slow" ? "slow-mode" : ""}`}>
            {databasePreset.mode === "slow" ? (
              <>
                <PanelCard title="慢查询 TOP 5（analytics-mysql-01）" className="db-card-wide">
                  <SlowSqlList />
                </PanelCard>
                <PanelCard title="慢查询治理建议">
                  <div className="db-advice-list">
                    <p><StatusLight tone="orange" /> orders.status 缺少组合索引，建议补充 status + created_at。</p>
                    <p><StatusLight tone="red" /> invoices 批量更新命中 12 万行，建议拆分批次。</p>
                    <p><StatusLight tone="green" /> users 聚合查询可迁移到只读副本。</p>
                  </div>
                </PanelCard>
                <PanelCard title="连接健康（analytics-mysql-01）" action="查看监控详情" onAction={() => notify("已打开连接监控详情", "info")}>
                  <HealthMini />
                </PanelCard>
              </>
            ) : (
              <>
                <PanelCard title="备份状态（最近 7 天）" action="查看备份计划" onAction={() => notify("已打开备份计划", "info")}>
                  <DonutCard />
                </PanelCard>
                <PanelCard title="连接健康（prod-postgres-01）" action="查看监控详情" onAction={() => notify("已打开连接监控详情", "info")}>
                  <HealthMini />
                </PanelCard>
                <PanelCard title="慢查询 TOP 5（analytics-mysql-01）">
                  <SlowSqlList />
                </PanelCard>
                <PanelCard title="审计日志（最近操作）" action="查看全部" onAction={() => notify("已打开数据库审计日志", "info")}>
                  <MiniAuditList />
                </PanelCard>
              </>
            )}
          </div>
        </section>
        <CreateDatabaseDrawer
          notify={notify}
          onCreate={(draft) => {
            const engine = draft.type === "PostgreSQL" ? "PostgreSQL 16.2" : "MySQL 8.0.36";
            setRows((current) => [
              [draft.name, engine, "10.0.12.24", draft.port, "正常", "成功", "0", currentClock(), "读写", "研发"],
              ...current,
            ]);
            notify(`数据库 ${draft.name} 已创建`);
          }}
        />
      </div>
    </div>
  );
}

function DatabaseTable({ rows, notify }: { rows: string[][]; notify: Notify }) {
  return (
    <table className="mini-table database-table">
      <thead>
        <tr>
          <th>名称</th>
          <th>类型</th>
          <th>主机</th>
          <th>端口</th>
          <th>连接健康</th>
          <th>备份</th>
          <th>慢查询</th>
          <th>最近备份</th>
          <th>权限</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row[0]}>
            <td><StatusLight tone={row[4].startsWith("延迟") ? "orange" : "green"} /> <b className="blue-text">{row[0]}</b></td>
            <td><Database size={15} /> {row[1]}</td>
            <td>{row[2]}</td>
            <td>{row[3]}</td>
            <td><StatusLight tone={row[4].startsWith("延迟") ? "orange" : "green"} /> {row[4]}</td>
            <td><StatusLight tone={row[5] === "失败" ? "red" : row[5] === "等待确认" ? "orange" : "green"} /> {row[5]}</td>
            <td className={Number(row[6]) > 0 ? "red-text" : ""}>{row[6]}</td>
            <td>{row[7]}</td>
            <td><span className="pill blue">{row[8]}</span> <span className="pill green">{row[9]}</span></td>
            <td className="table-actions">
              <button type="button" onClick={() => notify(`正在查看 ${row[0]}`, "info")}>查看</button>
              <button type="button" onClick={() => notify(`已触发 ${row[0]} 备份`)}>备份</button>
              <button type="button" onClick={() => notify(`${row[0]} 更多操作已展开`, "info")}><MoreVertical size={15} /></button>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={10} className="empty-row">没有匹配的数据库实例</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function CreateDatabaseDrawer({
  notify,
  onCreate,
}: {
  notify: Notify;
  onCreate: (draft: { name: string; type: string; port: string }) => void;
}) {
  const [name, setName] = useState("newdb_app");
  const [type, setType] = useState("PostgreSQL");
  const [port, setPort] = useState("5432");
  const [autoBackup, setAutoBackup] = useState(true);
  const [remote, setRemote] = useState(false);

  return (
    <aside className="create-drawer">
      <div className="drawer-head">
        <strong>创建数据库</strong>
        <button type="button" className="icon-action" onClick={() => notify("创建抽屉保持固定展示，已清空草稿", "info")}><X size={16} /></button>
      </div>
      <FormLine label="数据库名" required value={name} onChange={setName} />
      <FormSelectLine label="类型" required value={type} options={["PostgreSQL", "MySQL"]} onChange={(next) => {
        setType(next);
        setPort(next === "PostgreSQL" ? "5432" : "3306");
      }} icon={<Database size={14} />} />
      <FormSelectLine label="绑定主机" required value="10.0.12.24 (prod-db-01)" />
      <FormLine label="端口" required value={port} onChange={setPort} hint={`默认 ${type === "PostgreSQL" ? "5432" : "3306"}`} />
      <FormLine label="用户名" required value="newdb_app" />
      <FormLine label="初始密码" required value="••••••••••••••••" strength />
      <FormSelectLine label="字符集" value="UTF8" />
      <FormSelectLine label="时区" value="Asia/Shanghai" />
      <FormTagLine label="权限范围" />
      <ToggleLine label="自动备份" active={autoBackup} onToggle={setAutoBackup} hint="每天 02:00 执行，备份保留 7 天" />
      <ToggleLine label="允许远程连接" active={remote} onToggle={setRemote} hint="仅允许白名单 IP 访问" />
      <div className="drawer-tip">备份保留 7 天，周期将自动清理。审计日志记录所有变更操作。</div>
      <div className="drawer-warning">删除数据库为危险操作，执行后将无法恢复。请务必谨慎操作！</div>
      <div className="drawer-actions">
        <button className="ghost" type="button" onClick={() => {
          setName("newdb_app");
          setType("PostgreSQL");
          setPort("5432");
          notify("数据库草稿已重置", "info");
        }}>取消</button>
        <button className="primary" type="button" onClick={() => {
          if (!name.trim()) {
            notify("数据库名不能为空", "danger");
            return;
          }
          onCreate({ name: name.trim(), type, port });
        }}>创建数据库</button>
      </div>
    </aside>
  );
}

function SettingsPage({ page, setPage, notify }: { page: PageKey; setPage: SetPage; notify: Notify }) {
  const tabs = ["基础", "安全", "代理", "通知", "备份", "审计"];
  const [activeTab, setActiveTab] = useState(settingsPagePreset(page));
  const [readOnly, setReadOnly] = useState(false);
  const [backupItems, setBackupItems] = useState(["面板数据", "审计日志"]);
  const [twoFactor, setTwoFactor] = useState(true);
  const [multiLogin, setMultiLogin] = useState(false);
  const [mailNotice, setMailNotice] = useState(true);
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const activeSettingsPage = settingsPageForTab(activeTab);
  const toggleBackupItem = (item: string) => {
    setBackupItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  };
  return (
    <div className="settings-mock-page">
      <div className="page-head settings-title">
        <div>
          <h1>{resolvePageMeta(page).title}</h1>
          <p>配置面板身份、访问令牌、备份与恢复策略、安全与通知等全局设置，确保系统安全、可审计、稳定运行。</p>
        </div>
      </div>
      <ModuleViewContext context={viewContextForPage(activeSettingsPage) ?? {
        eyebrow: "设置 / 基础设置",
        title: activeTab,
        description: `当前定位到${activeTab}设置。`,
        chips: [`Tab ${activeTab}`],
      }} />
      <div className="settings-tabs">
        {tabs.map((tab) => (
          <button
            className={tab === activeTab ? "active" : ""}
            type="button"
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setPage(settingsPageForTab(tab), { message: `已切换到${tab}设置`, tone: "info" });
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="settings-layout">
        {(activeTab === "基础" || activeTab === "代理") && <PanelCard title="面板身份" className="settings-card-tall">
          <div className="settings-form">
            <FormLine label="面板名称" value="StackPilot 控制面板" />
            <FormLine label="公网访问地址" value="https://panel.example.com" success="已验证" />
            <FormLine label="管理员邮箱" value="admin@example.com" />
            <FormSelectLine label="时区" value="Asia/Shanghai (UTC+08:00)" />
            <FormSelectLine label="语言" value="简体中文" />
            <FormLine label="版本号" value="v1.8.2 (Build 20250810.1)" success="已是最新" />
            <ToggleLine label="只读模式" active={readOnly} onToggle={setReadOnly} hint="开启后所有操作将被强制转为只读" />
            <button className="primary save-button" type="button" onClick={() => notify("面板身份设置已保存")}>保存设置</button>
          </div>
        </PanelCard>}
        {(activeTab === "基础" || activeTab === "代理") && <PanelCard title="访问令牌" className="settings-card-wide">
          <div className="token-title">
            <span>用于 API 访问、CI/CD 集成或第三方工具接入，请妥善保管令牌，避免泄露。</span>
            <div><button className="primary" type="button" onClick={() => notify("新访问令牌已生成")}><Plus size={14} /> 生成令牌</button><button className="danger-soft" type="button" onClick={() => notify("已进入令牌批量编辑模式", "warning")}><Trash2 size={14} /> 编辑清单中</button></div>
          </div>
          <TokenTable notify={notify} />
        </PanelCard>}
        {activeTab === "备份" && <PanelCard title="备份策略">
          <div className="backup-grid">
            <FormSelectLine label="备份频率" value="每日" />
            <FormLine label=" " value="02:30" />
            <FormSelectLine label="保留策略" value="保留 14 份" />
            <FormSelectLine label="备份目标" value="S3 / MinIO" />
            <FormLine label="存储位置" value="s3://stackpilot-backup/" />
            <button className="ghost" type="button" onClick={() => notify("S3 / MinIO 连接测试成功")}>测试连接</button>
            <FormSelectLine label="加密设置" value="启用（AES-256）" />
          </div>
          <div className="check-row">
            {["面板数据", "审计日志", "上传文件"].map((item) => (
              <button key={item} className={backupItems.includes(item) ? "checked" : ""} type="button" onClick={() => toggleBackupItem(item)}>{item}</button>
            ))}
          </div>
          <div className="settings-buttons"><button className="primary" type="button" onClick={() => notify("备份策略已保存")}>保存策略</button><button className="primary" type="button" onClick={() => notify("已创建立即备份任务")}><Download size={14} /> 立即备份</button><button className="ghost" type="button" onClick={() => notify("恢复演练流程已打开", "info")}>恢复演练</button></div>
        </PanelCard>}
        {activeTab === "备份" && <PanelCard title="验证状态" className="settings-card-wide">
          <div className="verify-box">
            <p className="ok-line"><CheckCircle2 size={15} /> 最近验证成功：2025-08-12 03:01</p>
            <p className="warn-line">上次备份延迟 18 分钟 <button type="button" onClick={() => notify("已打开备份延迟详情", "warning")}>查看详情</button></p>
            <p className="error-line">恢复演练未完成 <button type="button" onClick={() => notify("恢复演练流程已打开", "warning")}>前往演练</button></p>
          </div>
          <div className="backup-list">
            <div><strong>最近备份任务</strong><button type="button" onClick={() => notify("已打开全部备份任务", "info")}>查看全部</button></div>
            {["2025-08-13 02:30", "2025-08-12 02:30", "2025-08-11 02:30", "2025-08-10 02:30", "2025-08-09 02:30"].map((time, index) => (
              <p key={time}><span>{time}</span><StatusLight tone={index === 3 ? "orange" : "green"} /> <em>{index === 3 ? "延迟" : "成功"}</em><b>{index === 0 ? "1.24 GB" : index === 1 ? "1.22 GB" : "1.18 GB"}</b><small>{index === 0 ? "00:03:21" : "00:03:05"}</small></p>
            ))}
          </div>
          <div className="storage-bar"><span style={{ width: "48%" }} /><em>可用空间：482.36 GB / 1.00 TB (48%)</em></div>
        </PanelCard>}
        {activeTab === "安全" && <PanelCard title="安全设置">
          <div className="right-settings">
            <ToggleLine label="强制启用两步验证（2FA）" active={twoFactor} onToggle={setTwoFactor} />
            <FormSelectLine label="会话超时时间" value="30 分钟" />
            <FormLine label="IP 访问白名单" value="10.0.0.0/8, 172.16.0.0/12" />
            <ToggleLine label="允许多地同时登录" active={multiLogin} onToggle={setMultiLogin} />
            <FormSelectLine label="登录失败锁定" value="5 次 / 15 分钟" />
          </div>
        </PanelCard>}
        {activeTab === "安全" && <PanelCard title="安全验证">
          <div className="verify-box">
            <p className="ok-line"><CheckCircle2 size={15} /> MFA 覆盖率：100%</p>
            <p className="warn-line">2 个 IP 白名单等待复核 <button type="button" onClick={() => notify("已打开 IP 白名单复核", "warning")}>查看</button></p>
            <p className="ok-line"><CheckCircle2 size={15} /> 最近登录策略校验通过</p>
          </div>
        </PanelCard>}
        {activeTab === "通知" && <PanelCard title="通知设置">
          <div className="right-settings">
            <FormLine label="Webhook 通知" value="https://hooks.example.com/stackpilot" hintButton="测试" hintAction={() => notify("Webhook 测试成功")} />
            <ToggleLine label="关键事件邮件通知" active={mailNotice} onToggle={setMailNotice} />
            <FormLine label="通知收件人" value="ops@example.com, dev@example.com" />
            <div className="connected-line"><CheckCircle2 size={14} /> 已连接（响应成本 45ms） <button type="button" onClick={() => notify("通知预览已发送")}>预览</button></div>
          </div>
        </PanelCard>}
        {activeTab === "代理" && <PanelCard title="代理设置">
          <div className="right-settings">
            <FormLine label="HTTP 代理" value="http://proxy.internal:7890" hintButton="测试" hintAction={() => notify("HTTP 代理连通")} />
            <FormLine label="NO_PROXY" value="localhost,127.0.0.1,10.0.0.0/8" />
            <ToggleLine label="部署任务使用代理" active={proxyEnabled} onToggle={setProxyEnabled} />
            <div className="connected-line"><CheckCircle2 size={14} /> 最近探测成功 <button type="button" onClick={() => notify("代理探测已刷新")}>重新探测</button></div>
          </div>
        </PanelCard>}
      </div>
      {(activeTab === "审计" || activeTab === "基础") && <PanelCard title="最近配置变更" action="查看审计日志" onAction={() => notify("已打开设置审计日志", "info")}>
        <table className="mini-table changes-table">
          <tbody>
            {settingsChanges.map((row) => (
              <tr key={row.join("-")}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </PanelCard>}
    </div>
  );
}

function MobileApp({ notify }: { notify: Notify }) {
  const [activeTab, setActiveTab] = useState("首页");
  const [activeQuick, setActiveQuick] = useState("添加主机");
  const mobileTasks: Array<[LucideIcon, string, string, string, string]> = [
    [CloudUpload, "部署 Laravel 应用到 web-01", "admin 触发", "成功", "2 分钟前"],
    [Database, "备份数据库 shop_db", "system 自动", "成功", "15 分钟前"],
    [RefreshCw, "更新系统组件 /web-02", "admin 触发", "警告", "32 分钟前"],
    [Server, "重启 Nginx 服务（web-01）", "自动监控", "成功", "1 小时前"],
    [TerminalSquare, "登录到 203.0.113.10", "admin 登录", "信息", "1 小时前"],
  ];
  const tabSummary: Record<string, string> = {
    首页: "5 台主机在线 · 2 个告警",
    主机: "3 台生产主机 · db-01 需要关注",
    网站: "12 个网站正常运行",
    任务: "5 条最近任务 · 1 条警告",
    我的: "管理员 · 面板运行正常",
  };

  return (
    <section className="mobile-app-shell">
      <header className="mobile-top">
        <button type="button" className="mobile-icon-button" aria-label="打开菜单" onClick={() => notify("移动端菜单已打开", "info")}><Menu size={20} /></button>
        <div className="mobile-brand"><div className="brand-gem small" /><strong>StackPilot</strong></div>
        <div className="mobile-icons"><button type="button" aria-label="查看通知" onClick={() => notify("移动端通知已标记为已读", "info")}><Bell size={18} /></button><i>3</i><button type="button" aria-label="打开个人中心" onClick={() => notify("已打开移动端个人中心", "info")}><b>U</b></button></div>
      </header>
      <div className="mobile-content">
        <h2>上午好，管理员</h2>
        <p>{activeTab} · {tabSummary[activeTab]}</p>
        <div className="mobile-stats">
          {[
            [Server, "主机", "5", "全部在线", "green"],
            [Globe2, "网站", "12", "正常运行", "green"],
            [Database, "数据库", "8", "运行中", "green"],
            [Shield, "告警", "2", "需要处理", "orange"],
          ].map(([Icon, label, value, desc, tone]) => (
            <article key={label as string}>
              <Icon className={tone as string} size={20} />
              <span>{label as string}</span>
              <strong>{value as string}</strong>
              <em><StatusLight tone={tone as Tone} />{desc as string}</em>
            </article>
          ))}
        </div>
        <MobileCard title="系统状态" action="查看详情" onAction={() => notify("已打开移动端系统状态详情", "info")}>
          <div className="mobile-resource">
            {[
              ["CPU", "18%", "负载 0.38", [18, 14, 23, 16, 28, 18, 22]],
              ["内存", "42%", "3.2 / 7.6 GB", [38, 42, 39, 46, 41, 43, 45]],
              ["磁盘", "37%", "180 / 480 GB", [35, 39, 37, 42, 36, 41, 38]],
            ].map(([label, value, desc, values]) => (
              <article key={label as string}>
                <span>{label as string}</span>
                <strong>{value as string}</strong>
                <Sparkline values={values as number[]} tone="blue" />
                <em>{desc as string}</em>
              </article>
            ))}
          </div>
        </MobileCard>
        <MobileCard title="最近任务" action="查看全部" onAction={() => notify("已打开移动端任务列表", "info")}>
          <div className="mobile-task-list">
            {mobileTasks.map(([Icon, title, operator, status, time]) => {
              const openTask = () => notify(`已打开任务：${title}`, "info");
              return (
                <div key={title} role="button" tabIndex={0} onClick={openTask} onKeyDown={(event) => activateOnKeyboard(event, openTask)}>
                  <span className="mobile-task-icon"><Icon size={14} /></span>
                  <p><strong>{title}</strong><em>{operator}</em></p>
                  <StatusLight tone={status === "警告" ? "orange" : status === "信息" ? "blue" : "green"} />
                  <b>{status}</b>
                  <small>{time}</small>
                </div>
              );
            })}
          </div>
        </MobileCard>
        <MobileCard title="快捷操作">
          <div className="mobile-quick">
            {["添加主机", "创建网站", "新建数据库", "上传文件", "终端连接", "系统服务", "计划任务", "防火墙规则"].map((item) => (
              <button
                className={item === activeQuick ? "active" : ""}
                key={item}
                type="button"
                onClick={() => {
                  setActiveQuick(item);
                  notify(`移动端已选择：${item}`, "info");
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </MobileCard>
        <MobileCard title="主机状态" action="查看全部" onAction={() => notify("已打开移动端主机列表", "info")}>
          <div className="mobile-hosts">
            {[
              ["web-01", "生产环境", "203.0.113.10", "Ubuntu 22.04", "12%", "38%", "2 天"],
              ["web-02", "生产环境", "203.0.113.11", "Ubuntu 22.04", "22%", "45%", "5 天"],
              ["db-01", "数据库", "203.0.113.20", "Ubuntu 22.04", "35%", "62%", "12 天"],
            ].map((row) => {
              const openHost = () => notify(`已打开主机：${row[0]}`, "info");
              return (
                <div key={row[0]} role="button" tabIndex={0} onClick={openHost} onKeyDown={(event) => activateOnKeyboard(event, openHost)}>
                  <StatusLight tone={row[0] === "db-01" ? "orange" : "green"} />
                  <p><strong>{row[0]}</strong><span>{row[1]}</span><em>{row[2]} | {row[3]}</em></p>
                  <b>CPU {row[4]}<br />内存 {row[5]}</b>
                  <small>{row[6]}</small>
                </div>
              );
            })}
          </div>
        </MobileCard>
      </div>
      <nav className="mobile-tabbar" aria-label="移动端主导航">
        {[[Home, "首页"], [Server, "主机"], [Globe2, "网站"], [ClipboardIcon, "任务"], [UserRound, "我的"]].map(([Icon, label], index) => (
          <button
            className={label === activeTab || (index === 0 && activeTab === "首页") ? "active" : ""}
            key={label as string}
            type="button"
            onClick={() => {
              setActiveTab(label as string);
              notify(`已切换到移动端${label}`, "info");
            }}
          >
            <Icon size={22} />
            <span>{label as string}</span>
          </button>
        ))}
      </nav>
    </section>
  );
}

function ClipboardIcon({ size = 22 }: { size?: number }) {
  return <FileText size={size} />;
}

function PanelCard({
  title,
  action,
  tabs,
  activeTab,
  className,
  onTabChange,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  tabs?: string[];
  activeTab?: string;
  className?: string;
  onTabChange?: (tab: string) => void;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`panel-card ${className ?? ""}`}>
      <header>
        <strong>{title}</strong>
        <div>
          {tabs?.map((tab, index) => (
            <button
              className={(activeTab ?? tabs[0]) === tab || (!activeTab && index === 0) ? "active" : ""}
              key={tab}
              type="button"
              onClick={() => onTabChange?.(tab)}
            >
              {tab}
            </button>
          ))}
          {action && <button className="panel-link" type="button" onClick={onAction}>{action}</button>}
        </div>
      </header>
      {children}
    </section>
  );
}

function MobileCard({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mobile-card">
      <header><strong>{title}</strong>{action && <button type="button" onClick={onAction}>{action}</button>}</header>
      {children}
    </section>
  );
}

function Sparkline({ values, tone = "blue" }: { values: number[]; tone?: string }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = 4 + (index / (values.length - 1)) * 92;
      const y = 36 - ((value - min) / range) * 28;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className={`spark ${tone}`} viewBox="0 0 100 42" aria-hidden="true">
      <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Bar({ value, tone }: { value: string; tone: Tone }) {
  return (
    <span className="bar-cell">
      <em>{value}</em>
      <i><b className={tone} style={{ width: value }} /></i>
    </span>
  );
}

function StatusLight({ tone }: { tone: Tone | string }) {
  return <i className={`status-light ${tone}`} />;
}

function StatusDot({ text }: { text: string }) {
  return <span className="status-dot"><StatusLight tone="green" />{text}</span>;
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options?: string[];
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <label
      className={`field-select ${open ? "open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <span>{label}</span>
      <button type="button" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((current) => !current)}>{value}<ChevronDown size={12} /></button>
      {open && options && (
        <div className="popover-panel" role="listbox">
          {options.map((option) => (
            <button
              className={option === value ? "active" : ""}
              key={option}
              role="option"
              aria-selected={option === value}
              type="button"
              onClick={() => {
                onChange?.(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

function FormLine({
  label,
  value,
  required,
  success,
  hint,
  hintButton,
  hintAction,
  strength,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  success?: string;
  hint?: string;
  hintButton?: string;
  hintAction?: () => void;
  strength?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="form-line">
      <span>{label}{required && <b>*</b>}</span>
      <div>
        <input value={value} readOnly={!onChange} onChange={(event) => onChange?.(event.target.value)} />
        {hint && <em>{hint}</em>}
        {hintButton && <button type="button" onClick={hintAction}>{hintButton}</button>}
        {success && <small><CheckCircle2 size={12} /> {success}</small>}
      </div>
      {strength && <p className="password-strength"><i /><i /><i /><em>强</em></p>}
    </label>
  );
}

function FormSelectLine({
  label,
  value,
  required,
  icon,
  options,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  icon?: React.ReactNode;
  options?: string[];
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <label
      className="form-line"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
        }
      }}
    >
      <span>{label}{required && <b>*</b>}</span>
      <button className={`select-like ${open ? "open" : ""}`} type="button" aria-expanded={open} aria-haspopup="listbox" onClick={() => options && setOpen((current) => !current)}>{icon}{value}<ChevronDown size={12} /></button>
      {open && options && (
        <div className="select-menu" role="listbox">
          {options.map((option) => (
            <button
              className={option === value ? "active" : ""}
              key={option}
              role="option"
              aria-selected={option === value}
              type="button"
              onClick={() => {
                onChange?.(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </label>
  );
}

function FormTagLine({ label }: { label: string }) {
  return (
    <label className="form-line">
      <span>{label}<b>*</b></span>
      <div className="tag-input"><em>读写 ×</em><em>仅团队 ×</em></div>
    </label>
  );
}

function ToggleLine({ label, active, hint, onToggle }: { label: string; active?: boolean; hint?: string; onToggle?: (active: boolean) => void }) {
  return (
    <button className="toggle-line" type="button" role="switch" aria-checked={Boolean(active)} onClick={() => onToggle?.(!active)}>
      <span>{label}</span>
      <i className={active ? "on" : ""}><b /></i>
      {hint && <em>{hint}</em>}
    </button>
  );
}

function DonutCard() {
  return (
    <div className="donut-card">
      <div className="donut" />
      <div>
        <p><StatusLight tone="green" /> 成功 <b>52 (96.4%)</b></p>
        <p><StatusLight tone="red" /> 失败 <b>2 (3.6%)</b></p>
        <p>总计 <b>54</b></p>
      </div>
    </div>
  );
}

function HealthMini() {
  return (
    <div className="health-mini">
      {[
        ["延迟 (Ping)", "12 ms", [10, 12, 11, 15, 12, 13]],
        ["连接数", "24 / 200", [18, 20, 24, 21, 25, 24]],
        ["CPU 使用率", "18%", [12, 16, 18, 13, 19, 18]],
        ["I/O 等待", "2%", [3, 2, 2, 4, 3, 2]],
      ].map(([label, value, points]) => (
        <p key={label as string}><span>{label as string}</span><b>{value as string}</b><Sparkline values={points as number[]} tone="blue" /></p>
      ))}
    </div>
  );
}

function SlowSqlList() {
  return (
    <div className="slow-sql">
      {["SELECT * FROM orders WHERE status = 'pending' ...", "UPDATE invoices SET status = 'paid' WHERE id IN ...", "SELECT uid, name, COUNT(id) FROM users ...", "DELETE FROM logs WHERE created_at < NOW() ...", "INSERT INTO metrics (name, value, created_at) ..."].map((sql, index) => (
        <p key={sql}><span>{sql}</span><b>{[2.48, 2.41, 1.95, 1.73, 1.28][index]}s</b></p>
      ))}
    </div>
  );
}

function MiniAuditList() {
  return (
    <div className="mini-audit">
      {["创建只读用户 readonly_reporter", "触发手动备份 billing-mysql-02", "修改连接池配置 analytics-mysql-01", "新增备份策略 analytics-mysql-01"].map((item, index) => (
        <p key={item}><span>{["10:42", "09:15", "08:51", "昨天 23:30"][index]}</span><b>{index === 0 ? "张工" : index === 1 ? "李工" : "系统"}</b><em>{item}</em></p>
      ))}
    </div>
  );
}

function TokenTable({ notify }: { notify: Notify }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [rows, setRows] = useState([
    ["CI 发布令牌", "stkp_12A9••••", "主机(读写) / 部署 / 文件(读写)", "2025-07-01 10:22", "2025-08-13 08:47", "已启用"],
    ["运维只读令牌", "stkp_6F3B••••", "主机(只读) / 网站(只读) / 数据库(只读)", "2025-06-15 14:05", "2025-08-12 17:32", "仅只读"],
    ["审计导出令牌", "stkp_8C7D••••", "审计日志(读) / 导出", "2025-07-20 09:11", "2025-08-08 11:02", "即将过期"],
    ["旧 CI 令牌（已停用）", "stkp_4B2E••••", "主机(读写) / 部署", "2025-03-18 16:30", "2025-07-01 12:10", "已停用"],
  ]);

  return (
    <table className="mini-table token-table">
      <thead><tr><th /><th>名称</th><th>令牌前缀</th><th>权限范围</th><th>创建时间</th><th>最近使用</th><th>状态</th><th>操作</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr className={selected.includes(row[0]) ? "is-selected" : ""} key={row[0]}>
            <td><input type="checkbox" checked={selected.includes(row[0])} onChange={(event) => {
              setSelected((current) => event.target.checked ? [...current, row[0]] : current.filter((item) => item !== row[0]));
            }} /></td>
            {row.slice(0, 6).map((cell) => <td key={cell}>{cell}</td>)}
            <td className="table-icon-actions">
              <button type="button" onClick={() => notify(`正在查看令牌：${row[0]}`, "info")}><Eye size={15} /></button>
              <button type="button" onClick={() => notify(`正在编辑令牌：${row[0]}`, "info")}><Edit3 size={15} /></button>
              <button type="button" onClick={() => {
                setRows((current) => current.filter((item) => item[0] !== row[0]));
                notify(`令牌已删除：${row[0]}`, "warning");
              }}><Trash2 size={15} /></button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActionToast({ toast }: { toast: ToastState }) {
  return (
    <div className={`action-toast ${toast.tone}`} role="status" aria-live="polite">
      <StatusLight tone={toast.tone === "danger" ? "red" : toast.tone === "warning" ? "orange" : toast.tone === "info" ? "blue" : "green"} />
      <span>{toast.message}</span>
    </div>
  );
}

function DesktopFooter() {
  return (
    <footer className="desktop-footer">
      <span>© 2025 StackPilot 开源版 v2.8.1</span>
      <div><BookOpen size={14} /> 文档 <Globe2 size={14} /> GitHub <FileBox size={14} /> 社区论坛 <CircleHelp size={14} /> 帮助中心</div>
    </footer>
  );
}

export default App;
