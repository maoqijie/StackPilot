import { useCallback, useEffect, useId, useRef, useState } from "react";
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
type TopbarPanel = "search" | "notifications" | "activity" | "help" | "user" | null;
type TopbarMenuPanel = Exclude<TopbarPanel, "search" | null>;
type TopbarSearchResult = { id: string; label: string; detail: string; page: PageKey; kind: string };
type NavChild = { id: string; label: string; meta: string; page?: PageKey; badge?: string };
type BackupDraft = {
  frequency: string;
  runAt: string;
  retention: string;
  target: string;
  location: string;
  encryption: string;
};
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

const drawerFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isFocusableElement(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.offsetParent !== null;
}

function drawerFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(drawerFocusableSelector)).filter(isFocusableElement);
}

function drawerRestoreFallback(drawer: HTMLElement) {
  const layout = drawer.closest(".module-layout");
  const scopes: Array<ParentNode | null> = [layout, document];
  const selectors = [
    ".module-main .module-row-link",
    ".module-main .table-actions button:not([disabled])",
    ".module-main button:not([disabled])",
    ".module-head button:not([disabled])",
  ];

  for (const scope of scopes) {
    if (!scope) continue;
    for (const selector of selectors) {
      const target = scope.querySelector<HTMLElement>(selector);
      if (target && !drawer.contains(target) && isFocusableElement(target)) return target;
    }
  }
  return null;
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
      { id: "databases-slow", label: "慢查询", meta: "4 条", badge: "4" },
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

const topbarNotifications = [
  { id: "ntf-1", title: "备份延迟 18 分钟", detail: "prod-postgres-01 已进入观察队列", tone: "orange", time: "2 分钟前" },
  { id: "ntf-2", title: "证书即将过期", detail: "api.stackpilot.local 还剩 5 天", tone: "red", time: "18 分钟前" },
  { id: "ntf-3", title: "部署任务完成", detail: "web-console v2.8.1 已发布到生产", tone: "green", time: "36 分钟前" },
] as const;

const topbarActivities = [
  { id: "act-1", title: "张工 更新防火墙规则", detail: "允许 10.0.0.0/8 访问 443/TCP", time: "刚刚" },
  { id: "act-2", title: "admin 重启 systemd 服务", detail: "nginx.service 已恢复 active", time: "12 分钟前" },
  { id: "act-3", title: "CI 创建部署任务", detail: "api-gateway staging v2.8.2-rc", time: "42 分钟前" },
] as const;

const topbarHelpLinks = [
  { id: "help-1", title: "快捷排障手册", detail: "查看主机、服务、日志的标准路径" },
  { id: "help-2", title: "防火墙规则说明", detail: "端口、协议、来源的填写规范" },
  { id: "help-3", title: "部署回滚指南", detail: "失败后如何查看日志并回滚" },
] as const;

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

function navChildMetaText(child: NavChild) {
  if (!child.meta) return "";
  if (!child.badge) return child.meta;
  const escapedBadge = child.badge.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return child.meta.replace(new RegExp(`^${escapedBadge}\\s*(个|条|项|台|人|组|风险|待执行)?\\s*`), "").trim();
}

function secondsFromDuration(value: string) {
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) return 0;
  return value.toLowerCase().includes("ms") ? amount / 1000 : amount;
}

function activeNavEntryForPage(page: PageKey) {
  const parentKey = navPageFor(page);
  const parent = navItems.find((item) => item.key === parentKey);
  const child = parent?.children.find((item) => (item.page ?? item.id) === page);
  return { parent, child };
}

function topbarSearchResults(query: string): TopbarSearchResult[] {
  const normalized = query.trim().toLowerCase();
  const entries: TopbarSearchResult[] = navItems.flatMap((item) => [
    { id: item.key, label: item.label, detail: resolvePageMeta(item.key).breadcrumb, page: item.key, kind: "模块" },
    ...item.children.map((child) => ({
      id: child.page ?? child.id,
      label: `${item.label} / ${child.label}`,
      detail: child.meta,
      page: child.page ?? child.id,
      kind: "入口",
    })),
  ]);
  const quickActions: TopbarSearchResult[] = [
    { id: "quick-create-host", label: "新增主机", detail: "打开主机新增页", page: "hosts", kind: "动作" },
    { id: "quick-open-terminal", label: "开启终端", detail: "进入终端会话", page: "terminal", kind: "动作" },
    { id: "quick-create-rule", label: "新增防火墙规则", detail: "打开防火墙规则列表", page: "firewall", kind: "动作" },
    { id: "quick-audit-export", label: "导出审计日志", detail: "进入审计导出记录", page: "audit-export", kind: "动作" },
  ];
  const allEntries = [...entries, ...quickActions];
  if (!normalized) return allEntries.slice(0, 6);
  return allEntries
    .filter((item) => `${item.label} ${item.detail} ${item.kind}`.toLowerCase().includes(normalized))
    .slice(0, 7);
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
      if (page === "settings-proxy") {
        return { eyebrow, title, description: "独立管理代理节点、路由规则和运行时变量。", chips: ["代理节点", "路由规则", "NO_PROXY"] };
      }
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

const initialDatabaseBackupPlans: DatabaseBackupPlan[] = [
  { id: "db-bkp-plan-1", name: "生产 PostgreSQL 每日全量", database: "prod-postgres-01", storage: "S3", schedule: "0 2 * * *", retention: "14 份", enabled: true, health: "正常", lastRun: "今天 02:14", successRate: 99.2 },
  { id: "db-bkp-plan-2", name: "账务 MySQL 半小时增量", database: "billing-mysql-02", storage: "MinIO", schedule: "*/30 * * * *", retention: "48 份", enabled: true, health: "正常", lastRun: "今天 10:30", successRate: 96.4 },
  { id: "db-bkp-plan-3", name: "分析库夜间归档", database: "analytics-mysql-01", storage: "S3", schedule: "20 2 * * *", retention: "7 份", enabled: true, health: "告警", lastRun: "昨天 20:45", successRate: 82.5 },
  { id: "db-bkp-plan-4", name: "日志库本地快照", database: "logs-mysql-02", storage: "本地", schedule: "0 */6 * * *", retention: "12 份", enabled: false, health: "正常", lastRun: "昨天 18:00", successRate: 91.8 },
];

const initialDatabaseBackupTasks: DatabaseBackupTask[] = [
  { id: "db-bkp-task-1", planId: "db-bkp-plan-1", database: "prod-postgres-01", storage: "S3", status: "成功", startedAt: "今天 02:14", size: "18.6 GB", duration: "3分12秒" },
  { id: "db-bkp-task-2", planId: "db-bkp-plan-2", database: "billing-mysql-02", storage: "MinIO", status: "运行中", startedAt: "今天 10:30", size: "2.4 GB", duration: "1分08秒" },
  { id: "db-bkp-task-3", planId: "db-bkp-plan-3", database: "analytics-mysql-01", storage: "S3", status: "失败", startedAt: "昨天 20:45", size: "-", duration: "18秒" },
  { id: "db-bkp-task-4", planId: "db-bkp-plan-4", database: "logs-mysql-02", storage: "本地", status: "等待", startedAt: "等待窗口", size: "-", duration: "-" },
];

const initialDatabaseRestorePoints: DatabaseRestorePoint[] = [
  { id: "db-restore-1", database: "prod-postgres-01", createdAt: "今天 02:14", storage: "s3://stackpilot/prod-postgres-01", size: "18.6 GB", checksum: "已校验", drillStatus: "未演练" },
  { id: "db-restore-2", database: "billing-mysql-02", createdAt: "今天 10:30", storage: "minio://db-backup/billing-mysql-02", size: "2.4 GB", checksum: "待校验", drillStatus: "未演练" },
  { id: "db-restore-3", database: "archive-pg-02", createdAt: "昨天 22:30", storage: "s3://stackpilot/archive-pg-02", size: "46.2 GB", checksum: "已校验", drillStatus: "已完成" },
];

const initialDatabaseSlowQueries: DatabaseSlowQuery[] = [
  { id: "slow-1", database: "analytics-mysql-01", fingerprint: "orders_status_created_at", sql: "SELECT * FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 200", avgTime: "2.48s", p95Time: "4.12s", calls: 428, rows: "18.4 万", level: "高", status: "待处理", owner: "运维", firstSeen: "今天 09:18", suggestion: "为 orders(status, created_at) 增加组合索引，并限制 SELECT 字段。", sessionId: "mysql-80231" },
  { id: "slow-2", database: "billing-mysql-02", fingerprint: "invoice_bulk_update", sql: "UPDATE invoices SET status = 'paid' WHERE id IN (...)", avgTime: "2.41s", p95Time: "3.86s", calls: 92, rows: "12.1 万", level: "高", status: "分析中", owner: "研发", firstSeen: "今天 08:52", suggestion: "拆分批次并在低峰期执行，避免长事务锁住账务表。", sessionId: "mysql-79418", explain: "type=range, key=PRIMARY, rows=121000, Extra=Using where" },
  { id: "slow-3", database: "metrics-pg-01", fingerprint: "metrics_group_by_day", sql: "SELECT date_trunc('day', created_at), avg(value) FROM metrics GROUP BY 1", avgTime: "1.95s", p95Time: "2.72s", calls: 316, rows: "42.8 万", level: "中", status: "待处理", owner: "运维", firstSeen: "昨天 22:17", suggestion: "增加按天聚合的物化视图，仪表盘读取聚合表。", sessionId: "pg-18842" },
  { id: "slow-4", database: "prod-postgres-01", fingerprint: "users_role_count", sql: "SELECT role, COUNT(*) FROM users WHERE active = true GROUP BY role", avgTime: "1.28s", p95Time: "1.76s", calls: 74, rows: "7.2 万", level: "低", status: "已处理", owner: "DBA", firstSeen: "昨天 16:40", suggestion: "已改为读取只读副本，保留观察 24 小时。", sessionId: "pg-17310", explain: "Seq Scan on users, Filter active=true, HashAggregate role" },
];

const initialProxyEndpoints: ProxyEndpoint[] = [
  { id: "px-1", name: "公司出口代理", protocol: "HTTP", url: "http://proxy.internal:7890", scope: "全局", enabled: true, latency: "42ms", status: "可用", lastCheck: "刚刚" },
  { id: "px-2", name: "部署专用代理", protocol: "HTTPS", url: "https://deploy-proxy.internal:8443", scope: "部署", enabled: true, latency: "68ms", status: "可用", lastCheck: "3 分钟前" },
  { id: "px-3", name: "仓库拉取代理", protocol: "SOCKS5", url: "socks5://git-proxy.internal:1080", scope: "仓库", enabled: false, latency: "-", status: "停用", lastCheck: "未探测" },
  { id: "px-4", name: "终端跳板代理", protocol: "SOCKS5", url: "socks5://ssh-proxy.internal:1081", scope: "终端", enabled: true, latency: "216ms", status: "告警", lastCheck: "12 分钟前" },
];

const initialProxyRules: ProxyRouteRule[] = [
  { id: "rule-1", target: "github.com", type: "代理", endpointId: "px-3", note: "仓库拉取和 release 下载", enabled: true },
  { id: "rule-2", target: "registry.npmjs.org", type: "代理", endpointId: "px-1", note: "前端依赖安装", enabled: true },
  { id: "rule-3", target: "10.0.0.0/8", type: "直连", endpointId: "direct", note: "内网服务保持直连", enabled: true },
  { id: "rule-4", target: "localhost,127.0.0.1", type: "直连", endpointId: "direct", note: "本地预览和开发服务", enabled: true },
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

type FileUploadRecord = {
  id: string;
  name: string;
  targetPath: string;
  size: string;
  progress: number;
  status: "上传中" | "等待" | "已完成" | "失败";
  speed: string;
  owner: string;
  startedAt: string;
};

type TrashFileRecord = {
  id: string;
  name: string;
  originalPath: string;
  size: string;
  deletedAt: string;
  expiresIn: string;
  owner: string;
  reason: string;
};

type TerminalSessionRecord = {
  id: string;
  host: string;
  ip: string;
  user: string;
  cwd: string;
  status: "connected" | "disconnected";
  latency: string;
  startedAt: string;
  lastCommand: string;
  privilege: "sudo" | "user";
};

type TerminalSnippetRecord = {
  id: string;
  title: string;
  command: string;
  category: string;
  risk: "只读" | "变更" | "危险";
  description: string;
  lastUsed: string;
  favorite: boolean;
};

type TerminalHistoryRecord = {
  id: string;
  command: string;
  host: string;
  user: string;
  status: "成功" | "失败";
  duration: string;
  time: string;
  output: string;
  pinned?: boolean;
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

type DatabaseBackupPlan = {
  id: string;
  name: string;
  database: string;
  storage: "S3" | "MinIO" | "本地";
  schedule: string;
  retention: string;
  enabled: boolean;
  health: "正常" | "告警";
  lastRun: string;
  successRate: number;
};

type DatabaseBackupTask = {
  id: string;
  planId: string;
  database: string;
  storage: string;
  status: "成功" | "运行中" | "失败" | "等待";
  startedAt: string;
  size: string;
  duration: string;
};

type DatabaseRestorePoint = {
  id: string;
  database: string;
  createdAt: string;
  storage: string;
  size: string;
  checksum: "已校验" | "待校验";
  drillStatus: "未演练" | "演练中" | "已完成";
};

type DatabaseSlowQuery = {
  id: string;
  database: string;
  fingerprint: string;
  sql: string;
  avgTime: string;
  p95Time: string;
  calls: number;
  rows: string;
  level: "高" | "中" | "低";
  status: "待处理" | "分析中" | "已处理";
  owner: string;
  firstSeen: string;
  suggestion: string;
  sessionId: string;
  explain?: string;
};

const initialOverviewNodes: OverviewNode[] = [
  { id: "node-1", name: "demo-sg-01", ip: "10.0.0.11", env: "生产", status: "健康", latency: "38ms", cpu: "18%", memory: "42%", disk: "35%", version: "v2.8.1", uptime: "23 天 14 小时", backup: "今天 02:15", update: "已是最新", owner: "核心集群", services: ["nginx", "postgresql", "redis", "worker"] },
  { id: "node-2", name: "panel-bj-02", ip: "10.0.1.22", env: "预发", status: "健康", latency: "52ms", cpu: "27%", memory: "55%", disk: "62%", version: "v2.8.0", uptime: "18 天 9 小时", backup: "今天 02:20", update: "可更新 1", owner: "发布验证", services: ["nginx", "worker", "systemd-resolved"] },
  { id: "node-3", name: "panel-hk-03", ip: "10.0.2.33", env: "生产", status: "警告", latency: "126ms", cpu: "63%", memory: "78%", disk: "83%", version: "v2.8.0", uptime: "9 天 2 小时", backup: "昨天 02:18", update: "可更新 1", owner: "边缘站点", services: ["nginx", "mysql", "queue"] },
  { id: "node-4", name: "panel-dev-04", ip: "10.0.3.44", env: "开发", status: "维护", latency: "离线", cpu: "0%", memory: "0%", disk: "47%", version: "v2.7.9", uptime: "维护中", backup: "3 天前", update: "待检查", owner: "研发调试", services: ["docker", "node", "cron"] },
];

const initialOverviewTasks: OverviewTaskRecord[] = [
  { id: "task-1", type: "部署", title: "部署 /api 服务 v2.8.1", target: "demo-sg-01", status: "成功", priority: "中", operator: "李敏", queuedAt: "2 分钟前", duration: "1分24秒", logs: ["拉取 release v2.8.1", "执行健康检查", "发布完成"] },
  { id: "task-2", type: "备份", title: "备份 shop_db", target: "prod-postgres-01", status: "成功", priority: "低", operator: "系统", queuedAt: "8 分钟前", duration: "32秒", logs: ["创建快照", "上传到 S3", "校验成功"] },
  { id: "task-3", type: "补丁", title: "更新防火墙规则", target: "panel-bj-02", status: "运行中", priority: "高", operator: "王工", queuedAt: "15 分钟前", duration: "18秒", logs: ["生成规则差异", "应用 TCP 3306 来源限制"] },
  { id: "task-4", type: "自动化", title: "每日快照", target: "全部生产主机", status: "等待", priority: "中", operator: "系统", queuedAt: "队列 #1", duration: "预计 12 分钟", logs: ["等待前序备份任务释放锁"] },
  { id: "task-5", type: "修复", title: "重启 mysql.service", target: "panel-hk-03", status: "失败", priority: "高", operator: "张工", queuedAt: "31 分钟前", duration: "7秒", logs: ["尝试重启服务", "systemd 返回 failed", "等待人工处理"] },
  { id: "task-6", type: "同步", title: "同步静态文件", target: "admin.example.com", status: "等待", priority: "低", operator: "CI", queuedAt: "队列 #2", duration: "预计 18 分钟", logs: ["等待部署窗口"] },
];

const initialOverviewRisks: OverviewRiskRecord[] = [
  { id: "risk-1", title: "SSH 密钥过期", level: "高危", status: "待处理", target: "demo-sg-01, panel-hk-03", owner: "安全组", impact: "2 台生产主机无法完成密钥轮换", detected: "10 分钟前", suggestion: "立即轮换 deploy key 并重新验证 SSH 登录链路", traceId: "risk-a1b2c3" },
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
      current: "demo-sg-01",
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

const initialFileUploads: FileUploadRecord[] = [
  { id: "upload-1", name: "release-v2.8.2.zip", targetPath: "/var/www/html/releases", size: "128 MB", progress: 72, status: "上传中", speed: "18 MB/s", owner: "deploy", startedAt: "今天 10:44" },
  { id: "upload-2", name: "avatar-batch.tar", targetPath: "/var/www/html/uploads", size: "42 MB", progress: 0, status: "等待", speed: "-", owner: "admin", startedAt: "今天 10:46" },
  { id: "upload-3", name: "hotfix-nginx.conf", targetPath: "/etc/nginx/conf.d", size: "4 KB", progress: 100, status: "已完成", speed: "完成", owner: "root", startedAt: "今天 10:31" },
  { id: "upload-4", name: "media-assets.zip", targetPath: "/var/www/html/uploads", size: "284 MB", progress: 38, status: "失败", speed: "中断", owner: "运营", startedAt: "昨天 21:18" },
];

const initialTrashFiles: TrashFileRecord[] = [
  { id: "trash-1", name: "old-error.log", originalPath: "/tmp/old-error.log", size: "32 KB", deletedAt: "今天 09:42", expiresIn: "6 天", owner: "root", reason: "日志轮转清理" },
  { id: "trash-2", name: "old-cache.tar", originalPath: "/tmp/old-cache.tar", size: "128 MB", deletedAt: "昨天 23:40", expiresIn: "5 天", owner: "www-data", reason: "缓存包过期" },
  { id: "trash-3", name: "index.backup.html", originalPath: "/var/www/html/index.backup.html", size: "21 KB", deletedAt: "昨天 18:12", expiresIn: "5 天", owner: "deploy", reason: "发布后清理" },
];

const initialTerminalSessions: TerminalSessionRecord[] = [
  { id: "term-session-1", host: "panel-se-01", ip: "10.0.0.11", user: "root", cwd: "/var/www/html", status: "connected", latency: "38ms", startedAt: "今天 10:21", lastCommand: "systemctl status nginx", privilege: "sudo" },
  { id: "term-session-2", host: "panel-bj-02", ip: "10.0.1.22", user: "deploy", cwd: "/srv/shop", status: "connected", latency: "52ms", startedAt: "今天 10:04", lastCommand: "tail -f storage/logs/laravel.log", privilege: "user" },
  { id: "term-session-3", host: "panel-hk-03", ip: "10.0.2.33", user: "root", cwd: "/etc/mysql", status: "disconnected", latency: "-", startedAt: "昨天 22:18", lastCommand: "mysqladmin processlist", privilege: "sudo" },
];

const initialTerminalSnippets: TerminalSnippetRecord[] = [
  { id: "term-snippet-1", title: "查看 Nginx 状态", command: "systemctl status nginx --no-pager", category: "服务", risk: "只读", description: "快速确认 Nginx 是否 active，并查看最近几行 systemd 输出。", lastUsed: "今天 10:31", favorite: true },
  { id: "term-snippet-2", title: "磁盘占用", command: "df -h", category: "资源", risk: "只读", description: "查看挂载点容量、使用率和剩余空间。", lastUsed: "今天 09:48", favorite: true },
  { id: "term-snippet-3", title: "最近错误日志", command: "tail -n 100 /var/log/nginx/error.log", category: "日志", risk: "只读", description: "读取 Nginx 最近 100 行错误日志用于排障。", lastUsed: "昨天 21:12", favorite: false },
  { id: "term-snippet-4", title: "重启 Worker", command: "systemctl restart worker.service", category: "服务", risk: "变更", description: "重启异步任务 Worker，适合发布后刷新进程。", lastUsed: "周一 18:20", favorite: false },
  { id: "term-snippet-5", title: "清理临时缓存", command: "rm -rf /tmp/stackpilot-cache/*", category: "文件", risk: "危险", description: "删除临时缓存目录，执行前应确认路径。", lastUsed: "未使用", favorite: false },
];

const initialTerminalHistory: TerminalHistoryRecord[] = [
  { id: "term-history-1", command: "systemctl restart nginx", host: "panel-se-01", user: "root", status: "成功", duration: "1.2s", time: "今天 10:42", output: "nginx.service restarted", pinned: true },
  { id: "term-history-2", command: "df -h", host: "panel-se-01", user: "root", status: "成功", duration: "0.2s", time: "今天 10:38", output: "/dev/vda1 62G 21G 41G 35% /" },
  { id: "term-history-3", command: "mysqladmin processlist", host: "panel-hk-03", user: "root", status: "失败", duration: "5.0s", time: "昨天 22:18", output: "ERROR 2002: connection timed out" },
  { id: "term-history-4", command: "tail -n 100 /var/log/nginx/error.log", host: "panel-bj-02", user: "deploy", status: "成功", duration: "0.7s", time: "昨天 21:12", output: "no critical errors" },
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
  if (page === "schedule-failed") return { state: "全部", search: "", mode: "list", subtitle: "失败任务视图，默认定位最近执行失败的自动化任务。" };
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
  if (page === "settings-notice") return "通知";
  if (page === "settings-backup") return "备份";
  if (page === "settings-audit") return "审计";
  return "基础";
}

function settingsPageForTab(tab: string): PageKey {
  if (tab === "安全") return "settings-security";
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
    typeof window !== "undefined" && window.matchMedia("(max-width: 680px)").matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 680px)");
    const syncSidebar = (event: MediaQueryListEvent | MediaQueryList) => {
      setSidebarCollapsed(event.matches);
    };

    syncSidebar(mediaQuery);
    mediaQuery.addEventListener("change", syncSidebar);
    return () => mediaQuery.removeEventListener("change", syncSidebar);
  }, []);

  const expandSidebar = () => setSidebarCollapsed(false);
  const collapseSidebar = () => setSidebarCollapsed(true);
  const toggleSidebar = () => setSidebarCollapsed((current) => !current);

  return (
    <section className={`desktop-frame ${whiteTop ? "white-top" : "dark-top"} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      {!sidebarCollapsed && <button className="sidebar-backdrop" type="button" aria-label="收起侧栏" onClick={collapseSidebar} />}
      <Sidebar
        page={page}
        setPage={setPage}
        notify={notify}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        onExpandCollapsed={expandSidebar}
      />
      <div className="desktop-main">
        <TopBar key={page} page={page} setPage={setPage} white={whiteTop} notify={notify} />
        {page === "overview" && <OverviewPage setPage={setPage} notify={notify} />}
        {page === "overview-health" && <OverviewHealthPage notify={notify} />}
        {page === "overview-tasks" && <OverviewTasksPage notify={notify} />}
        {page === "overview-risks" && <OverviewRisksPage notify={notify} />}
        {activeModule === "hosts" && <HostsPage key={page} page={page} notify={notify} />}
        {activeModule === "sites" && <SitesPage key={page} page={page} notify={notify} />}
        {activeModule === "databases" && (
          page === "databases-backups"
            ? <DatabaseBackupsPage key={page} page={page} notify={notify} />
            : page === "databases-slow"
              ? <DatabaseSlowQueriesPage key={page} page={page} notify={notify} />
            : <DatabasesPage key={page} page={page} notify={notify} />
        )}
        {activeModule === "files" && <FilesModule page={page} notify={notify} />}
        {activeModule === "terminal" && <TerminalPage page={page} notify={notify} />}
        {activeModule === "systemd" && <SystemdPage page={page} notify={notify} />}
        {activeModule === "firewall" && <FirewallPage key={page} page={page} notify={notify} />}
        {activeModule === "deploy" && <DeployPage key={page} page={page} notify={notify} />}
        {activeModule === "schedule" && <SchedulePage page={page} notify={notify} />}
        {activeModule === "audit" && <AuditPage key={page} page={page} notify={notify} />}
        {activeModule === "acl" && <AclPage page={page} setPage={setPage} notify={notify} />}
        {activeModule === "settings" && (
          page === "settings-proxy"
            ? <SettingsProxyPage key={page} page={page} notify={notify} />
            : <SettingsPage key={page} page={page} setPage={setPage} notify={notify} />
        )}
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
  onExpandCollapsed,
}: {
  page: PageKey;
  setPage: SetPage;
  notify: Notify;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onExpandCollapsed: () => void;
}) {
  const [openGroups, setOpenGroups] = useState<Partial<Record<NavItem["key"], boolean>>>(() => ({
    overview: true,
  }));
  const [manuallyClosedActiveGroup, setManuallyClosedActiveGroup] = useState<{ key: NavItem["key"]; page: PageKey } | null>(null);
  const activeChild = activeChildForPage(page);
  const activeNavPage = navPageFor(page);

  const toggleGroup = (key: NavItem["key"], label: string) => {
    const currentOpen = openGroups[key] ?? key === activeNavPage;
    const nextOpen = !currentOpen;
    setManuallyClosedActiveGroup(!nextOpen && key === activeNavPage && activeChild ? { key, page } : null);
    setOpenGroups((current) => ({ ...current, [key]: nextOpen }));
    notify(`${label} 下拉项目已${nextOpen ? "展开" : "收起"}`, "info");
  };

  const openNavPage = (key: NavItem["key"], label: string) => {
    setManuallyClosedActiveGroup(null);
    setPage(key, { message: `已进入${label}`, tone: "info" });
    setOpenGroups((current) => ({ ...current, [key]: true }));
  };

  const handleMainNavClick = (item: NavItem, hasActiveChild: boolean) => {
    if (collapsed && hasActiveChild) {
      setManuallyClosedActiveGroup(null);
      setOpenGroups((current) => ({ ...current, [item.key]: true }));
      onExpandCollapsed();
      notify(`已展开${item.label}下拉项目`, "info");
      return;
    }
    openNavPage(item.key, item.label);
  };

  const openNavChild = (parent: NavItem, child: NavChild) => {
    setManuallyClosedActiveGroup(null);
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
          const wasManuallyClosedForThisPage = manuallyClosedActiveGroup?.key === item.key && manuallyClosedActiveGroup?.page === page;
          const open = ((openGroups[item.key] ?? active) || (hasActiveChild && !wasManuallyClosedForThisPage)) && !collapsed;
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
                  onClick={() => handleMainNavClick(item, hasActiveChild)}
                  aria-current={parentCurrent ? "page" : undefined}
                  aria-label={parentCurrent && activeChildLabel ? `${item.label}，当前页面：${activeChildLabel}${collapsed ? "，点击展开侧栏查看下拉项目" : ""}` : undefined}
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
              {!collapsed && (
                <div
                  className="side-submenu"
                  id={`side-submenu-${item.key}`}
                  aria-hidden={!open}
                >
                  {item.children.map((child) => {
                    const metaText = navChildMetaText(child);
                    const labelDetail = child.meta ?? child.badge ?? "";
                    return (
                      <button
                        key={child.id}
                        className={[
                          "side-child",
                          metaText ? "has-child-meta" : "",
                          activeChild === child.id ? "is-child-active" : "",
                        ].filter(Boolean).join(" ")}
                        type="button"
                        tabIndex={open ? 0 : -1}
                        aria-current={open && activeChild === child.id ? "page" : undefined}
                        aria-label={[child.label, labelDetail].filter(Boolean).join("，")}
                        onClick={() => openNavChild(item, child)}
                        >
                        <i />
                        <span className="side-child-copy">
                          <span className="side-child-label">{child.label}</span>
                          {metaText && <em>{metaText}</em>}
                        </span>
                        {child.badge && <strong className="side-child-badge">{child.badge}</strong>}
                      </button>
                    );
                  })}
                </div>
              )}
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

function TopBar({ page, setPage, white, notify }: { page: PageKey; setPage: SetPage; white: boolean; notify: Notify }) {
  const [query, setQuery] = useState("");
  const [openPanel, setOpenPanel] = useState<TopbarPanel>(null);
  const [unreadCount, setUnreadCount] = useState(() => (page === "overview" ? 3 : navPageFor(page) === "settings" ? 5 : 2));
  const topbarRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const meta = resolvePageMeta(page);
  const activeModule = navPageFor(page);
  const isSettings = activeModule === "settings";
  const userName = page === "overview" ? "admin" : page === "databases" ? "张工" : "管理员";
  const searchResults = topbarSearchResults(query);
  const togglePanel = (panel: TopbarMenuPanel) => {
    setOpenPanel((current) => (current === panel ? null : panel));
  };
  const openSearchResult = (result: TopbarSearchResult) => {
    setOpenPanel(null);
    setQuery("");
    searchInputRef.current?.blur();
    window.requestAnimationFrame(() => {
      setPage(result.page, { message: `已打开${result.label}`, tone: "info" });
    });
  };

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (topbarRef.current?.contains(event.target as Node) || searchRef.current?.contains(event.target as Node)) return;
      setOpenPanel(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpenPanel("search");
        searchInputRef.current?.focus();
        return;
      }
      if (event.key === "Escape") setOpenPanel(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

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
      <div className={`mock-search ${openPanel === "search" ? "active" : ""}`} ref={searchRef}>
        <Search size={13} />
        <span id="topbar-search-label" className="sr-only">全局搜索</span>
        <input
          ref={searchInputRef}
          value={query}
          placeholder={meta.search}
          aria-labelledby="topbar-search-label"
          role="combobox"
          aria-haspopup="listbox"
          onFocus={() => setOpenPanel("search")}
          onBlur={(event) => {
            if (searchRef.current?.contains(event.relatedTarget as Node)) return;
            setOpenPanel((current) => current === "search" ? null : current);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpenPanel("search");
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const firstResult = searchResults[0];
              if (firstResult) {
                event.preventDefault();
                openSearchResult(firstResult);
              }
            }
          }}
          aria-expanded={openPanel === "search"}
          aria-controls="topbar-search-panel"
        />
        <kbd>⌘K</kbd>
        {openPanel === "search" && (
          <div className="topbar-search-panel" id="topbar-search-panel" role="listbox" aria-label="全局搜索结果">
            <div className="topbar-search-head">
              <span>{query.trim() ? `搜索 ${query.trim()}` : "快速打开"}</span>
              <em>{searchResults.length} 项</em>
            </div>
            {searchResults.length > 0 ? (
              searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openSearchResult(result)}
                >
                  <b>{result.kind}</b>
                  <span>
                    <strong>{result.label}</strong>
                    <em>{result.detail}</em>
                  </span>
                </button>
              ))
            ) : (
              <p>没有匹配结果</p>
            )}
          </div>
        )}
      </div>
      {page !== "overview" && <div className="top-spacer" />}
      <div className="top-actions" ref={topbarRef}>
        {isSettings && <StatusDot text="面板运行正常" />}
        <span className="notification-wrap">
          <button
            type="button"
            className={`icon-action ${openPanel === "notifications" ? "active" : ""}`}
            onClick={() => togglePanel("notifications")}
            aria-label={`通知${unreadCount > 0 ? `，${unreadCount} 条未读` : "，无未读"}`}
            aria-haspopup="dialog"
            aria-expanded={openPanel === "notifications"}
            aria-controls={openPanel === "notifications" ? "topbar-notifications-panel" : undefined}
          >
            <Bell size={18} />
          </button>
          {unreadCount > 0 && <span className="red-badge">{unreadCount}</span>}
        </span>
        {page !== "overview" && (
          <button
            type="button"
            className={`icon-action ${openPanel === "activity" ? "active" : ""}`}
            onClick={() => togglePanel("activity")}
            aria-label="操作记录"
            aria-haspopup="dialog"
            aria-expanded={openPanel === "activity"}
            aria-controls={openPanel === "activity" ? "topbar-activity-panel" : undefined}
          >
            <FileText size={17} />
          </button>
        )}
        <button
          type="button"
          className={`icon-action ${openPanel === "help" ? "active" : ""}`}
          onClick={() => togglePanel("help")}
          aria-label="帮助"
          aria-haspopup="dialog"
          aria-expanded={openPanel === "help"}
          aria-controls={openPanel === "help" ? "topbar-help-panel" : undefined}
        >
          <CircleHelp size={17} />
        </button>
        <button
          type="button"
          className={`user-menu-button ${openPanel === "user" ? "active" : ""}`}
          onClick={() => togglePanel("user")}
          aria-label="用户菜单"
          aria-haspopup="menu"
          aria-expanded={openPanel === "user"}
          aria-controls={openPanel === "user" ? "topbar-user-panel" : undefined}
        >
          <span className="avatar-mini" aria-hidden="true">
            {page === "overview" ? <UserRound size={18} /> : "张"}
          </span>
          <strong>{userName}</strong>
          <ChevronDown size={13} />
        </button>
        {openPanel && openPanel !== "search" && (
          <TopbarDropdown
            panel={openPanel}
            page={page}
            userName={userName}
            unreadCount={unreadCount}
            onClose={() => setOpenPanel(null)}
            onMarkRead={() => {
              setUnreadCount(0);
              notify("通知已全部标记为已读", "info");
            }}
            notify={notify}
          />
        )}
      </div>
    </header>
  );
}

function TopbarDropdown({
  panel,
  page,
  userName,
  unreadCount,
  onClose,
  onMarkRead,
  notify,
}: {
  panel: TopbarMenuPanel;
  page: PageKey;
  userName: string;
  unreadCount: number;
  onClose: () => void;
  onMarkRead: () => void;
  notify: Notify;
}) {
  if (panel === "user") {
    return (
      <div className="topbar-dropdown user-dropdown" id="topbar-user-panel" role="menu" aria-label="用户菜单">
        <div className="topbar-dropdown-head">
          <span>当前账号</span>
          <strong>{userName}</strong>
        </div>
        {["个人资料", "访问令牌", "登录记录"].map((item) => (
          <button key={item} type="button" role="menuitem" onClick={() => { notify(`已打开${item}`, "info"); onClose(); }}>
            {item}
          </button>
        ))}
        <button type="button" role="menuitem" className="danger-item" onClick={() => { notify("已退出当前会话", "warning"); onClose(); }}>
          退出登录
        </button>
      </div>
    );
  }

  const panelMeta = {
    notifications: { title: "通知中心", subtitle: `${unreadCount} 条未读`, action: "全部已读" },
    activity: { title: "操作记录", subtitle: resolvePageMeta(page).title, action: "查看审计" },
    help: { title: "帮助中心", subtitle: "当前页上下文", action: "打开文档" },
  }[panel];
  const items = panel === "notifications" ? topbarNotifications : panel === "activity" ? topbarActivities : topbarHelpLinks;

  return (
    <div className={`topbar-dropdown ${panel}-dropdown`} id={`topbar-${panel}-panel`} role="dialog" aria-label={panelMeta.title}>
      <div className="topbar-dropdown-head">
        <span>{panelMeta.title}</span>
        <button
          type="button"
          onClick={() => {
            if (panel === "notifications") onMarkRead();
            else notify(panel === "activity" ? "已打开审计日志" : "帮助文档已打开", "info");
          }}
        >
          {panelMeta.action}
        </button>
      </div>
      <p className="topbar-dropdown-subtitle">{panelMeta.subtitle}</p>
      <div className="topbar-dropdown-list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="topbar-dropdown-item"
            onClick={() => {
              notify(panel === "help" ? `已打开帮助：${item.title}` : `已打开记录：${item.title}`, "info");
              onClose();
            }}
          >
            {panel === "notifications" && <StatusLight tone={"tone" in item ? item.tone : "blue"} />}
            <span>
              <strong>{item.title}</strong>
              <em>{item.detail}</em>
            </span>
            {"time" in item && <small>{item.time}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

function OverviewPage({ setPage, notify }: { setPage: SetPage; notify: Notify }) {
  const [overview, setOverview] = useState<OverviewSummaryPayload>(() => initialOverviewSummary());
  const [loading, setLoading] = useState(true);
  const [taskTab, setTaskTab] = useState("最近任务");
  const [resourceTab, setResourceTab] = useState("今天");
  const clusterNames = overview.nodes.map((node) => node.name);
  const clusterIndex = Math.max(clusterNames.indexOf(overview.cluster.current), 0);
  const nextCluster = clusterNames[(clusterIndex + 1) % clusterNames.length] ?? "demo-sg-01";
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
        <DetailDrawer title={selected.name} subtitle={`${selected.ip} · ${selected.env}`} onClose={() => setSelected(null)} autoFocus={false}>
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
        <DetailDrawer title={selected.title} subtitle={`${selected.type} · ${selected.target}`} onClose={() => setSelected(null)} autoFocus={false}>
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
        <DetailDrawer title={selected.title} subtitle={selected.traceId} onClose={() => setSelected(null)} autoFocus={false}>
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
    <div className={`module-page ${page ? `module-page-${page}` : ""}`}>
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
    <div className="module-table-wrap">
      <table className="mini-table module-table">
        <colgroup>
          {columns.map((column) => <col key={column.key} style={{ width: column.width }} />)}
        </colgroup>
        <thead>
          <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>{columns.map((column) => <td key={column.key} data-label={column.label}>{column.render(row)}</td>)}</tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="empty-row">{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="module-card-list">
        {rows.map((row) => (
          <article className="module-card-row" key={getRowKey(row)}>
            {columns.map((column) => (
              <div className="module-card-cell" key={column.key}>
                <span>{column.label}</span>
                <div>{column.render(row)}</div>
              </div>
            ))}
          </article>
        ))}
        {rows.length === 0 && <div className="module-card-empty">{emptyText}</div>}
      </div>
    </div>
  );
}

function DetailDrawer({
  title,
  subtitle,
  onClose,
  children,
  actions,
  autoFocus = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  autoFocus?: boolean;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    let focusFrame = 0;
    if (autoFocus) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusable = drawerFocusableElements(drawer);
      const firstBodyFocusTarget = focusable.find((element) => !element.classList.contains("drawer-close-button"));
      focusFrame = window.requestAnimationFrame(() => {
        if (document.contains(drawer)) {
          (firstBodyFocusTarget ?? focusable[0] ?? drawer).focus({ preventScroll: true });
        }
      });
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !document.contains(drawer)) return;
      if (document.querySelector(".topbar-search-panel, .topbar-dropdown")) return;
      onCloseRef.current();
    };

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      const activeElement = document.activeElement;
      const shouldRestoreFocus = !activeElement || activeElement === document.body || drawer.contains(activeElement);
      if (!shouldRestoreFocus) return;
      const restoreTarget = restoreFocusRef.current;
      const fallbackTarget = restoreTarget && document.contains(restoreTarget) && isFocusableElement(restoreTarget)
        ? restoreTarget
        : drawerRestoreFallback(drawer);
      if (fallbackTarget) {
        fallbackTarget.focus({ preventScroll: true });
      }
    };
  }, [autoFocus]);

  const handleFocusCapture = (event: React.FocusEvent<HTMLElement>) => {
    const previousFocus = event.relatedTarget;
    if (previousFocus instanceof HTMLElement && !event.currentTarget.contains(previousFocus) && isFocusableElement(previousFocus)) {
      restoreFocusRef.current = previousFocus;
    }
  };

  return (
    <aside
      ref={drawerRef}
      className="detail-drawer"
      role="region"
      aria-labelledby={titleId}
      tabIndex={-1}
      onFocusCapture={handleFocusCapture}
    >
      <div className="drawer-head">
        <div>
          <strong id={titleId}>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <button type="button" className="icon-action drawer-close-button" onClick={onClose} aria-label="关闭详情"><X size={16} /></button>
      </div>
      <div className="drawer-body">{children}</div>
      {actions && <div className="drawer-actions inline">{actions}</div>}
    </aside>
  );
}

function ModuleSearch({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="module-search">
      <span className="sr-only">{placeholder}</span>
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

function FilesModule({ page, notify }: { page: PageKey; notify: Notify }) {
  const [files, setFiles] = useState(initialFileRecords);
  const [trashRows, setTrashRows] = useState(initialTrashFiles);
  const [restoredRows, setRestoredRows] = useState<FileRecord[]>([]);

  if (page === "files-upload") {
    return <FileUploadQueuePage page={page} notify={notify} />;
  }
  if (page === "files-trash") {
    return <FileTrashPage page={page} notify={notify} trashRows={trashRows} setTrashRows={setTrashRows} restoredRows={restoredRows} setRestoredRows={setRestoredRows} setFiles={setFiles} />;
  }
  return <FilesPage page={page} notify={notify} rows={files} setRows={setFiles} setTrashRows={setTrashRows} />;
}

function FilesPage({
  page,
  notify,
  rows,
  setRows,
  setTrashRows,
}: {
  page: PageKey;
  notify: Notify;
  rows: FileRecord[];
  setRows: React.Dispatch<React.SetStateAction<FileRecord[]>>;
  setTrashRows: React.Dispatch<React.SetStateAction<TrashFileRecord[]>>;
}) {
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
  const moveToTrash = (row: FileRecord) => {
    if (row.type === "文件夹") {
      notify("文件夹删除已加入回收站，请在回收站确认恢复或清理", "warning");
    }
    setRows((current) => current.filter((item) => item.id !== row.id));
    setTrashRows((current) => [{
      id: `trash-${Date.now()}`,
      name: row.name,
      originalPath: `${row.path === "/" ? "" : row.path}/${row.name}`,
      size: row.size,
      deletedAt: currentClock(),
      expiresIn: "7 天",
      owner: row.owner,
      reason: "从文件管理删除",
    }, ...current]);
    notify(`${row.name} 已移入回收站`, "warning");
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
          { key: "ops", label: "操作", width: "170px", render: (row) => <span className="table-actions"><button type="button" aria-label={`重命名 ${row.name}`} onClick={() => { setDraftName(row.name); setDrawer({ type: "rename", file: row }); }}>重命名</button><button type="button" aria-label={`删除 ${row.name} 到回收站`} onClick={() => moveToTrash(row)}>删除</button></span> },
        ]}
        rows={visibleRows}
        emptyText="当前路径没有匹配文件"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function FileUploadQueuePage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [uploads, setUploads] = useState(initialFileUploads);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState(initialFileUploads[0]?.id ?? "");
  const selected = uploads.find((row) => row.id === selectedId) ?? null;
  const filteredRows = uploads.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.name} ${row.targetPath} ${row.owner}`.toLowerCase().includes(query);
    return matchSearch && (statusFilter === "全部" || row.status === statusFilter);
  });
  const updateUpload = (id: string, patch: Partial<FileUploadRecord>) => {
    setUploads((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  };
  const addUpload = () => {
    const next: FileUploadRecord = {
      id: `upload-${Date.now()}`,
      name: `manual-upload-${uploads.length + 1}.zip`,
      targetPath: "/var/www/html/uploads",
      size: "24 MB",
      progress: 0,
      status: "等待",
      speed: "-",
      owner: "admin",
      startedAt: currentClock(),
    };
    setUploads((current) => [next, ...current]);
    setSelectedId(next.id);
    notify(`${next.name} 已加入上传队列`, "info");
  };
  const cancelUpload = (row: FileUploadRecord) => {
    setUploads((current) => current.filter((item) => item.id !== row.id));
    if (selectedId === row.id) setSelectedId("");
    notify(`${row.name} 已从上传队列移除`, "warning");
  };
  const resumeUpload = (row: FileUploadRecord) => {
    if (row.status === "已完成") {
      notify(`${row.name} 已完成，无需继续上传`, "info");
      return;
    }
    updateUpload(row.id, { status: "上传中", speed: "18 MB/s", progress: Math.max(row.progress, 12) });
    notify(`${row.name} 已继续上传`);
  };
  const retryUpload = (row: FileUploadRecord) => {
    updateUpload(row.id, { status: "上传中", progress: Math.max(row.progress, 12), speed: "16 MB/s" });
    notify(`${row.name} 已重试`, "info");
  };
  const pauseUpload = (row: FileUploadRecord) => {
    updateUpload(row.id, { status: "等待", speed: "-" });
    notify(`${row.name} 已暂停`);
  };
  const completeUpload = (row: FileUploadRecord) => {
    updateUpload(row.id, { status: "已完成", progress: 100, speed: "完成" });
    notify(`${row.name} 已完成`);
  };
  const statusTone = (status: FileUploadRecord["status"]): Tone => {
    if (status === "已完成") return "green";
    if (status === "失败") return "red";
    if (status === "上传中") return "blue";
    return "orange";
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle="独立上传队列视图，支持暂停、继续、重试、完成和取消本地上传任务。"
      page={page}
      viewContext={{
        eyebrow: "文件 / 上传队列",
        title: "上传队列",
        description: "按上传任务管理目标路径、传输进度、失败重试和完成清理。",
        chips: [`任务 ${uploads.length}`, `上传中 ${uploads.filter((row) => row.status === "上传中").length}`, `失败 ${uploads.filter((row) => row.status === "失败").length}`],
      }}
      actions={<><button className="ghost" type="button" onClick={() => { setUploads((current) => current.filter((row) => row.status !== "已完成")); notify("已清理完成的上传记录", "info"); }}><Trash2 size={15} /> 清理完成</button><button className="primary" type="button" onClick={addUpload}><CloudUpload size={15} /> 添加上传</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索文件名、目标路径或上传人" onChange={setSearch} /><FieldSelect label="状态" value={statusFilter} options={["全部", "上传中", "等待", "已完成", "失败"]} onChange={setStatusFilter} /></>}
      metrics={<><MetricTile icon={CloudUpload} label="队列任务" value={`${uploads.length}`} tone="blue" /><MetricTile icon={Activity} label="上传中" value={`${uploads.filter((row) => row.status === "上传中").length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="已完成" value={`${uploads.filter((row) => row.status === "已完成").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${uploads.filter((row) => row.status === "失败").length}`} tone="red" /></>}
      side={selected && (
        <DetailDrawer title="上传详情" subtitle={selected.name} onClose={() => setSelectedId("")} autoFocus={false} actions={<><button className="ghost" type="button" aria-label={`取消上传 ${selected.name}`} onClick={() => cancelUpload(selected)}>取消上传</button><button className="primary" type="button" aria-label={`完成上传 ${selected.name}`} onClick={() => completeUpload(selected)}>完成</button></>}>
          <div className="detail-kv upload-detail">
            <p><span>目标路径</span><b>{selected.targetPath}</b></p>
            <p><span>大小</span><b>{selected.size}</b></p>
            <p><span>状态</span><b>{selected.status}</b></p>
            <p><span>速度</span><b>{selected.speed}</b></p>
            <p><span>上传人</span><b>{selected.owner}</b></p>
            <p><span>开始时间</span><b>{selected.startedAt}</b></p>
            <div className="upload-progress-card"><span style={{ width: `${selected.progress}%` }} /><b>{selected.progress}%</b></div>
          </div>
        </DetailDrawer>
      )}
    >
      <div className="file-upload-workspace">
        <DataTable
          columns={[
            { key: "name", label: "文件", width: "230px", render: (row) => <button className="module-row-link" type="button" onClick={() => setSelectedId(row.id)}><FileBox size={15} /><b>{row.name}</b></button> },
            { key: "target", label: "目标路径", render: (row) => <code>{row.targetPath}</code> },
            { key: "size", label: "大小", width: "82px", render: (row) => row.size },
            { key: "progress", label: "进度", width: "150px", render: (row) => <span className="upload-progress-inline"><i style={{ width: `${row.progress}%` }} /><b>{row.progress}%</b></span> },
            { key: "status", label: "状态", width: "86px", render: (row) => <span className={`pill ${statusTone(row.status)}`}>{row.status}</span> },
            { key: "speed", label: "速度", width: "86px", render: (row) => row.speed },
            { key: "owner", label: "上传人", width: "80px", render: (row) => row.owner },
            { key: "ops", label: "操作", width: "260px", render: (row) => (
              <span className="table-actions">
                {row.status === "上传中" && <button type="button" aria-label={`暂停上传 ${row.name}`} onClick={() => pauseUpload(row)}>暂停</button>}
                {row.status === "等待" && <button type="button" aria-label={`继续上传 ${row.name}`} onClick={() => resumeUpload(row)}>继续</button>}
                {row.status === "失败" && <button type="button" aria-label={`重试上传 ${row.name}`} onClick={() => retryUpload(row)}>重试</button>}
                {row.status !== "已完成" && <button type="button" aria-label={`完成上传 ${row.name}`} onClick={() => completeUpload(row)}>完成</button>}
                <button type="button" aria-label={`取消上传 ${row.name}`} onClick={() => cancelUpload(row)}>取消</button>
              </span>
            ) },
          ]}
          rows={filteredRows}
          emptyText="没有匹配的上传任务"
          getRowKey={(row) => row.id}
        />
        <section className="upload-lane-list">
          {["准备上传", "传输中", "收尾校验"].map((label, index) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{index === 0 ? uploads.filter((row) => row.status === "等待").length : index === 1 ? uploads.filter((row) => row.status === "上传中").length : uploads.filter((row) => row.status === "已完成").length}</strong>
              <em>{index === 0 ? "等待资源" : index === 1 ? "网络传输" : "落盘完成"}</em>
            </article>
          ))}
        </section>
      </div>
    </ModulePageShell>
  );
}

function FileTrashPage({
  page,
  notify,
  trashRows,
  setTrashRows,
  restoredRows,
  setRestoredRows,
  setFiles,
}: {
  page: PageKey;
  notify: Notify;
  trashRows: TrashFileRecord[];
  setTrashRows: React.Dispatch<React.SetStateAction<TrashFileRecord[]>>;
  restoredRows: FileRecord[];
  setRestoredRows: React.Dispatch<React.SetStateAction<FileRecord[]>>;
  setFiles: React.Dispatch<React.SetStateAction<FileRecord[]>>;
}) {
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState(initialTrashFiles[0]?.id ?? "");
  const selected = trashRows.find((row) => row.id === selectedId) ?? null;
  const ownerOptions = ["全部", ...Array.from(new Set(trashRows.map((row) => row.owner)))];
  const filteredRows = trashRows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.name} ${row.originalPath} ${row.reason} ${row.owner}`.toLowerCase().includes(query);
    return matchSearch && (ownerFilter === "全部" || row.owner === ownerFilter);
  });
  const restoreFile = (row: TrashFileRecord) => {
    const originalPathParts = row.originalPath.split("/");
    const fileName = originalPathParts.pop() ?? row.name;
    const parentPath = originalPathParts.join("/") || "/";
    const restoredFile: FileRecord = { id: `restore-${Date.now()}`, name: fileName, type: "文件", path: parentPath, size: row.size, modified: currentClock(), owner: row.owner };
    setRestoredRows((current) => [restoredFile, ...current]);
    setFiles((current) => [restoredFile, ...current]);
    setTrashRows((current) => current.filter((item) => item.id !== row.id));
    if (selectedId === row.id) setSelectedId("");
    notify(`${row.name} 已恢复到 ${parentPath}`);
  };
  const purgeFile = (row: TrashFileRecord) => {
    setTrashRows((current) => current.filter((item) => item.id !== row.id));
    if (selectedId === row.id) setSelectedId("");
    notify(`${row.name} 已永久删除`, "warning");
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle="独立回收站视图，支持按所有者筛选、查看删除原因、恢复文件和永久删除。"
      page={page}
      viewContext={{
        eyebrow: "文件 / 回收站",
        title: "回收站",
        description: "查看被删除文件的原路径、删除原因和保留期，支持恢复或永久清理。",
        chips: [`待清理 ${trashRows.length}`, `已恢复 ${restoredRows.length}`, "保留 7 天"],
      }}
      actions={<><button className="ghost" type="button" onClick={() => { setTrashRows([]); setSelectedId(""); notify("回收站已清空", "warning"); }}><Trash2 size={15} /> 清空回收站</button><button className="ghost" type="button" onClick={() => notify(`最近恢复记录：${restoredRows.length} 个`, "info")}><RefreshCw size={15} /> 查看恢复记录</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索文件、原路径、删除原因" onChange={setSearch} /><FieldSelect label="所有者" value={ownerFilter} options={ownerOptions} onChange={setOwnerFilter} /></>}
      metrics={<><MetricTile icon={Trash2} label="回收站文件" value={`${trashRows.length}`} tone="orange" /><MetricTile icon={RefreshCw} label="已恢复" value={`${restoredRows.length}`} tone="green" /><MetricTile icon={Clock3} label="保留策略" value="7天" tone="blue" /></>}
      side={selected && (
        <DetailDrawer title="删除详情" subtitle={selected.name} onClose={() => setSelectedId("")} autoFocus={false} actions={<><button className="ghost" type="button" aria-label={`永久删除 ${selected.name}`} onClick={() => purgeFile(selected)}>永久删除</button><button className="primary" type="button" aria-label={`恢复 ${selected.name}`} onClick={() => restoreFile(selected)}>恢复</button></>}>
          <div className="detail-kv">
            <p><span>原路径</span><b>{selected.originalPath}</b></p>
            <p><span>大小</span><b>{selected.size}</b></p>
            <p><span>删除时间</span><b>{selected.deletedAt}</b></p>
            <p><span>剩余保留</span><b>{selected.expiresIn}</b></p>
            <p><span>所有者</span><b>{selected.owner}</b></p>
            <p><span>删除原因</span><b>{selected.reason}</b></p>
          </div>
        </DetailDrawer>
      )}
    >
      <div className="file-trash-workspace">
        <DataTable
          columns={[
            { key: "name", label: "文件", width: "220px", render: (row) => <button className="module-row-link" type="button" onClick={() => setSelectedId(row.id)}><Trash2 size={15} /><b>{row.name}</b></button> },
            { key: "path", label: "原路径", render: (row) => <code>{row.originalPath}</code> },
            { key: "size", label: "大小", width: "84px", render: (row) => row.size },
            { key: "deleted", label: "删除时间", render: (row) => row.deletedAt },
            { key: "expires", label: "剩余保留", width: "92px", render: (row) => <span className="pill orange">{row.expiresIn}</span> },
            { key: "owner", label: "所有者", width: "84px", render: (row) => row.owner },
            { key: "ops", label: "操作", width: "170px", render: (row) => <span className="table-actions"><button type="button" aria-label={`恢复 ${row.name}`} onClick={() => restoreFile(row)}>恢复</button><button type="button" aria-label={`永久删除 ${row.name}`} onClick={() => purgeFile(row)}>永久删除</button></span> },
          ]}
          rows={filteredRows}
          emptyText="回收站没有匹配文件"
          getRowKey={(row) => row.id}
        />
        <section className="trash-restore-panel">
          <PanelCard title="最近恢复">
            <div className="restore-mini-list">
              {restoredRows.map((row) => <p key={row.id}><FileBox size={14} /><span>{row.name}</span><em>{row.path}</em></p>)}
              {restoredRows.length === 0 && <p className="module-empty-card">还没有恢复记录</p>}
            </div>
          </PanelCard>
        </section>
      </div>
    </ModulePageShell>
  );
}

function TerminalPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const terminalPreset = terminalPagePreset(page);
  const terminalMode = terminalPreset.panel;
  const [sessions, setSessions] = useState(initialTerminalSessions);
  const [snippets, setSnippets] = useState(initialTerminalSnippets);
  const [historyRows, setHistoryRows] = useState(initialTerminalHistory);
  const [selectedSessionId, setSelectedSessionId] = useState(initialTerminalSessions[0].id);
  const [command, setCommand] = useState("");
  const [sessionSearch, setSessionSearch] = useState("");
  const [snippetSearch, setSnippetSearch] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [sessionStatusFilter, setSessionStatusFilter] = useState("全部");
  const [snippetCategoryFilter, setSnippetCategoryFilter] = useState("全部");
  const [snippetRiskFilter, setSnippetRiskFilter] = useState("全部");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("全部");
  const [pendingSensitiveCommand, setPendingSensitiveCommand] = useState<{ command: string; sessionId: string } | null>(null);
  const [logsBySession, setLogsBySession] = useState<Record<string, string[]>>(() => ({
    [initialTerminalSessions[0].id]: [`connected to ${initialTerminalSessions[0].host}`, "Last login: Thu Jun 18 10:21:03"],
    [initialTerminalSessions[1].id]: [`connected to ${initialTerminalSessions[1].host}`, "Last login: Thu Jun 18 10:04:19"],
    [initialTerminalSessions[2].id]: [`disconnected from ${initialTerminalSessions[2].host}`],
  }));
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
  const connected = selectedSession.status === "connected";
  const logs = logsBySession[selectedSession.id] ?? [];
  const search = terminalMode === "snippets" ? snippetSearch : terminalMode === "history" ? historySearch : sessionSearch;
  const snippetCategories = ["全部", ...Array.from(new Set(snippets.map((snippet) => snippet.category)))];

  const filteredSessions = sessions.filter((session) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${session.host} ${session.ip} ${session.user} ${session.cwd} ${session.lastCommand}`.toLowerCase().includes(query);
    const matchStatus = sessionStatusFilter === "全部" || session.status === sessionStatusFilter;
    return matchSearch && matchStatus;
  });
  const filteredSnippets = snippets.filter((snippet) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${snippet.title} ${snippet.command} ${snippet.category} ${snippet.description}`.toLowerCase().includes(query);
    const matchCategory = snippetCategoryFilter === "全部" || snippet.category === snippetCategoryFilter;
    const matchRisk = snippetRiskFilter === "全部" || snippet.risk === snippetRiskFilter;
    return matchSearch && matchCategory && matchRisk;
  });
  const filteredHistory = historyRows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.command} ${row.host} ${row.user} ${row.output}`.toLowerCase().includes(query);
    const matchStatus = historyStatusFilter === "全部" || row.status === historyStatusFilter;
    return matchSearch && matchStatus;
  });
  const updateSession = (id: string, patch: Partial<TerminalSessionRecord>) => {
    setSessions((current) => current.map((session) => session.id === id ? { ...session, ...patch } : session));
  };
  const appendLogs = (sessionId: string, lines: string[]) => {
    setLogsBySession((current) => ({
      ...current,
      [sessionId]: [...(current[sessionId] ?? []), ...lines],
    }));
  };
  const setSessionLogs = (sessionId: string, nextLogs: string[]) => {
    setLogsBySession((current) => ({
      ...current,
      [sessionId]: nextLogs,
    }));
  };
  const switchSession = (session: TerminalSessionRecord) => {
    setSelectedSessionId(session.id);
    appendLogs(session.id, [`session focused: ${session.user}@${session.host}`]);
    notify(`已切换到 ${session.host}`, "info");
  };
  const connectSession = (session = selectedSession) => {
    updateSession(session.id, { status: "connected", latency: session.latency === "-" ? "44ms" : session.latency });
    setSelectedSessionId(session.id);
    appendLogs(session.id, [`connected to ${session.host}`]);
    notify(`已连接 ${session.host}`);
  };
  const disconnectSession = (session = selectedSession) => {
    updateSession(session.id, { status: "disconnected", latency: "-" });
    appendLogs(session.id, [`disconnected from ${session.host}`]);
    notify(`${session.host} 会话已断开`, "warning");
  };
  const commandOutput = (next: string) => {
    if (next.includes("systemctl status")) return "nginx.service active (running)";
    if (next.includes("systemctl restart")) return "service restart queued, status=0/SUCCESS";
    if (next.includes("df")) return "/dev/vda1  62G  21G  41G  35% /";
    if (next.includes("top")) return "load average: 0.38, 0.42, 0.41";
    if (next.includes("tail")) return "no critical errors in last 100 lines";
    if (next.includes("mysqladmin")) return "ERROR 2002: connection timed out";
    if (next.includes("rm -rf")) return "dangerous command blocked by local prototype";
    return `command '${next}' executed`;
  };
  const isPrivilegedCommand = (next: string) => /(^|\s)(systemctl\s+restart|systemctl\s+stop|rm\s+-rf|ufw|iptables)\b/.test(next);
  const isDestructiveCommand = (next: string) => /(^|\s)rm\s+-rf\b/.test(next);
  const runCommand = (value = command, risk: TerminalSnippetRecord["risk"] | "自动" = "自动") => {
    const next = value.trim();
    if (!next) return;
    if (!connected) {
      notify("终端未连接，请先连接主机", "danger");
      return;
    }
    if (risk === "危险" || isDestructiveCommand(next)) {
      const output = "dangerous command blocked by local prototype";
      appendLogs(selectedSession.id, [`$ ${next}`, output]);
      setHistoryRows((current) => [{
        id: `term-history-${Date.now()}`,
        command: next,
        host: selectedSession.host,
        user: selectedSession.user,
        status: "失败",
        duration: "0.0s",
        time: currentClock(),
        output,
      }, ...current]);
      setPendingSensitiveCommand(null);
      setCommand("");
      notify("危险命令已强制阻止", "danger");
      return;
    }
    const requiresSudo = risk === "变更" || isPrivilegedCommand(next);
    if (requiresSudo && selectedSession.privilege !== "sudo") {
      const output = "permission denied: sudo privilege required";
      appendLogs(selectedSession.id, [`$ ${next}`, output]);
      setHistoryRows((current) => [{
        id: `term-history-${Date.now()}`,
        command: next,
        host: selectedSession.host,
        user: selectedSession.user,
        status: "失败",
        duration: "0.1s",
        time: currentClock(),
        output,
      }, ...current]);
      setCommand("");
      notify("当前会话权限不足，已阻止变更命令", "danger");
      return;
    }
    if (requiresSudo && (pendingSensitiveCommand?.command !== next || pendingSensitiveCommand.sessionId !== selectedSession.id)) {
      setPendingSensitiveCommand({ command: next, sessionId: selectedSession.id });
      setCommand(next);
      notify("变更命令需要二次确认，再次运行将执行", "warning");
      return;
    }
    const output = commandOutput(next);
    const failed = next.includes("mysqladmin") || next.includes("rm -rf");
    appendLogs(selectedSession.id, [`$ ${next}`, output]);
    setHistoryRows((current) => [{
      id: `term-history-${Date.now()}`,
      command: next,
      host: selectedSession.host,
      user: selectedSession.user,
      status: failed ? "失败" : "成功",
      duration: failed ? "5.0s" : "0.4s",
      time: currentClock(),
      output,
    }, ...current]);
    updateSession(selectedSession.id, { lastCommand: next });
    setPendingSensitiveCommand(null);
    setCommand("");
    notify(failed ? "命令已被原型拦截或执行失败" : "命令已执行", failed ? "danger" : "success");
  };
  const fillSnippet = (snippet: TerminalSnippetRecord) => {
    setCommand(snippet.command);
    setSnippets((current) => current.map((item) => item.id === snippet.id ? { ...item, lastUsed: currentClock() } : item));
    notify(`已填充命令：${snippet.title}`, "info");
  };
  const runSnippet = (snippet: TerminalSnippetRecord) => {
    fillSnippet(snippet);
    runCommand(snippet.command, snippet.risk);
  };
  const copyText = (value: string, successMessage: string) => {
    if (!navigator.clipboard?.writeText) {
      notify("复制失败，请检查浏览器剪贴板权限", "danger");
      return;
    }
    void navigator.clipboard.writeText(value)
      .then(() => notify(successMessage, "info"))
      .catch(() => notify("复制失败，请检查浏览器剪贴板权限", "danger"));
  };
  const copyCommand = (value: string) => copyText(value, "命令已复制");
  const terminalFilters = terminalMode === "snippets"
    ? <><ModuleSearch value={snippetSearch} placeholder="搜索命令、分类或说明" onChange={setSnippetSearch} /><FieldSelect label="分类" value={snippetCategoryFilter} options={snippetCategories} onChange={setSnippetCategoryFilter} /><FieldSelect label="风险" value={snippetRiskFilter} options={["全部", "只读", "变更", "危险"]} onChange={setSnippetRiskFilter} /></>
    : terminalMode === "history"
      ? <><ModuleSearch value={historySearch} placeholder="搜索命令、主机或输出" onChange={setHistorySearch} /><FieldSelect label="结果" value={historyStatusFilter} options={["全部", "成功", "失败"]} onChange={setHistoryStatusFilter} /></>
      : <><ModuleSearch value={sessionSearch} placeholder="搜索主机、IP、用户或路径" onChange={setSessionSearch} /><FieldSelect label="连接" value={sessionStatusFilter} options={["全部", "connected", "disconnected"]} onChange={setSessionStatusFilter} /></>;

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={terminalPreset.subtitle}
      page={page}
      actions={<><button className="ghost" type="button" onClick={() => disconnectSession()} disabled={!connected}>断开当前</button><button className="primary" type="button" onClick={() => connectSession()}><RefreshCw size={15} /> 连接/重连</button></>}
      filters={terminalFilters}
      metrics={<><MetricTile icon={TerminalSquare} label="活动会话" value={`${sessions.filter((session) => session.status === "connected").length}`} tone="blue" /><MetricTile icon={Clock3} label="历史命令" value={`${historyRows.length}`} tone="green" /><MetricTile icon={Shield} label="高风险片段" value={`${snippets.filter((snippet) => snippet.risk !== "只读").length}`} tone="orange" /></>}
    >
      <div className={`terminal-workbench terminal-${terminalMode}-view`}>
        <section className="terminal-side-panel">
          {terminalMode === "sessions" && (
            <div className="terminal-session-list">
              {filteredSessions.map((session) => (
                <article key={session.id} className={session.id === selectedSession.id ? "active" : ""}>
                  <button className="terminal-session-main" type="button" aria-label={`切换终端会话 ${session.host}`} onClick={() => switchSession(session)}>
                    <span><StatusLight tone={session.status === "connected" ? "green" : "red"} /><b>{session.host}</b><em>{session.ip}</em></span>
                    <strong>{session.user}</strong>
                    <p>{session.cwd}</p>
                    <small>{session.lastCommand}</small>
                  </button>
                  <div className="terminal-card-actions">
                    <span>{session.latency}</span>
                    <button type="button" aria-label={`${session.status === "connected" ? "断开" : "连接"} ${session.host}`} onClick={() => session.status === "connected" ? disconnectSession(session) : connectSession(session)}>{session.status === "connected" ? "断开" : "连接"}</button>
                  </div>
                </article>
              ))}
              {filteredSessions.length === 0 && <p className="module-empty-card">没有匹配的终端会话</p>}
            </div>
          )}
          {terminalMode === "snippets" && (
            <div className="terminal-snippet-library">
              {filteredSnippets.map((snippet) => (
                <article key={snippet.id} className={snippet.favorite ? "favorite" : ""}>
                  <header><strong>{snippet.title}</strong><span className={`pill ${snippet.risk === "危险" ? "red" : snippet.risk === "变更" ? "orange" : "green"}`}>{snippet.risk}</span></header>
                  <code>{snippet.command}</code>
                  <p>{snippet.description}</p>
                  <footer><span>{snippet.category} · {snippet.lastUsed}</span><div><button type="button" aria-label={`收藏 ${snippet.title}`} onClick={() => { setSnippets((current) => current.map((item) => item.id === snippet.id ? { ...item, favorite: !item.favorite } : item)); notify(`${snippet.title} 已${snippet.favorite ? "取消收藏" : "收藏"}`, "info"); }}>{snippet.favorite ? "取消收藏" : "收藏"}</button><button type="button" aria-label={`填充 ${snippet.title}`} onClick={() => fillSnippet(snippet)}>填充</button><button type="button" aria-label={`执行 ${snippet.title}`} onClick={() => runSnippet(snippet)}>执行</button></div></footer>
                </article>
              ))}
              {filteredSnippets.length === 0 && <p className="module-empty-card">没有匹配的常用命令</p>}
            </div>
          )}
          {terminalMode === "history" && (
            <div className="terminal-history-list">
              {filteredHistory.map((row) => (
                <article key={row.id} className={row.pinned ? "pinned" : ""}>
                  <header><span className={`pill ${row.status === "成功" ? "green" : "red"}`}>{row.status}</span><strong>{row.command}</strong></header>
                  <p><b>{row.host}</b><span>{row.user} · {row.time} · {row.duration}</span></p>
                  <code>{row.output}</code>
                  <footer><button type="button" aria-label={`复制历史命令 ${row.command} ${row.host} ${row.time}`} onClick={() => copyCommand(row.command)}>复制</button><button type="button" aria-label={`重新执行 ${row.command} ${row.host} ${row.time}`} onClick={() => runCommand(row.command)}>重跑</button><button type="button" aria-label={`${row.pinned ? "取消固定" : "固定"} ${row.command} ${row.host} ${row.time}`} onClick={() => { setHistoryRows((current) => current.map((item) => item.id === row.id ? { ...item, pinned: !item.pinned } : item)); notify(`${row.command} 已${row.pinned ? "取消固定" : "固定"}`, "info"); }}>{row.pinned ? "取消固定" : "固定"}</button></footer>
                </article>
              ))}
              {filteredHistory.length === 0 && <p className="module-empty-card">没有匹配的执行历史</p>}
            </div>
          )}
        </section>
        <section className="terminal-console-card">
          <div className="terminal-console-head">
            <div><span>{selectedSession.user}@{selectedSession.host}</span><strong>{selectedSession.cwd}</strong></div>
            <StatusDot text={connected ? "已连接" : "未连接"} tone={connected ? "green" : "red"} />
          </div>
          <div className="terminal-panel">
            <div className="terminal-toolbar">
              <span><StatusLight tone={connected ? "green" : "red"} /> {connected ? "connected" : "disconnected"}</span>
              <div>
                <button type="button" onClick={() => { setSessionLogs(selectedSession.id, []); notify("终端已清屏", "info"); }}>清屏</button>
                <button type="button" onClick={() => copyText(logs.join("\n"), "会话内容已复制")}>复制会话</button>
                <button type="button" onClick={() => connectSession()}>重连</button>
              </div>
            </div>
            <div className="terminal-log" role="log" aria-live="polite" aria-label={`${selectedSession.host} 终端输出`}>
              {logs.length === 0 ? <p>terminal cleared</p> : logs.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}
            </div>
            <label className="terminal-input">
              <span>{selectedSession.host}:~$</span>
              <input aria-label="命令输入" value={command} disabled={!connected} placeholder={connected ? "输入命令后按 Enter" : "请先连接主机"} onChange={(event) => { setCommand(event.target.value); setPendingSensitiveCommand(null); }} onKeyDown={(event) => { if (event.key === "Enter") runCommand(); }} />
              <button type="button" disabled={!connected || !command.trim()} onClick={() => runCommand()}>运行</button>
            </label>
          </div>
        </section>
      </div>
    </ModulePageShell>
  );
}

function SystemdPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [rows, setRows] = useState(initialServiceRecords);
  const servicePreset = systemdPagePreset(page);
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [statusByPage, setStatusByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<ServiceRecord | null>(servicePreset.mode === "logs" ? initialServiceRecords[0] : null);
  const search = searchByPage[page] ?? servicePreset.search;
  const statusFilter = statusByPage[page] ?? servicePreset.status;
  const filteredRows = rows.filter((row) => (!search.trim() || `${row.name} ${row.host}`.toLowerCase().includes(search.trim().toLowerCase())) && (statusFilter === "全部" || row.status === statusFilter));
  const updateService = (id: string, patch: Partial<ServiceRecord>) => {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
    setDrawer((current) => current?.id === id ? { ...current, ...patch } : current);
  };
  const logRows = servicePreset.mode === "logs" ? rows : drawer ? [drawer] : [];
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={servicePreset.subtitle}
      page={page}
      actions={<button className="ghost" type="button" onClick={() => notify("服务状态已刷新", "info")}><RefreshCw size={15} /> 刷新</button>}
      filters={<><ModuleSearch value={search} placeholder="搜索服务或主机" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="状态" value={statusFilter} options={["全部", "active", "failed", "inactive"]} onChange={(value) => setStatusByPage((current) => ({ ...current, [page]: value }))} /></>}
      metrics={<><MetricTile icon={CheckCircle2} label="active" value={`${rows.filter((row) => row.status === "active").length}`} tone="green" /><MetricTile icon={Shield} label="failed" value={`${rows.filter((row) => row.status === "failed").length}`} tone="red" /><MetricTile icon={Clock3} label="inactive" value={`${rows.filter((row) => row.status === "inactive").length}`} tone="gray" /></>}
      side={drawer && (
        <DetailDrawer title="服务日志" subtitle={drawer.name} onClose={() => setDrawer(null)} autoFocus={servicePreset.mode !== "logs"}>
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
  const [searchByPage, setSearchByPage] = useState<Record<string, string>>({});
  const [stateByPage, setStateByPage] = useState<Record<string, string>>({});
  const [drawer, setDrawer] = useState<{ type: "create" | "edit"; job?: ScheduleJob } | null>(null);
  const [draft, setDraft] = useState({ name: "新建任务", cron: "0 4 * * *", command: "echo ok" });
  const search = searchByPage[page] ?? schedulePreset.search;
  const stateFilter = stateByPage[page] ?? schedulePreset.state;
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
      updateJob(drawer.job.id, { name: draft.name.trim(), cron: draft.cron.trim(), command: draft.command.trim() });
      notify(`${draft.name.trim()} 已保存`);
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
      filters={<><ModuleSearch value={search} placeholder="搜索任务、cron 或命令" onChange={(value) => setSearchByPage((current) => ({ ...current, [page]: value }))} /><FieldSelect label="状态" value={stateFilter} options={["全部", "已启用", "已停用"]} onChange={(value) => setStateByPage((current) => ({ ...current, [page]: value }))} /></>}
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
          { key: "ops", label: "操作", width: "300px", render: (row) => <span className="table-actions"><button type="button" onClick={() => { updateJob(row.id, { enabled: !row.enabled }); notify(`${row.name} 已${row.enabled ? "停用" : "启用"}`); }}>{row.enabled ? "停用" : "启用"}</button><button type="button" onClick={() => { updateJob(row.id, { lastRun: currentClock(), result: "成功" }); notify(`${row.name} 已立即执行`); }}>执行</button><button type="button" onClick={() => { setDraft({ name: row.name, cron: row.cron, command: row.command }); setDrawer({ type: "edit", job: row }); }}>编辑</button><button type="button" onClick={() => { setRows((current) => current.filter((item) => item.id !== row.id)); notify(`${row.name} 已删除`, "warning"); }}>删除</button></span> },
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

function AclPage({ page, setPage, notify }: { page: PageKey; setPage: SetPage; notify: Notify }) {
  const aclPreset = aclPagePreset(page);
  const tab = aclPreset.tab;
  const [users, setUsers] = useState(initialAclUsers);
  const [roles, setRoles] = useState(initialAclRoles);
  const [policies, setPolicies] = useState(initialAclPolicies);
  const [savedRoleIds, setSavedRoleIds] = useState(() => new Set(initialAclRoles.map((role) => role.id)));
  const [savedPolicyIds, setSavedPolicyIds] = useState(() => new Set(initialAclPolicies.map((policy) => policy.id)));
  const [userSearch, setUserSearch] = useState("");
  const [policySearch, setPolicySearch] = useState("");
  const [policyModule, setPolicyModule] = useState("全部");
  const [policyRisk, setPolicyRisk] = useState("全部");
  const [selectedPolicyId, setSelectedPolicyId] = useState(initialAclPolicies[0].id);
  const [roleId, setRoleId] = useState(initialAclRoles[0].id);
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const filteredUsers = users.filter((user) => !userSearch.trim() || `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(userSearch.trim().toLowerCase()));
  const filteredPolicies = policies.filter((policy) => {
    const query = policySearch.trim().toLowerCase();
    const matchSearch = !query || `${policy.name} ${policy.module} ${policy.desc} ${policy.roles.join(" ")}`.toLowerCase().includes(query);
    const matchModule = policyModule === "全部" || policy.module === policyModule;
    const matchRisk = policyRisk === "全部" || policy.risk === policyRisk;
    return matchSearch && matchModule && matchRisk;
  });
  const selectedPolicy = filteredPolicies.find((policy) => policy.id === selectedPolicyId) ?? filteredPolicies[0] ?? null;
  const policyModules = ["全部", ...Array.from(new Set(policies.map((policy) => policy.module)))];
  const dirtyRoles = roles.filter((role) => !savedRoleIds.has(role.id)).length;
  const dirtyPolicies = policies.filter((policy) => !savedPolicyIds.has(policy.id)).length;
  const setAclTab = (nextTab: "users" | "roles" | "policies") => {
    const pageForTab = nextTab === "roles" ? "acl-roles" : nextTab === "policies" ? "acl-policies" : "acl-users";
    if (nextTab !== "policies") {
      setPolicyModule("全部");
      setPolicyRisk("全部");
    }
    setPage(pageForTab, { message: `已切换到${nextTab === "users" ? "用户" : nextTab === "roles" ? "角色" : "权限项"}视图`, tone: "info" });
  };
  const saveRole = (role: AclRole) => {
    setSavedRoleIds((current) => new Set(current).add(role.id));
    notify(`${role.name} 权限已保存`);
  };
  const savePolicy = (policy: AclPolicy) => {
    setSavedPolicyIds((current) => new Set(current).add(policy.id));
    notify(`${policy.name} 关联角色已保存`);
  };
  const togglePermission = (permission: string) => {
    const nextAllowed = !selectedRole.permissions.includes(permission);
    const policy = policies.find((item) => item.name === permission);
    setRoles((current) => current.map((role) => {
      if (role.id !== selectedRole.id) return role;
      return nextAllowed
        ? { ...role, permissions: [...role.permissions, permission] }
        : { ...role, permissions: role.permissions.filter((item) => item !== permission) };
    }));
    setPolicies((current) => current.map((item) => {
      if (item.name !== permission) return item;
      const nextRoles = nextAllowed
        ? Array.from(new Set([...item.roles, selectedRole.name]))
        : item.roles.filter((roleName) => roleName !== selectedRole.name);
      return { ...item, roles: nextRoles, lastUpdated: currentClock() };
    }));
    setSavedRoleIds((current) => {
      const next = new Set(current);
      next.delete(selectedRole.id);
      return next;
    });
    setSavedPolicyIds((current) => {
      if (!policy) return current;
      const next = new Set(current);
      next.delete(policy.id);
      return next;
    });
  };
  const togglePolicyRole = (policy: AclPolicy, role: AclRole) => {
    const checked = policy.roles.includes(role.name);
    setPolicies((current) => current.map((item) => item.id === policy.id ? {
      ...item,
      roles: checked ? item.roles.filter((name) => name !== role.name) : [...item.roles, role.name],
      lastUpdated: currentClock(),
    } : item));
    setRoles((current) => current.map((item) => {
      if (item.id !== role.id) return item;
      const hasPermission = item.permissions.includes(policy.name);
      return hasPermission
        ? { ...item, permissions: item.permissions.filter((permission) => permission !== policy.name) }
        : { ...item, permissions: [...item.permissions, policy.name] };
    }));
    setSavedPolicyIds((current) => {
      const next = new Set(current);
      next.delete(policy.id);
      return next;
    });
    setSavedRoleIds((current) => {
      const next = new Set(current);
      next.delete(role.id);
      return next;
    });
    notify(`${role.name} 已${checked ? "移除" : "关联"} ${policy.name}`, checked ? "warning" : "info");
  };
  const resetUserMfa = (user: AclUser) => {
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, mfa: "需重置" } : item));
    notify(`${user.name} MFA 已重置`, "warning");
  };
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={aclPreset.subtitle}
      page={page}
      actions={tab === "roles" ? <button className={dirtyRoles > 0 ? "primary" : "ghost"} type="button" onClick={() => saveRole(selectedRole)}>{dirtyRoles > 0 ? `保存角色权限 (${dirtyRoles})` : "保存角色权限"}</button> : tab === "policies" && selectedPolicy ? <button className={dirtyPolicies > 0 ? "primary" : "ghost"} type="button" onClick={() => savePolicy(selectedPolicy)}>{dirtyPolicies > 0 ? `保存权限项 (${dirtyPolicies})` : "保存权限项"}</button> : undefined}
      filters={<><div className="deploy-tabs" role="tablist" aria-label="权限视图"><button className={tab === "users" ? "active" : ""} type="button" role="tab" aria-selected={tab === "users"} onClick={() => setAclTab("users")}>用户</button><button className={tab === "roles" ? "active" : ""} type="button" role="tab" aria-selected={tab === "roles"} onClick={() => setAclTab("roles")}>角色</button><button className={tab === "policies" ? "active" : ""} type="button" role="tab" aria-selected={tab === "policies"} onClick={() => setAclTab("policies")}>权限项</button></div>{tab === "users" && <ModuleSearch value={userSearch} placeholder="搜索用户、邮箱或角色" onChange={setUserSearch} />}{tab === "policies" && <><ModuleSearch value={policySearch} placeholder="搜索权限项、模块或角色" onChange={setPolicySearch} /><FieldSelect label="模块" value={policyModule} options={policyModules} onChange={setPolicyModule} /><FieldSelect label="风险" value={policyRisk} options={["全部", "高", "中", "低"]} onChange={setPolicyRisk} /></>}</>}
      metrics={<><MetricTile icon={UserRound} label="用户" value={`${users.length}`} tone="blue" /><MetricTile icon={Lock} label="未保存" value={`${dirtyRoles + dirtyPolicies}`} tone={dirtyRoles + dirtyPolicies > 0 ? "orange" : "purple"} /><MetricTile icon={Shield} label="高风险权限" value={`${policies.filter((policy) => policy.risk === "高").length}`} tone="orange" /></>}
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
            { key: "ops", label: "操作", width: "180px", render: (row) => <span className="table-actions"><button type="button" onClick={() => { setUsers((current) => current.map((item) => item.id === row.id ? { ...item, enabled: !item.enabled } : item)); notify(`${row.name} 已${row.enabled ? "禁用" : "启用"}`); }}>{row.enabled ? "禁用" : "启用"}</button><button type="button" onClick={() => resetUserMfa(row)}>重置 MFA</button></span> },
          ]}
          rows={filteredUsers}
          emptyText="没有匹配的用户"
          getRowKey={(row) => row.id}
        />
      ) : tab === "roles" ? (
        <div className="acl-role-layout">
          <PanelCard title="角色列表">
            <div className="role-list">
              {roles.map((role) => <button key={role.id} className={role.id === roleId ? "active" : ""} type="button" aria-pressed={role.id === roleId} onClick={() => setRoleId(role.id)}><strong>{role.name}</strong><span>{role.desc}</span></button>)}
            </div>
          </PanelCard>
          <PanelCard title={`${selectedRole.name} 权限项`} action={savedRoleIds.has(selectedRole.id) ? "已保存" : "保存"} onAction={() => saveRole(selectedRole)}>
            <div className="permission-grid">
              {permissionOptions.map((permission) => (
                <button key={permission} className={selectedRole.permissions.includes(permission) ? "checked" : ""} type="button" aria-pressed={selectedRole.permissions.includes(permission)} onClick={() => togglePermission(permission)}>
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
              <button key={policy.id} className={policy.id === selectedPolicy?.id ? "active" : ""} type="button" aria-pressed={policy.id === selectedPolicy?.id} onClick={() => setSelectedPolicyId(policy.id)}>
                <span><b>{policy.name}</b><i>{policy.module}</i></span>
                <em className={policy.risk === "高" ? "red-text" : policy.risk === "中" ? "orange-text" : "blue-text"}>{policy.risk}风险</em>
                <small>{policy.desc}</small>
              </button>
            ))}
            {filteredPolicies.length === 0 && <p className="module-empty-card">没有匹配的权限项</p>}
          </div>
          {selectedPolicy ? (
            <PanelCard title={`${selectedPolicy.name} 关联角色`} action={savedPolicyIds.has(selectedPolicy.id) ? "已保存" : "保存"} onAction={() => savePolicy(selectedPolicy)}>
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
                    <button key={role.id} className={checked ? "checked" : ""} type="button" aria-pressed={checked} onClick={() => togglePolicyRole(selectedPolicy, role)}>
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

function DatabaseSlowQueriesPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [queries, setQueries] = useState(initialDatabaseSlowQueries);
  const [search, setSearch] = useState("");
  const [databaseFilter, setDatabaseFilter] = useState("全部");
  const [levelFilter, setLevelFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [timeRange, setTimeRange] = useState("近 24 小时");
  const [drawerId, setDrawerId] = useState<string | null>(initialDatabaseSlowQueries[0]?.id ?? null);
  const databaseOptions = ["全部", ...Array.from(new Set(queries.map((query) => query.database)))];
  const filteredQueries = queries.filter((query) => {
    const keyword = search.trim().toLowerCase();
    const matchSearch = !keyword || `${query.database} ${query.fingerprint} ${query.sql} ${query.owner}`.toLowerCase().includes(keyword);
    const matchDatabase = databaseFilter === "全部" || query.database === databaseFilter;
    const matchLevel = levelFilter === "全部" || query.level === levelFilter;
    const matchStatus = statusFilter === "全部" || query.status === statusFilter;
    return matchSearch && matchDatabase && matchLevel && matchStatus;
  });
  const selectedQuery = drawerId ? filteredQueries.find((query) => query.id === drawerId) ?? null : null;
  const primaryQuery = selectedQuery ?? filteredQueries[0] ?? null;
  const pendingCount = queries.filter((query) => query.status !== "已处理").length;
  const highCount = queries.filter((query) => query.level === "高" && query.status !== "已处理").length;
  const affectedDatabases = new Set(queries.filter((query) => query.status !== "已处理").map((query) => query.database)).size;
  const highestP95 = queries.reduce((max, query) => (
    secondsFromDuration(query.p95Time) > secondsFromDuration(max.p95Time) ? query : max
  ), queries[0]);
  const updateQuery = (id: string, patch: Partial<DatabaseSlowQuery>) => {
    setQueries((current) => current.map((query) => query.id === id ? { ...query, ...patch } : query));
  };
  const openQuery = (query: DatabaseSlowQuery) => {
    setDrawerId(query.id);
  };
  const runExplain = (queryId: string) => {
    const target = queries.find((query) => query.id === queryId);
    if (!target) {
      notify("未找到可分析的慢查询", "warning");
      return;
    }
    const nextExplain = target.explain ?? `${target.database.toLowerCase().includes("mysql") ? "type=range" : "Bitmap Heap Scan"} · rows=${target.rows} · cost=high · 建议按指纹创建索引`;
    setDrawerId(target.id);
    setQueries((current) => current.map((item) => (
      item.id === queryId
        ? { ...item, status: item.status === "已处理" ? "已处理" : "分析中", explain: nextExplain }
        : item
    )));
    notify(`${target.fingerprint} 的 Explain 已生成`, "info");
  };
  const markResolved = (query: DatabaseSlowQuery) => {
    updateQuery(query.id, { status: "已处理" });
    notify(`${query.fingerprint} 已标记处理`);
  };
  const createIndexAdvice = (query: DatabaseSlowQuery) => {
    updateQuery(query.id, { suggestion: `${query.suggestion} · 已生成索引建议草案。`, status: query.status === "已处理" ? "已处理" : "分析中" });
    setDrawerId(query.id);
    notify(`${query.database} 索引建议已生成`);
  };
  const killSession = (query: DatabaseSlowQuery) => {
    updateQuery(query.id, { status: query.status === "已处理" ? "已处理" : "分析中" });
    notify(`${query.sessionId} 已发送终止会话指令`, "warning");
  };
  const copyFingerprint = async (fingerprint: string) => {
    try {
      await navigator.clipboard?.writeText(fingerprint);
      notify("SQL 指纹已复制", "info");
    } catch {
      notify("浏览器未允许复制 SQL 指纹", "warning");
    }
  };
  const levelTone = (level: DatabaseSlowQuery["level"]): Tone => {
    if (level === "高") return "red";
    if (level === "中") return "orange";
    return "blue";
  };
  const statusTone = (status: DatabaseSlowQuery["status"]): Tone => {
    if (status === "已处理") return "green";
    if (status === "分析中") return "blue";
    return "orange";
  };
  const handlePrimaryIndexAdvice = () => {
    if (!primaryQuery) {
      notify("没有可生成建议的慢查询", "warning");
      return;
    }
    createIndexAdvice(primaryQuery);
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={`聚焦慢查询指纹、耗时分布和治理动作，不混入数据库创建流程。采样窗口：${timeRange}`}
      page={page}
      viewContext={{
        eyebrow: "数据库 / 慢查询",
        title: "慢查询中心",
        description: "按 SQL 指纹聚合慢查询，支持 Explain、索引建议、终止会话和处理状态流转。",
        chips: [`窗口 ${timeRange}`, `待处理 ${pendingCount}`, `高危 ${highCount}`],
      }}
      actions={<><button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredQueries.length} 条慢查询`, "info")}><Download size={15} /> 导出慢查询</button><button className="ghost" type="button" onClick={() => { setTimeRange(timeRange === "近 24 小时" ? "近 7 天" : "近 24 小时"); notify("慢查询采样窗口已切换", "info"); }}><Clock3 size={15} /> 切换窗口</button><button className="primary" type="button" disabled={!primaryQuery} onClick={handlePrimaryIndexAdvice}><Plus size={15} /> 生成索引建议</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索 SQL、指纹、数据库或负责人" onChange={setSearch} /><FieldSelect label="数据库" value={databaseFilter} options={databaseOptions} onChange={setDatabaseFilter} /><FieldSelect label="等级" value={levelFilter} options={["全部", "高", "中", "低"]} onChange={setLevelFilter} /><FieldSelect label="状态" value={statusFilter} options={["全部", "待处理", "分析中", "已处理"]} onChange={setStatusFilter} /></>}
      metrics={<><MetricTile icon={Activity} label="慢查询指纹" value={`${queries.length}`} tone="orange" /><MetricTile icon={Clock3} label="P95 最高" value={highestP95?.p95Time ?? "-"} tone="red" /><MetricTile icon={Database} label="受影响实例" value={`${affectedDatabases}`} tone="blue" /><MetricTile icon={Shield} label="高风险待处理" value={`${highCount}`} tone={highCount ? "red" : "green"} /></>}
      side={selectedQuery && (
        <DetailDrawer title="慢查询详情" subtitle={selectedQuery.fingerprint} onClose={() => setDrawerId(null)} autoFocus={false} actions={<><button className="ghost" type="button" onClick={() => void copyFingerprint(selectedQuery.fingerprint)}>复制指纹</button><button className="primary" type="button" onClick={() => runExplain(selectedQuery.id)}>生成 Explain</button></>}>
          <div className="slow-query-drawer">
            <p><span>数据库</span><b>{selectedQuery.database}</b></p>
            <p><span>等级 / 状态</span><b>{selectedQuery.level} · {selectedQuery.status}</b></p>
            <p><span>平均 / P95</span><b>{selectedQuery.avgTime} / {selectedQuery.p95Time}</b></p>
            <p><span>调用次数</span><b>{selectedQuery.calls} 次 · 扫描 {selectedQuery.rows} 行</b></p>
            <p><span>会话</span><b>{selectedQuery.sessionId}</b></p>
            <code>{selectedQuery.sql}</code>
            <p><span>优化建议</span><b>{selectedQuery.suggestion}</b></p>
            <code>{selectedQuery.explain ?? "尚未生成 Explain，点击下方操作进行模拟分析。"}</code>
            <div className="slow-drawer-actions">
              <button type="button" onClick={() => createIndexAdvice(selectedQuery)}>索引建议</button>
              <button type="button" onClick={() => killSession(selectedQuery)}>终止会话</button>
              <button type="button" onClick={() => markResolved(selectedQuery)}>标记处理</button>
            </div>
          </div>
        </DetailDrawer>
      )}
    >
      <div className="database-slow-content">
        <DataTable
          columns={[
            { key: "fingerprint", label: "SQL 指纹", width: "220px", render: (query) => <button className="module-row-link" type="button" aria-label={`查看慢查询 ${query.fingerprint}`} onClick={() => openQuery(query)}><StatusLight tone={levelTone(query.level)} /><b>{query.fingerprint}</b></button> },
            { key: "database", label: "数据库", width: "150px", render: (query) => <span className="pill blue">{query.database}</span> },
            { key: "sql", label: "SQL 摘要", render: (query) => <code>{query.sql}</code> },
            { key: "avg", label: "平均", width: "76px", render: (query) => query.avgTime },
            { key: "p95", label: "P95", width: "76px", render: (query) => <b className={query.level === "高" ? "red-text" : ""}>{query.p95Time}</b> },
            { key: "calls", label: "调用", width: "72px", render: (query) => query.calls },
            { key: "level", label: "等级", width: "70px", render: (query) => <span className={`pill ${levelTone(query.level)}`}>{query.level}</span> },
            { key: "status", label: "状态", width: "86px", render: (query) => <span className={`pill ${statusTone(query.status)}`}>{query.status}</span> },
            { key: "ops", label: "操作", width: "250px", render: (query) => <span className="table-actions"><button type="button" aria-label={`生成 ${query.fingerprint} Explain`} onClick={() => runExplain(query.id)}>Explain</button><button type="button" aria-label={`创建 ${query.fingerprint} 索引建议`} onClick={() => createIndexAdvice(query)}>索引</button><button type="button" aria-label={`标记 ${query.fingerprint} 已处理`} onClick={() => markResolved(query)}>处理</button><button type="button" aria-label={`打开 ${query.fingerprint} 详情`} onClick={() => openQuery(query)}>详情</button></span> },
          ]}
          rows={filteredQueries}
          emptyText="没有匹配的慢查询指纹"
          getRowKey={(query) => query.id}
        />
        <section className="slow-query-lower">
          <PanelCard title="治理队列" action="刷新采样" onAction={() => notify("慢查询采样已刷新")}>
            <div className="slow-remediation-list">
              {queries.filter((query) => query.status !== "已处理").map((query) => (
                <article key={query.id}>
                  <span><StatusLight tone={levelTone(query.level)} /><b>{query.database}</b></span>
                  <em>{query.suggestion}</em>
                  <button type="button" onClick={() => openQuery(query)}>查看</button>
                </article>
              ))}
            </div>
          </PanelCard>
          <PanelCard title="耗时趋势">
            <div className="slow-trend-panel">
              {[
                ["平均耗时", [42, 46, 51, 58, 54, 62, 67], "orange"],
                ["P95 耗时", [50, 54, 61, 70, 74, 78, 82], "red"],
                ["调用次数", [22, 28, 24, 33, 38, 42, 36], "blue"],
              ].map(([label, points, tone]) => (
                <p key={label as string}><span>{label as string}</span><Sparkline values={points as number[]} tone={tone as Tone} /></p>
              ))}
            </div>
          </PanelCard>
        </section>
      </div>
    </ModulePageShell>
  );
}

function DatabaseBackupsPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const preset = databasePagePreset(page);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [storageFilter, setStorageFilter] = useState("全部");
  const [plans, setPlans] = useState(initialDatabaseBackupPlans);
  const [tasks, setTasks] = useState(initialDatabaseBackupTasks);
  const [restorePoints, setRestorePoints] = useState(initialDatabaseRestorePoints);
  const [restorePointId, setRestorePointId] = useState(initialDatabaseRestorePoints[0]?.id ?? "");
  const [drawer, setDrawer] = useState<DatabaseBackupPlan | DatabaseRestorePoint | null>(null);
  const selectedRestorePoint = restorePoints.find((point) => point.id === restorePointId) ?? restorePoints[0];
  const filteredPlans = plans.filter((plan) => {
    const keyword = search.trim().toLowerCase();
    const matchSearch = !keyword || `${plan.name} ${plan.database} ${plan.schedule}`.toLowerCase().includes(keyword);
    const matchStatus = statusFilter === "全部" || (statusFilter === "已启用" ? plan.enabled : statusFilter === "已暂停" ? !plan.enabled : plan.health === "告警");
    const matchStorage = storageFilter === "全部" || plan.storage === storageFilter;
    return matchSearch && matchStatus && matchStorage;
  });
  const successTasks = tasks.filter((task) => task.status === "成功").length;
  const successRate = tasks.length ? Math.round((successTasks / tasks.length) * 100) : 0;
  const failedTasks = tasks.filter((task) => task.status === "失败").length;
  const runningTasks = tasks.filter((task) => task.status === "运行中").length;
  const updatePlan = (id: string, patch: Partial<DatabaseBackupPlan>) => {
    setPlans((current) => current.map((plan) => plan.id === id ? { ...plan, ...patch } : plan));
  };
  const updateTask = (id: string, patch: Partial<DatabaseBackupTask>) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...patch } : task));
  };
  const syncCompletedPlan = (planIds: string[]) => {
    const uniqueIds = new Set(planIds);
    setPlans((current) => current.map((plan) => uniqueIds.has(plan.id) ? { ...plan, health: plan.health === "告警" ? "正常" : plan.health, lastRun: "刚刚", successRate: Math.max(plan.successRate, 96.8) } : plan));
  };
  const updateRestorePoint = (id: string, patch: Partial<DatabaseRestorePoint>) => {
    setRestorePoints((current) => current.map((point) => point.id === id ? { ...point, ...patch } : point));
    setDrawer((current) => current && !("schedule" in current) && current.id === id ? { ...current, ...patch } : current);
  };
  const runPlanNow = (plan: DatabaseBackupPlan) => {
    const task: DatabaseBackupTask = {
      id: `db-bkp-task-${Date.now()}`,
      planId: plan.id,
      database: plan.database,
      storage: plan.storage,
      status: "运行中",
      startedAt: "刚刚",
      size: "计算中",
      duration: "0秒",
    };
    setTasks((current) => [task, ...current]);
    updatePlan(plan.id, { enabled: true, lastRun: "刚刚" });
    notify(`${plan.database} 已开始立即备份`);
  };
  const createPlan = () => {
    const next: DatabaseBackupPlan = {
      id: `db-bkp-plan-${Date.now()}`,
      name: "新建备份计划",
      database: "staging-pg-03",
      storage: "S3",
      schedule: "0 3 * * *",
      retention: "7 份",
      enabled: false,
      health: "正常",
      lastRun: "未执行",
      successRate: 100,
    };
    setPlans((current) => [next, ...current]);
    setSearch("");
    setStatusFilter("全部");
    setStorageFilter("全部");
    setDrawer(next);
    notify("备份计划已创建，默认处于暂停状态", "info");
  };

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={`${preset.subtitle} · 最近同步 ${currentClock()}`}
      page={page}
      viewContext={{
        eyebrow: "数据库 / 备份计划",
        title: "备份计划",
        description: "独立管理数据库备份策略、最近任务和恢复点演练，不混入实例创建流程。",
        chips: [`计划 ${plans.length}`, `失败 ${failedTasks}`, `恢复点 ${restorePoints.length}`],
      }}
      actions={<><button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredPlans.length} 条备份计划`, "info")}><Download size={15} /> 导出</button><button className="ghost" type="button" onClick={() => notify("备份计划状态已刷新", "info")}><RefreshCw size={15} /> 刷新</button><button className="primary" type="button" onClick={createPlan}><Plus size={15} /> 新建计划</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索计划、数据库或 cron" onChange={setSearch} /><FieldSelect label="状态" value={statusFilter} options={["全部", "已启用", "已暂停", "告警"]} onChange={setStatusFilter} /><FieldSelect label="存储" value={storageFilter} options={["全部", "S3", "MinIO", "本地"]} onChange={setStorageFilter} /></>}
      metrics={<><MetricTile icon={CalendarDays} label="备份计划" value={`${plans.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="任务成功率" value={`${successRate}%`} tone="green" /><MetricTile icon={Shield} label="失败任务" value={`${failedTasks}`} tone={failedTasks ? "red" : "gray"} /></>}
      side={drawer && (
        <DetailDrawer
          title={"schedule" in drawer ? "备份计划详情" : "恢复演练"}
          subtitle={drawer.database}
          onClose={() => setDrawer(null)}
          actions={"schedule" in drawer ? (
            <><button className="ghost" type="button" onClick={() => setDrawer(null)}>关闭</button><button className="primary" type="button" onClick={() => { runPlanNow(drawer); setDrawer(null); }}>立即备份</button></>
          ) : (
            <><button className="ghost" type="button" aria-label={`校验恢复点 ${drawer.database}`} onClick={() => { updateRestorePoint(drawer.id, { checksum: "已校验" }); notify(`${drawer.database} 校验已完成`, "info"); }}>校验</button><button className="primary" type="button" aria-label={`${drawer.drillStatus === "演练中" ? "完成" : "开始"}恢复演练 ${drawer.database}`} onClick={() => { updateRestorePoint(drawer.id, { drillStatus: drawer.drillStatus === "演练中" ? "已完成" : "演练中" }); notify(`${drawer.database} 恢复演练已${drawer.drillStatus === "演练中" ? "完成" : "创建"}`); }}>{drawer.drillStatus === "演练中" ? "完成演练" : "开始演练"}</button></>
          )}
        >
          {"schedule" in drawer ? (
            <div className="backup-drawer-body">
              <p><span>计划名称</span><b>{drawer.name}</b></p>
              <p><span>执行周期</span><b>{drawer.schedule}</b></p>
              <p><span>保留策略</span><b>{drawer.retention}</b></p>
              <p><span>存储目标</span><b>{drawer.storage}</b></p>
              <p><span>成功率</span><b>{drawer.successRate}%</b></p>
              <div className="drawer-tip">编辑计划会记录到审计日志，本地原型仅模拟保存状态。</div>
            </div>
          ) : (
            <div className="backup-drawer-body">
              <p><span>恢复点</span><b>{drawer.createdAt}</b></p>
              <p><span>存储位置</span><b>{drawer.storage}</b></p>
              <p><span>大小</span><b>{drawer.size}</b></p>
              <p><span>校验</span><b>{drawer.checksum}</b></p>
              <p><span>演练状态</span><b>{drawer.drillStatus}</b></p>
              <div className="drawer-warning">恢复演练不会覆盖生产库，原型中仅生成本地状态反馈。</div>
            </div>
          )}
        </DetailDrawer>
      )}
    >
      <div className="database-backup-content">
        <section className="backup-plan-section">
          <DataTable
            columns={[
              { key: "plan", label: "备份计划", width: "240px", render: (plan) => <button className="module-row-link" type="button" aria-label={`查看 ${plan.name} 详情`} onClick={() => setDrawer(plan)}><StatusLight tone={backupPlanTone(plan)} /><b>{plan.name}</b></button> },
              { key: "database", label: "数据库", render: (plan) => <code>{plan.database}</code> },
              { key: "schedule", label: "周期", render: (plan) => plan.schedule },
              { key: "storage", label: "存储", render: (plan) => <span className="pill blue">{plan.storage}</span> },
              { key: "retention", label: "保留", render: (plan) => plan.retention },
              { key: "status", label: "状态", render: (plan) => <span className={`pill ${backupPlanTone(plan)}`}>{plan.enabled ? plan.health : "暂停"}</span> },
              { key: "success", label: "成功率", render: (plan) => <span className={plan.successRate < 90 ? "red-text" : "green-text"}>{plan.successRate}%</span> },
              { key: "ops", label: "操作", width: "230px", render: (plan) => <span className="table-actions"><button type="button" aria-label={`立即备份 ${plan.name}`} onClick={() => runPlanNow(plan)}>立即</button><button type="button" aria-label={`${plan.enabled ? "暂停" : "启用"} ${plan.name}`} onClick={() => { const enabled = !plan.enabled; updatePlan(plan.id, { enabled }); notify(`${plan.name} 已${enabled ? "启用" : "暂停"}`, enabled ? "success" : "warning"); }}>{plan.enabled ? "暂停" : "启用"}</button><button type="button" aria-label={`打开 ${plan.name} 详情`} onClick={() => setDrawer(plan)}>详情</button></span> },
            ]}
            rows={filteredPlans}
            emptyText="没有匹配的备份计划"
            getRowKey={(plan) => plan.id}
          />
        </section>
        <section className="database-backup-lower">
          <PanelCard title="最近备份任务" action="完成运行中" onAction={() => {
            if (!runningTasks) {
              notify("当前没有运行中的备份任务", "info");
              return;
            }
            const completedPlanIds = tasks.filter((task) => task.status === "运行中").map((task) => task.planId);
            setTasks((current) => current.map((task) => task.status === "运行中" ? { ...task, status: "成功", size: task.size === "计算中" || task.size === "-" ? "3.1 GB" : task.size, duration: "2分06秒" } : task));
            syncCompletedPlan(completedPlanIds);
            notify("运行中的备份任务已标记成功");
          }}>
            <div className="backup-task-list">
              {tasks.map((task) => (
                <article key={task.id}>
                  <span><StatusLight tone={backupTaskTone(task.status)} /> <b>{task.database}</b></span>
                  <em>{task.startedAt} · {task.storage}</em>
                  <strong className={task.status === "失败" ? "red-text" : task.status === "成功" ? "green-text" : ""}>{task.status}</strong>
                  <i>{task.size} / {task.duration}</i>
                  <button type="button" aria-label={`${task.status === "失败" ? "重试" : "查看日志"} ${task.database}`} onClick={() => {
                    if (task.status === "失败") {
                      updateTask(task.id, { status: "运行中", startedAt: "刚刚", duration: "0秒" });
                      notify(`${task.database} 失败任务已重试`);
                      return;
                    }
                    notify(`${task.database} 任务日志已打开`, "info");
                  }}>{task.status === "失败" ? "重试" : "日志"}</button>
                </article>
              ))}
            </div>
          </PanelCard>
          <PanelCard title="恢复点演练" action="开始演练" onAction={() => {
            if (selectedRestorePoint) {
              setDrawer(selectedRestorePoint);
              notify(`${selectedRestorePoint.database} 恢复演练已准备`, "info");
            }
          }}>
            <div className="restore-point-list">
              {restorePoints.map((point) => (
                <button key={point.id} className={point.id === restorePointId ? "active" : ""} type="button" aria-label={`选择恢复点 ${point.database} ${point.createdAt}`} aria-pressed={point.id === restorePointId} onClick={() => { setRestorePointId(point.id); setDrawer(point); }}>
                  <span><b>{point.database}</b><i>{point.createdAt}</i></span>
                  <em>{point.size}</em>
                  <strong>{point.checksum} · {point.drillStatus}</strong>
                </button>
              ))}
            </div>
          </PanelCard>
        </section>
      </div>
    </ModulePageShell>
  );
}

function backupPlanTone(plan: DatabaseBackupPlan) {
  if (!plan.enabled) return "gray";
  if (plan.health === "告警") return "red";
  return "green";
}

function backupTaskTone(status: DatabaseBackupTask["status"]) {
  if (status === "成功") return "green";
  if (status === "失败") return "red";
  if (status === "运行中") return "orange";
  return "gray";
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
  const tabs = ["基础", "安全", "通知", "备份", "审计"];
  const [activeTab, setActiveTab] = useState(settingsPagePreset(page));
  const [readOnly, setReadOnly] = useState(false);
  const [backupItems, setBackupItems] = useState(["面板数据", "审计日志"]);
  const backupJobSequence = useRef(1);
  const backupRunAtInputRef = useRef<HTMLInputElement>(null);
  const backupLocationInputRef = useRef<HTMLInputElement>(null);
  const [backupDraft, setBackupDraft] = useState<BackupDraft>({
    frequency: "每日",
    runAt: "02:30",
    retention: "保留 14 份",
    target: "S3 / MinIO",
    location: "s3://stackpilot-backup/",
    encryption: "启用（AES-256）",
  });
  const backupDraftRef = useRef<BackupDraft>(backupDraft);
  const [backupConnection, setBackupConnection] = useState<{ status: "未测试" | "连接正常" | "需要检查"; detail: string; signature?: string }>({
    status: "未测试",
    detail: "保存前建议测试备份目标连接。",
  });
  const [backupTimeError, setBackupTimeError] = useState("");
  const [backupVerification, setBackupVerification] = useState({
    latest: "2025-08-12 03:01",
    delay: "上次备份延迟 18 分钟",
    delayTone: "warn",
    drill: "恢复演练未完成",
    drillTone: "error",
  });
  const [backupJobs, setBackupJobs] = useState([
    { id: "backup-20250813", time: "2025-08-13 02:30", status: "成功", size: "1.24 GB", duration: "00:03:21" },
    { id: "backup-20250812", time: "2025-08-12 02:30", status: "成功", size: "1.22 GB", duration: "00:03:05" },
    { id: "backup-20250811", time: "2025-08-11 02:30", status: "成功", size: "1.18 GB", duration: "00:03:05" },
    { id: "backup-20250810", time: "2025-08-10 02:30", status: "延迟", size: "1.18 GB", duration: "00:08:44" },
    { id: "backup-20250809", time: "2025-08-09 02:30", status: "成功", size: "1.18 GB", duration: "00:03:05" },
  ]);
  const [twoFactor, setTwoFactor] = useState(true);
  const [multiLogin, setMultiLogin] = useState(false);
  const securityWhitelistInputRef = useRef<HTMLInputElement>(null);
  const [securityDraft, setSecurityDraft] = useState({
    sessionTimeout: "30 分钟",
    ipWhitelist: "10.0.0.0/8, 172.16.0.0/12",
    lockPolicy: "5 次 / 15 分钟",
  });
  const [securityError, setSecurityError] = useState("");
  const [securitySavedAt, setSecuritySavedAt] = useState("2025-08-12 18:47");
  const [securityReview, setSecurityReview] = useState("2 个 IP 白名单等待复核");
  const [securityReviewTone, setSecurityReviewTone] = useState<"ok" | "warn">("warn");
  const [mailNotice, setMailNotice] = useState(true);
  const noticeWebhookInputRef = useRef<HTMLInputElement>(null);
  const noticeRecipientsInputRef = useRef<HTMLInputElement>(null);
  const [noticeDraft, setNoticeDraft] = useState({
    webhook: "https://hooks.example.com/stackpilot",
    recipients: "ops@example.com, dev@example.com",
    severity: "关键与告警",
    digest: "每小时摘要",
  });
  const [savedNotice, setSavedNotice] = useState({
    webhook: "https://hooks.example.com/stackpilot",
    recipients: "ops@example.com, dev@example.com",
    severity: "关键与告警",
    digest: "每小时摘要",
    mailEnabled: true,
    events: ["高危告警", "备份失败", "部署完成"],
  });
  const [noticeErrors, setNoticeErrors] = useState({ webhook: "", recipients: "" });
  const [noticeConnection, setNoticeConnection] = useState({
    status: "已连接",
    detail: "响应成本 45ms",
    tone: "ok" as "ok" | "warn" | "error",
    signature: "https://hooks.example.com/stackpilot::mail::ops@example.com, dev@example.com",
  });
  const [noticeSavedAt, setNoticeSavedAt] = useState("2025-08-12 18:43");
  const [noticeEvents, setNoticeEvents] = useState(["高危告警", "备份失败", "部署完成"]);
  const [noticeDeliveries, setNoticeDeliveries] = useState([
    { id: "notice-1", time: "18:42", channel: "Webhook", target: "ops-alerts", result: "成功", latency: "45ms" },
    { id: "notice-2", time: "18:20", channel: "邮件", target: "ops@example.com", result: "成功", latency: "1.2s" },
    { id: "notice-3", time: "17:58", channel: "Webhook", target: "deploy-room", result: "重试中", latency: "3.4s" },
  ]);
  const activeSettingsPage = settingsPageForTab(activeTab);
  const backupTargetSignature = `${backupDraft.target}::${backupDraft.location.trim()}`;
  const backupConnectionValid = backupConnection.status === "连接正常" && backupConnection.signature === backupTargetSignature;
  const backupConnectionTone = backupConnection.status === "连接正常" ? "ok-line" : backupConnection.status === "需要检查" ? "error-line" : "warn-line";
  const immediateBackupRunning = backupJobs.some((job) => job.status === "运行中");
  const backupStateClass = (tone: string) => tone === "ok" ? "ok-line" : tone === "error" ? "error-line" : "warn-line";
  useEffect(() => {
    backupDraftRef.current = backupDraft;
  }, [backupDraft]);
  const readBackupDraft = () => ({
    ...backupDraftRef.current,
    runAt: backupRunAtInputRef.current?.value ?? backupDraftRef.current.runAt,
    location: backupLocationInputRef.current?.value ?? backupDraftRef.current.location,
  });
  const syncBackupDraft = (draft: BackupDraft) => {
    backupDraftRef.current = draft;
    setBackupDraft(draft);
  };
  const toggleBackupItem = (item: string) => {
    setBackupItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  };
  const updateBackupDraft = (key: keyof typeof backupDraft, value: string) => {
    const next = { ...backupDraftRef.current, [key]: value };
    backupDraftRef.current = next;
    setBackupDraft(next);
    if (key === "runAt") {
      setBackupTimeError("");
    }
    if (key === "target" || key === "location") {
      setBackupConnection({ status: "未测试", detail: "备份目标已变更，需要重新测试连接。" });
    }
  };
  const testBackupConnection = () => {
    const draft = readBackupDraft();
    syncBackupDraft(draft);
    const signature = `${draft.target}::${draft.location.trim()}`;
    if (!draft.location.trim()) {
      setBackupConnection({ status: "需要检查", detail: "请先填写存储位置。" });
      notify("存储位置不能为空", "danger");
      return;
    }
    setBackupConnection({ status: "连接正常", detail: `${draft.target} 本地模拟验证通过，未连接真实后端。`, signature });
    setBackupVerification((current) => ({ ...current, latest: "刚刚" }));
    notify(`${draft.target} 本地模拟连接测试成功`);
  };
  const saveBackupPolicy = () => {
    const draft = readBackupDraft();
    syncBackupDraft(draft);
    const signature = `${draft.target}::${draft.location.trim()}`;
    const connectionValid = backupConnection.status === "连接正常" && backupConnection.signature === signature;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.runAt.trim())) {
      setBackupTimeError("请输入 00:00-23:59 的执行时间");
      notify("执行时间格式不正确", "danger");
      return;
    }
    if (!draft.runAt.trim() || !draft.location.trim()) {
      notify("执行时间和存储位置不能为空", "danger");
      return;
    }
    if (backupItems.length === 0) {
      notify("至少选择一个备份范围", "danger");
      return;
    }
    if (!connectionValid) {
      setBackupConnection({ status: "需要检查", detail: "请先测试当前备份目标连接。" });
      notify("请先测试当前备份目标连接", "danger");
      return;
    }
    setBackupVerification((current) => ({
      ...current,
      delay: "下一次备份计划已校准",
      delayTone: "ok",
    }));
    notify(`备份策略已保存：${draft.frequency} ${draft.runAt}`);
  };
  const createImmediateBackup = () => {
    if (immediateBackupRunning) {
      notify("已有立即备份任务正在运行", "warning");
      return;
    }
    if (backupItems.length === 0) {
      notify("请先选择备份范围", "danger");
      return;
    }
    if (!backupConnectionValid) {
      notify("请先测试当前备份目标连接", "danger");
      return;
    }
    const sequence = backupJobSequence.current;
    backupJobSequence.current += 1;
    setBackupJobs((current) => [
      { id: `manual-${Date.now()}-${sequence}`, time: `刚刚 #${sequence}`, status: "运行中", size: "计算中", duration: "00:00:08" },
      ...current.slice(0, 4),
    ]);
    setBackupVerification((current) => ({ ...current, delay: "立即备份任务运行中", delayTone: "warn" }));
    notify("已创建立即备份任务");
  };
  const startRestoreDrill = () => {
    setBackupVerification((current) => ({ ...current, drill: "恢复演练已排队", drillTone: "warn" }));
    notify("恢复演练已排队", "info");
  };
  const updateSecurityDraft = (key: keyof typeof securityDraft, value: string) => {
    setSecurityDraft((current) => ({ ...current, [key]: value }));
    setSecurityError("");
    setSecurityReview("安全策略已变更，等待复核");
    setSecurityReviewTone("warn");
  };
  const isValidIpv4Cidr = (value: string) => {
    const [ip, prefix] = value.split("/");
    const octets = ip.split(".");
    if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
    if (prefix === undefined) return true;
    return /^\d{1,2}$/.test(prefix) && Number(prefix) <= 32;
  };
  const validateSecurityWhitelist = (ipWhitelist: string) => {
    const whitelistParts = ipWhitelist.split(",").map((item) => item.trim()).filter(Boolean);
    if (whitelistParts.length === 0) return "至少保留一个 IP 或 CIDR 白名单";
    if (whitelistParts.some((item) => !isValidIpv4Cidr(item))) return "仅支持 IPv4 或 CIDR，例如 10.0.0.0/8";
    return "";
  };
  const securityReviewResult = (ipWhitelist: string) => {
    const whitelistError = validateSecurityWhitelist(ipWhitelist);
    if (whitelistError) return { ok: false, message: whitelistError, tone: "warn" as const };
    if (!twoFactor) return { ok: false, message: "MFA 未强制启用，建议复核", tone: "warn" as const };
    if (multiLogin) return { ok: false, message: "多地登录已开启，等待安全复核", tone: "warn" as const };
    return { ok: true, message: "MFA 覆盖率 100%，白名单校验通过", tone: "ok" as const };
  };
  const saveSecurityPolicy = () => {
    const ipWhitelist = securityWhitelistInputRef.current?.value ?? securityDraft.ipWhitelist;
    setSecurityDraft((current) => ({ ...current, ipWhitelist }));
    const whitelistError = validateSecurityWhitelist(ipWhitelist);
    if (whitelistError) {
      setSecurityError(whitelistError);
      notify(whitelistError.includes("至少") ? "IP 白名单不能为空" : "IP 白名单格式不正确", "danger");
      return;
    }
    const review = securityReviewResult(ipWhitelist);
    setSecuritySavedAt("刚刚");
    setSecurityReview(review.ok ? "安全策略已校准" : review.message);
    setSecurityReviewTone(review.tone);
    notify("安全策略已保存");
  };
  const runSecurityReview = () => {
    const ipWhitelist = securityWhitelistInputRef.current?.value ?? securityDraft.ipWhitelist;
    setSecurityDraft((current) => ({ ...current, ipWhitelist }));
    const review = securityReviewResult(ipWhitelist);
    if (!review.ok && validateSecurityWhitelist(ipWhitelist)) {
      setSecurityError(review.message);
    }
    setSecurityReview(review.message);
    setSecurityReviewTone(review.tone);
    notify(review.ok ? "安全策略复核已完成" : "安全策略复核未通过", review.ok ? "success" : "warning");
  };
  const readNoticeDraft = () => ({
    ...noticeDraft,
    webhook: noticeWebhookInputRef.current?.value ?? noticeDraft.webhook,
    recipients: noticeRecipientsInputRef.current?.value ?? noticeDraft.recipients,
  });
  const noticeSignature = (draft: typeof noticeDraft, mailEnabled = mailNotice) => `${draft.webhook.trim()}::${mailEnabled ? `mail::${draft.recipients.trim()}` : "webhook-only"}`;
  const validateNoticeDraft = (draft: typeof noticeDraft) => {
    const webhook = draft.webhook.trim();
    const recipients = draft.recipients.split(",").map((item) => item.trim()).filter(Boolean);
    return {
      webhook: /^https:\/\/[\w.-]+(?::\d+)?(?:\/[\w./?=&:%+-]*)?$/.test(webhook) ? "" : "请输入 https:// 开头的 Webhook 地址",
      recipients: !mailNotice || recipients.length > 0 && recipients.every((item) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) ? "" : "请输入有效邮箱，多个收件人用逗号分隔",
    };
  };
  const updateNoticeDraft = (key: keyof typeof noticeDraft, value: string) => {
    const next = { ...noticeDraft, [key]: value };
    setNoticeDraft(next);
    setNoticeErrors((current) => ({ ...current, [key]: "" }));
    if (key === "webhook" || key === "recipients" && mailNotice) {
      setNoticeConnection({
        status: "待测试",
        detail: "通知渠道已变更，需要重新测试连接。",
        tone: "warn",
        signature: "",
      });
      return;
    }
    setNoticeConnection((current) => ({
      ...current,
      status: "待保存",
      detail: "通知策略已变更，保存后生效。",
      tone: "warn",
    }));
  };
  const toggleNoticeEvent = (eventName: string) => {
    setNoticeEvents((current) => current.includes(eventName) ? current.filter((item) => item !== eventName) : [...current, eventName]);
    setNoticeConnection((current) => ({
      ...current,
      status: "待保存",
      detail: "事件范围已变更，保存后生效。",
      tone: "warn",
    }));
  };
  const testNoticeConnection = () => {
    const draft = readNoticeDraft();
    setNoticeDraft(draft);
    const errors = validateNoticeDraft(draft);
    setNoticeErrors(errors);
    if (errors.webhook || errors.recipients) {
      setNoticeConnection({ status: "需要检查", detail: errors.webhook || errors.recipients, tone: "error", signature: "" });
      notify(errors.webhook ? "Webhook 地址格式不正确" : "通知收件人格式不正确", "danger");
      return false;
    }
    const latency = `${38 + noticeDeliveries.length * 3}ms`;
    setNoticeConnection({
      status: "已连接",
      detail: `本地模拟连接成功，响应成本 ${latency}`,
      tone: "ok",
      signature: noticeSignature(draft),
    });
    notify(`通知渠道测试成功：${latency}`);
    return true;
  };
  const saveNoticeSettings = () => {
    const draft = readNoticeDraft();
    setNoticeDraft(draft);
    const errors = validateNoticeDraft(draft);
    setNoticeErrors(errors);
    if (errors.webhook || errors.recipients) {
      notify(errors.webhook ? "Webhook 地址格式不正确" : "通知收件人格式不正确", "danger");
      return;
    }
    if (noticeEvents.length === 0) {
      notify("至少选择一个通知事件", "danger");
      return;
    }
    if (noticeConnection.signature !== noticeSignature(draft) || noticeConnection.tone !== "ok") {
      setNoticeConnection({ status: "待测试", detail: "请先测试当前通知渠道连接。", tone: "warn", signature: "" });
      notify("请先测试当前通知渠道连接", "warning");
      return;
    }
    setNoticeSavedAt("刚刚");
    setSavedNotice({ ...draft, mailEnabled: mailNotice, events: noticeEvents });
    setNoticeConnection((current) => ({
      ...current,
      status: "已连接",
      detail: "通知策略已保存，连接状态有效。",
      tone: "ok",
    }));
    notify("通知设置已保存");
  };
  const sendNoticePreview = () => {
    const draft = readNoticeDraft();
    setNoticeDraft(draft);
    const errors = validateNoticeDraft(draft);
    setNoticeErrors(errors);
    if (errors.webhook || errors.recipients) {
      notify(errors.webhook ? "Webhook 地址格式不正确" : "通知收件人格式不正确", "danger");
      return;
    }
    if (noticeEvents.length === 0) {
      notify("至少选择一个通知事件", "danger");
      return;
    }
    if (noticeConnection.signature !== noticeSignature(draft) || noticeConnection.tone !== "ok") {
      setNoticeConnection({ status: "待测试", detail: "请先测试当前通知渠道连接。", tone: "warn", signature: "" });
      notify("请先测试当前通知渠道连接", "warning");
      return;
    }
    const recipients = draft.recipients.split(",").map((item) => item.trim()).filter(Boolean);
    setNoticeDeliveries((current) => [
      {
        id: `notice-preview-${Date.now()}`,
        time: "刚刚",
        channel: mailNotice ? "邮件 + Webhook" : "Webhook",
        target: mailNotice ? recipients[0] : "ops-alerts",
        result: "成功",
        latency: "52ms",
      },
      ...current.slice(0, 4),
    ]);
    notify("通知预览已发送");
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
        {activeTab === "基础" && <PanelCard title="面板身份" className="settings-card-tall">
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
        {activeTab === "基础" && <PanelCard title="访问令牌" className="settings-card-wide">
          <div className="token-title">
            <span>用于 API 访问、CI/CD 集成或第三方工具接入，请妥善保管令牌，避免泄露。</span>
            <div><button className="primary" type="button" onClick={() => notify("新访问令牌已生成")}><Plus size={14} /> 生成令牌</button><button className="danger-soft" type="button" onClick={() => notify("已进入令牌批量编辑模式", "warning")}><Trash2 size={14} /> 编辑清单中</button></div>
          </div>
          <TokenTable notify={notify} />
        </PanelCard>}
        {activeTab === "备份" && <PanelCard title="备份策略">
          <div className="backup-grid">
            <FormSelectLine label="备份频率" value={backupDraft.frequency} options={["每日", "每周", "每 6 小时"]} onChange={(value) => updateBackupDraft("frequency", value)} />
            <FormLine label="执行时间" value={backupDraft.runAt} onChange={(value) => updateBackupDraft("runAt", value)} hint="24 小时制，如 02:30" error={backupTimeError} inputRef={backupRunAtInputRef} />
            <FormSelectLine label="保留策略" value={backupDraft.retention} options={["保留 7 份", "保留 14 份", "保留 30 份"]} onChange={(value) => updateBackupDraft("retention", value)} />
            <FormSelectLine label="备份目标" value={backupDraft.target} options={["S3 / MinIO", "本地磁盘", "远端 SFTP"]} onChange={(value) => updateBackupDraft("target", value)} />
            <FormLine label="存储位置" value={backupDraft.location} onChange={(value) => updateBackupDraft("location", value)} inputRef={backupLocationInputRef} />
            <button className="ghost backup-test-button" type="button" onClick={testBackupConnection}>测试连接</button>
            <FormSelectLine label="加密设置" value={backupDraft.encryption} options={["启用（AES-256）", "启用（KMS 托管）", "关闭"]} onChange={(value) => updateBackupDraft("encryption", value)} />
          </div>
          <div className="backup-policy-summary">
            <p><span>当前策略</span><b>{backupDraft.frequency} {backupDraft.runAt}</b><em>{backupDraft.retention} · {backupDraft.encryption}</em></p>
            <p><span>备份目标</span><b>{backupDraft.target}</b><em>{backupDraft.location || "未填写存储位置"}</em></p>
            <p className={backupConnectionTone}><span>{backupConnectionValid ? "连接正常" : backupConnection.status}</span><b>{backupConnection.detail}</b></p>
          </div>
          <div className="check-row">
            {["面板数据", "审计日志", "上传文件"].map((item) => (
              <button key={item} className={backupItems.includes(item) ? "checked" : ""} type="button" aria-pressed={backupItems.includes(item)} onClick={() => toggleBackupItem(item)}>{item}</button>
            ))}
          </div>
          <div className="settings-buttons backup-actions"><button className="primary" type="button" onClick={saveBackupPolicy}>保存策略</button><button className="primary" type="button" disabled={immediateBackupRunning} onClick={createImmediateBackup}><Download size={14} /> 立即备份</button><button className="ghost" type="button" onClick={startRestoreDrill}>恢复演练</button></div>
        </PanelCard>}
        {activeTab === "备份" && <PanelCard title="验证状态" className="settings-card-wide">
          <div className="verify-box">
            <p className="ok-line"><CheckCircle2 size={15} /> 最近验证成功：{backupVerification.latest}</p>
            <p className={backupStateClass(backupVerification.delayTone)}>{backupVerification.delay} <button type="button" onClick={() => notify(`备份状态：${backupVerification.delay}`, "warning")}>查看详情</button></p>
            <p className={backupStateClass(backupVerification.drillTone)}>{backupVerification.drill} <button type="button" onClick={startRestoreDrill}>前往演练</button></p>
          </div>
          <div className="backup-list">
            <div><strong>最近备份任务</strong><button type="button" onClick={() => notify("已打开全部备份任务", "info")}>查看全部</button></div>
            {backupJobs.map((job) => (
              <p key={job.id}><span>{job.time}</span><StatusLight tone={job.status === "延迟" || job.status === "运行中" ? "orange" : "green"} /> <em>{job.status}</em><b>{job.size}</b><small>{job.duration}</small></p>
            ))}
          </div>
          <div className="storage-bar"><span style={{ width: "48%" }} /><em>可用空间：482.36 GB / 1.00 TB (48%)</em></div>
        </PanelCard>}
        {activeTab === "安全" && <PanelCard title="安全设置">
          <div className="right-settings">
            <ToggleLine label="强制启用两步验证（2FA）" active={twoFactor} onToggle={(active) => {
              setTwoFactor(active);
              setSecurityReview("安全策略已变更，等待复核");
              setSecurityReviewTone("warn");
            }} />
            <FormSelectLine label="会话超时时间" value={securityDraft.sessionTimeout} options={["15 分钟", "30 分钟", "60 分钟"]} onChange={(value) => updateSecurityDraft("sessionTimeout", value)} />
            <FormLine label="IP 访问白名单" value={securityDraft.ipWhitelist} onChange={(value) => updateSecurityDraft("ipWhitelist", value)} error={securityError} hint="逗号分隔，支持 IPv4 / CIDR" inputRef={securityWhitelistInputRef} />
            <ToggleLine label="允许多地同时登录" active={multiLogin} onToggle={(active) => {
              setMultiLogin(active);
              setSecurityReview("安全策略已变更，等待复核");
              setSecurityReviewTone("warn");
            }} />
            <FormSelectLine label="登录失败锁定" value={securityDraft.lockPolicy} options={["3 次 / 10 分钟", "5 次 / 15 分钟", "10 次 / 30 分钟"]} onChange={(value) => updateSecurityDraft("lockPolicy", value)} />
            <div className="security-policy-summary">
              <p><span>会话</span><b>{securityDraft.sessionTimeout}</b><em>{securityDraft.lockPolicy}</em></p>
              <p><span>登录</span><b>{twoFactor ? "强制 MFA" : "未强制 MFA"}</b><em>{multiLogin ? "允许多地登录" : "禁止多地登录"}</em></p>
              <p><span>保存</span><b>{securitySavedAt}</b><em>{securityReview}</em></p>
            </div>
            <div className="settings-buttons security-actions"><button className="primary" type="button" onClick={saveSecurityPolicy}>保存安全策略</button><button className="ghost" type="button" onClick={runSecurityReview}>立即复核</button></div>
          </div>
        </PanelCard>}
        {activeTab === "安全" && <PanelCard title="安全验证">
          <div className="verify-box">
            <p className={twoFactor ? "ok-line" : "warn-line"}><CheckCircle2 size={15} /> MFA 覆盖率：{twoFactor ? "100%" : "未强制"}</p>
            <p className={securityReviewTone === "ok" ? "ok-line" : "warn-line"}>{securityReview} <button type="button" onClick={runSecurityReview}>复核</button></p>
            <p className={securityReviewTone === "ok" ? "ok-line" : "warn-line"}><CheckCircle2 size={15} /> 登录策略：{securityReviewTone === "ok" ? "校验通过" : "等待复核"}</p>
          </div>
        </PanelCard>}
        {activeTab === "通知" && <PanelCard title="通知设置">
          <div className="right-settings">
            <FormLine label="Webhook 通知" value={noticeDraft.webhook} onChange={(value) => updateNoticeDraft("webhook", value)} error={noticeErrors.webhook} hintButton="测试" hintAction={testNoticeConnection} inputRef={noticeWebhookInputRef} />
            <ToggleLine label="关键事件邮件通知" active={mailNotice} onToggle={(active) => {
              const draft = readNoticeDraft();
              setMailNotice(active);
              setNoticeDraft(draft);
              setNoticeErrors((current) => ({ ...current, recipients: active ? current.recipients : "" }));
              setNoticeConnection((current) => {
                if (!active && current.tone === "ok") {
                  return { ...current, status: "已连接", detail: "邮件已关闭，Webhook 连接仍有效，保存后生效。", signature: noticeSignature(draft, false) };
                }
                return { status: "待测试", detail: "邮件通知状态已变更，需要重新测试渠道。", tone: "warn", signature: "" };
              });
            }} />
            <FormLine label="通知收件人" value={noticeDraft.recipients} onChange={(value) => updateNoticeDraft("recipients", value)} error={noticeErrors.recipients} hint="多个邮箱用逗号分隔" inputRef={noticeRecipientsInputRef} />
            <FormSelectLine label="通知级别" value={noticeDraft.severity} options={["仅高危", "关键与告警", "全部事件"]} onChange={(value) => updateNoticeDraft("severity", value)} />
            <FormSelectLine label="摘要频率" value={noticeDraft.digest} options={["实时推送", "每小时摘要", "每日摘要"]} onChange={(value) => updateNoticeDraft("digest", value)} />
            <div className="check-row notice-event-row">
              {["高危告警", "备份失败", "部署完成", "登录异常"].map((item) => (
                <button key={item} className={noticeEvents.includes(item) ? "checked" : ""} type="button" aria-pressed={noticeEvents.includes(item)} onClick={() => toggleNoticeEvent(item)}>{item}</button>
              ))}
            </div>
            <div className="notice-policy-summary">
              <p><span>渠道</span><b>{mailNotice ? "邮件 + Webhook" : "仅 Webhook"}</b><em>{noticeDraft.severity}</em></p>
              <p><span>范围</span><b>{noticeEvents.length ? noticeEvents.join(" / ") : "未选择事件"}</b><em>{noticeDraft.digest}</em></p>
              <p className={noticeConnection.tone === "ok" ? "ok-line" : noticeConnection.tone === "error" ? "error-line" : "warn-line"}><span>{noticeConnection.status}</span><b>{noticeConnection.detail}</b></p>
            </div>
            <div className="settings-buttons notice-actions"><button className="primary" type="button" onClick={saveNoticeSettings}>保存通知设置</button><button className="ghost" type="button" onClick={testNoticeConnection}>测试连接</button><button className="ghost" type="button" onClick={sendNoticePreview}>发送预览</button></div>
          </div>
        </PanelCard>}
        {activeTab === "通知" && <PanelCard title="投递状态" className="settings-card-wide">
          <div className="notice-status-grid">
            <p><span>最近保存</span><b>{noticeSavedAt}</b><em>投递面板显示已保存配置</em></p>
            <p><span>收件人</span><b>{savedNotice.mailEnabled ? savedNotice.recipients : "Webhook-only"}</b><em>{savedNotice.mailEnabled ? "邮件启用" : "邮件关闭"}</em></p>
            <p><span>Webhook</span><b>{savedNotice.webhook}</b><em>{noticeConnection.status}</em></p>
            <p><span>策略</span><b>{savedNotice.severity} · {savedNotice.digest}</b><em>{savedNotice.events.join(" / ")}</em></p>
          </div>
          <div className="notice-delivery-list">
            <div><strong>最近投递</strong><button type="button" onClick={sendNoticePreview}>发送预览</button></div>
            {noticeDeliveries.map((row) => (
              <p key={row.id}><span>{row.time}</span><b>{row.channel}</b><em>{row.target}</em><StatusLight tone={row.result === "成功" ? "green" : "orange"} /><small>{row.result} · {row.latency}</small></p>
            ))}
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

function SettingsProxyPage({ page, notify }: { page: PageKey; notify: Notify }) {
  const [endpoints, setEndpoints] = useState(initialProxyEndpoints);
  const [rules, setRules] = useState(initialProxyRules);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [deployProxy, setDeployProxy] = useState(true);
  const [terminalProxy, setTerminalProxy] = useState(true);
  const [strictTls, setStrictTls] = useState(true);
  const [noProxy, setNoProxy] = useState("localhost,127.0.0.1,10.0.0.0/8,*.internal");
  const [drawer, setDrawer] = useState<{ type: "test"; endpointId: string } | { type: "create" } | null>(null);
  const [draft, setDraft] = useState({ name: "临时调试代理", protocol: "HTTP", url: "http://proxy.local:7890", scope: "部署" });
  const healthyEndpoints = endpoints.filter((endpoint) => endpoint.enabled && endpoint.status === "可用");
  const selectedDrawerEndpoint = drawer?.type === "test" ? endpoints.find((endpoint) => endpoint.id === drawer.endpointId) ?? null : null;
  const warningEndpoints = endpoints.filter((endpoint) => endpoint.status === "告警");
  const filteredEndpoints = endpoints.filter((endpoint) => {
    const keyword = search.trim().toLowerCase();
    const matchSearch = !keyword || `${endpoint.name} ${endpoint.url} ${endpoint.scope}`.toLowerCase().includes(keyword);
    const matchScope = scopeFilter === "全部" || endpoint.scope === scopeFilter;
    const matchStatus = statusFilter === "全部" || endpoint.status === statusFilter;
    return matchSearch && matchScope && matchStatus;
  });
  const updateEndpoint = (id: string, patch: Partial<ProxyEndpoint>) => {
    setEndpoints((current) => current.map((endpoint) => endpoint.id === id ? { ...endpoint, ...patch } : endpoint));
  };
  const updateRule = (id: string, patch: Partial<ProxyRouteRule>) => {
    setRules((current) => current.map((rule) => rule.id === id ? { ...rule, ...patch } : rule));
  };
  const runProbe = (endpoint: ProxyEndpoint) => {
    const latency = endpoint.status === "告警" ? "86ms" : endpoint.latency === "-" || endpoint.latency === "未探测" ? "58ms" : endpoint.latency;
    const nextStatus = endpoint.enabled ? "可用" : "停用";
    updateEndpoint(endpoint.id, { status: nextStatus, latency, lastCheck: "刚刚" });
    notify(`${endpoint.name} 探测成功，延迟 ${latency}${endpoint.enabled ? "" : "，节点仍保持停用"}`);
  };
  const addEndpoint = () => {
    if (!draft.name.trim() || !draft.url.trim()) {
      notify("代理名称和地址不能为空", "danger");
      return;
    }
    const next: ProxyEndpoint = {
      id: `px-${Date.now()}`,
      name: draft.name.trim(),
      protocol: draft.protocol as ProxyEndpoint["protocol"],
      url: draft.url.trim(),
      scope: draft.scope as ProxyEndpoint["scope"],
      enabled: true,
      latency: "未探测",
      status: "未验证",
      lastCheck: "未探测",
    };
    setEndpoints((current) => [next, ...current]);
    setSearch("");
    setScopeFilter("全部");
    setStatusFilter("全部");
    setDrawer({ type: "test", endpointId: next.id });
    notify(`${next.name} 已新增`);
  };
  const proxyEndpointForRule = (rule: ProxyRouteRule) => endpoints.find((endpoint) => endpoint.id === rule.endpointId);
  const ruleTone = (rule: ProxyRouteRule): Tone => {
    if (!rule.enabled) return "gray";
    if (rule.type === "直连") return "blue";
    const endpoint = proxyEndpointForRule(rule);
    if (!endpoint || !endpoint.enabled || endpoint.status === "停用") return "red";
    if (endpoint.status === "告警" || endpoint.status === "未验证") return "orange";
    return "green";
  };
  const envEndpoint = (protocol: ProxyEndpoint["protocol"]) => healthyEndpoints.find((endpoint) => endpoint.protocol === protocol);
  const httpProxy = deployProxy ? envEndpoint("HTTP")?.url ?? "" : "";
  const httpsProxy = deployProxy ? envEndpoint("HTTPS")?.url ?? httpProxy : "";
  const socksProxy = terminalProxy ? envEndpoint("SOCKS5")?.url ?? "" : "";
  const envPreview = [
    `HTTP_PROXY=${httpProxy}`,
    `HTTPS_PROXY=${httpsProxy}`,
    `ALL_PROXY=${socksProxy}`,
    `NO_PROXY=${noProxy}`,
    `STACKPILOT_DEPLOY_PROXY=${deployProxy ? "enabled" : "disabled"}`,
    `STACKPILOT_TERMINAL_PROXY=${terminalProxy ? "enabled" : "disabled"}`,
    `NODE_TLS_REJECT_UNAUTHORIZED=${strictTls ? "1" : "0"}`,
  ];

  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle="独立管理 HTTP / HTTPS / SOCKS5 代理节点、路由规则、NO_PROXY 和运行时环境变量。"
      page={page}
      viewContext={{
        eyebrow: "设置 / 代理设置",
        title: "代理设置",
        description: "配置控制台访问外部网络时的代理策略，并模拟连通性探测和规则切换。",
        chips: [`可用 ${healthyEndpoints.length}`, `告警 ${warningEndpoints.length}`, `规则 ${rules.length}`],
      }}
      actions={<><button className="ghost" type="button" onClick={() => { setEndpoints((current) => current.map((endpoint) => endpoint.enabled ? { ...endpoint, status: "可用", latency: endpoint.latency === "-" || endpoint.latency === "未探测" ? "54ms" : endpoint.latency, lastCheck: "刚刚" } : endpoint)); notify("已批量探测启用代理"); }}><RefreshCw size={15} /> 批量探测</button><button className="primary" type="button" onClick={() => setDrawer({ type: "create" })}><Plus size={15} /> 新增代理</button></>}
      filters={<><ModuleSearch value={search} placeholder="搜索代理名称、地址或用途" onChange={setSearch} /><FieldSelect label="用途" value={scopeFilter} options={["全部", "全局", "部署", "终端", "仓库"]} onChange={setScopeFilter} /><FieldSelect label="状态" value={statusFilter} options={["全部", "可用", "告警", "未验证", "停用"]} onChange={setStatusFilter} /></>}
      metrics={<><MetricTile icon={Shield} label="可用节点" value={`${healthyEndpoints.length}`} tone="green" /><MetricTile icon={TerminalSquare} label="终端代理" value={terminalProxy ? "启用" : "停用"} tone={terminalProxy ? "blue" : "gray"} /><MetricTile icon={Globe2} label="部署代理" value={deployProxy ? "启用" : "停用"} tone={deployProxy ? "blue" : "gray"} /></>}
      side={drawer?.type === "create" ? (
        <DetailDrawer title="新增代理" subtitle="本地插入代理节点" onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => setDrawer(null)}>取消</button><button className="primary" type="button" onClick={addEndpoint}>保存代理</button></>}>
          <FormLine label="代理名称" required value={draft.name} onChange={(value) => setDraft((current) => ({ ...current, name: value }))} />
          <FormSelectLine label="协议" required value={draft.protocol} options={["HTTP", "HTTPS", "SOCKS5"]} onChange={(value) => setDraft((current) => ({ ...current, protocol: value }))} />
          <FormLine label="代理地址" required value={draft.url} onChange={(value) => setDraft((current) => ({ ...current, url: value }))} />
          <FormSelectLine label="用途" required value={draft.scope} options={["全局", "部署", "终端", "仓库"]} onChange={(value) => setDraft((current) => ({ ...current, scope: value }))} />
        </DetailDrawer>
      ) : selectedDrawerEndpoint ? (
        <DetailDrawer title="代理探测" subtitle={selectedDrawerEndpoint.name} onClose={() => setDrawer(null)} actions={<><button className="ghost" type="button" onClick={() => notify(`${selectedDrawerEndpoint.name} curl 诊断已复制`, "info")}>复制诊断</button><button className="primary" type="button" onClick={() => runProbe(selectedDrawerEndpoint)}>重新探测</button></>}>
          <div className="proxy-test-panel">
            <p><span>协议</span><b>{selectedDrawerEndpoint.protocol}</b></p>
            <p><span>地址</span><b>{selectedDrawerEndpoint.url}</b></p>
            <p><span>用途</span><b>{selectedDrawerEndpoint.scope}</b></p>
            <p><span>状态</span><b>{selectedDrawerEndpoint.status}</b></p>
            <p><span>最近探测</span><b>{selectedDrawerEndpoint.lastCheck}</b></p>
            <p><span>延迟</span><b>{selectedDrawerEndpoint.latency}</b></p>
          </div>
        </DetailDrawer>
      ) : null}
    >
      <div className="proxy-settings-content">
        <DataTable
          columns={[
            { key: "name", label: "代理节点", width: "220px", render: (endpoint) => <button className="module-row-link" type="button" aria-label={`查看代理 ${endpoint.name}`} onClick={() => setDrawer({ type: "test", endpointId: endpoint.id })}><StatusLight tone={proxyStatusTone(endpoint)} /><b>{endpoint.name}</b></button> },
            { key: "protocol", label: "协议", width: "86px", render: (endpoint) => <span className="pill blue">{endpoint.protocol}</span> },
            { key: "url", label: "地址", render: (endpoint) => <code>{endpoint.url}</code> },
            { key: "scope", label: "用途", width: "78px", render: (endpoint) => endpoint.scope },
            { key: "status", label: "状态", width: "88px", render: (endpoint) => <span className={`pill ${proxyStatusTone(endpoint)}`}>{endpoint.status}</span> },
            { key: "latency", label: "延迟", width: "82px", render: (endpoint) => endpoint.latency },
            { key: "ops", label: "操作", width: "230px", render: (endpoint) => <span className="table-actions"><button type="button" aria-label={`探测 ${endpoint.name}`} onClick={() => runProbe(endpoint)}>探测</button><button type="button" aria-label={`${endpoint.enabled ? "停用" : "启用"} ${endpoint.name}`} onClick={() => { const enabled = !endpoint.enabled; updateEndpoint(endpoint.id, { enabled, status: enabled ? "未验证" : "停用", latency: enabled ? "未探测" : "-" }); notify(`${endpoint.name} 已${enabled ? "启用，等待探测" : "停用"}`, enabled ? "success" : "warning"); }}>{endpoint.enabled ? "停用" : "启用"}</button><button type="button" aria-label={`打开 ${endpoint.name} 详情`} onClick={() => setDrawer({ type: "test", endpointId: endpoint.id })}>详情</button></span> },
          ]}
          rows={filteredEndpoints}
          emptyText="没有匹配的代理节点"
          getRowKey={(endpoint) => endpoint.id}
        />
        <section className="proxy-lower-grid">
          <PanelCard title="代理路由规则" action="新增规则" onAction={() => {
            const next: ProxyRouteRule = { id: `rule-${Date.now()}`, target: "api.github.com", type: "代理", endpointId: healthyEndpoints[0]?.id ?? "direct", note: "新增 API 规则", enabled: true };
            setRules((current) => [next, ...current]);
            notify("代理路由规则已新增");
          }}>
            <div className="proxy-rule-list">
              {rules.map((rule) => {
                const endpoint = proxyEndpointForRule(rule);
                const endpointName = rule.type === "直连" ? "DIRECT" : endpoint?.name ?? "未绑定";
                const tone = ruleTone(rule);
                const ruleState = !rule.enabled
                  ? "已禁用"
                  : rule.type === "直连"
                    ? "直连"
                    : endpoint?.status === "可用" && endpoint.enabled
                      ? "可用"
                      : "需处理";
                return (
                  <article key={rule.id}>
                    <span><StatusLight tone={tone} /><b>{rule.target}</b></span>
                    <em>{rule.note}</em>
                    <strong>{rule.type} · {endpointName} · {ruleState}</strong>
                    <button type="button" aria-label={`${rule.enabled ? "禁用" : "启用"}规则 ${rule.target}`} onClick={() => { updateRule(rule.id, { enabled: !rule.enabled }); notify(`${rule.target} 规则已${rule.enabled ? "禁用" : "启用"}`, rule.enabled ? "warning" : "success"); }}>{rule.enabled ? "禁用" : "启用"}</button>
                  </article>
                );
              })}
            </div>
          </PanelCard>
          <PanelCard title="运行时策略">
            <div className="proxy-policy-panel">
              <ToggleLine label="部署任务使用代理" active={deployProxy} onToggle={setDeployProxy} hint="用于 npm、composer、镜像拉取和远端发布任务" />
              <ToggleLine label="终端会话使用 SOCKS5" active={terminalProxy} onToggle={setTerminalProxy} hint="仅影响新开的终端会话" />
              <ToggleLine label="严格 TLS 校验" active={strictTls} onToggle={setStrictTls} hint="关闭后会在审计日志标记为高风险" />
              <FormLine label="NO_PROXY" value={noProxy} onChange={setNoProxy} hint="逗号分隔，支持通配符和 CIDR" />
              <div className="proxy-env-preview">
                {envPreview.map((line) => <code key={line}>{line}</code>)}
              </div>
              <div className="settings-buttons">
                <button className="primary" type="button" onClick={() => notify("代理运行时策略已保存")}>保存策略</button>
                <button className="ghost" type="button" onClick={() => { void navigator.clipboard?.writeText(envPreview.join("\n")); notify("环境变量已复制", "info"); }}>复制环境变量</button>
              </div>
            </div>
          </PanelCard>
        </section>
      </div>
    </ModulePageShell>
  );
}

function proxyStatusTone(endpoint: ProxyEndpoint) {
  if (!endpoint.enabled || endpoint.status === "停用") return "gray";
  if (endpoint.status === "告警") return "red";
  if (endpoint.status === "未验证") return "orange";
  return "green";
}

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
  | { type: "quick"; action: string }
  | { type: "module"; action: string }
  | { type: "action"; action: MobileActionKind; targetId?: string; label?: string }
  | { type: "host"; hostId: string }
  | { type: "site"; siteId: string }
  | { type: "task"; taskId: string };

type MobileTabIcon = (props: { size?: number }) => React.ReactNode;

const mobileTabs: Array<[MobileTabIcon, MobileTab]> = [
  [Home, "首页"],
  [Server, "主机"],
  [Globe2, "网站"],
  [ClipboardIcon, "任务"],
  [UserRound, "我的"],
];

const mobileQuickActions: MobileQuickAction[] = [
  { label: "添加主机", target: "主机", targetHint: "主机列表 / 新增主机", draft: "主机接入草稿" },
  { label: "创建网站", target: "网站", targetHint: "网站列表 / 添加网站", draft: "站点配置草稿" },
  { label: "新建数据库", target: "数据库", targetHint: "数据库模块 / 实例创建", draft: "数据库实例草稿" },
  { label: "上传文件", target: "文件", targetHint: "文件模块 / 上传队列", draft: "文件上传草稿" },
  { label: "终端连接", target: "终端", targetHint: "终端模块 / 会话连接", draft: "终端会话草稿" },
  { label: "系统服务", target: "系统服务", targetHint: "systemd 服务 / 单元管理", draft: "服务变更草稿" },
  { label: "计划任务", target: "任务", targetHint: "任务列表 / 定时任务", draft: "计划任务草稿" },
  { label: "防火墙规则", target: "防火墙", targetHint: "防火墙模块 / 规则编辑", draft: "防火墙规则草稿" },
];

const mobileNoticeRows = [
  { id: "cert", title: "证书即将过期", detail: "shop.example.com 证书剩余 11 天", tone: "orange" as Tone, time: "刚刚" },
  { id: "host", title: "主机资源告警", detail: "db-01 内存使用率 62%", tone: "orange" as Tone, time: "8 分钟前" },
  { id: "backup", title: "备份完成", detail: "shop_db 备份已写入对象存储", tone: "green" as Tone, time: "15 分钟前" },
];

function MobileApp({ notify }: { notify: Notify }) {
  const [activeTab, setActiveTab] = useState<MobileTab>("首页");
  const mobileContentRef = useRef<HTMLDivElement>(null);
  const [activeQuick, setActiveQuick] = useState("添加主机");
  const [quickDrafts, setQuickDrafts] = useState<string[]>([]);
  const [favoriteQuickActions, setFavoriteQuickActions] = useState<string[]>(["添加主机", "终端连接"]);
  const [hostFilter, setHostFilter] = useState("全部");
  const [siteFilter, setSiteFilter] = useState("全部");
  const [taskFilter, setTaskFilter] = useState("全部");
  const [unreadNoticeCount, setUnreadNoticeCount] = useState(3);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [mobileSheet, setMobileSheet] = useState<MobileSheetState | null>(null);
  const [mobileHosts, setMobileHosts] = useState<MobileHostRecord[]>([
    { id: "web-01", name: "web-01", env: "生产环境", ip: "203.0.113.10", os: "Ubuntu 22.04", cpu: "12%", memory: "38%", uptime: "2 天", health: "健康" },
    { id: "web-02", name: "web-02", env: "生产环境", ip: "203.0.113.11", os: "Ubuntu 22.04", cpu: "22%", memory: "45%", uptime: "5 天", health: "健康" },
    { id: "db-01", name: "db-01", env: "数据库", ip: "203.0.113.20", os: "Ubuntu 22.04", cpu: "35%", memory: "62%", uptime: "12 天", health: "告警" },
    { id: "dev-01", name: "dev-01", env: "开发环境", ip: "10.0.4.21", os: "Debian 12", cpu: "8%", memory: "29%", uptime: "18 小时", health: "健康" },
  ]);
  const [mobileSites, setMobileSites] = useState<MobileSiteRecord[]>([
    { id: "site-main", domain: "stackpilot.io", runtime: "Node 20", host: "web-01", status: "运行中", certDays: 72, traffic: "128 GB" },
    { id: "site-shop", domain: "shop.example.com", runtime: "PHP 8.3", host: "web-02", status: "运行中", certDays: 11, traffic: "86 GB" },
    { id: "site-docs", domain: "docs.example.com", runtime: "Static", host: "web-01", status: "运行中", certDays: 45, traffic: "24 GB" },
    { id: "site-lab", domain: "lab.internal", runtime: "Node 18", host: "dev-01", status: "已停止", certDays: 30, traffic: "3 GB" },
  ]);
  const [mobileTasks, setMobileTasks] = useState<MobileTaskRecord[]>([
    { id: "deploy-laravel", icon: CloudUpload, title: "部署 Laravel 应用到 web-01", operator: "admin 触发", status: "成功", time: "2 分钟前" },
    { id: "backup-shop", icon: Database, title: "备份数据库 shop_db", operator: "system 自动", status: "成功", time: "15 分钟前" },
    { id: "update-web02", icon: RefreshCw, title: "更新系统组件 /web-02", operator: "admin 触发", status: "警告", time: "32 分钟前" },
    { id: "restart-nginx", icon: Server, title: "重启 Nginx 服务（web-01）", operator: "自动监控", status: "成功", time: "1 小时前" },
    { id: "login-terminal", icon: TerminalSquare, title: "登录到 203.0.113.10", operator: "admin 登录", status: "信息", time: "1 小时前" },
  ]);
  const mobileSiteDisplayStatus = (site: MobileSiteRecord) => (
    site.certDays <= 14 && site.status === "运行中" ? "证书告警" : site.status
  );
  const tabSummary: Record<MobileTab, string> = {
    首页: `${mobileHosts.filter((host) => host.health === "健康").length} 台主机在线 · ${mobileHosts.filter((host) => host.health === "告警").length} 个告警`,
    主机: `${mobileHosts.length} 台主机 · ${mobileHosts.filter((host) => host.health === "告警").length} 台需要关注`,
    网站: `${mobileSites.filter((site) => mobileSiteDisplayStatus(site) === "运行中").length} 个网站正常运行`,
    任务: `${mobileTasks.length} 条最近任务 · ${mobileTasks.filter((task) => task.status === "警告").length} 条警告`,
    我的: `管理员 · 推送${pushEnabled ? "已开启" : "已关闭"}`,
  };
  const visibleHosts = mobileHosts.filter((host) => (
    hostFilter === "全部" || host.env === hostFilter || host.health === hostFilter
  ));
  const visibleSites = mobileSites.filter((site) => (
    siteFilter === "全部" || mobileSiteDisplayStatus(site) === siteFilter
  ));
  const visibleTasks = mobileTasks.filter((task) => taskFilter === "全部" || task.status === taskFilter);
  const selectedHost = mobileSheet?.type === "host" ? mobileHosts.find((host) => host.id === mobileSheet.hostId) ?? null : null;
  const selectedSite = mobileSheet?.type === "site" ? mobileSites.find((site) => site.id === mobileSheet.siteId) ?? null : null;
  const selectedTask = mobileSheet?.type === "task" ? mobileTasks.find((task) => task.id === mobileSheet.taskId) ?? null : null;
  const selectedQuickAction = mobileSheet?.type === "quick"
    ? mobileQuickActions.find((action) => action.label === mobileSheet.action) ?? null
    : null;
  const selectedModuleAction = mobileSheet?.type === "module"
    ? mobileQuickActions.find((action) => action.label === mobileSheet.action) ?? null
    : null;
  const selectedActionHost = mobileSheet?.type === "action" && mobileSheet.targetId
    ? mobileHosts.find((host) => host.id === mobileSheet.targetId) ?? null
    : null;
  const selectedActionSite = mobileSheet?.type === "action" && mobileSheet.targetId
    ? mobileSites.find((site) => site.id === mobileSheet.targetId) ?? null
    : null;
  const selectedActionTask = mobileSheet?.type === "action" && mobileSheet.targetId
    ? mobileTasks.find((task) => task.id === mobileSheet.targetId) ?? null
    : null;
  const selectedActionLabel = mobileSheet?.type === "action" ? mobileSheet.label ?? "" : "";
  const closeMobileSheet = () => setMobileSheet(null);
  const updateHost = (id: string, patch: Partial<MobileHostRecord>) => {
    setMobileHosts((current) => current.map((host) => (host.id === id ? { ...host, ...patch } : host)));
  };
  const updateSite = (id: string, patch: Partial<MobileSiteRecord>) => {
    setMobileSites((current) => current.map((site) => (site.id === id ? { ...site, ...patch } : site)));
  };
  const updateTask = (id: string, patch: Partial<MobileTaskRecord>) => {
    setMobileTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  };
  const statusTone = (status: string): Tone => {
    if (status === "警告" || status === "告警" || status === "证书告警") return "orange";
    if (status === "信息" || status === "运行中") return "blue";
    if (status === "已停止") return "gray";
    return "green";
  };
  const openQuickTarget = (action: MobileQuickAction) => {
    if (["首页", "主机", "网站", "任务", "我的"].includes(action.target)) {
      setActiveTab(action.target as MobileTab);
      closeMobileSheet();
      notify(`已打开${action.targetHint}`, "info");
      return;
    }
    setMobileSheet({ type: "module", action: action.label });
  };
  const saveQuickDraft = (action: MobileQuickAction) => {
    setQuickDrafts((current) => (
      current.includes(action.label) ? current : [...current, action.label]
    ));
    notify(`${action.draft}已创建`, "info");
  };
  const toggleFavoriteQuick = (action: MobileQuickAction) => {
    setFavoriteQuickActions((current) => (
      current.includes(action.label)
        ? current.filter((item) => item !== action.label)
        : [...current, action.label]
    ));
  };
  const runMobileAction = (action: MobileActionKind, targetId?: string) => {
    if (action === "host-restart" && targetId) {
      const host = mobileHosts.find((item) => item.id === targetId);
      updateHost(targetId, { uptime: "刚刚重启", health: "健康" });
      notify(`${host?.name ?? "主机"} 已重启`);
      closeMobileSheet();
      return;
    }
    if (action === "host-backup" && targetId) {
      const host = mobileHosts.find((item) => item.id === targetId);
      const nextTask: MobileTaskRecord = {
        id: `mobile-backup-${targetId}-${Date.now()}`,
        icon: Database,
        title: `备份主机 ${host?.name ?? targetId}`,
        operator: "admin 触发",
        status: "成功",
        time: "刚刚",
      };
      setMobileTasks((current) => [nextTask, ...current]);
      notify(`${host?.name ?? "主机"} 已创建备份`, "info");
      closeMobileSheet();
      return;
    }
    if (action === "site-toggle" && targetId) {
      const site = mobileSites.find((item) => item.id === targetId);
      if (site) {
        updateSite(targetId, { status: site.status === "已停止" ? "运行中" : "已停止" });
        notify(`${site.domain} 已${site.status === "已停止" ? "启动" : "停止"}`);
      }
      closeMobileSheet();
      return;
    }
    if (action === "site-renew" && targetId) {
      const site = mobileSites.find((item) => item.id === targetId);
      updateSite(targetId, { certDays: 90, status: "运行中" });
      notify(`${site?.domain ?? "网站"} 证书已续期`);
      closeMobileSheet();
      return;
    }
    if (action === "task-rerun" && targetId) {
      const task = mobileTasks.find((item) => item.id === targetId);
      updateTask(targetId, { status: "运行中", time: "刚刚" });
      notify(`已重新执行：${task?.title ?? "任务"}`);
      closeMobileSheet();
      return;
    }
    if (action === "task-complete" && targetId) {
      updateTask(targetId, { status: "成功", time: "刚刚完成" });
      notify("任务已标记完成");
      closeMobileSheet();
      return;
    }
    if (action === "profile-refresh") {
      notify("移动端资料已刷新", "info");
      closeMobileSheet();
      return;
    }
    if (action === "push-toggle") {
      setPushEnabled((value) => !value);
      notify(`移动端推送已${pushEnabled ? "关闭" : "开启"}`);
      closeMobileSheet();
      return;
    }
    if (action === "mfa-toggle") {
      setMfaEnabled((value) => !value);
      notify(`MFA 已${mfaEnabled ? "暂停" : "启用"}`, "info");
      closeMobileSheet();
      return;
    }
    if (action === "audit-view") {
      notify("已打开移动端审计记录", "info");
      closeMobileSheet();
      return;
    }
    if (action === "diagnostics") {
      notify("移动端诊断摘要已复制", "info");
      closeMobileSheet();
      return;
    }
    if (action === "notification-open") {
      notify(`已打开通知：${selectedActionLabel || "通知详情"}`, "info");
      closeMobileSheet();
      return;
    }
    if (action === "terminal-open") {
      notify(`${selectedActionLabel || "主机"} 终端已准备`, "info");
      closeMobileSheet();
    }
  };

  useEffect(() => {
    mobileContentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  useEffect(() => {
    if (!mobileSheet) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMobileSheet();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileSheet]);

  return (
    <section className="mobile-app-shell">
      <header className="mobile-top">
        <button type="button" className="mobile-icon-button" aria-label="打开菜单" onClick={() => setMobileSheet({ type: "menu" })}><Menu size={20} /></button>
        <div className="mobile-brand"><div className="brand-gem small" /><strong>StackPilot</strong></div>
        <div className="mobile-icons">
          <button
            type="button"
            aria-label={unreadNoticeCount > 0 ? `查看通知，${unreadNoticeCount} 条未读` : "查看通知，无未读"}
            onClick={() => setMobileSheet({ type: "notifications" })}
          >
            <Bell size={18} />
          </button>
          {unreadNoticeCount > 0 && <i>{unreadNoticeCount}</i>}
          <button type="button" aria-label="打开个人中心" onClick={() => { setActiveTab("我的"); notify("已切换到移动端我的", "info"); }}><b>U</b></button>
        </div>
      </header>
      <div className="mobile-content" ref={mobileContentRef}>
        <h2>{activeTab === "首页" ? "上午好，管理员" : activeTab}</h2>
        <p>{activeTab} · {tabSummary[activeTab]}</p>
        {activeTab === "首页" && (
          <>
            <div className="mobile-stats">
              {[
                [Server, "主机", `${mobileHosts.length}`, `${mobileHosts.filter((host) => host.health === "健康").length} 台在线`, "green"],
                [Globe2, "网站", `${mobileSites.filter((site) => mobileSiteDisplayStatus(site) === "运行中").length}`, `${mobileSites.filter((site) => mobileSiteDisplayStatus(site) !== "运行中").length} 个待处理`, "green"],
                [Database, "数据库", "8", "运行中", "green"],
                [Shield, "告警", `${mobileHosts.filter((host) => host.health === "告警").length + mobileTasks.filter((task) => task.status === "警告").length}`, "需要处理", "orange"],
              ].map(([Icon, label, value, desc, tone]) => (
                <article key={label as string}>
                  <Icon className={tone as string} size={20} />
                  <span>{label as string}</span>
                  <strong>{value as string}</strong>
                  <em><StatusLight tone={tone as Tone} />{desc as string}</em>
                </article>
              ))}
            </div>
            <MobileCard title="系统状态" action="查看详情" onAction={() => setMobileSheet({ type: "system" })}>
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
            <MobileCard title="最近任务" action="查看全部" onAction={() => { setTaskFilter("全部"); setActiveTab("任务"); notify("已切换到移动端任务", "info"); }}>
              <div className="mobile-task-list">
                {mobileTasks.slice(0, 4).map((task) => {
                  const Icon = task.icon;
                  const openTask = () => setMobileSheet({ type: "task", taskId: task.id });
                  return (
                    <div key={task.id} role="button" tabIndex={0} onClick={openTask} onKeyDown={(event) => activateOnKeyboard(event, openTask)}>
                      <span className="mobile-task-icon"><Icon size={14} /></span>
                      <p><strong>{task.title}</strong><em>{task.operator}</em></p>
                      <StatusLight tone={statusTone(task.status)} />
                      <b>{task.status}</b>
                      <small>{task.time}</small>
                    </div>
                  );
                })}
              </div>
            </MobileCard>
            <MobileCard title="快捷操作">
              <div className="mobile-quick">
                {mobileQuickActions.map((action) => (
                  <button
                    className={action.label === activeQuick ? "active" : ""}
                    key={action.label}
                    type="button"
                    aria-pressed={action.label === activeQuick}
                    onClick={() => {
                      setActiveQuick(action.label);
                      setMobileSheet({ type: "quick", action: action.label });
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </MobileCard>
          </>
        )}
        {activeTab === "主机" && (
          <>
            <div className="mobile-filter-tabs" role="group" aria-label="主机筛选">
              {["全部", "生产环境", "开发环境", "告警"].map((filter) => (
                <button className={hostFilter === filter ? "active" : ""} key={filter} type="button" aria-pressed={hostFilter === filter} onClick={() => setHostFilter(filter)}>{filter}</button>
              ))}
            </div>
            <div className="mobile-list">
              {visibleHosts.map((host) => (
                <article className="mobile-list-item" key={host.id}>
                  <header>
                    <StatusLight tone={host.health === "告警" ? "orange" : "green"} />
                    <h3>{host.name}</h3>
                    <span className={`mobile-status-pill ${statusTone(host.health)}`}>{host.health}</span>
                  </header>
                  <p>{host.env} · {host.ip} · {host.os}</p>
                  <div className="mobile-row-meta">
                    <span>CPU <b>{host.cpu}</b></span>
                    <span>内存 <b>{host.memory}</b></span>
                    <span>运行 <b>{host.uptime}</b></span>
                  </div>
                  <div className="mobile-row-actions">
                    <button type="button" aria-label={`重启主机 ${host.name}`} onClick={() => setMobileSheet({ type: "action", action: "host-restart", targetId: host.id })}>重启</button>
                    <button type="button" aria-label={`备份主机 ${host.name}`} onClick={() => setMobileSheet({ type: "action", action: "host-backup", targetId: host.id })}>备份</button>
                    <button type="button" aria-label={`查看主机 ${host.name} 详情`} onClick={() => setMobileSheet({ type: "host", hostId: host.id })}>详情</button>
                  </div>
                </article>
              ))}
              {visibleHosts.length === 0 && <div className="mobile-empty">没有匹配的主机</div>}
            </div>
          </>
        )}
        {activeTab === "网站" && (
          <>
            <div className="mobile-filter-tabs" role="group" aria-label="网站筛选">
              {["全部", "运行中", "已停止", "证书告警"].map((filter) => (
                <button className={siteFilter === filter ? "active" : ""} key={filter} type="button" aria-pressed={siteFilter === filter} onClick={() => setSiteFilter(filter)}>{filter}</button>
              ))}
            </div>
            <div className="mobile-list">
              {visibleSites.map((site) => {
                const displayStatus = mobileSiteDisplayStatus(site);
                return (
                  <article className="mobile-list-item" key={site.id}>
                    <header>
                      <StatusLight tone={statusTone(displayStatus)} />
                      <h3>{site.domain}</h3>
                      <span className={`mobile-status-pill ${statusTone(displayStatus)}`}>{displayStatus}</span>
                    </header>
                    <p>{site.runtime} · {site.host} · {site.traffic}</p>
                    <div className="mobile-row-meta">
                      <span>证书 <b className={site.certDays <= 14 ? "orange-text" : "green-text"}>{site.certDays} 天</b></span>
                      <span>主机 <b>{site.host}</b></span>
                      <span>流量 <b>{site.traffic}</b></span>
                    </div>
                    <div className="mobile-row-actions">
                      <button type="button" aria-label={`${site.status === "已停止" ? "启动" : "停止"}网站 ${site.domain}`} onClick={() => setMobileSheet({ type: "action", action: "site-toggle", targetId: site.id })}>{site.status === "已停止" ? "启动" : "停止"}</button>
                      <button type="button" aria-label={`续期网站 ${site.domain} 证书`} onClick={() => setMobileSheet({ type: "action", action: "site-renew", targetId: site.id })}>续期</button>
                      <button type="button" aria-label={`查看网站 ${site.domain} 日志`} onClick={() => setMobileSheet({ type: "site", siteId: site.id })}>日志</button>
                    </div>
                  </article>
                );
              })}
              {visibleSites.length === 0 && <div className="mobile-empty">没有匹配的网站</div>}
            </div>
          </>
        )}
        {activeTab === "任务" && (
          <>
            <div className="mobile-filter-tabs" role="group" aria-label="任务筛选">
              {["全部", "运行中", "警告", "成功"].map((filter) => (
                <button className={taskFilter === filter ? "active" : ""} key={filter} type="button" aria-pressed={taskFilter === filter} onClick={() => setTaskFilter(filter)}>{filter}</button>
              ))}
            </div>
            <div className="mobile-list">
              {visibleTasks.map((task) => {
                const Icon = task.icon;
                return (
                  <article className="mobile-list-item" key={task.id}>
                    <header>
                      <span className="mobile-task-icon"><Icon size={14} /></span>
                      <h3>{task.title}</h3>
                      <span className={`mobile-status-pill ${statusTone(task.status)}`}>{task.status}</span>
                    </header>
                    <p>{task.operator} · {task.time}</p>
                    <div className="mobile-row-actions">
                      <button type="button" aria-label={`查看任务 ${task.title} 日志`} onClick={() => setMobileSheet({ type: "task", taskId: task.id })}>日志</button>
                      <button type="button" aria-label={`重跑任务 ${task.title}`} onClick={() => setMobileSheet({ type: "action", action: "task-rerun", targetId: task.id })}>重跑</button>
                      <button type="button" aria-label={`完成任务 ${task.title}`} onClick={() => setMobileSheet({ type: "action", action: "task-complete", targetId: task.id })}>完成</button>
                    </div>
                  </article>
                );
              })}
              {visibleTasks.length === 0 && <div className="mobile-empty">没有匹配的任务</div>}
            </div>
          </>
        )}
        {activeTab === "我的" && (
          <>
            <div className="mobile-profile">
              <section className="mobile-profile-hero">
                <b>U</b>
                <div><strong>管理员</strong><span>Default Workspace · 超级管理员</span></div>
                <button type="button" onClick={() => setMobileSheet({ type: "action", action: "profile-refresh" })}><RefreshCw size={14} />刷新</button>
              </section>
              <div className="mobile-row-meta">
                <span>MFA <b>{mfaEnabled ? "已启用" : "未启用"}</b></span>
                <span>推送 <b>{pushEnabled ? "开启" : "关闭"}</b></span>
                <span>会话 <b>3 台</b></span>
              </div>
            </div>
            <MobileCard title="账号设置">
              <div className="mobile-settings-list">
                <button
                  type="button"
                  aria-label="通知推送"
                  aria-pressed={pushEnabled}
                  onClick={() => setMobileSheet({ type: "action", action: "push-toggle" })}
                >
                  <span><Bell size={16} />通知推送</span><b>{pushEnabled ? "开启" : "关闭"}</b>
                </button>
                <button
                  type="button"
                  aria-label="MFA 验证"
                  aria-pressed={mfaEnabled}
                  onClick={() => setMobileSheet({ type: "action", action: "mfa-toggle" })}
                >
                  <span><KeyRound size={16} />MFA 验证</span><b>{mfaEnabled ? "启用" : "暂停"}</b>
                </button>
                <button type="button" onClick={() => setMobileSheet({ type: "action", action: "audit-view" })}>
                  <span><FileText size={16} />我的审计</span><b>128 条</b>
                </button>
                <button type="button" onClick={() => setMobileSheet({ type: "action", action: "diagnostics" })}>
                  <span><Activity size={16} />诊断摘要</span><b>正常</b>
                </button>
              </div>
            </MobileCard>
          </>
        )}
      </div>
      <nav className="mobile-tabbar" aria-label="移动端主导航">
        {mobileTabs.map(([Icon, label]) => (
          <button
            className={label === activeTab ? "active" : ""}
            key={label}
            type="button"
            aria-current={label === activeTab ? "page" : undefined}
            onClick={() => {
              if (label !== activeTab) {
                setActiveTab(label);
                notify(`已切换到移动端${label}`, "info");
              }
            }}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {mobileSheet && (
        <MobileSheet
          title={
            mobileSheet.type === "menu" ? "快捷菜单"
              : mobileSheet.type === "system" ? "系统状态"
                : mobileSheet.type === "notifications" ? "通知中心"
                  : mobileSheet.type === "quick" ? mobileSheet.action
                    : mobileSheet.type === "module" ? selectedModuleAction?.target ?? "模块预览"
                      : mobileSheet.type === "action" ? mobileActionTitle(mobileSheet.action, selectedActionHost, selectedActionSite, selectedActionTask, pushEnabled, mfaEnabled, selectedActionLabel)
                        : mobileSheet.type === "host" ? selectedHost?.name ?? "主机详情"
                          : mobileSheet.type === "site" ? selectedSite?.domain ?? "网站日志"
                            : selectedTask?.title ?? "任务详情"
          }
          onClose={closeMobileSheet}
        >
          {mobileSheet.type === "menu" && (
            <div className="mobile-sheet-actions">
              {mobileTabs.map(([, label]) => (
                <button key={label} type="button" onClick={() => { setActiveTab(label); closeMobileSheet(); notify(`已切换到移动端${label}`, "info"); }}>{label}</button>
              ))}
              <button type="button" onClick={() => { setMobileSheet({ type: "system" }); }}>系统状态</button>
              <button type="button" onClick={() => { setMobileSheet({ type: "notifications" }); }}>通知中心</button>
            </div>
          )}
          {mobileSheet.type === "notifications" && (
            <>
              <div className="mobile-sheet-list">
                {mobileNoticeRows.map((notice, index) => (
                  <button key={notice.id} type="button" onClick={() => setMobileSheet({ type: "action", action: "notification-open", label: notice.title })}>
                    <StatusLight tone={notice.tone} />
                    <span>
                      <b>{notice.title}</b>
                      <em>{notice.detail}</em>
                    </span>
                    <small>{index < unreadNoticeCount ? "未读" : notice.time}</small>
                  </button>
                ))}
              </div>
              <div className="mobile-sheet-actions split">
                <button type="button" onClick={() => { setUnreadNoticeCount(0); notify("通知已全部标记为已读", "info"); }}>全部已读</button>
                <button type="button" onClick={() => { setActiveTab("任务"); closeMobileSheet(); notify("已打开任务列表处理通知", "info"); }}>去处理</button>
              </div>
            </>
          )}
          {mobileSheet.type === "system" && (
            <div className="mobile-sheet-metrics">
              {[
                ["CPU", "18%", "负载 0.38"],
                ["内存", "42%", "3.2 / 7.6 GB"],
                ["磁盘", "37%", "180 / 480 GB"],
                ["在线主机", `${mobileHosts.filter((host) => host.health === "健康").length}/${mobileHosts.length}`, "实时同步"],
              ].map(([label, value, desc]) => (
                <p key={label}><span>{label}</span><b>{value}</b><em>{desc}</em></p>
              ))}
            </div>
          )}
          {mobileSheet.type === "quick" && selectedQuickAction && (
            <>
              <div className="mobile-sheet-kv">
                <p><span>目标</span><b>{selectedQuickAction.targetHint}</b></p>
                <p><span>草稿</span><b>{quickDrafts.includes(selectedQuickAction.label) ? "已创建" : "未创建"}</b></p>
                <p><span>常用</span><b>{favoriteQuickActions.includes(selectedQuickAction.label) ? "已固定" : "未固定"}</b></p>
              </div>
              <div className="mobile-sheet-actions">
                <button type="button" onClick={() => openQuickTarget(selectedQuickAction)}>打开模块</button>
                <button type="button" onClick={() => saveQuickDraft(selectedQuickAction)}>创建草稿</button>
                <button type="button" onClick={() => { toggleFavoriteQuick(selectedQuickAction); notify(`${selectedQuickAction.label}${favoriteQuickActions.includes(selectedQuickAction.label) ? "已取消常用" : "已加入常用"}`, "info"); }}>
                  {favoriteQuickActions.includes(selectedQuickAction.label) ? "取消常用" : "设为常用"}
                </button>
              </div>
            </>
          )}
          {mobileSheet.type === "module" && selectedModuleAction && (
            <>
              <div className="mobile-sheet-kv">
                <p><span>入口</span><b>{selectedModuleAction.target}</b></p>
                <p><span>位置</span><b>{selectedModuleAction.targetHint}</b></p>
                <p><span>草稿</span><b>{quickDrafts.includes(selectedModuleAction.label) ? "已创建" : "未创建"}</b></p>
              </div>
              <div className="mobile-sheet-log">
                <p>mobile module preview: {selectedModuleAction.target}</p>
                <p>{selectedModuleAction.draft} ready for local prototype</p>
                <p>source action: {selectedModuleAction.label}</p>
              </div>
              <div className="mobile-sheet-actions">
                <button type="button" onClick={() => setMobileSheet({ type: "quick", action: selectedModuleAction.label })}>返回操作</button>
                <button type="button" onClick={() => saveQuickDraft(selectedModuleAction)}>创建草稿</button>
              </div>
            </>
          )}
          {mobileSheet.type === "action" && (
            <>
              <div className="mobile-action-summary">
                {mobileActionSummary(mobileSheet.action, selectedActionHost, selectedActionSite, selectedActionTask, pushEnabled, mfaEnabled, selectedActionLabel).map((item) => (
                  <p key={item[0]}><span>{item[0]}</span><b>{item[1]}</b></p>
                ))}
              </div>
              <div className="mobile-action-impact">
                <StatusLight tone={mobileActionTone(mobileSheet.action)} />
                <span>{mobileActionImpact(mobileSheet.action, selectedActionHost, selectedActionSite, selectedActionTask, pushEnabled, mfaEnabled, selectedActionLabel)}</span>
              </div>
              <div className="mobile-sheet-actions split">
                <button type="button" onClick={closeMobileSheet}>取消</button>
                <button className={mobileActionTone(mobileSheet.action) === "orange" ? "warning" : ""} type="button" onClick={() => runMobileAction(mobileSheet.action, mobileSheet.targetId)}>确认执行</button>
              </div>
            </>
          )}
          {mobileSheet.type === "host" && selectedHost && (
            <>
              <div className="mobile-sheet-kv">
                <p><span>环境</span><b>{selectedHost.env}</b></p>
                <p><span>IP</span><b>{selectedHost.ip}</b></p>
                <p><span>系统</span><b>{selectedHost.os}</b></p>
                <p><span>CPU</span><b>{selectedHost.cpu}</b></p>
                <p><span>内存</span><b>{selectedHost.memory}</b></p>
                <p><span>运行</span><b>{selectedHost.uptime}</b></p>
              </div>
              <div className="mobile-sheet-actions">
                <button type="button" onClick={() => setMobileSheet({ type: "action", action: "host-restart", targetId: selectedHost.id })}>重启主机</button>
                <button type="button" onClick={() => setMobileSheet({ type: "action", action: "terminal-open", targetId: selectedHost.id, label: selectedHost.name })}>打开终端</button>
              </div>
            </>
          )}
          {mobileSheet.type === "site" && selectedSite && (
            <>
              <div className="mobile-sheet-kv">
                <p><span>运行时</span><b>{selectedSite.runtime}</b></p>
                <p><span>主机</span><b>{selectedSite.host}</b></p>
                <p><span>证书</span><b>{selectedSite.certDays} 天</b></p>
                <p><span>流量</span><b>{selectedSite.traffic}</b></p>
              </div>
              <div className="mobile-sheet-log">
                <p>200 GET /login 24ms</p>
                <p>{selectedSite.certDays <= 14 ? "tls certificate renewal recommended" : "tls certificate healthy"}</p>
                <p>upstream {selectedSite.host} healthy</p>
              </div>
            </>
          )}
          {mobileSheet.type === "task" && selectedTask && (
            <>
              <div className="mobile-sheet-kv">
                <p><span>状态</span><b>{selectedTask.status}</b></p>
                <p><span>操作人</span><b>{selectedTask.operator}</b></p>
                <p><span>时间</span><b>{selectedTask.time}</b></p>
              </div>
              <div className="mobile-sheet-log">
                <p>queued by {selectedTask.operator}</p>
                <p>{selectedTask.status === "警告" ? "warning: retry required" : "finished with status 0"}</p>
                <p>trace id mobile-{selectedTask.id}</p>
              </div>
            </>
          )}
        </MobileSheet>
      )}
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

function mobileActionTitle(
  action: MobileActionKind,
  host: MobileHostRecord | null,
  site: MobileSiteRecord | null,
  task: MobileTaskRecord | null,
  pushEnabled: boolean,
  mfaEnabled: boolean,
  label = "",
) {
  const titles: Record<MobileActionKind, string> = {
    "host-restart": `重启 ${host?.name ?? "主机"}`,
    "host-backup": `备份 ${host?.name ?? "主机"}`,
    "site-toggle": `${site?.status === "已停止" ? "启动" : "停止"} ${site?.domain ?? "网站"}`,
    "site-renew": `续期 ${site?.domain ?? "网站"} 证书`,
    "task-rerun": `重跑 ${task?.title ?? "任务"}`,
    "task-complete": `完成 ${task?.title ?? "任务"}`,
    "profile-refresh": "刷新资料",
    "push-toggle": `${pushEnabled ? "关闭" : "开启"}通知推送`,
    "mfa-toggle": `${mfaEnabled ? "暂停" : "启用"} MFA`,
    "audit-view": "打开审计记录",
    diagnostics: "复制诊断摘要",
    "notification-open": `打开${label || "通知详情"}`,
    "terminal-open": `连接 ${host?.name ?? (label || "主机")} 终端`,
  };
  return titles[action];
}

function mobileActionSummary(
  action: MobileActionKind,
  host: MobileHostRecord | null,
  site: MobileSiteRecord | null,
  task: MobileTaskRecord | null,
  pushEnabled: boolean,
  mfaEnabled: boolean,
  label = "",
) {
  if (action === "notification-open") {
    return [["对象", label || "通知详情"], ["来源", "通知中心"], ["动作", "打开详情"]];
  }
  if (action === "terminal-open") {
    return [["对象", host?.name ?? (label || "主机")], ["IP", host?.ip ?? "-"], ["权限", "admin 会话"]];
  }
  if (action.startsWith("host")) {
    return [["对象", host?.name ?? "主机"], ["环境", host?.env ?? "-"], ["IP", host?.ip ?? "-"]];
  }
  if (action.startsWith("site")) {
    return [["对象", site?.domain ?? "网站"], ["运行时", site?.runtime ?? "-"], ["证书", site ? `${site.certDays} 天` : "-"]];
  }
  if (action.startsWith("task")) {
    return [["对象", task?.title ?? "任务"], ["当前状态", task?.status ?? "-"], ["触发人", task?.operator ?? "-"]];
  }
  if (action === "push-toggle") {
    return [["对象", "通知推送"], ["当前状态", pushEnabled ? "开启" : "关闭"], ["变更后", pushEnabled ? "关闭" : "开启"]];
  }
  if (action === "mfa-toggle") {
    return [["对象", "MFA 验证"], ["当前状态", mfaEnabled ? "启用" : "暂停"], ["变更后", mfaEnabled ? "暂停" : "启用"]];
  }
  if (action === "audit-view") {
    return [["范围", "我的审计"], ["记录数", "128 条"], ["筛选", "当前用户"]];
  }
  if (action === "diagnostics") {
    return [["范围", "移动端诊断"], ["状态", "正常"], ["格式", "摘要文本"]];
  }
  return [["对象", "管理员资料"], ["会话", "3 台"], ["状态", "实时同步"]];
}

function mobileActionImpact(
  action: MobileActionKind,
  host: MobileHostRecord | null,
  site: MobileSiteRecord | null,
  task: MobileTaskRecord | null,
  pushEnabled: boolean,
  mfaEnabled: boolean,
  label = "",
) {
  const impacts: Record<MobileActionKind, string> = {
    "host-restart": `${host?.name ?? "该主机"} 将进入刚刚重启状态，告警会同步清除。`,
    "host-backup": `${host?.name ?? "该主机"} 会新增一条备份任务记录。`,
    "site-toggle": `${site?.domain ?? "该网站"} 将被${site?.status === "已停止" ? "启动" : "停止"}，列表状态会立即更新。`,
    "site-renew": `${site?.domain ?? "该网站"} 证书会刷新为 90 天并恢复运行中。`,
    "task-rerun": `${task?.title ?? "该任务"} 会进入运行中状态。`,
    "task-complete": `${task?.title ?? "该任务"} 会被标记为成功完成。`,
    "profile-refresh": "会刷新个人资料和会话摘要，不改变安全设置。",
    "push-toggle": `通知推送会被${pushEnabled ? "关闭" : "开启"}，状态会同步到我的页面。`,
    "mfa-toggle": `MFA 会被${mfaEnabled ? "暂停" : "启用"}，请确认这是预期的安全变更。`,
    "audit-view": "会打开当前账号的审计记录入口。",
    diagnostics: "会复制当前移动端诊断摘要，便于排障定位。",
    "notification-open": `会打开「${label || "通知详情"}」的处理入口，并保留通知中心状态。`,
    "terminal-open": `会为 ${host?.name ?? (label || "该主机")} 准备移动端终端会话。`,
  };
  return impacts[action];
}

function mobileActionTone(action: MobileActionKind): Tone {
  return ["host-restart", "site-toggle", "mfa-toggle", "terminal-open"].includes(action) ? "orange" : "blue";
}

function MobileSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  return (
    <div className="mobile-sheet-layer" role="presentation">
      <button className="mobile-sheet-scrim" type="button" aria-label="关闭移动端面板" onClick={onClose} />
      <section className="mobile-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <strong>{title}</strong>
          <button ref={closeButtonRef} type="button" aria-label="关闭" onClick={onClose}><X size={18} /></button>
        </header>
        <div className="mobile-sheet-body">{children}</div>
      </section>
    </div>
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

function StatusDot({ text, tone = "green" }: { text: string; tone?: Tone | string }) {
  return <span className="status-dot"><StatusLight tone={tone} />{text}</span>;
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
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const reactId = useId();
  const safeId = reactId.replace(/:/g, "");
  const listboxId = `${safeId}-listbox`;
  const buttonId = `${safeId}-button`;
  const valueId = `${safeId}-value`;
  const availableOptions = options ?? [];
  const rawSelectedIndex = availableOptions.indexOf(value);
  const hasSelectedOption = rawSelectedIndex >= 0;
  const selectedIndex = hasSelectedOption ? rawSelectedIndex : 0;
  const boundedActiveIndex = Math.min(activeIndex, Math.max(availableOptions.length - 1, 0));
  const activeOptionId = open && availableOptions.length > 0 && hasSelectedOption ? `${safeId}-option-${boundedActiveIndex}` : undefined;
  const focusButtonSoon = () => {
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  };
  const openMenu = () => {
    if (!availableOptions.length) return;
    setActiveIndex(selectedIndex);
    setOpen(true);
  };
  const selectOption = (option: string) => {
    onChange?.(option);
    setOpen(false);
    focusButtonSoon();
  };
  const commitActiveOption = () => {
    const option = availableOptions[boundedActiveIndex];
    if (option) selectOption(option);
  };
  const moveActiveOption = (direction: 1 | -1) => {
    if (availableOptions.length === 0) return;
    setActiveIndex((current) => (current + direction + availableOptions.length) % availableOptions.length);
  };

  return (
    <div
      className={`field-select ${open ? "open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          focusButtonSoon();
          return;
        }
        if (!availableOptions.length) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!open) {
            openMenu();
            return;
          }
          moveActiveOption(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!open) {
            openMenu();
            return;
          }
          moveActiveOption(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          if (!open) openMenu();
          setActiveIndex(0);
        } else if (event.key === "End") {
          event.preventDefault();
          if (!open) openMenu();
          setActiveIndex(availableOptions.length - 1);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!open) {
            openMenu();
            return;
          }
          commitActiveOption();
        }
      }}
    >
      <span id={`${safeId}-label`}>{label}</span>
      <button
        id={buttonId}
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-labelledby={`${safeId}-label ${valueId}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        onClick={() => {
          if (open) {
            setOpen(false);
            focusButtonSoon();
          } else {
            openMenu();
          }
        }}
      >
        <span id={valueId}>{value}</span><ChevronDown size={12} />
      </button>
      {open && availableOptions.length > 0 && (
        <div className="popover-panel" id={listboxId} role="listbox" aria-labelledby={`${safeId}-label`}>
          {availableOptions.map((option, index) => (
            <button
              className={[
                index === boundedActiveIndex ? "active" : "",
                option === value ? "selected" : "",
              ].filter(Boolean).join(" ")}
              id={`${safeId}-option-${index}`}
              key={option}
              role="option"
              aria-selected={option === value}
              tabIndex={-1}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                selectOption(option);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
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
  error,
  inputType = "text",
  inputRef,
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
  error?: string;
  inputType?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onChange?: (value: string) => void;
}) {
  const generatedId = useId();
  const inputId = `form-line-${generatedId.replace(/:/g, "")}`;
  const labelId = `${inputId}-label`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="form-line">
      <label id={labelId} htmlFor={inputId}>{label}{required && <b>*</b>}</label>
      <div>
        <input id={inputId} ref={inputRef} type={inputType} value={value} readOnly={!onChange} aria-labelledby={labelId} aria-describedby={describedBy} aria-invalid={error ? "true" : undefined} onChange={(event) => onChange?.(event.target.value)} />
        {hint && <em id={hintId}>{hint}</em>}
        {hintButton && <button type="button" onClick={hintAction}>{hintButton}</button>}
        {success && <small><CheckCircle2 size={12} /> {success}</small>}
        {error && <strong id={errorId} className="form-error">{error}</strong>}
      </div>
      {strength && <p className="password-strength"><i /><i /><i /><em>强</em></p>}
    </div>
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
