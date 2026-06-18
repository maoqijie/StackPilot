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

type PageKey = "overview" | "databases" | "settings" | "mobile";
type Tone = "green" | "blue" | "orange" | "red" | "gray" | "purple";
type ToastTone = "success" | "info" | "warning" | "danger";
type ToastState = { message: string; tone: ToastTone };
type Notify = (message: string, tone?: ToastTone) => void;

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

const navItems: Array<{ key: PageKey | string; label: string; icon: LucideIcon; badge?: string }> = [
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

function readPageFromHash(): PageKey {
  const key = window.location.hash.replace("#", "");
  if (key === "databases" || key === "settings" || key === "mobile") {
    return key;
  }
  return "overview";
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

  return (
    <section className={`desktop-frame ${whiteTop ? "white-top" : "dark-top"}`}>
      <Sidebar page={page} setPage={setPage} notify={notify} compact={page === "settings"} />
      <div className="desktop-main">
        <TopBar page={page} white={whiteTop} notify={notify} />
        {page === "databases" && <DatabasesPage notify={notify} />}
        {page === "settings" && <SettingsPage notify={notify} />}
        {page === "overview" && <OverviewPage setPage={setPage} notify={notify} />}
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
}: {
  page: PageKey;
  setPage: (page: PageKey) => void;
  notify: Notify;
  compact?: boolean;
}) {
  return (
    <aside className={`sidebar-mock ${compact ? "compact" : ""}`}>
      <div className="side-brand">
        <div className="brand-gem" />
        <strong>StackPilot</strong>
        {compact && <Menu size={16} />}
      </div>
      {!compact && (
        <button className="workspace-switch" type="button" onClick={() => notify("团队切换器已展开", "info")}>
          <span>Default Workspace</span>
          <em>切换团队</em>
          <ChevronDown size={13} />
        </button>
      )}
      <nav className="side-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === page || (page === "overview" && item.key === "overview");
          return (
            <button
              key={item.key}
              className={active ? "active" : ""}
              type="button"
              onClick={() => {
                if (item.key === "overview" || item.key === "databases" || item.key === "settings") {
                  setPage(item.key);
                  return;
                }
                notify(`${item.label} 模块正在接入，已保留导航状态`, "info");
              }}
            >
              <Icon size={17} />
              <span>{compact && item.key === "overview" ? "仪表盘" : item.label}</span>
              {item.key === "hosts" && compact && <b>12</b>}
              {item.key === "sites" && compact && <b>28</b>}
              {item.key === "databases" && compact && <b>9</b>}
              {!compact && ["hosts", "sites", "databases", "files", "terminal", "systemd", "firewall", "deploy", "schedule", "audit", "acl", "settings"].includes(item.key) && <ChevronDown size={13} />}
            </button>
          );
        })}
      </nav>
      {!compact && (
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
      <button className="collapse-side" type="button" onClick={() => notify(compact ? "已打开版本更新详情" : "侧栏保持展开，已记录收起偏好", "info")}>
        {compact ? <Settings size={15} /> : <ChevronLeft size={15} />}
        <span>{compact ? "更新可用 v1.8.3" : "收起侧栏"}</span>
      </button>
    </aside>
  );
}

function TopBar({ page, white, notify }: { page: PageKey; white: boolean; notify: Notify }) {
  const [query, setQuery] = useState("");

  return (
    <header className={`topbar-mock ${white ? "white" : ""}`}>
      {page === "databases" && (
        <div className="breadcrumb-title">
          <Menu size={16} />
          <span>数据库管理</span>
        </div>
      )}
      {page === "settings" && (
        <div className="breadcrumb-title">
          <span>设置</span>
          <em>/</em>
          <strong>面板设置</strong>
        </div>
      )}
      {(page === "overview" || page === "settings") && (
        <label className="mock-search">
          <Search size={13} />
          <input
            value={query}
            placeholder={page === "overview" ? "搜索主机、网站、数据库、任务..." : "搜索主机、网站、数据库、文件..."}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && query.trim()) {
                notify(`已搜索：${query.trim()}`, "info");
              }
            }}
          />
          <kbd>⌘K</kbd>
        </label>
      )}
      {page === "databases" && <div className="top-spacer" />}
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
            <HostTable />
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

function HostTable() {
  return (
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
          <tr key={host[0]}>
            <td><StatusLight tone={index === 2 ? "orange" : "green"} /> {host[0]}</td>
            <td>{host[1]}</td>
            <td><Bar value={host[2]} tone={index === 2 ? "orange" : "green"} /></td>
            <td><Bar value={host[3]} tone={index === 2 ? "red" : index === 1 ? "orange" : "green"} /></td>
            <td><Bar value={host[4]} tone={index === 2 ? "red" : index === 1 ? "orange" : "green"} /></td>
            <td><StatusLight tone={index === 2 ? "orange" : "green"} /> {host[5]}</td>
            <td><StatusLight tone="green" /> {host[6]}</td>
            <td className={index === 0 ? "" : "orange-text"}>{host[7]}</td>
            <td><MoreVertical size={17} /></td>
          </tr>
        ))}
      </tbody>
    </table>
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
