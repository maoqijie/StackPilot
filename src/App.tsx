import { useEffect, useState } from "react";
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

const pageKeys = [
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
  "mobile",
] as const;

type PageKey = (typeof pageKeys)[number];
type Tone = "green" | "blue" | "orange" | "red" | "gray" | "purple";
type ToastTone = "success" | "info" | "warning" | "danger";
type ToastState = { message: string; tone: ToastTone };
type Notify = (message: string, tone?: ToastTone) => void;
type PageMeta = { title: string; breadcrumb: string; search: string };

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

const pageMeta: Record<PageKey, PageMeta> = {
  overview: { title: "首页总览", breadcrumb: "控制台", search: "搜索主机、网站、数据库、任务..." },
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
  mobile: { title: "移动端", breadcrumb: "预览", search: "搜索移动端模块..." },
};

const navItems: Array<{ key: Exclude<PageKey, "mobile">; label: string; icon: LucideIcon; badge?: string }> = [
  { key: "overview", label: "首页总览", icon: Home },
  { key: "hosts", label: "主机", icon: Server },
  { key: "sites", label: "网站", icon: Globe2 },
  { key: "databases", label: "数据库", icon: Database },
  { key: "files", label: "文件", icon: Folder },
  { key: "terminal", label: "终端", icon: TerminalSquare },
  { key: "systemd", label: "systemd 服务", icon: Settings },
  { key: "firewall", label: "防火墙", icon: Shield },
  { key: "deploy", label: "部署", icon: CloudUpload },
  { key: "schedule", label: "定时任务", icon: CalendarDays },
  { key: "audit", label: "审计日志", icon: FileText },
  { key: "acl", label: "权限", icon: Lock },
  { key: "settings", label: "设置", icon: Settings },
];

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

const hosts = [
  ["panel-se-01", "10.0.0.11", "18%", "42%", "35%", "健康", "今天 02:15", "已是最新"],
  ["panel-bj-02", "10.0.1.22", "27%", "55%", "62%", "健康", "今天 02:20", "可更新 1"],
  ["panel-hk-03", "10.0.2.33", "63%", "78%", "83%", "警告", "昨天 02:18", "可更新 1"],
];

const taskRows = [
  ["部署", "部署 /api 服务 v2.8.1", "成功", "2 分钟前", "1分24秒"],
  ["备份", "备份数据 shop_db 完成", "成功", "8 分钟前", "32秒"],
  ["补丁", "更新防火墙规则", "成功", "15 分钟前", "18秒"],
  ["自动化", "每日快照 成功", "成功", "1 小时前", "2分11秒"],
  ["修复", "重启 systemd 服务 nginx", "成功", "2 小时前", "7秒"],
  ["自动化", "同步文件到 panel-hk-03", "成功", "3 小时前", "45秒"],
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

const riskRows = [
  ["SSH 密钥过期", "2 台", "高危"],
  ["防火墙放行 0.0.0.0/0:3306", "", "高危"],
  ["3 个站点证书 5 天后到期", "", "中危"],
  ["1 个 systemd 服务反复重启", "", "中危"],
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

type ScheduleJob = {
  id: string;
  name: string;
  cron: string;
  command: string;
  enabled: boolean;
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

const initialScheduleJobs: ScheduleJob[] = [
  { id: "sch-1", name: "每日数据备份", cron: "0 2 * * *", command: "backup:run --daily", enabled: true, lastRun: "今天 02:00", result: "成功" },
  { id: "sch-2", name: "证书续期检查", cron: "15 3 * * 1", command: "certbot renew --dry-run", enabled: true, lastRun: "周一 03:15", result: "成功" },
  { id: "sch-3", name: "日志清理", cron: "30 1 * * 0", command: "logs:prune --days=30", enabled: false, lastRun: "未运行", result: "未运行" },
  { id: "sch-4", name: "服务健康探测", cron: "*/10 * * * *", command: "health:check", enabled: true, lastRun: "10 分钟前", result: "失败" },
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

function readPageFromHash(): PageKey {
  const key = window.location.hash.replace("#", "");
  return pageKeys.find((pageKey) => pageKey === key) ?? "overview";
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

  const notify: Notify = (message, tone = "success") => {
    setToast({ message, tone });
  };

  const setPage = (next: PageKey) => {
    setPageState(next);
    window.location.hash = next;
  };

  return (
    <main className="shot-canvas">
      {page === "mobile" ? (
        <MobileMock notify={notify} />
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
  setPage: (page: PageKey) => void;
  notify: Notify;
}) {
  const whiteTop = page !== "overview";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <section className={`desktop-frame ${whiteTop ? "white-top" : "dark-top"} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <Sidebar
        page={page}
        setPage={setPage}
        notify={notify}
        compact={page === "settings"}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
      />
      <div className="desktop-main">
        <TopBar page={page} white={whiteTop} notify={notify} />
        {page === "overview" && <OverviewPage setPage={setPage} notify={notify} />}
        {page === "hosts" && <HostsPage notify={notify} />}
        {page === "sites" && <SitesPage notify={notify} />}
        {page === "databases" && <DatabasesPage notify={notify} />}
        {page === "files" && <FilesPage notify={notify} />}
        {page === "terminal" && <TerminalPage notify={notify} />}
        {page === "systemd" && <SystemdPage notify={notify} />}
        {page === "firewall" && <FirewallPage notify={notify} />}
        {page === "deploy" && <DeployPage notify={notify} />}
        {page === "schedule" && <SchedulePage notify={notify} />}
        {page === "audit" && <AuditPage notify={notify} />}
        {page === "acl" && <AclPage notify={notify} />}
        {page === "settings" && <SettingsPage notify={notify} />}
      </div>
      {page === "overview" && <DesktopFooter />}
    </section>
  );
}

function Sidebar({
  page,
  setPage,
  notify,
  compact,
  collapsed,
  onToggleCollapsed,
}: {
  page: PageKey;
  setPage: (page: PageKey) => void;
  notify: Notify;
  compact?: boolean;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  return (
    <aside className={`sidebar-mock ${compact ? "compact" : ""} ${collapsed ? "collapsed" : ""}`}>
      <div className="side-brand">
        <div className="brand-gem" />
        {!collapsed && <strong>StackPilot</strong>}
        {(compact || collapsed) && <Menu size={16} />}
      </div>
      <nav className="side-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === page || (page === "overview" && item.key === "overview");
          return (
            <button
              key={item.key}
              className={active ? "active" : ""}
              type="button"
              onClick={() => setPage(item.key)}
            >
              <Icon size={17} />
              {!collapsed && <span>{compact && item.key === "overview" ? "仪表盘" : item.label}</span>}
              {!collapsed && item.key === "hosts" && compact && <b>12</b>}
              {!collapsed && item.key === "sites" && compact && <b>28</b>}
              {!collapsed && item.key === "databases" && compact && <b>9</b>}
              {!collapsed && !compact && ["hosts", "sites", "databases", "files", "terminal", "systemd", "firewall", "deploy", "schedule", "audit", "acl", "settings"].includes(item.key) && <ChevronDown size={13} />}
            </button>
          );
        })}
      </nav>
      {!compact && !collapsed && (
        <div className="host-groups">
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
      )}
      <button
        className="collapse-side"
        type="button"
        onClick={() => {
          onToggleCollapsed();
          notify(collapsed ? "侧栏已展开" : "侧栏已收起", "info");
        }}
        aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
      >
        {collapsed ? <Menu size={15} /> : compact ? <Settings size={15} /> : <ChevronLeft size={15} />}
        {!collapsed && <span>{compact ? "收起侧栏" : "收起侧栏"}</span>}
      </button>
    </aside>
  );
}

function TopBar({ page, white, notify }: { page: PageKey; white: boolean; notify: Notify }) {
  const [query, setQuery] = useState("");
  const meta = pageMeta[page];

  return (
    <header className={`topbar-mock ${white ? "white" : ""}`}>
      {page !== "overview" && (
        <div className="breadcrumb-title">
          {page !== "settings" && <Menu size={16} />}
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
        {page === "settings" && <StatusDot text="面板运行正常" />}
        <button type="button" className="icon-action" onClick={() => notify("暂无新的未读通知", "info")} aria-label="通知">
          <Bell size={18} />
        </button>
        <span className="red-badge">{page === "overview" ? "3" : page === "settings" ? "5" : "2"}</span>
        {page !== "overview" && (
          <button type="button" className="icon-action" onClick={() => notify("已打开当前页操作记录", "info")} aria-label="操作记录">
            <FileText size={17} />
          </button>
        )}
        <button type="button" className="icon-action" onClick={() => notify("帮助中心已准备好", "info")} aria-label="帮助">
          <CircleHelp size={17} />
        </button>
        <button type="button" className="avatar-mini" onClick={() => notify("已打开用户菜单", "info")} aria-label="用户菜单">
          {page === "overview" ? <UserRound size={18} /> : "张"}
        </button>
        <strong>{page === "overview" ? "admin" : page === "databases" ? "张工" : "管理员"}</strong>
        <ChevronDown size={13} />
      </div>
    </header>
  );
}

function OverviewPage({ setPage, notify }: { setPage: (page: PageKey) => void; notify: Notify }) {
  const [cluster, setCluster] = useState("panel-sg-01");
  const [taskTab, setTaskTab] = useState("最近任务");
  const [resourceTab, setResourceTab] = useState("今天");
  const [lastRefresh, setLastRefresh] = useState("2025-05-22 02:15");
  const nextCluster = cluster === "panel-sg-01" ? "panel-bj-02" : cluster === "panel-bj-02" ? "panel-hk-03" : "panel-sg-01";

  return (
    <div className="overview-page">
      <div className="cluster-bar">
        <button
          type="button"
          className="cluster-select"
          onClick={() => {
            setCluster(nextCluster);
            notify(`已切换到 ${nextCluster}`, "info");
          }}
        >
          <StatusLight tone="green" />
          {cluster}
          <ChevronDown size={14} />
        </button>
        <span>集群状态：<b className="green-text">健康</b></span>
        <span>延迟：<b className="green-text">38ms</b></span>
        <span>版本：v2.8.1</span>
        <span>运行时间：23 天 14 小时</span>
        <span>最后备份：{lastRefresh} <CheckCircle2 size={13} /></span>
        <span>待更新：<b className="red-text">2</b></span>
        <div className="cluster-actions">
          <button className="primary small" type="button" onClick={() => notify("新增主机向导已打开", "info")}><Plus size={14} /> 新增主机</button>
          <button
            className="ghost small"
            type="button"
            onClick={() => {
              setLastRefresh(currentClock());
              notify("集群数据已刷新");
            }}
          >
            <RefreshCw size={14} /> 刷新
          </button>
          <button className="ghost small" type="button" onClick={() => notify("检查完成：2 个组件可更新", "warning")}><RefreshCw size={14} /> 检查更新</button>
          <button className="warning small" type="button" onClick={() => notify("风险中心已定位到 3 个待处理项", "warning")}>风险中心 <b>3</b></button>
        </div>
      </div>
      <section className="metric-row">
        {overviewMetrics.map((item) => (
          <MetricCard key={item.label} {...item} />
        ))}
      </section>
      <section className="overview-grid">
        <div className="left-stack">
          <PanelCard title="集群状态" action="查看全部">
            <HostTable notify={notify} />
          </PanelCard>
          <div className="two-panels">
            <PanelCard title="任务流" tabs={["最近任务", "队列中的任务 (7)"]} activeTab={taskTab} onTabChange={setTaskTab} action="查看全部" onAction={() => notify("已展开完整任务流", "info")}>
              <TaskTable queued={taskTab !== "最近任务"} />
            </PanelCard>
            <PanelCard title="最近审计" action="查看全部" onAction={() => notify("已打开审计日志列表", "info")}>
              <AuditTable />
            </PanelCard>
          </div>
        </div>
        <div className="right-stack">
          <PanelCard title="风险中心" action="查看详情" onAction={() => notify("风险详情已展开", "warning")}>
            <RiskList notify={notify} />
          </PanelCard>
          <PanelCard title="快捷操作">
            <QuickActions setPage={setPage} notify={notify} />
          </PanelCard>
          <PanelCard title="资源概览" tabs={["今天", "近7天", "近30天"]} activeTab={resourceTab} onTabChange={setResourceTab}>
            <ResourceOverview activeTab={resourceTab} />
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

function HostTable({ notify }: { notify: Notify }) {
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
          {hosts.map((host, index) => (
            <tr className={selectedHost === host[0] ? "is-selected" : ""} key={host[0]}>
              <td><StatusLight tone={index === 2 ? "orange" : "green"} /> {host[0]}</td>
              <td>{host[1]}</td>
              <td><Bar value={host[2]} tone={index === 2 ? "orange" : "green"} /></td>
              <td><Bar value={host[3]} tone={index === 2 ? "red" : index === 1 ? "orange" : "green"} /></td>
              <td><Bar value={host[4]} tone={index === 2 ? "red" : index === 1 ? "orange" : "green"} /></td>
              <td><StatusLight tone={index === 2 ? "orange" : "green"} /> {host[5]}</td>
              <td><StatusLight tone="green" /> {host[6]}</td>
              <td className={index === 0 ? "" : "orange-text"}>{host[7]}</td>
              <td>
                <button
                  className="icon-action inline"
                  type="button"
                  onClick={() => {
                    setSelectedHost(host[0]);
                    notify(`${host[0]} 详情已选中`, "info");
                  }}
                  aria-label={`${host[0]} 更多操作`}
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

function TaskTable({ queued }: { queued?: boolean }) {
  const rows = queued
    ? [
        ["排队", "等待发布 API 服务 v2.8.2", "等待", "预计 12 分钟", "队列 #1"],
        ["排队", "等待同步静态文件", "等待", "预计 18 分钟", "队列 #2"],
        ["排队", "等待备份 analytics_db", "等待", "预计 25 分钟", "队列 #3"],
        ["排队", "等待重启 worker 服务", "等待", "预计 31 分钟", "队列 #4"],
      ]
    : taskRows;
  return (
    <div className="task-flow">
      {rows.map((row) => (
        <div key={row.join("-")}>
          <StatusLight tone={queued ? "orange" : "green"} />
          <span className="task-icon"><Code2 size={15} /></span>
          <strong>{row[0]}</strong>
          <p>{row[1]}</p>
          <b>{queued ? "等待" : "成功"}</b>
          <em>{row[3]}</em>
          <small>{row[4]}</small>
        </div>
      ))}
    </div>
  );
}

function AuditTable() {
  return (
    <table className="mini-table audit-table">
      <tbody>
        {auditRows.map((row) => (
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

function RiskList({ notify }: { notify: Notify }) {
  const [resolved, setResolved] = useState<string[]>([]);

  return (
    <div className="risk-list">
      {riskRows.map((row) => (
        <div key={row[0]} className={resolved.includes(row[0]) ? "is-resolved" : ""}>
          <KeyRound size={17} />
          <span>{row[0]}</span>
          <b>{row[1]}</b>
          <em className={row[2] === "高危" ? "red-text" : "orange-text"}>{resolved.includes(row[0]) ? "已处理" : row[2]}</em>
          <button
            type="button"
            disabled={resolved.includes(row[0])}
            onClick={() => {
              setResolved((current) => [...current, row[0]]);
              notify(`已处理风险：${row[0]}`);
            }}
          >
            {resolved.includes(row[0]) ? "完成" : "立即处理"}
          </button>
        </div>
      ))}
    </div>
  );
}

function QuickActions({ setPage, notify }: { setPage: (page: PageKey) => void; notify: Notify }) {
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

function ResourceOverview({ activeTab }: { activeTab: string }) {
  const multiplier = activeTab === "近30天" ? 1.18 : activeTab === "近7天" ? 1.08 : 1;
  const resources = [
    ["CPU 使用率", `${Math.round(18 * multiplier)}%`, activeTab === "今天" ? "+3%" : "+6%", [18, 16, 20, 14, 26, 17, 23, 15, 21, 18]],
    ["内存使用率", `${Math.round(52 * multiplier)}%`, activeTab === "今天" ? "+4%" : "+7%", [42, 48, 45, 52, 47, 55, 48, 52, 49, 57]],
    ["磁盘使用率", `${Math.round(61 * multiplier)}%`, activeTab === "今天" ? "+1%" : "+3%", [59, 61, 58, 63, 57, 62, 56, 61, 58, 64]],
    ["网络流量", activeTab === "今天" ? "1.2 TB" : activeTab === "近7天" ? "8.9 TB" : "34.6 TB", activeTab === "今天" ? "+8%" : "+13%", [20, 16, 26, 18, 30, 23, 19, 24, 21, 28]],
  ];

  return (
    <div className="resource-grid">
      {resources.map(([label, value, delta, values]) => (
        <article key={label as string}>
          <div><span>{label as string}</span><em>{delta as string}</em></div>
          <strong>{value as string}</strong>
          <Sparkline values={values as number[]} tone="blue" />
        </article>
      ))}
    </div>
  );
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
  actions,
  filters,
  metrics,
  side,
  children,
}: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  metrics?: React.ReactNode;
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
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
          {filters && <div className="module-filter-line">{filters}</div>}
          {metrics && <div className="module-metrics">{metrics}</div>}
          {children}
        </section>
        {side}
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

function HostsPage({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState(initialHostRecords);
  const [search, setSearch] = useState("");
  const [envFilter, setEnvFilter] = useState("全部");
  const [healthFilter, setHealthFilter] = useState("全部");
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
      title="主机"
      subtitle="统一查看各环境主机健康、资源负载、备份和系统更新状态。"
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

function SitesPage({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState(initialSiteRecords);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [runtimeFilter, setRuntimeFilter] = useState("全部");
  const [drawer, setDrawer] = useState<{ type: "create" | "logs"; site?: SiteRecord } | null>(null);
  const [draft, setDraft] = useState({ domain: "new.example.com", runtime: "Node 20", host: "panel-se-01" });
  const runtimeOptions = ["全部", ...Array.from(new Set(rows.map((row) => row.runtime)))];
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return (!query || row.domain.toLowerCase().includes(query)) && (statusFilter === "全部" || row.status === statusFilter) && (runtimeFilter === "全部" || row.runtime === runtimeFilter);
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
      title="网站"
      subtitle="管理域名、运行时、证书有效期和站点启停状态。"
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

function FilesPage({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState(initialFileRecords);
  const [currentPath, setCurrentPath] = useState("/var/www/html");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("全部");
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
      title="文件"
      subtitle="模拟文件管理器，支持路径面包屑、进入文件夹、本地上传和重命名删除。"
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

function TerminalPage({ notify }: { notify: Notify }) {
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
      title="终端"
      subtitle="本地模拟 SSH 会话，命令输入会追加到终端输出。"
      actions={<><button className="ghost" type="button" onClick={() => { setConnected(false); notify("终端会话已断开", "warning"); }}>断开</button><button className="primary" type="button" onClick={() => { setConnected(true); setLogs((current) => [...current, `reconnected to ${host}`]); notify(`已连接 ${host}`); }}>连接</button></>}
      filters={<><FieldSelect label="主机" value={host} options={initialHostRecords.map((item) => item.name)} onChange={(value) => { setHost(value); setLogs((current) => [...current, `switch host to ${value}`]); }} /><StatusDot text={connected ? "已连接" : "未连接"} /></>}
      metrics={<><MetricTile icon={TerminalSquare} label="当前主机" value={host} tone="blue" /><MetricTile icon={Clock3} label="会话行数" value={`${logs.length}`} tone="green" /><MetricTile icon={Shield} label="权限" value="sudo" tone="orange" /></>}
    >
      <div className="terminal-panel">
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

function SystemdPage({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState(initialServiceRecords);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [drawer, setDrawer] = useState<ServiceRecord | null>(null);
  const filteredRows = rows.filter((row) => (!search.trim() || `${row.name} ${row.host}`.toLowerCase().includes(search.trim().toLowerCase())) && (statusFilter === "全部" || row.status === statusFilter));
  const updateService = (id: string, patch: Partial<ServiceRecord>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));

  return (
    <ModulePageShell
      title="systemd 服务"
      subtitle="查看服务 active/failed/inactive 状态，并在本地模拟启停、重启和处理失败服务。"
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
    </ModulePageShell>
  );
}

function FirewallPage({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState(initialFirewallRules);
  const [search, setSearch] = useState("");
  const [protocolFilter, setProtocolFilter] = useState("全部");
  const [sourceFilter, setSourceFilter] = useState("全部");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "临时调试端口", port: "", protocol: "TCP", source: "10.0.0.0/8" });
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    return (!query || `${row.name} ${row.port}`.toLowerCase().includes(query)) && (protocolFilter === "全部" || row.protocol === protocolFilter) && (sourceFilter === "全部" || row.source === sourceFilter);
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
      title="防火墙"
      subtitle="本地维护规则列表，支持端口、协议、来源筛选和启用删除。"
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

function DeployPage({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState(initialDeployJobs);
  const [env, setEnv] = useState("生产");
  const [drawer, setDrawer] = useState<DeployJob | null>(null);
  const filteredRows = rows.filter((row) => row.env === env);
  const updateDeploy = (id: string, patch: Partial<DeployJob>) => setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  const createDeploy = () => {
    const next: DeployJob = { id: `dep-${Date.now()}`, app: env === "生产" ? "shop-web" : "feature-service", env, version: `build-${rows.length + 1}`, status: "运行中", operator: "管理员", duration: "运行中" };
    setRows((current) => [next, ...current]);
    notify(`${env} 部署任务已创建`, "info");
  };

  return (
    <ModulePageShell
      title="部署"
      subtitle="按环境查看发布任务，支持创建、完成、回滚、查看日志和重新部署。"
      actions={<button className="primary" type="button" onClick={createDeploy}><Plus size={15} /> 创建部署任务</button>}
      filters={<div className="deploy-tabs">{["生产", "预发", "开发"].map((item) => <button key={item} className={item === env ? "active" : ""} type="button" onClick={() => setEnv(item)}>{item}</button>)}</div>}
      metrics={<><MetricTile icon={CloudUpload} label="当前环境" value={env} tone="blue" /><MetricTile icon={Activity} label="运行中" value={`${rows.filter((row) => row.status === "运行中").length}`} tone="orange" /><MetricTile icon={CheckCircle2} label="成功" value={`${rows.filter((row) => row.status === "成功").length}`} tone="green" /></>}
      side={drawer && (
        <DetailDrawer title="部署日志" subtitle={`${drawer.app} ${drawer.version}`} onClose={() => setDrawer(null)}>
          <div className="terminal-log compact-log">
            <p>checkout {drawer.version}</p>
            <p>install dependencies</p>
            <p>build artifacts</p>
            <p>{drawer.status === "失败" ? "deploy failed: health check timeout" : "deploy finished"}</p>
          </div>
        </DetailDrawer>
      )}
    >
      <DataTable
        columns={[
          { key: "app", label: "应用", width: "210px", render: (row) => <b className="blue-text">{row.app}</b> },
          { key: "env", label: "环境", render: (row) => <span className="pill blue">{row.env}</span> },
          { key: "version", label: "版本", render: (row) => row.version },
          { key: "status", label: "状态", render: (row) => <span className={`pill ${row.status === "成功" ? "green" : row.status === "失败" ? "red" : "blue"}`}>{row.status}</span> },
          { key: "operator", label: "操作人", render: (row) => row.operator },
          { key: "duration", label: "耗时", render: (row) => row.duration },
          { key: "ops", label: "操作", width: "260px", render: (row) => <span className="table-actions">{row.status === "运行中" && <button type="button" onClick={() => { updateDeploy(row.id, { status: "成功", duration: "1分02秒" }); notify(`${row.app} 部署已完成`); }}>完成</button>}<button type="button" onClick={() => { updateDeploy(row.id, { status: "运行中", duration: "回滚中" }); notify(`${row.app} 已开始回滚`, "warning"); }}>回滚</button><button type="button" onClick={() => setDrawer(row)}>日志</button><button type="button" onClick={() => { updateDeploy(row.id, { status: "运行中", duration: "运行中" }); notify(`${row.app} 已重新部署`, "info"); }}>重部署</button></span> },
        ]}
        rows={filteredRows}
        emptyText="当前环境没有部署任务"
        getRowKey={(row) => row.id}
      />
    </ModulePageShell>
  );
}

function SchedulePage({ notify }: { notify: Notify }) {
  const [rows, setRows] = useState(initialScheduleJobs);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("全部");
  const [drawer, setDrawer] = useState<{ type: "create" | "edit"; job?: ScheduleJob } | null>(null);
  const [draft, setDraft] = useState({ name: "新建任务", cron: "0 4 * * *", command: "echo ok" });
  const filteredRows = rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.name} ${row.cron} ${row.command}`.toLowerCase().includes(query);
    const matchState = stateFilter === "全部" || (stateFilter === "已启用" ? row.enabled : !row.enabled);
    return matchSearch && matchState;
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
      setRows((current) => [{ id: `sch-${Date.now()}`, name: draft.name.trim(), cron: draft.cron.trim(), command: draft.command.trim(), enabled: true, lastRun: "未运行", result: "未运行" }, ...current]);
      notify("定时任务已新建");
    }
    setDrawer(null);
  };

  return (
    <ModulePageShell
      title="定时任务"
      subtitle="管理 cron 自动化，支持启停、立即执行、编辑和新增。"
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

function AuditPage({ notify }: { notify: Notify }) {
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("全部");
  const [resultFilter, setResultFilter] = useState("全部");
  const [selected, setSelected] = useState<AuditRecord | null>(null);
  const users = ["全部", ...Array.from(new Set(initialAuditRecords.map((row) => row.user)))];
  const filteredRows = initialAuditRecords.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query || `${row.user} ${row.action} ${row.object} ${row.result} ${row.traceId} ${row.ip}`.toLowerCase().includes(query);
    return matchSearch && (userFilter === "全部" || row.user === userFilter) && (resultFilter === "全部" || row.result === resultFilter);
  });

  return (
    <ModulePageShell
      title="审计日志"
      subtitle="只读审计视图，支持关键字、用户和结果过滤。"
      actions={<button className="ghost" type="button" onClick={() => notify(`已导出 ${filteredRows.length} 条审计日志`, "info")}><Download size={15} /> 导出</button>}
      filters={<><ModuleSearch value={search} placeholder="搜索关键字、对象或 trace id" onChange={setSearch} /><FieldSelect label="用户" value={userFilter} options={users} onChange={setUserFilter} /><FieldSelect label="结果" value={resultFilter} options={["全部", "成功", "失败"]} onChange={setResultFilter} /></>}
      metrics={<><MetricTile icon={FileText} label="日志" value={`${initialAuditRecords.length}`} tone="blue" /><MetricTile icon={CheckCircle2} label="成功" value={`${initialAuditRecords.filter((row) => row.result === "成功").length}`} tone="green" /><MetricTile icon={Shield} label="失败" value={`${initialAuditRecords.filter((row) => row.result === "失败").length}`} tone="red" /></>}
      side={selected && (
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
    </ModulePageShell>
  );
}

function AclPage({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState<"users" | "roles">("users");
  const [users, setUsers] = useState(initialAclUsers);
  const [roles, setRoles] = useState(initialAclRoles);
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState(initialAclRoles[0].id);
  const selectedRole = roles.find((role) => role.id === roleId) ?? roles[0];
  const filteredUsers = users.filter((user) => !search.trim() || `${user.name} ${user.email} ${user.role}`.toLowerCase().includes(search.trim().toLowerCase()));
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
      title="权限"
      subtitle="管理用户启用状态、MFA 和角色权限勾选。"
      actions={<button className="ghost" type="button" onClick={() => notify("权限变更已保存")}>保存权限</button>}
      filters={<><div className="deploy-tabs"><button className={tab === "users" ? "active" : ""} type="button" onClick={() => setTab("users")}>用户</button><button className={tab === "roles" ? "active" : ""} type="button" onClick={() => setTab("roles")}>角色</button></div>{tab === "users" && <ModuleSearch value={search} placeholder="搜索用户、邮箱或角色" onChange={setSearch} />}</>}
      metrics={<><MetricTile icon={UserRound} label="用户" value={`${users.length}`} tone="blue" /><MetricTile icon={Lock} label="角色" value={`${roles.length}`} tone="purple" /><MetricTile icon={Shield} label="MFA 异常" value={`${users.filter((user) => user.mfa !== "已启用").length}`} tone="orange" /></>}
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
      ) : (
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
      )}
    </ModulePageShell>
  );
}

function DatabasesPage({ notify }: { notify: Notify }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("全部");
  const [statusFilter, setStatusFilter] = useState("全部");
  const [hostFilter, setHostFilter] = useState("全部主机");
  const [rows, setRows] = useState(dbRows);
  const [lastSync, setLastSync] = useState(currentClock());
  const filteredRows = rows.filter((row) => {
    const matchSearch = row[0].toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "全部" || row[1].includes(typeFilter);
    const matchStatus = statusFilter === "全部" || (statusFilter === "告警" ? row[4].startsWith("延迟") || row[5] === "失败" : row[4] === "正常");
    const matchHost = hostFilter === "全部主机" || row[2] === hostFilter;
    return matchSearch && matchType && matchStatus && matchHost;
  });

  return (
    <div className="database-page">
      <div className="page-head">
        <div>
          <h1>数据库管理</h1>
          <p>集中管理和监控所有数据库实例的运行状态、备份与慢查询 · 最近同步 {lastSync}</p>
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
          <div className="db-bottom">
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

function SettingsPage({ notify }: { notify: Notify }) {
  const tabs = ["基础", "安全", "代理", "通知", "备份", "审计"];
  const [activeTab, setActiveTab] = useState("备份");
  const [readOnly, setReadOnly] = useState(false);
  const [backupItems, setBackupItems] = useState(["面板数据", "审计日志"]);
  const [twoFactor, setTwoFactor] = useState(true);
  const [multiLogin, setMultiLogin] = useState(false);
  const [mailNotice, setMailNotice] = useState(true);
  const toggleBackupItem = (item: string) => {
    setBackupItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  };

  return (
    <div className="settings-mock-page">
      <div className="page-head settings-title">
        <div>
          <h1>面板设置</h1>
          <p>配置面板身份、访问令牌、备份与恢复策略、安全与通知等全局设置，确保系统安全、可审计、稳定运行。</p>
        </div>
      </div>
      <div className="settings-tabs">
        {tabs.map((tab) => (
          <button
            className={tab === activeTab ? "active" : ""}
            type="button"
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              notify(`已切换到${tab}设置`, "info");
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="settings-layout">
        <PanelCard title="面板身份">
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
        </PanelCard>
        <PanelCard title="访问令牌">
          <div className="token-title">
            <span>用于 API 访问、CI/CD 集成或第三方工具接入，请妥善保管令牌，避免泄露。</span>
            <div><button className="primary" type="button" onClick={() => notify("新访问令牌已生成")}><Plus size={14} /> 生成令牌</button><button className="danger-soft" type="button" onClick={() => notify("已进入令牌批量编辑模式", "warning")}><Trash2 size={14} /> 编辑清单中</button></div>
          </div>
          <TokenTable notify={notify} />
        </PanelCard>
        <PanelCard title="备份策略">
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
        </PanelCard>
        <PanelCard title="验证状态">
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
        </PanelCard>
        <PanelCard title="安全设置">
          <div className="right-settings">
            <ToggleLine label="强制启用两步验证（2FA）" active={twoFactor} onToggle={setTwoFactor} />
            <FormSelectLine label="会话超时时间" value="30 分钟" />
            <FormLine label="IP 访问白名单" value="10.0.0.0/8, 172.16.0.0/12" />
            <ToggleLine label="允许多地同时登录" active={multiLogin} onToggle={setMultiLogin} />
            <FormSelectLine label="登录失败锁定" value="5 次 / 15 分钟" />
          </div>
        </PanelCard>
        <PanelCard title="通知设置">
          <div className="right-settings">
            <FormLine label="Webhook 通知" value="https://hooks.example.com/stackpilot" hintButton="测试" hintAction={() => notify("Webhook 测试成功")} />
            <ToggleLine label="关键事件邮件通知" active={mailNotice} onToggle={setMailNotice} />
            <FormLine label="通知收件人" value="ops@example.com, dev@example.com" />
            <div className="connected-line"><CheckCircle2 size={14} /> 已连接（响应成本 45ms） <button type="button" onClick={() => notify("通知预览已发送")}>预览</button></div>
          </div>
        </PanelCard>
      </div>
      <PanelCard title="最近配置变更" action="查看审计日志" onAction={() => notify("已打开设置审计日志", "info")}>
        <table className="mini-table changes-table">
          <tbody>
            {settingsChanges.map((row) => (
              <tr key={row.join("-")}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </PanelCard>
    </div>
  );
}

function MobileMock({ notify }: { notify: Notify }) {
  const [activeTab, setActiveTab] = useState("首页");
  const [activeQuick, setActiveQuick] = useState("添加主机");
  const tabSummary: Record<string, string> = {
    首页: "5 台主机在线 · 2 个告警",
    主机: "3 台生产主机 · db-01 需要关注",
    网站: "12 个网站正常运行",
    任务: "5 条最近任务 · 1 条警告",
    我的: "管理员 · 面板运行正常",
  };

  return (
    <section className="mobile-frame-stage">
      <div className="phone-scale-box">
        <div className="phone-shell">
          <div className="phone-side left top" />
          <div className="phone-side left mid" />
          <div className="phone-side right mid" />
          <div className="phone-screen">
            <div className="ios-status">
              <strong>9:41</strong>
              <span />
              <em>●●●</em>
            </div>
            <div className="mobile-top">
              <button type="button" className="mobile-icon-button" onClick={() => notify("移动端菜单已打开", "info")}><Menu size={20} /></button>
              <div className="mobile-brand"><div className="brand-gem small" /><strong>StackPilot</strong></div>
              <div className="mobile-icons"><button type="button" onClick={() => notify("移动端通知已标记为已读", "info")}><Bell size={18} /></button><i>3</i><button type="button" onClick={() => notify("已打开移动端个人中心", "info")}><b>U</b></button></div>
            </div>
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
                  {[
                    ["部署 Laravel 应用到 web-01", "admin 触发", "成功", "2 分钟前"],
                    ["备份数据库 shop_db", "system 自动", "成功", "15 分钟前"],
                    ["更新系统组件 /web-02", "admin 触发", "警告", "32 分钟前"],
                    ["重启 Nginx 服务（web-01）", "自动监控", "成功", "1 小时前"],
                    ["登录到 203.0.113.10", "admin 登录", "信息", "1 小时前"],
                  ].map((row, index) => {
                    const openTask = () => notify(`已打开任务：${row[0]}`, "info");
                    return (
                    <div key={row[0]} role="button" tabIndex={0} onClick={openTask} onKeyDown={(event) => activateOnKeyboard(event, openTask)}>
                      <span className="mobile-task-icon">{["★", "▣", "↻", "↺", "♙"][index]}</span>
                      <p><strong>{row[0]}</strong><em>{row[1]}</em></p>
                      <StatusLight tone={row[2] === "警告" ? "orange" : row[2] === "信息" ? "blue" : "green"} />
                      <b>{row[2]}</b>
                      <small>{row[3]}</small>
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
            <nav className="mobile-tabbar">
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
          </div>
        </div>
      </div>
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
  onTabChange,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  tabs?: string[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="panel-card">
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
