import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Cloud,
  Copy,
  Cpu,
  Database,
  FileTerminal,
  FolderOpen,
  GitBranch,
  Globe2,
  HardDrive,
  LayoutDashboard,
  Lock,
  MemoryStick,
  MoreHorizontal,
  Moon,
  Package,
  Plus,
  Power,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Sun,
  TerminalSquare,
  UploadCloud,
  Wrench,
} from "lucide-react";

type Theme = "light" | "dark";
type NavKey =
  | "overview"
  | "servers"
  | "monitor"
  | "websites"
  | "databases"
  | "files"
  | "terminal"
  | "services"
  | "firewall"
  | "deployments"
  | "audit"
  | "schedules"
  | "settings";
type NodeState = "online" | "offline" | "warning" | "initializing";
type ServiceState = "running" | "failed" | "inactive";
type ReleaseState = "success" | "running" | "failed" | "queued";
type AuditResult = "成功" | "失败" | "等待确认";
type TaskState = "running" | "waiting" | "failed";
type ToolTone = "default" | "warning" | "danger";

type ServerNode = {
  id: string;
  name: string;
  host: string;
  os: string;
  state: NodeState;
  load: string;
  cpu: number;
  memory: number;
  disk: number;
  network: string;
  heartbeat: string;
  agent: string;
  risk: string;
};

type SystemService = {
  name: string;
  node: string;
  state: ServiceState;
  description: string;
  lastAction: string;
};

type FirewallRule = {
  id: string;
  node: string;
  action: "allow" | "deny";
  port: string;
  protocol: "tcp" | "udp";
  from: string;
  note: string;
};

type Deployment = {
  project: string;
  node: string;
  repo: string;
  branch: string;
  profile: "静态站点" | "Node pnpm";
  state: ReleaseState;
  commit: string;
  duration: string;
  updatedAt: string;
};

type AuditEntry = {
  time: string;
  user: string;
  node: string;
  action: string;
  result: AuditResult;
  detail: string;
};

type QueueTask = {
  id: string;
  state: TaskState;
  title: string;
  node: string;
  detail: string;
  time: string;
};

type QuickEntry = {
  label: string;
  value: string;
  detail: string;
  icon: typeof LayoutDashboard;
  target: NavKey;
  tone?: ToolTone;
};

const navItems: Array<{
  key: NavKey;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: "overview", label: "首页", icon: LayoutDashboard },
  { key: "servers", label: "主机", icon: Server },
  { key: "monitor", label: "监控", icon: Activity },
  { key: "websites", label: "网站", icon: Globe2 },
  { key: "databases", label: "数据库", icon: Database },
  { key: "files", label: "文件", icon: FolderOpen },
  { key: "terminal", label: "终端", icon: FileTerminal },
  { key: "services", label: "服务", icon: TerminalSquare },
  { key: "firewall", label: "防火墙", icon: Shield },
  { key: "deployments", label: "项目发布", icon: GitBranch },
  { key: "audit", label: "审计日志", icon: ClipboardList },
  { key: "schedules", label: "计划任务", icon: Clock3 },
  { key: "settings", label: "面板设置", icon: Settings },
];

const nodes: ServerNode[] = [
  {
    id: "sg-prod-01",
    name: "新加坡生产 01",
    host: "203.0.113.10",
    os: "Ubuntu 24.04 LTS",
    state: "online",
    load: "0.42",
    cpu: 34,
    memory: 61,
    disk: 73,
    network: "↑ 2.1 / ↓ 16.3 Mbps",
    heartbeat: "12 秒前",
    agent: "v0.1.0",
    risk: "磁盘偏高",
  },
  {
    id: "hk-web-02",
    name: "香港 Web 02",
    host: "10.10.8.24",
    os: "Debian 12",
    state: "online",
    load: "0.18",
    cpu: 18,
    memory: 42,
    disk: 39,
    network: "↑ 0.7 / ↓ 6.1 Mbps",
    heartbeat: "19 秒前",
    agent: "v0.1.0",
    risk: "正常",
  },
  {
    id: "jp-edge-03",
    name: "东京边缘 03",
    host: "172.18.0.13",
    os: "Ubuntu 22.04 LTS",
    state: "warning",
    load: "1.86",
    cpu: 72,
    memory: 66,
    disk: 58,
    network: "↑ 8.4 / ↓ 22.8 Mbps",
    heartbeat: "44 秒前",
    agent: "v0.1.0",
    risk: "nginx 失败",
  },
  {
    id: "lab-node-04",
    name: "测试节点 04",
    host: "192.168.1.42",
    os: "Debian 12",
    state: "offline",
    load: "-",
    cpu: 0,
    memory: 0,
    disk: 0,
    network: "-",
    heartbeat: "17 分钟前",
    agent: "v0.0.9",
    risk: "Agent 失联",
  },
];

const services: SystemService[] = [
  {
    name: "nginx.service",
    node: "新加坡生产 01",
    state: "running",
    description: "反向代理",
    lastAction: "12 分钟前重启",
  },
  {
    name: "stackpilot-agent.service",
    node: "新加坡生产 01",
    state: "running",
    description: "节点连接",
    lastAction: "2 小时前重连",
  },
  {
    name: "postgresql.service",
    node: "香港 Web 02",
    state: "running",
    description: "PostgreSQL",
    lastAction: "09:12 启动",
  },
  {
    name: "app-web.service",
    node: "东京边缘 03",
    state: "failed",
    description: "Node 服务",
    lastAction: "4 分钟前失败",
  },
  {
    name: "backup.timer",
    node: "香港 Web 02",
    state: "inactive",
    description: "每日备份",
    lastAction: "昨天 23:00",
  },
];

const firewallRules: FirewallRule[] = [
  {
    id: "1001",
    node: "新加坡生产 01",
    action: "allow",
    port: "22",
    protocol: "tcp",
    from: "管理 IP",
    note: "SSH 入口，受保护",
  },
  {
    id: "1002",
    node: "新加坡生产 01",
    action: "allow",
    port: "80,443",
    protocol: "tcp",
    from: "Anywhere",
    note: "Web 入口",
  },
  {
    id: "1003",
    node: "香港 Web 02",
    action: "deny",
    port: "5432",
    protocol: "tcp",
    from: "Anywhere",
    note: "数据库禁止公网访问",
  },
];

const deployments: Deployment[] = [
  {
    project: "docs-web",
    node: "新加坡生产 01",
    repo: "git@github.com:stackpilot/docs-web.git",
    branch: "main",
    profile: "静态站点",
    state: "success",
    commit: "8f3a91c",
    duration: "46s",
    updatedAt: "10 分钟前",
  },
  {
    project: "customer-portal",
    node: "香港 Web 02",
    repo: "git@gitlab.com:ops/customer-portal.git",
    branch: "release",
    profile: "Node pnpm",
    state: "running",
    commit: "31de8a0",
    duration: "01:18",
    updatedAt: "进行中",
  },
  {
    project: "status-page",
    node: "东京边缘 03",
    repo: "git@github.com:stackpilot/status-page.git",
    branch: "main",
    profile: "静态站点",
    state: "failed",
    commit: "b7192fd",
    duration: "22s",
    updatedAt: "36 分钟前",
  },
];

const audits: AuditEntry[] = [
  {
    time: "10:42:18",
    user: "admin",
    node: "香港 Web 02",
    action: "发布 customer-portal",
    result: "等待确认",
    detail: "GitLab push · 31de8a0",
  },
  {
    time: "10:36:03",
    user: "admin",
    node: "新加坡生产 01",
    action: "重启 nginx.service",
    result: "成功",
    detail: "AUD-2048",
  },
  {
    time: "10:12:44",
    user: "admin",
    node: "东京边缘 03",
    action: "发布 status-page",
    result: "失败",
    detail: "/health 502",
  },
  {
    time: "09:58:21",
    user: "admin",
    node: "新加坡生产 01",
    action: "添加 ufw 规则",
    result: "成功",
    detail: "allow 443/tcp from Anywhere",
  },
];

const queueTasks: QueueTask[] = [
  {
    id: "task-4821",
    state: "running",
    title: "发布 customer-portal",
    node: "香港 Web 02",
    detail: "pnpm build",
    time: "已运行 01:18",
  },
  {
    id: "task-4819",
    state: "waiting",
    title: "确认重启 app-web.service",
    node: "东京边缘 03",
    detail: "等待二次确认",
    time: "4 分钟前",
  },
  {
    id: "task-4816",
    state: "failed",
    title: "拉取 status-page",
    node: "东京边缘 03",
    detail: "Git 退出码 128",
    time: "36 分钟前",
  },
];

const releaseLogs = [
  "10:42:19  收到 GitLab push: release",
  "10:42:20  拉取代码 31de8a0",
  "10:42:31  pnpm install --frozen-lockfile",
  "10:43:02  pnpm build",
  "10:43:09  检查 /health",
];

const quickEntries: QuickEntry[] = [
  {
    label: "网站",
    value: "12",
    detail: "2 个证书需续期",
    icon: Globe2,
    target: "websites",
    tone: "warning",
  },
  {
    label: "数据库",
    value: "5",
    detail: "昨晚备份成功",
    icon: Database,
    target: "databases",
  },
  {
    label: "文件",
    value: "/srv",
    detail: "打开文件管理",
    icon: FolderOpen,
    target: "files",
  },
  {
    label: "终端",
    value: "SSH",
    detail: "连接生产节点",
    icon: FileTerminal,
    target: "terminal",
  },
  {
    label: "服务",
    value: "5",
    detail: "1 个失败",
    icon: TerminalSquare,
    target: "services",
    tone: "danger",
  },
  {
    label: "项目",
    value: "3",
    detail: "1 个发布中",
    icon: GitBranch,
    target: "deployments",
    tone: "warning",
  },
  {
    label: "计划任务",
    value: "4",
    detail: "备份 23:00",
    icon: Clock3,
    target: "schedules",
  },
  {
    label: "防火墙",
    value: "UFW",
    detail: "22 端口已保护",
    icon: Shield,
    target: "firewall",
  },
];

const softwareList = [
  ["Nginx", "1.24.0", "运行中", "80/443"],
  ["PostgreSQL", "16.2", "运行中", "5432"],
  ["Docker", "26.1", "运行中", "-"],
  ["Redis", "7.2", "未安装", "-"],
  ["Node.js", "22.11", "运行中", "3000"],
];

const websites = [
  ["admin.stackpilot.local", "新加坡生产 01", "/srv/www/admin", "有效 26 天", "运行中"],
  ["docs.stackpilot.local", "新加坡生产 01", "/srv/www/docs", "有效 89 天", "运行中"],
  ["status.stackpilot.local", "东京边缘 03", "/srv/www/status", "未配置", "异常"],
];

const databases = [
  ["stackpilot", "PostgreSQL 16", "香港 Web 02", "1.8 GB", "今天 02:10"],
  ["audit_log", "PostgreSQL 16", "香港 Web 02", "420 MB", "今天 02:10"],
  ["cache", "Redis 7.2", "新加坡生产 01", "126 MB", "未开启"],
];

const files = [
  ["www", "/srv/www", "目录", "今天 10:20"],
  ["stackpilot", "/opt/demo-app", "目录", "今天 09:44"],
  ["nginx.conf", "/etc/nginx/nginx.conf", "4.8 KB", "昨天 18:21"],
  ["backup", "/data/demo-backup", "目录", "今天 02:10"],
];

const schedules = [
  ["数据库备份", "0 2 * * *", "香港 Web 02", "成功", "今天 02:10"],
  ["日志清理", "30 3 * * 0", "新加坡生产 01", "成功", "周日 03:30"],
  ["证书检查", "0 */6 * * *", "全部主机", "等待", "12:00"],
  ["同步 release", "手动触发", "香港 Web 02", "执行中", "01:18"],
];

function App() {
  const [active, setActive] = useState<NavKey>("overview");
  const [theme, setTheme] = useState<Theme>("light");
  const [query, setQuery] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const selectedNode = nodes[0];
  const onlineCount = nodes.filter((node) => node.state === "online").length;
  const issueCount = nodes.filter(
    (node) => node.state === "warning" || node.state === "offline",
  ).length;

  const filteredNodes = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return nodes;
    }
    return nodes.filter((node) =>
      [node.name, node.host, node.os, node.risk]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [query]);

  return (
    <div
      className={`app ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      data-theme={theme}
    >
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Cloud size={22} />
          </div>
          <div className="brand-copy">
            <strong>StackPilot</strong>
            <span>运维面板</span>
          </div>
        </div>

        <button
          className="collapse-button"
          type="button"
          aria-label={sidebarCollapsed ? "展开侧边栏" : "收起侧边栏"}
          aria-pressed={sidebarCollapsed}
          title={sidebarCollapsed ? "展开" : "收起"}
          onClick={() => setSidebarCollapsed((value) => !value)}
        >
          {sidebarCollapsed ? (
            <ChevronRight size={17} />
          ) : (
            <ChevronLeft size={17} />
          )}
        </button>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`nav-item ${active === item.key ? "active" : ""}`}
                type="button"
                title={sidebarCollapsed ? item.label : undefined}
                onClick={() => setActive(item.key)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button className="sidebar-card" type="button" onClick={() => setActive("audit")}>
          <div className="sidebar-card-title">
            <ClipboardList size={17} />
            待处理
          </div>
          <p>发布确认 1 条，失败任务 1 条。</p>
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">demo-sg-01 · Ubuntu 24.04 · 运行 18 天</p>
            <h1>{pageTitle(active)}</h1>
          </div>
          <div className="topbar-actions">
            <span className="status-pill good">
              <CheckCircle2 size={16} />
              {onlineCount}/{nodes.length} 在线
            </span>
            <button className="top-link" type="button">
              v0.1.0
            </button>
            <button className="tool-button" type="button">
              <Wrench size={16} />
              修复
            </button>
            <button className="tool-button danger-text" type="button">
              <Power size={16} />
              重启
            </button>
            <button className="icon-button" type="button" aria-label="通知">
              <Bell size={18} />
            </button>
            <button
              className="theme-button"
              type="button"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
              <span>{theme === "light" ? "暗色" : "浅色"}</span>
            </button>
          </div>
        </header>

        <section className="content-shell">
          {active === "overview" && (
            <Overview
              issueCount={issueCount}
              query={query}
              setQuery={setQuery}
              filteredNodes={filteredNodes}
              onNavigate={setActive}
            />
          )}
          {active === "servers" && <Servers nodes={filteredNodes} />}
          {active === "websites" && <Websites />}
          {active === "databases" && <Databases />}
          {active === "files" && <Files />}
          {active === "terminal" && <TerminalView node={selectedNode} />}
          {active === "monitor" && <Monitor node={selectedNode} />}
          {active === "services" && <Services />}
          {active === "firewall" && <Firewall />}
          {active === "deployments" && <Deployments />}
          {active === "audit" && <AuditLog />}
          {active === "schedules" && <Schedules />}
          {active === "settings" && <SettingsPage theme={theme} />}
        </section>
      </main>
    </div>
  );
}

function Overview({
  issueCount,
  query,
  setQuery,
  filteredNodes,
  onNavigate,
}: {
  issueCount: number;
  query: string;
  setQuery: (query: string) => void;
  filteredNodes: ServerNode[];
  onNavigate: (target: NavKey) => void;
}) {
  return (
    <>
      <section className="panel status-line" aria-label="面板状态">
        <div className="status-line-left">
          <span>账号：admin</span>
          <span>系统：Ubuntu 24.04 LTS</span>
          <span>面板：v0.1.0</span>
          <span>入口：10.0.0.5:9443</span>
        </div>
        <div className="status-line-right">
          <button className="table-link" type="button">
            检查更新
          </button>
          <button className="table-link" type="button">
            绑定账号
          </button>
          <button className="table-link danger" type="button">
            重启面板
          </button>
        </div>
      </section>

      <div className="notice-line" role="status">
        <AlertTriangle size={17} />
        <span>东京边缘 03 的 app-web.service 失败，customer-portal 发布仍在等待健康检查。</span>
        <button className="table-link" type="button" onClick={() => onNavigate("services")}>
          查看服务
        </button>
      </div>

      <section className="home-layout">
        <div className="home-main stack">
          <Panel title="快捷入口" actions={<PanelTool label="管理入口" />}>
            <div className="shortcut-grid">
              {quickEntries.map((entry) => {
                const Icon = entry.icon;
                return (
                  <button
                    className={`shortcut-card ${entry.tone ?? ""}`}
                    key={entry.label}
                    type="button"
                    onClick={() => onNavigate(entry.target)}
                  >
                    <Icon size={18} />
                    <span>{entry.label}</span>
                    <strong>{entry.value}</strong>
                    <em>{entry.detail}</em>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="状态" actions={<PanelTool label="刷新" icon={RefreshCw} />}>
            <div className="meter-grid">
              <ResourceMeter
                icon={Activity}
                label="负载"
                value="0.42"
                detail="运行流畅"
                percent={42}
              />
              <ResourceMeter
                icon={Cpu}
                label="CPU"
                value="34%"
                detail="4 核"
                percent={34}
              />
              <ResourceMeter
                icon={MemoryStick}
                label="内存"
                value="61%"
                detail="4.9 / 8 GB"
                percent={61}
              />
              <ResourceMeter
                icon={HardDrive}
                label="磁盘"
                value="73%"
                detail="/data"
                percent={73}
                tone="warning"
              />
            </div>
          </Panel>

          <Panel
            title="监控"
            actions={<SegmentedControl options={["流量", "磁盘 IO"]} />}
          >
            <div className="traffic-summary">
              <Metric label="上行" value="2.1 Mbps" />
              <Metric label="下行" value="16.3 Mbps" />
              <Metric label="总发送" value="18.4 GB" />
              <Metric label="总接收" value="142.8 GB" />
            </div>
            <div className="chart-grid tight">
              <ChartCard
                title="eth0"
                color="blue"
                unit="Mbps"
                values={[8, 11, 6, 18, 22, 16]}
              />
              <ChartCard
                title="sda IO"
                color="green"
                unit="MB/s"
                values={[3, 8, 6, 10, 7, 9]}
              />
            </div>
          </Panel>

          <Panel
            title="主机"
            description={`${filteredNodes.length} 台，${issueCount} 个需要处理`}
            actions={
              <>
                <div className="search-box compact">
                  <Search size={16} />
                  <input
                    aria-label="搜索主机"
                    placeholder="名称 / IP"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <button className="tool-button" type="button">
                  <RefreshCw size={16} />
                  刷新
                </button>
                <button className="primary-button" type="button">
                  <Plus size={16} />
                  添加主机
                </button>
              </>
            }
          >
            <ServerTable nodes={filteredNodes} compact />
            <TableFooter total={filteredNodes.length} />
          </Panel>
        </div>

        <aside className="home-side stack">
          <Panel title="软件" actions={<PanelTool label="软件商店" />}>
            <SoftwareList />
          </Panel>
          <Panel title="任务" description="需要人工确认的任务排在前面">
            <TaskList />
          </Panel>
          <Panel title="系统信息" actions={<PanelTool label="复制" icon={Copy} />}>
            <div className="settings-list compact">
              <SettingRow label="主机名" value="demo-sg-01" />
              <SettingRow label="公网 IP" value="203.0.113.10" />
              <SettingRow label="数据目录" value="/opt/demo-app" />
              <SettingRow label="启动时间" value="2026-05-30 18:12" />
            </div>
          </Panel>
          <Panel title="最近操作">
            <AuditMiniList />
          </Panel>
        </aside>
      </section>
    </>
  );
}

function Servers({ nodes }: { nodes: ServerNode[] }) {
  return (
    <div className="stack">
      <Panel
        title="安装 Agent"
        description="在目标服务器执行后会出现在主机列表。"
        actions={
          <button className="primary-button" type="button">
            <Copy size={16} />
            复制命令
          </button>
        }
      >
        <div className="install-box">
          <code>
            curl -fsSL https://panel.stackpilot.local/install.sh | sudo bash -s --
            --token sp_once_8f3a
          </code>
        </div>
      </Panel>

      <Panel
        title="主机"
        description="离线 Agent 不允许执行危险操作。"
        actions={
          <>
            <button className="tool-button" type="button">
              <RefreshCw size={16} />
              刷新
            </button>
            <button className="primary-button" type="button">
              <Plus size={16} />
              添加主机
            </button>
          </>
        }
      >
        <ServerTable nodes={nodes} />
        <TableFooter total={nodes.length} />
      </Panel>
    </div>
  );
}

function Websites() {
  return (
    <Panel
      title="网站"
      description="证书、根目录、反向代理在这里集中处理。"
      actions={
        <>
          <button className="tool-button" type="button">
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="primary-button" type="button">
            <Plus size={16} />
            添加站点
          </button>
        </>
      }
    >
      <SimpleTable
        headers={["域名", "主机", "根目录", "SSL", "状态", "操作"]}
        rows={websites.map((site) => [
          <strong>{site[0]}</strong>,
          site[1],
          site[2],
          site[3],
          <TextStatus state={site[4] === "异常" ? "failed" : "running"}>
            {site[4]}
          </TextStatus>,
          <ActionLinks labels={["设置", "日志", "证书", "更多"]} />,
        ])}
      />
      <TableFooter total={websites.length} />
    </Panel>
  );
}

function Databases() {
  return (
    <Panel
      title="数据库"
      description="公网访问默认关闭，备份状态单独显示。"
      actions={
        <>
          <button className="tool-button" type="button">
            导入
          </button>
          <button className="primary-button" type="button">
            <Plus size={16} />
            创建数据库
          </button>
        </>
      }
    >
      <SimpleTable
        headers={["名称", "类型", "主机", "大小", "备份", "操作"]}
        rows={databases.map((db) => [
          <strong>{db[0]}</strong>,
          db[1],
          db[2],
          db[3],
          db[4],
          <ActionLinks labels={["管理", "备份", "权限", "更多"]} />,
        ])}
      />
      <TableFooter total={databases.length} />
    </Panel>
  );
}

function Files() {
  return (
    <Panel
      title="文件"
      description="当前路径：/srv"
      actions={
        <>
          <button className="tool-button" type="button">
            上传
          </button>
          <button className="tool-button" type="button">
            远程下载
          </button>
          <button className="primary-button" type="button">
            <Plus size={16} />
            新建
          </button>
        </>
      }
    >
      <div className="file-toolbar">
        <button className="table-link" type="button">
          /srv
        </button>
        <span>/</span>
        <button className="table-link" type="button">
          www
        </button>
        <div className="search-box compact">
          <Search size={16} />
          <input aria-label="搜索文件" placeholder="搜索文件名" />
        </div>
      </div>
      <SimpleTable
        headers={["名称", "路径", "大小/类型", "修改时间", "操作"]}
        rows={files.map((file) => [
          <span className="file-name">
            <FolderOpen size={16} />
            <strong>{file[0]}</strong>
          </span>,
          file[1],
          file[2],
          file[3],
          <ActionLinks labels={["打开", "权限", "压缩", "删除"]} dangerLast />,
        ])}
      />
      <TableFooter total={files.length} />
    </Panel>
  );
}

function TerminalView({ node }: { node: ServerNode }) {
  return (
    <div className="split-layout equal">
      <Panel
        title="终端"
        description={`${node.name} · ${node.host}`}
        actions={
          <>
            <button className="tool-button" type="button">
              断开
            </button>
            <button className="primary-button" type="button">
              新建会话
            </button>
          </>
        }
      >
        <div className="terminal-window" aria-label="终端输出">
          <p>Last login: Wed Jun 17 10:43:20 from 10.0.0.5</p>
          <p>root@sg-prod-01:~# systemctl status nginx --no-pager</p>
          <p className="terminal-ok">active (running) since Wed 2026-06-17 09:31:05 CST</p>
          <p>root@sg-prod-01:~# tail -f /var/log/stackpilot/agent.log</p>
          <p className="terminal-cursor">等待输出...</p>
        </div>
      </Panel>

      <Panel title="会话" description="危险命令需要二次确认。">
        <div className="settings-list">
          <SettingRow label="当前用户" value="root" />
          <SettingRow label="Shell" value="/bin/bash" />
          <SettingRow label="审计 ID" value="AUD-2051" />
          <SettingRow label="空闲断开" value="30 分钟" />
        </div>
      </Panel>
    </div>
  );
}

function Monitor({ node }: { node: ServerNode }) {
  return (
    <div className="stack">
      <Panel
        title={`${node.name} 监控`}
        description="采样间隔 15 秒。"
        actions={
          <>
            <SegmentedControl options={["近 1 小时", "6 小时", "24 小时"]} />
            <button className="tool-button" type="button">
              <ChevronDown size={16} />
              eth0
            </button>
          </>
        }
      >
        <div className="traffic-summary">
          <Metric label="负载" value={node.load} />
          <Metric label="CPU" value={`${node.cpu}%`} />
          <Metric label="内存" value={`${node.memory}%`} />
          <Metric label="磁盘" value={`${node.disk}%`} />
        </div>
        <div className="chart-grid">
          <ChartCard title="CPU" color="blue" values={[22, 30, 28, 36, 34, 42]} />
          <ChartCard
            title="内存"
            color="green"
            values={[44, 48, 53, 58, 57, 61]}
          />
          <ChartCard
            title="磁盘"
            color="orange"
            values={[66, 67, 68, 70, 72, 73]}
          />
          <ChartCard
            title="网络"
            color="blue"
            unit="Mbps"
            values={[18, 12, 24, 20, 31, 18]}
          />
        </div>
      </Panel>
    </div>
  );
}

function Services() {
  return (
    <Panel
      title="systemd 服务"
      description="失败服务优先处理，停止和重启会记录审计 ID。"
      actions={
        <>
          <div className="search-box compact">
            <Search size={16} />
            <input aria-label="搜索服务" placeholder="服务名 / 主机" />
          </div>
          <button className="tool-button" type="button">
            <RefreshCw size={16} />
            刷新
          </button>
          <button className="primary-button" type="button">
            <Plus size={16} />
            添加 unit
          </button>
        </>
      }
    >
      <SimpleTable
        headers={["服务", "服务器", "状态", "类型", "最近动作", "操作"]}
        rows={services.map((service) => [
          <strong>{service.name}</strong>,
          service.node,
          <StateBadge state={service.state} />,
          service.description,
          service.lastAction,
          <ActionLinks
            labels={
              service.state === "running"
                ? ["重启", "日志", "停止", "更多"]
                : ["启动", "日志", "更多"]
            }
            dangerIndex={service.state === "running" ? 2 : undefined}
          />,
        ])}
      />
      <TableFooter total={services.length} />
    </Panel>
  );
}

function Firewall() {
  return (
    <div className="split-layout firewall-layout">
      <Panel
        title="防火墙"
        description="只开放必要端口，SSH 入口单独保护。"
        actions={
          <>
            <button className="tool-button" type="button">
              导入
            </button>
            <button className="tool-button" type="button">
              导出
            </button>
            <button className="primary-button" type="button">
              <Plus size={16} />
              添加端口
            </button>
          </>
        }
      >
        <div className="tabs-line" role="tablist" aria-label="防火墙分类">
          <button className="active" type="button">
            系统防火墙
          </button>
          <button type="button">SSH 管理</button>
          <button type="button">端口规则</button>
          <button type="button">日志</button>
        </div>
        <div className="safety-bar">
          <Metric label="防火墙" value="开启" />
          <Metric label="SSH 端口" value="22" />
          <Metric label="放行规则" value="2" />
          <Metric label="拒绝规则" value="1" />
        </div>
        <SimpleTable
          headers={["服务器", "动作", "端口", "协议", "来源", "备注", "操作"]}
          rows={firewallRules.map((rule) => [
            rule.node,
            <RuleAction action={rule.action} />,
            rule.port,
            rule.protocol,
            rule.from,
            rule.note,
            <ActionLinks labels={["编辑", "删除"]} dangerLast />,
          ])}
        />
        <TableFooter total={firewallRules.length} />
      </Panel>

      <Panel title="添加端口" description="22/tcp 已锁定，避免误断 SSH。">
        <form className="rule-form">
          <label>
            动作
            <select defaultValue="allow">
              <option value="allow">放行</option>
              <option value="deny">拒绝</option>
            </select>
          </label>
          <label>
            端口
            <input defaultValue="443" />
          </label>
          <label>
            协议
            <select defaultValue="tcp">
              <option>tcp</option>
              <option>udp</option>
            </select>
          </label>
          <label>
            来源
            <input defaultValue="Anywhere" />
          </label>
          <div className="warning-callout">
            <Lock size={17} />
            保存后生成审计 ID，可在日志页追踪。
          </div>
          <button className="primary-button" type="button">
            添加规则
          </button>
        </form>
      </Panel>
    </div>
  );
}

function Deployments() {
  return (
    <div className="split-layout equal">
      <Panel
        title="项目"
        description="发布前拉取代码，失败会保留完整日志。"
        actions={
          <button className="primary-button" type="button">
            <UploadCloud size={16} />
            新建项目
          </button>
        }
      >
        <DeploymentTable />
      </Panel>

      <Panel title="发布日志" description="customer-portal · release">
        <div className="log-window" aria-label="发布日志">
          {releaseLogs.map((log) => (
            <p key={log}>{log}</p>
          ))}
          <p className="log-cursor">10:43:15  等待健康检查返回...</p>
        </div>
      </Panel>
    </div>
  );
}

function AuditLog() {
  return (
    <Panel
      title="审计日志"
      description="按服务器、动作、结果筛选。"
      actions={<SegmentedControl options={["今天", "7 天", "30 天"]} />}
    >
      <div className="filter-row">
        <div className="search-box compact">
          <Search size={16} />
          <input aria-label="搜索操作记录" placeholder="动作 / 服务器 / ID" />
        </div>
        <button className="tool-button" type="button">
          <ChevronDown size={16} />
          结果
        </button>
        <button className="tool-button" type="button">
          <ChevronDown size={16} />
          主机
        </button>
      </div>
      <SimpleTable
        headers={["时间", "账号", "服务器", "动作", "结果", "详情"]}
        rows={audits.map((audit) => [
          audit.time,
          audit.user,
          audit.node,
          audit.action,
          <AuditBadge result={audit.result} />,
          audit.detail,
        ])}
      />
      <TableFooter total={audits.length} />
    </Panel>
  );
}

function Schedules() {
  return (
    <Panel
      title="计划任务"
      description="备份、清理、证书检查和发布同步。"
      actions={
        <button className="primary-button" type="button">
          <Plus size={16} />
          添加任务
        </button>
      }
    >
      <SimpleTable
        headers={["任务", "周期", "主机", "结果", "最近执行", "操作"]}
        rows={schedules.map((schedule) => [
          <strong>{schedule[0]}</strong>,
          schedule[1],
          schedule[2],
          <TextStatus state={schedule[3] === "成功" ? "running" : "queued"}>
            {schedule[3]}
          </TextStatus>,
          schedule[4],
          <ActionLinks labels={["执行", "日志", "编辑", "删除"]} dangerLast />,
        ])}
      />
      <TableFooter total={schedules.length} />
    </Panel>
  );
}

function SettingsPage({ theme }: { theme: Theme }) {
  return (
    <div className="settings-grid">
      <Panel title="面板入口" description="中心端 demo-sg-01">
        <div className="settings-list">
          <SettingRow label="访问地址" value="https://panel.stackpilot.local" />
          <SettingRow label="绑定账号" value="admin" />
          <SettingRow label="登录保护" value="开启" />
          <SettingRow label="当前主题" value={theme === "light" ? "浅色" : "暗色"} />
        </div>
      </Panel>
      <Panel title="Agent 注册" description="一次性 token 默认 30 分钟过期。">
        <div className="settings-list">
          <SettingRow label="注册通道" value="stable" />
          <SettingRow label="最新 Agent" value="v0.1.0" />
          <SettingRow label="心跳超时" value="90 秒" />
          <SettingRow label="命令审计" value="开启" />
        </div>
      </Panel>
      <Panel title="数据与备份" description="不保留无用历史。">
        <div className="settings-list">
          <SettingRow label="指标数据" value="30 天" />
          <SettingRow label="发布记录" value="20 次/项目" />
          <SettingRow label="备份目录" value="/data/demo-backup" />
          <SettingRow label="升级通道" value="stable" />
        </div>
      </Panel>
    </div>
  );
}

function Panel({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

function PanelTool({
  label,
  icon: Icon,
}: {
  label: string;
  icon?: typeof LayoutDashboard;
}) {
  return (
    <button className="tool-button" type="button">
      {Icon && <Icon size={16} />}
      {label}
    </button>
  );
}

function ServerTable({
  nodes,
  compact = false,
}: {
  nodes: ServerNode[];
  compact?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className={compact ? "server-table compact" : "server-table"}>
        <thead>
          <tr>
            <th>
              <input aria-label="选择全部主机" type="checkbox" />
            </th>
            <th>名称 / IP</th>
            <th>状态</th>
            <th>系统</th>
            <th>负载</th>
            <th>资源</th>
            <th>磁盘</th>
            <th>Agent</th>
            <th>最后连接</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.id}>
              <td>
                <input aria-label={`选择 ${node.name}`} type="checkbox" />
              </td>
              <td>
                <div className="node-cell">
                  <strong>{node.name}</strong>
                  <span>{node.host}</span>
                </div>
              </td>
              <td>
                <NodeBadge state={node.state} label={node.risk} />
              </td>
              <td>{node.os}</td>
              <td className="numeric">{node.load}</td>
              <td>
                <ResourceStack cpu={node.cpu} memory={node.memory} />
              </td>
              <td>
                <Usage value={node.disk} />
              </td>
              <td>{node.agent}</td>
              <td>{node.heartbeat}</td>
              <td>
                <ActionLinks labels={["终端", "文件", "监控", "更多"]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeploymentTable() {
  return (
    <>
      <SimpleTable
        headers={["项目", "主机", "仓库", "分支", "类型", "状态", "提交", "耗时", "更新时间", "操作"]}
        rows={deployments.map((deployment) => [
          <strong>{deployment.project}</strong>,
          deployment.node,
          deployment.repo,
          deployment.branch,
          deployment.profile,
          <StateBadge state={deployment.state} />,
          deployment.commit,
          deployment.duration,
          deployment.updatedAt,
          <ActionLinks labels={["发布", "日志", "回滚", "更多"]} dangerIndex={2} />,
        ])}
      />
      <TableFooter total={deployments.length} />
    </>
  );
}

function SimpleTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableFooter({ total }: { total: number }) {
  return (
    <div className="table-footer">
      <span>共 {total} 条</span>
      <div>
        <span>10 条/页</span>
        <strong>1</strong>
      </div>
    </div>
  );
}

function ActionLinks({
  labels,
  dangerLast = false,
  dangerIndex,
}: {
  labels: string[];
  dangerLast?: boolean;
  dangerIndex?: number;
}) {
  return (
    <div className="action-links">
      {labels.map((label, index) => {
        const isDanger = dangerLast
          ? index === labels.length - 1
          : dangerIndex === index;
        return (
          <span key={label} className="action-link-wrap">
            <button
              className={`table-link ${isDanger ? "danger" : ""}`}
              type="button"
            >
              {label === "更多" ? <MoreHorizontal size={15} /> : label}
            </button>
          </span>
        );
      })}
    </div>
  );
}

function Usage({ value }: { value: number }) {
  return (
    <div className="usage">
      <span>{value ? `${value}%` : "-"}</span>
      <div className="usage-track" aria-hidden="true">
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ResourceStack({ cpu, memory }: { cpu: number; memory: number }) {
  return (
    <div className="resource-stack">
      <Usage value={cpu} />
      <Usage value={memory} />
    </div>
  );
}

function ResourceMeter({
  icon: Icon,
  label,
  value,
  detail,
  percent,
  tone = "default",
}: {
  icon: typeof LayoutDashboard;
  label: string;
  value: string;
  detail: string;
  percent: number;
  tone?: "default" | "warning";
}) {
  return (
    <article
      className={`resource-meter ${tone}`}
      style={{ "--value": `${percent * 3.6}deg` } as React.CSSProperties}
    >
      <div className="meter-ring" aria-hidden="true">
        <span>
          <Icon size={18} />
        </span>
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <em>{detail}</em>
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ChartCard({
  title,
  values,
  color,
  unit = "%",
}: {
  title: string;
  values: number[];
  color: string;
  unit?: string;
}) {
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - value;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <article className="chart-card">
      <div className="chart-title">
        <strong>{title}</strong>
        <span>
          {values.at(-1)}
          {unit}
        </span>
      </div>
      <svg
        className={`line-chart ${color}`}
        viewBox="0 0 100 100"
        role="img"
        aria-label={`${title} 趋势图`}
        preserveAspectRatio="none"
      >
        <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
    </article>
  );
}

function SoftwareList() {
  return (
    <div className="software-list">
      {softwareList.map(([name, version, state, port]) => (
        <article className="software-row" key={name}>
          <Package size={17} />
          <div>
            <strong>{name}</strong>
            <span>
              {version} · {port}
            </span>
          </div>
          <TextStatus state={state === "未安装" ? "inactive" : "running"}>
            {state}
          </TextStatus>
        </article>
      ))}
    </div>
  );
}

function TaskList() {
  return (
    <div className="task-list">
      {queueTasks.map((task) => (
        <article className="task-item" key={task.id}>
          <StateDot state={task.state} />
          <div>
            <strong>{task.title}</strong>
            <p>
              {task.node} · {task.detail}
            </p>
          </div>
          <span>{task.time}</span>
        </article>
      ))}
    </div>
  );
}

function StateDot({ state }: { state: TaskState }) {
  return (
    <span
      className={`state-dot ${state}`}
      aria-label={
        state === "running" ? "执行中" : state === "waiting" ? "等待" : "失败"
      }
      role="img"
    />
  );
}

function AuditMiniList() {
  return (
    <div className="audit-mini-list">
      {audits.slice(0, 3).map((audit) => (
        <div key={audit.time}>
          <span>{audit.time}</span>
          <strong>{audit.action}</strong>
          <p>{audit.detail}</p>
        </div>
      ))}
    </div>
  );
}

function SegmentedControl({ options }: { options: string[] }) {
  return (
    <div className="segmented" role="group" aria-label="切换范围">
      {options.map((option, index) => (
        <button
          className={index === 0 ? "selected" : ""}
          key={option}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function NodeBadge({ state, label }: { state: NodeState; label: string }) {
  const text = {
    online: "在线",
    offline: "离线",
    warning: "告警",
    initializing: "初始化",
  }[state];

  return (
    <span className={`node-status ${state}`}>
      <i aria-hidden="true" />
      <span>{text}</span>
      {label !== "正常" && <em>{label}</em>}
    </span>
  );
}

function StateBadge({ state }: { state: ServiceState | ReleaseState }) {
  const map: Record<ServiceState | ReleaseState, string> = {
    running: "运行中",
    failed: "失败",
    inactive: "未运行",
    success: "成功",
    queued: "排队中",
  };

  return <TextStatus state={state}>{map[state]}</TextStatus>;
}

function TextStatus({
  state,
  children,
}: {
  state: ServiceState | ReleaseState;
  children: React.ReactNode;
}) {
  return <span className={`text-status ${state}`}>{children}</span>;
}

function RuleAction({ action }: { action: "allow" | "deny" }) {
  return (
    <span className={`rule-action ${action}`}>
      {action === "allow" ? "放行" : "拒绝"}
    </span>
  );
}

function AuditBadge({ result }: { result: AuditResult }) {
  const className =
    result === "成功" ? "success" : result === "失败" ? "failed" : "pending";

  return <span className={`audit-badge ${className}`}>{result}</span>;
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function pageTitle(active: NavKey) {
  return navItems.find((item) => item.key === active)?.label ?? "首页";
}

export default App;
