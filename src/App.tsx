import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Cloud,
  Copy,
  Cpu,
  Eye,
  GitBranch,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  Lock,
  Mail,
  MemoryStick,
  Moon,
  MoreHorizontal,
  Network,
  Play,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  Shield,
  Square,
  Sun,
  TerminalSquare,
  UploadCloud,
  Wrench,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Theme = "light" | "dark";
type NavKey =
  | "overview"
  | "servers"
  | "services"
  | "firewall"
  | "deployments"
  | "audit"
  | "settings";
type NodeState = "online" | "offline" | "warning" | "permission";
type ServiceState = "running" | "stopped" | "failed" | "deploying";
type ReleaseState = "success" | "running" | "failed" | "rollback" | "queued";
type AuditResult = "成功" | "失败" | "等待确认";
type TaskState = "running" | "waiting" | "failed";
type Tone = "success" | "warning" | "danger" | "muted" | "info";

type ServerNode = {
  id: string;
  name: string;
  host: string;
  group: string;
  tags: string[];
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
  systemInfo: Array<[string, string]>;
  activity: string[];
};

type SystemService = {
  name: string;
  node: string;
  state: ServiceState;
  port: string;
  health: "正常" | "异常" | "等待" | "部署中";
  updatedAt: string;
  description: string;
  environment: string;
  log: string[];
};

type FirewallRule = {
  id: string;
  node: string;
  action: "allow" | "deny";
  port: string;
  protocol: "tcp" | "udp";
  source: string;
  enabled: boolean;
  highRisk: boolean;
  note: string;
};

type FirewallDraft = {
  action: "allow" | "deny";
  port: string;
  protocol: "tcp" | "udp";
  source: string;
  note: string;
};

type DeploymentStep = {
  label: string;
  state: "done" | "running" | "failed" | "waiting";
};

type Deployment = {
  project: string;
  node: string;
  version: string;
  repo: string;
  branch: string;
  operator: string;
  state: ReleaseState;
  commit: string;
  duration: string;
  updatedAt: string;
  failure?: string;
  steps: DeploymentStep[];
  logs: string[];
};

type AuditEntry = {
  id: string;
  time: string;
  user: string;
  target: string;
  action: string;
  result: AuditResult;
  source: string;
  detail: string;
};

type QueueTask = {
  id: string;
  state: TaskState;
  title: string;
  target: string;
  detail: string;
  time: string;
};

type RowAction = {
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  confirm?: boolean;
  disabled?: boolean;
  title?: string;
};

type Toast = {
  tone: Tone;
  message: string;
};

const navItems: Array<{
  key: NavKey;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "overview", label: "总览", icon: LayoutDashboard },
  { key: "servers", label: "服务器", icon: Server },
  { key: "services", label: "服务", icon: TerminalSquare },
  { key: "firewall", label: "防火墙", icon: Shield },
  { key: "deployments", label: "发布", icon: GitBranch },
  { key: "audit", label: "审计", icon: ClipboardList },
  { key: "settings", label: "设置", icon: Settings },
];

const nodes: ServerNode[] = [
  {
    id: "sg-prod-01",
    name: "新加坡生产 01",
    host: "203.0.113.10",
    group: "生产",
    tags: ["API", "入口"],
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
    systemInfo: [
      ["内核", "6.8.0-31-generic"],
      ["运行时间", "18 天 6 小时"],
      ["公网 IP", "203.0.113.10"],
      ["数据目录", "/opt/demo-app"],
    ],
    activity: ["10:36 重启 nginx.service", "10:12 新增 443/tcp 规则", "09:58 Agent 心跳恢复"],
  },
  {
    id: "hk-web-02",
    name: "香港 Web 02",
    host: "10.10.8.24",
    group: "生产",
    tags: ["Web", "DB"],
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
    systemInfo: [
      ["内核", "6.1.0-21-amd64"],
      ["运行时间", "42 天 1 小时"],
      ["私网 IP", "10.10.8.24"],
      ["数据目录", "/srv/customer"],
    ],
    activity: ["10:42 发布 customer-portal", "09:12 启动 PostgreSQL", "02:10 备份完成"],
  },
  {
    id: "jp-edge-03",
    name: "东京边缘 03",
    host: "172.18.0.13",
    group: "边缘",
    tags: ["边缘", "告警"],
    os: "Ubuntu 22.04 LTS",
    state: "warning",
    load: "1.86",
    cpu: 72,
    memory: 66,
    disk: 58,
    network: "↑ 8.4 / ↓ 22.8 Mbps",
    heartbeat: "44 秒前",
    agent: "v0.1.0",
    risk: "app-web 失败",
    systemInfo: [
      ["内核", "5.15.0-91-generic"],
      ["运行时间", "9 天 3 小时"],
      ["出口", "Tokyo edge"],
      ["最近错误", "/health 502"],
    ],
    activity: ["10:12 发布失败", "10:08 app-web.service 退出", "09:50 nginx reload"],
  },
  {
    id: "lab-node-04",
    name: "测试节点 04",
    host: "192.168.1.42",
    group: "测试",
    tags: ["实验"],
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
    systemInfo: [
      ["最近心跳", "17 分钟前"],
      ["失败原因", "连接超时"],
      ["建议", "检查 stackpilot-agent"],
      ["保护", "危险操作已禁用"],
    ],
    activity: ["10:25 Agent 断开", "10:20 SSH 探测超时", "09:10 注册完成"],
  },
  {
    id: "eu-db-05",
    name: "法兰克福 DB 05",
    host: "10.30.2.15",
    group: "数据库",
    tags: ["DB", "受限"],
    os: "Rocky Linux 9",
    state: "permission",
    load: "-",
    cpu: 0,
    memory: 0,
    disk: 0,
    network: "-",
    heartbeat: "3 分钟前",
    agent: "v0.1.0",
    risk: "权限不足",
    systemInfo: [
      ["最近心跳", "3 分钟前"],
      ["失败原因", "sudo 白名单缺失"],
      ["建议", "补齐 systemctl 只读权限"],
      ["保护", "控制命令已禁用"],
    ],
    activity: ["10:39 资源读取被拒绝", "10:36 Agent 在线", "10:30 权限检查失败"],
  },
];

const services: SystemService[] = [
  {
    name: "nginx.service",
    node: "新加坡生产 01",
    state: "running",
    port: "80,443",
    health: "正常",
    updatedAt: "12 分钟前",
    description: "反向代理",
    environment: "prod / systemd",
    log: ["active (running)", "reload complete", "upstream stackpilot-agent ready"],
  },
  {
    name: "stackpilot-agent.service",
    node: "新加坡生产 01",
    state: "running",
    port: "9443",
    health: "正常",
    updatedAt: "2 分钟前",
    description: "节点连接",
    environment: "agent / stable",
    log: ["heartbeat accepted", "metrics batch sent", "command queue idle"],
  },
  {
    name: "postgresql.service",
    node: "香港 Web 02",
    state: "running",
    port: "5432",
    health: "正常",
    updatedAt: "09:12",
    description: "PostgreSQL",
    environment: "database / private",
    log: ["checkpoint complete", "backup snapshot created", "connections: 18"],
  },
  {
    name: "app-web.service",
    node: "东京边缘 03",
    state: "failed",
    port: "3000",
    health: "异常",
    updatedAt: "4 分钟前",
    description: "Node 服务",
    environment: "edge / node",
    log: ["exit code 1", "health check /health returned 502", "waiting for operator action"],
  },
  {
    name: "customer-portal.service",
    node: "香港 Web 02",
    state: "deploying",
    port: "8080",
    health: "部署中",
    updatedAt: "进行中",
    description: "客户门户",
    environment: "release / pnpm",
    log: ["pnpm build", "copy artifacts", "waiting health probe"],
  },
  {
    name: "backup.timer",
    node: "香港 Web 02",
    state: "stopped",
    port: "-",
    health: "等待",
    updatedAt: "昨天 23:00",
    description: "每日备份",
    environment: "timer / daily",
    log: ["last run success", "next run disabled", "manual start required"],
  },
];

const initialFirewallRules: FirewallRule[] = [
  {
    id: "1001",
    node: "新加坡生产 01",
    action: "allow",
    port: "22",
    protocol: "tcp",
    source: "管理 IP",
    enabled: true,
    highRisk: false,
    note: "SSH 入口，受保护",
  },
  {
    id: "1002",
    node: "新加坡生产 01",
    action: "allow",
    port: "80,443",
    protocol: "tcp",
    source: "Anywhere",
    enabled: true,
    highRisk: false,
    note: "Web 入口",
  },
  {
    id: "1003",
    node: "东京边缘 03",
    action: "allow",
    port: "0-65535",
    protocol: "tcp",
    source: "Anywhere",
    enabled: false,
    highRisk: true,
    note: "高风险规则，已禁用",
  },
  {
    id: "1004",
    node: "香港 Web 02",
    action: "deny",
    port: "5432",
    protocol: "tcp",
    source: "Anywhere",
    enabled: true,
    highRisk: false,
    note: "数据库禁止公网访问",
  },
];

const deployments: Deployment[] = [
  {
    project: "docs-web",
    node: "新加坡生产 01",
    version: "v2026.06.18",
    repo: "github.com/stackpilot/docs-web",
    branch: "main",
    operator: "admin",
    state: "success",
    commit: "8f3a91c",
    duration: "46s",
    updatedAt: "10 分钟前",
    steps: [
      { label: "拉取代码", state: "done" },
      { label: "构建产物", state: "done" },
      { label: "切换软链", state: "done" },
      { label: "健康检查", state: "done" },
    ],
    logs: ["clone main", "npm run build", "switch release", "health 200"],
  },
  {
    project: "customer-portal",
    node: "香港 Web 02",
    version: "release-31de8a0",
    repo: "gitlab.com/ops/customer-portal",
    branch: "release",
    operator: "admin",
    state: "running",
    commit: "31de8a0",
    duration: "01:18",
    updatedAt: "进行中",
    steps: [
      { label: "拉取代码", state: "done" },
      { label: "安装依赖", state: "done" },
      { label: "构建产物", state: "running" },
      { label: "健康检查", state: "waiting" },
    ],
    logs: ["收到 GitLab push", "pnpm install --frozen-lockfile", "pnpm build", "等待健康检查"],
  },
  {
    project: "status-page",
    node: "东京边缘 03",
    version: "v1.8.2",
    repo: "github.com/stackpilot/status-page",
    branch: "main",
    operator: "ops",
    state: "failed",
    commit: "b7192fd",
    duration: "22s",
    updatedAt: "36 分钟前",
    failure: "/health 返回 502，app-web.service 未运行",
    steps: [
      { label: "拉取代码", state: "done" },
      { label: "构建产物", state: "done" },
      { label: "切换软链", state: "done" },
      { label: "健康检查", state: "failed" },
    ],
    logs: ["clone main", "build complete", "switch release", "health check failed: 502"],
  },
  {
    project: "api-gateway",
    node: "新加坡生产 01",
    version: "rollback-20260618",
    repo: "github.com/stackpilot/api-gateway",
    branch: "stable",
    operator: "admin",
    state: "rollback",
    commit: "f421bb2",
    duration: "00:31",
    updatedAt: "回滚中",
    steps: [
      { label: "锁定当前版本", state: "done" },
      { label: "恢复上一版", state: "running" },
      { label: "重载服务", state: "waiting" },
      { label: "健康检查", state: "waiting" },
    ],
    logs: ["rollback requested", "restore release-20260617", "waiting nginx reload"],
  },
];

const audits: AuditEntry[] = [
  {
    id: "AUD-2052",
    time: "10:42:18",
    user: "admin",
    target: "customer-portal",
    action: "发布项目",
    result: "等待确认",
    source: "10.0.0.5 / Web",
    detail: "GitLab push release · 31de8a0",
  },
  {
    id: "AUD-2051",
    time: "10:36:03",
    user: "admin",
    target: "nginx.service",
    action: "重启服务",
    result: "成功",
    source: "10.0.0.5 / Web",
    detail: "systemctl restart nginx.service",
  },
  {
    id: "AUD-2050",
    time: "10:12:44",
    user: "ops",
    target: "status-page",
    action: "发布项目",
    result: "失败",
    source: "192.168.31.8 / API",
    detail: "/health 502，已保留失败版本",
  },
  {
    id: "AUD-2049",
    time: "09:58:21",
    user: "admin",
    target: "新加坡生产 01",
    action: "添加防火墙规则",
    result: "成功",
    source: "10.0.0.5 / Web",
    detail: "allow 443/tcp from Anywhere",
  },
  {
    id: "AUD-2048",
    time: "09:31:17",
    user: "system",
    target: "法兰克福 DB 05",
    action: "权限检查",
    result: "失败",
    source: "agent / scheduler",
    detail: "sudoers 缺少 systemctl 只读权限",
  },
];

const queueTasks: QueueTask[] = [
  {
    id: "task-4821",
    state: "running",
    title: "发布 customer-portal",
    target: "香港 Web 02",
    detail: "pnpm build",
    time: "已运行 01:18",
  },
  {
    id: "task-4819",
    state: "waiting",
    title: "确认停止 app-web.service",
    target: "东京边缘 03",
    detail: "等待二次确认",
    time: "4 分钟前",
  },
  {
    id: "task-4816",
    state: "failed",
    title: "status-page 健康检查",
    target: "东京边缘 03",
    detail: "/health 502",
    time: "36 分钟前",
  },
];

const emptyFirewallDraft: FirewallDraft = {
  action: "allow",
  port: "443",
  protocol: "tcp",
  source: "Anywhere",
  note: "",
};

const defaultSettings = {
  centerUrl: "https://panel.stackpilot.local",
  tokenTtl: "30",
  themePreference: "跟随当前",
  notifyFailedDeploy: true,
  notifyOfflineNode: true,
  notifyWebhook: false,
  loginProtection: true,
  commandAudit: true,
  upgradeChannel: "stable",
};

function App() {
  const [active, setActive] = useState<NavKey>("overview");
  const [theme, setTheme] = useState<Theme>("light");
  const [query, setQuery] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState(nodes[0].id);
  const [firewallRules, setFirewallRules] = useState(initialFirewallRules);
  const [toast, setToast] = useState<Toast | null>(null);

  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId) ?? nodes[0];
  const onlineCount = nodes.filter((node) => node.state === "online").length;
  const issueCount = nodes.filter(
    (node) => node.state !== "online",
  ).length;

  const filteredNodes = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return nodes;
    }
    return nodes.filter((node) =>
      [node.name, node.host, node.os, node.group, node.risk, ...node.tags]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }, [query]);

  const notify = (message: string, tone: Tone = "success") => {
    setToast({ message, tone });
  };

  return (
    <div className="app" data-theme={theme}>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Cloud size={22} />
          </div>
          <div>
            <strong>StackPilot</strong>
            <span>多服务器总控台</span>
          </div>
        </div>

        <nav className="nav-list">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                className={`nav-item ${active === item.key ? "active" : ""}`}
                type="button"
                aria-current={active === item.key ? "page" : undefined}
                onClick={() => setActive(item.key)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <button className="sidebar-status" type="button" onClick={() => setActive("audit")}>
          <span>
            <ClipboardList size={16} />
            待处理
          </span>
          <strong>2 条需人工确认</strong>
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">demo-sg-01 · Ubuntu 24.04 · v0.1.0</p>
            <h1>{pageTitle(active)}</h1>
          </div>
          <div className="topbar-actions">
            <StatusPill tone={issueCount ? "warning" : "success"}>
              {onlineCount}/{nodes.length} 在线
            </StatusPill>
            <ActionButton
              label="修复告警"
              icon={Wrench}
              onAction={() => notify("已创建告警修复任务", "info")}
            />
            <ActionButton
              label={theme === "light" ? "暗色" : "浅色"}
              icon={theme === "light" ? Moon : Sun}
              onAction={() => setTheme(theme === "light" ? "dark" : "light")}
            />
            <IconButton
              label="通知"
              icon={Bell}
              onAction={() => notify("当前没有新的未读通知", "info")}
            />
            <ActionButton
              label="重启中心端"
              icon={Power}
              danger
              confirm
              onAction={() => notify("已提交中心端重启确认", "warning")}
            />
          </div>
        </header>

        <section className="content-shell">
          {active === "overview" && (
            <Overview
              issueCount={issueCount}
              onlineCount={onlineCount}
              query={query}
              setQuery={setQuery}
              filteredNodes={filteredNodes}
              onSelectNode={(id) => {
                setSelectedNodeId(id);
                setActive("servers");
              }}
              onNavigate={setActive}
              notify={notify}
            />
          )}
          {active === "servers" && (
            <ServersPage
              nodes={filteredNodes}
              query={query}
              setQuery={setQuery}
              selectedNode={selectedNode}
              onSelectNode={setSelectedNodeId}
              notify={notify}
            />
          )}
          {active === "services" && <ServicesPage notify={notify} />}
          {active === "firewall" && (
            <FirewallPage
              rules={firewallRules}
              setRules={setFirewallRules}
              notify={notify}
            />
          )}
          {active === "deployments" && <DeploymentsPage notify={notify} />}
          {active === "audit" && <AuditPage />}
          {active === "settings" && (
            <SettingsPage theme={theme} setTheme={setTheme} />
          )}
        </section>
      </main>

      {toast && (
        <div className={`toast ${toast.tone}`} role="status">
          <span>{toast.message}</span>
          <button type="button" aria-label="关闭提示" onClick={() => setToast(null)}>
            <XCircle size={17} />
          </button>
        </div>
      )}
    </div>
  );
}

function Overview({
  issueCount,
  onlineCount,
  query,
  setQuery,
  filteredNodes,
  onSelectNode,
  onNavigate,
  notify,
}: {
  issueCount: number;
  onlineCount: number;
  query: string;
  setQuery: (query: string) => void;
  filteredNodes: ServerNode[];
  onSelectNode: (id: string) => void;
  onNavigate: (target: NavKey) => void;
  notify: (message: string, tone?: Tone) => void;
}) {
  const runningServices = services.filter((service) => service.state === "running").length;
  const runningDeployments = deployments.filter(
    (deployment) => deployment.state === "running" || deployment.state === "rollback",
  ).length;

  return (
    <>
      <section className="overview-strip" aria-label="关键状态">
        <MetricCell label="服务器" value={`${onlineCount}/${nodes.length}`} tone="success" />
        <MetricCell label="异常节点" value={`${issueCount}`} tone={issueCount ? "warning" : "success"} />
        <MetricCell label="运行服务" value={`${runningServices}/${services.length}`} tone="success" />
        <MetricCell label="发布中" value={`${runningDeployments}`} tone={runningDeployments ? "warning" : "muted"} />
        <MetricCell label="待审计" value="2" tone="warning" />
      </section>

      <div className="notice-line" role="status">
        <AlertTriangle size={17} />
        <span>东京边缘 03 的 app-web.service 异常，customer-portal 发布仍在等待健康检查。</span>
        <button className="text-button" type="button" onClick={() => onNavigate("services")}>
          查看服务
        </button>
      </div>

      <section className="home-layout">
        <div className="stack">
          <Panel
            title="服务器健康"
            description="核心节点、资源和连接状态"
            actions={
              <>
                <SearchBox
                  label="搜索服务器"
                  placeholder="名称 / IP / 分组"
                  value={query}
                  onChange={setQuery}
                />
                <ActionButton
                  label="刷新"
                  icon={RefreshCw}
                  onAction={() => notify("服务器状态已刷新", "success")}
                />
                <ActionButton
                  label="添加服务器"
                  icon={Plus}
                  primary
                  onAction={() => onNavigate("servers")}
                />
              </>
            }
          >
            <ServerTable
              nodes={filteredNodes}
              compact
              onSelect={onSelectNode}
              onAction={notify}
            />
          </Panel>

          <Panel title="监控趋势" description="近 1 小时采样">
            <div className="chart-grid">
              <ChartLine title="CPU" values={[22, 30, 28, 36, 34, 42]} tone="info" />
              <ChartLine title="内存" values={[44, 48, 53, 58, 57, 61]} tone="success" />
              <ChartLine title="磁盘" values={[66, 67, 68, 70, 72, 73]} tone="warning" />
              <ChartLine title="网络" values={[18, 12, 24, 20, 31, 18]} unit="Mbps" tone="info" />
            </div>
          </Panel>
        </div>

        <aside className="stack">
          <Panel title="快捷入口">
            <div className="shortcut-grid">
              {navItems.slice(1).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    className="shortcut-button"
                    type="button"
                    onClick={() => onNavigate(item.key)}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="待处理事项" description="危险操作需要二次确认">
            <TaskList />
          </Panel>

          <Panel title="最近审计">
            <AuditMiniList />
          </Panel>
        </aside>
      </section>
    </>
  );
}

function ServersPage({
  nodes: visibleNodes,
  query,
  setQuery,
  selectedNode,
  onSelectNode,
  notify,
}: {
  nodes: ServerNode[];
  query: string;
  setQuery: (query: string) => void;
  selectedNode: ServerNode;
  onSelectNode: (id: string) => void;
  notify: (message: string, tone?: Tone) => void;
}) {
  return (
    <div className="stack">
      <Panel
        title="安装 Agent"
        description="一次性 token 默认 30 分钟过期"
        actions={
          <ActionButton
            label="复制命令"
            icon={Copy}
            primary
            onAction={() => notify("安装命令已复制", "success")}
          />
        }
      >
        <div className="install-command">
          <code>
            curl -fsSL https://panel.stackpilot.local/install.sh | sudo bash -s -- --token sp_once_8f3a
          </code>
        </div>
      </Panel>

      <div className="split-layout">
        <Panel
          title="服务器列表"
          description="离线和权限不足节点已限制控制命令"
          actions={
            <>
              <SearchBox
                label="搜索服务器"
                placeholder="名称 / IP / 标签"
                value={query}
                onChange={setQuery}
              />
              <ActionButton label="刷新" icon={RefreshCw} onAction={() => notify("服务器列表已刷新", "success")} />
              <ActionButton label="添加服务器" icon={Plus} primary onAction={() => notify("已打开添加服务器流程", "info")} />
            </>
          }
        >
          <ServerTable
            nodes={visibleNodes}
            onSelect={onSelectNode}
            selectedId={selectedNode.id}
            onAction={notify}
          />
        </Panel>

        <ServerDetail node={selectedNode} notify={notify} />
      </div>
    </div>
  );
}

function ServerDetail({
  node,
  notify,
}: {
  node: ServerNode;
  notify: (message: string, tone?: Tone) => void;
}) {
  const blocked = node.state === "offline" || node.state === "permission";

  return (
    <Panel
      title="服务器详情"
      description={`${node.name} · ${node.host}`}
      actions={
        <>
          <ActionButton label="终端" icon={TerminalSquare} disabled={blocked} onAction={() => notify("已打开终端会话", "info")} />
          <ActionButton
            label="重启"
            icon={Power}
            danger
            confirm
            disabled={blocked}
            title={blocked ? "当前节点不可执行控制命令" : undefined}
            onAction={() => notify(`${node.name} 已提交重启确认`, "warning")}
          />
        </>
      }
    >
      {blocked && (
        <div className="inline-alert danger" role="alert">
          <AlertTriangle size={17} />
          <span>{node.risk}，控制命令已禁用。</span>
        </div>
      )}
      <div className="resource-grid">
        <ResourceMeter icon={Cpu} label="CPU" value={node.cpu} suffix="%" />
        <ResourceMeter icon={MemoryStick} label="内存" value={node.memory} suffix="%" />
        <ResourceMeter icon={HardDrive} label="磁盘" value={node.disk} suffix="%" tone={node.disk > 70 ? "warning" : "info"} />
        <ResourceMeter icon={Network} label="网络" value={node.network} />
      </div>
      <div className="detail-columns">
        <div className="settings-list">
          {node.systemInfo.map(([label, value]) => (
            <SettingRow key={label} label={label} value={value} />
          ))}
        </div>
        <div className="activity-list">
          {node.activity.map((item) => (
            <div key={item}>
              <Clock3 size={15} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function ServicesPage({
  notify,
}: {
  notify: (message: string, tone?: Tone) => void;
}) {
  const [selectedServiceName, setSelectedServiceName] = useState("app-web.service");
  const selectedService =
    services.find((service) => service.name === selectedServiceName) ?? services[0];

  return (
    <div className="split-layout equal">
      <Panel
        title="systemd 服务"
        description="运行状态、端口、健康检查和最近更新时间"
        actions={
          <>
            <SearchBox label="搜索服务" placeholder="服务名 / 服务器" />
            <ActionButton label="刷新" icon={RefreshCw} onAction={() => notify("服务状态已刷新", "success")} />
            <ActionButton label="添加 unit" icon={Plus} primary onAction={() => notify("已打开添加 unit 流程", "info")} />
          </>
        }
      >
        <SimpleTable
          headers={["服务", "服务器", "状态", "端口", "健康", "更新时间", "操作"]}
          rows={services.map((service) => [
            <button className="row-title" type="button" onClick={() => setSelectedServiceName(service.name)}>
              {service.name}
            </button>,
            service.node,
            <ServiceBadge state={service.state} />,
            service.port,
            <HealthBadge health={service.health} />,
            service.updatedAt,
            <ActionMenu
              actions={serviceActions(service)}
              onAction={(label) => notify(`${service.name}：${label} 已记录审计`, label === "停止" ? "warning" : "success")}
            />,
          ])}
        />
      </Panel>

      <Panel
        title="服务详情"
        description={`${selectedService.node} · ${selectedService.environment}`}
        actions={
          <>
            <ActionButton label="查看日志" icon={Eye} onAction={() => notify("日志窗口已定位到最新输出", "info")} />
            <ActionButton
              label="停止"
              icon={Square}
              danger
              confirm
              disabled={selectedService.state !== "running"}
              onAction={() => notify(`${selectedService.name} 已提交停止确认`, "warning")}
            />
          </>
        }
      >
        <div className="service-summary">
          <MetricCell label="状态" value={serviceStateText(selectedService.state)} tone={serviceTone(selectedService.state)} />
          <MetricCell label="端口" value={selectedService.port} tone="muted" />
          <MetricCell label="健康" value={selectedService.health} tone={healthTone(selectedService.health)} />
        </div>
        <div className="log-window" aria-label={`${selectedService.name} 日志`}>
          {selectedService.log.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function FirewallPage({
  rules,
  setRules,
  notify,
}: {
  rules: FirewallRule[];
  setRules: (rules: FirewallRule[]) => void;
  notify: (message: string, tone?: Tone) => void;
}) {
  const [draft, setDraft] = useState<FirewallDraft>(emptyFirewallDraft);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof FirewallDraft, boolean>>>({});
  const errors = validateFirewallDraft(draft);

  const showError = (field: keyof FirewallDraft) =>
    Boolean((submitted || touched[field]) && errors[field]);

  const updateDraft = (field: keyof FirewallDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }) as FirewallDraft);
  };

  const submitRule = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      notify("请修正防火墙规则表单", "danger");
      return;
    }

    const nextRule: FirewallRule = {
      id: `10${rules.length + 1}`,
      node: "新加坡生产 01",
      action: draft.action,
      port: draft.port,
      protocol: draft.protocol,
      source: draft.source,
      enabled: true,
      highRisk: draft.source === "Anywhere" && (draft.port.includes("0-65535") || draft.port === "22"),
      note: draft.note || "手动新增",
    };
    setRules([nextRule, ...rules]);
    setDraft(emptyFirewallDraft);
    setSubmitted(false);
    setTouched({});
    notify("规则已添加，审计 ID AUD-2060", "success");
  };

  return (
    <div className="split-layout firewall-layout">
      <Panel
        title="防火墙规则"
        description="高风险规则和禁用状态在列表中直接标识"
        actions={
          <>
            <ActionButton label="导入" onAction={() => notify("规则导入入口已打开", "info")} />
            <ActionButton label="导出" onAction={() => notify("规则已导出", "success")} />
          </>
        }
      >
        <div className="summary-row">
          <MetricCell label="开启规则" value={`${rules.filter((rule) => rule.enabled).length}`} tone="success" />
          <MetricCell label="禁用规则" value={`${rules.filter((rule) => !rule.enabled).length}`} tone="muted" />
          <MetricCell label="高风险" value={`${rules.filter((rule) => rule.highRisk).length}`} tone="warning" />
          <MetricCell label="拒绝策略" value={`${rules.filter((rule) => rule.action === "deny").length}`} tone="danger" />
        </div>
        <SimpleTable
          headers={["服务器", "策略", "端口", "协议", "来源", "状态", "备注", "操作"]}
          rows={rules.map((rule) => [
            rule.node,
            <RuleAction action={rule.action} />,
            <span className={rule.highRisk ? "risk-text" : undefined}>{rule.port}</span>,
            rule.protocol,
            rule.source,
            <StatusPill tone={rule.enabled ? "success" : "muted"}>
              {rule.enabled ? "启用" : "禁用"}
            </StatusPill>,
            rule.highRisk ? (
              <span className="risk-text">高风险 · {rule.note}</span>
            ) : (
              rule.note
            ),
            <ActionMenu
              actions={[
                { label: "编辑" },
                { label: rule.enabled ? "禁用" : "启用", confirm: rule.enabled },
                { label: "删除", danger: true, confirm: true },
              ]}
              onAction={(label) => notify(`规则 ${rule.id}：${label} 已记录`, label === "删除" ? "warning" : "success")}
            />,
          ])}
        />
      </Panel>

      <Panel title="新增规则" description="保存前校验端口、协议和来源">
        <form className="rule-form" onSubmit={submitRule}>
          <FormField label="策略">
            <select
              value={draft.action}
              onBlur={() => setTouched((value) => ({ ...value, action: true }))}
              onChange={(event) => updateDraft("action", event.currentTarget.value)}
            >
              <option value="allow">放行</option>
              <option value="deny">拒绝</option>
            </select>
          </FormField>
          <FormField label="端口" error={showError("port") ? errors.port : undefined}>
            <input
              value={draft.port}
              inputMode="numeric"
              aria-invalid={showError("port")}
              onBlur={() => setTouched((value) => ({ ...value, port: true }))}
              onChange={(event) => updateDraft("port", event.currentTarget.value)}
            />
          </FormField>
          <FormField label="协议">
            <select
              value={draft.protocol}
              onBlur={() => setTouched((value) => ({ ...value, protocol: true }))}
              onChange={(event) => updateDraft("protocol", event.currentTarget.value)}
            >
              <option value="tcp">tcp</option>
              <option value="udp">udp</option>
            </select>
          </FormField>
          <FormField label="来源" error={showError("source") ? errors.source : undefined}>
            <input
              value={draft.source}
              aria-invalid={showError("source")}
              onBlur={() => setTouched((value) => ({ ...value, source: true }))}
              onChange={(event) => updateDraft("source", event.currentTarget.value)}
            />
          </FormField>
          <FormField label="备注">
            <input
              value={draft.note}
              placeholder="可选"
              onChange={(event) => updateDraft("note", event.currentTarget.value)}
            />
          </FormField>
          <div className="inline-alert warning">
            <Lock size={17} />
            <span>保存后生成审计记录，22/tcp 与全端口规则会标为高风险。</span>
          </div>
          <ActionButton label="添加规则" icon={Plus} primary submit />
        </form>
      </Panel>
    </div>
  );
}

function DeploymentsPage({
  notify,
}: {
  notify: (message: string, tone?: Tone) => void;
}) {
  const [selectedProject, setSelectedProject] = useState("customer-portal");
  const selected =
    deployments.find((deployment) => deployment.project === selectedProject) ??
    deployments[0];

  return (
    <div className="split-layout equal">
      <Panel
        title="发布项目"
        description="失败记录保留日志与回滚入口"
        actions={
          <ActionButton
            label="新建发布"
            icon={UploadCloud}
            primary
            onAction={() => notify("已打开新建发布流程", "info")}
          />
        }
      >
        <SimpleTable
          headers={["项目", "服务器", "版本", "状态", "操作者", "更新时间", "操作"]}
          rows={deployments.map((deployment) => [
            <button
              className="row-title"
              type="button"
              onClick={() => setSelectedProject(deployment.project)}
            >
              {deployment.project}
            </button>,
            deployment.node,
            deployment.version,
            <DeploymentBadge state={deployment.state} />,
            deployment.operator,
            deployment.updatedAt,
            <ActionMenu
              actions={[
                { label: "详情", icon: Eye },
                { label: "重试", icon: Play, disabled: deployment.state === "success" },
                { label: "回滚", danger: true, confirm: true, disabled: deployment.state === "running" },
              ]}
              onAction={(label) => notify(`${deployment.project}：${label} 已记录`, label === "回滚" ? "warning" : "success")}
            />,
          ])}
        />
      </Panel>

      <Panel
        title="发布详情"
        description={`${selected.project} · ${selected.branch} · ${selected.commit}`}
        actions={
          <>
            <ActionButton label="查看日志" icon={Eye} onAction={() => notify("已定位发布日志", "info")} />
            <ActionButton
              label="回滚"
              icon={RotateCcw}
              danger
              confirm
              disabled={selected.state === "running"}
              onAction={() => notify(`${selected.project} 已提交回滚确认`, "warning")}
            />
          </>
        }
      >
        {selected.failure && (
          <div className="inline-alert danger" role="alert">
            <AlertTriangle size={17} />
            <span>{selected.failure}</span>
          </div>
        )}
        <ol className="step-list">
          {selected.steps.map((step) => (
            <li key={step.label} className={step.state}>
              <span>{step.label}</span>
              <StatusPill tone={stepTone(step.state)}>{stepText(step.state)}</StatusPill>
            </li>
          ))}
        </ol>
        <div className="log-window" aria-label={`${selected.project} 发布日志`}>
          {selected.logs.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function AuditPage() {
  const [keyword, setKeyword] = useState("");
  const [resultFilter, setResultFilter] = useState<"全部" | AuditResult>("全部");
  const [selectedAuditId, setSelectedAuditId] = useState(audits[0].id);
  const filteredAudits = audits.filter((audit) => {
    const matchesResult = resultFilter === "全部" || audit.result === resultFilter;
    const matchesKeyword = [audit.id, audit.user, audit.target, audit.action, audit.source]
      .join(" ")
      .toLowerCase()
      .includes(keyword.trim().toLowerCase());
    return matchesResult && matchesKeyword;
  });
  const selected = audits.find((audit) => audit.id === selectedAuditId) ?? audits[0];

  return (
    <div className="split-layout audit-layout">
      <Panel
        title="审计日志"
        description="操作人、对象、结果、来源和上下文"
        actions={
          <>
            <SearchBox
              label="搜索审计"
              placeholder="动作 / 对象 / ID"
              value={keyword}
              onChange={setKeyword}
            />
            <select
              className="control-select"
              aria-label="按结果筛选"
              value={resultFilter}
              onChange={(event) => setResultFilter(event.currentTarget.value as "全部" | AuditResult)}
            >
              <option>全部</option>
              <option>成功</option>
              <option>失败</option>
              <option>等待确认</option>
            </select>
          </>
        }
      >
        <SimpleTable
          headers={["时间", "操作人", "动作", "对象", "结果", "来源", "操作"]}
          emptyMessage="没有匹配的审计记录"
          rows={filteredAudits.map((audit) => [
            audit.time,
            audit.user,
            audit.action,
            audit.target,
            <AuditBadge result={audit.result} />,
            audit.source,
            <button className="text-button" type="button" onClick={() => setSelectedAuditId(audit.id)}>
              详情
            </button>,
          ])}
        />
      </Panel>

      <Panel title="审计详情" description={selected.id}>
        <div className="settings-list">
          <SettingRow label="操作人" value={selected.user} />
          <SettingRow label="目标对象" value={selected.target} />
          <SettingRow label="操作类型" value={selected.action} />
          <SettingRow label="来源" value={selected.source} />
          <SettingRow label="结果" value={selected.result} />
          <SettingRow label="上下文" value={selected.detail} />
        </div>
      </Panel>
    </div>
  );
}

function SettingsPage({
  theme,
  setTheme,
}: {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}) {
  const [settings, setSettings] = useState(defaultSettings);
  const [baseline, setBaseline] = useState(defaultSettings);
  const [feedback, setFeedback] = useState<Toast | null>(null);
  const dirty = JSON.stringify(settings) !== JSON.stringify(baseline);
  const centerUrlInvalid = !/^https:\/\/[^\s]+$/.test(settings.centerUrl);

  const save = () => {
    if (centerUrlInvalid) {
      setFeedback({ tone: "danger", message: "中心地址必须使用 https://" });
      return;
    }
    setBaseline(settings);
    setFeedback({ tone: "success", message: "设置已保存，审计 ID AUD-2061" });
  };

  return (
    <div className="settings-page">
      {feedback && (
        <div className={`inline-alert ${feedback.tone}`} role="status">
          <CheckCircle2 size={17} />
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="settings-grid">
        <Panel title="基础配置" description="中心端地址与 token 策略">
          <div className="form-grid">
            <FormField label="中心地址" error={centerUrlInvalid ? "必须是 https 地址" : undefined}>
              <input
                value={settings.centerUrl}
                aria-invalid={centerUrlInvalid}
                onChange={(event) =>
                  setSettings((value) => ({ ...value, centerUrl: event.currentTarget.value }))
                }
              />
            </FormField>
            <FormField label="一次性 token 过期时间">
              <input
                value={settings.tokenTtl}
                inputMode="numeric"
                onChange={(event) =>
                  setSettings((value) => ({ ...value, tokenTtl: event.currentTarget.value }))
                }
              />
            </FormField>
            <FormField label="升级通道">
              <select
                value={settings.upgradeChannel}
                onChange={(event) =>
                  setSettings((value) => ({ ...value, upgradeChannel: event.currentTarget.value }))
                }
              >
                <option value="stable">stable</option>
                <option value="preview">preview</option>
              </select>
            </FormField>
          </div>
        </Panel>

        <Panel title="主题偏好" description="默认浅色，暗色可选">
          <div className="theme-choice" role="group" aria-label="主题偏好">
            <button
              className={theme === "light" ? "selected" : ""}
              type="button"
              onClick={() => setTheme("light")}
            >
              <Sun size={17} />
              浅色
            </button>
            <button
              className={theme === "dark" ? "selected" : ""}
              type="button"
              onClick={() => setTheme("dark")}
            >
              <Moon size={17} />
              暗色
            </button>
          </div>
          <div className="settings-list compact">
            <SettingRow label="当前主题" value={theme === "light" ? "浅色" : "暗色"} />
            <SettingRow label="层级策略" value="同源色阶" />
          </div>
        </Panel>

        <Panel title="通知偏好" description="只保留可执行事件">
          <div className="checkbox-list">
            <CheckboxRow
              icon={UploadCloud}
              label="发布失败"
              checked={settings.notifyFailedDeploy}
              onChange={(checked) =>
                setSettings((value) => ({ ...value, notifyFailedDeploy: checked }))
              }
            />
            <CheckboxRow
              icon={Server}
              label="节点离线"
              checked={settings.notifyOfflineNode}
              onChange={(checked) =>
                setSettings((value) => ({ ...value, notifyOfflineNode: checked }))
              }
            />
            <CheckboxRow
              icon={Mail}
              label="Webhook 通知"
              checked={settings.notifyWebhook}
              onChange={(checked) =>
                setSettings((value) => ({ ...value, notifyWebhook: checked }))
              }
            />
          </div>
        </Panel>

        <Panel title="安全配置" description="登录保护和命令审计">
          <div className="checkbox-list">
            <CheckboxRow
              icon={KeyRound}
              label="登录保护"
              checked={settings.loginProtection}
              onChange={(checked) =>
                setSettings((value) => ({ ...value, loginProtection: checked }))
              }
            />
            <CheckboxRow
              icon={ClipboardList}
              label="命令审计"
              checked={settings.commandAudit}
              onChange={(checked) =>
                setSettings((value) => ({ ...value, commandAudit: checked }))
              }
            />
          </div>
        </Panel>
      </div>

      <div className="settings-actions">
        <ActionButton label="保存" icon={Save} primary disabled={!dirty} onAction={save} />
        <ActionButton
          label="取消"
          disabled={!dirty}
          onAction={() => {
            setSettings(baseline);
            setFeedback({ tone: "muted", message: "已恢复到上次保存状态" });
          }}
        />
        <ActionButton
          label="重置"
          icon={RotateCcw}
          danger
          confirm
          onAction={() => {
            setSettings(defaultSettings);
            setBaseline(defaultSettings);
            setFeedback({ tone: "warning", message: "设置已重置为默认值" });
          }}
        />
      </div>
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
  actions?: ReactNode;
  children: ReactNode;
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

function ServerTable({
  nodes: tableNodes,
  compact = false,
  selectedId,
  onSelect,
  onAction,
}: {
  nodes: ServerNode[];
  compact?: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  onAction: (message: string, tone?: Tone) => void;
}) {
  if (tableNodes.length === 0) {
    return <EmptyState title="没有匹配的服务器" detail="调整搜索条件后再试。" />;
  }

  return (
    <div className="table-wrap">
      <table className={compact ? "server-table compact" : "server-table"}>
        <thead>
          <tr>
            <th>名称 / IP</th>
            <th>状态</th>
            <th>系统</th>
            <th>分组</th>
            <th>负载</th>
            <th>CPU / 内存</th>
            <th>磁盘</th>
            <th>最近连接</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {tableNodes.map((node) => {
            const blocked = node.state === "offline" || node.state === "permission";
            return (
              <tr key={node.id} className={selectedId === node.id ? "selected-row" : undefined}>
                <td>
                  <div className="node-cell">
                    <strong>{node.name}</strong>
                    <span>{node.host}</span>
                    <div className="tag-row">
                      {node.tags.map((tag) => (
                        <em key={tag}>{tag}</em>
                      ))}
                    </div>
                  </div>
                </td>
                <td>
                  <NodeBadge state={node.state} label={node.risk} />
                </td>
                <td>{node.os}</td>
                <td>{node.group}</td>
                <td className="numeric">{node.load}</td>
                <td>
                  <ResourceStack cpu={node.cpu} memory={node.memory} />
                </td>
                <td>
                  <Usage value={node.disk} />
                </td>
                <td>{node.heartbeat}</td>
                <td>
                  <ActionMenu
                    actions={[
                      { label: "详情", icon: Eye },
                      { label: "监控", icon: Activity, disabled: blocked },
                      { label: "重启", icon: Power, danger: true, confirm: true, disabled: blocked, title: "离线或权限不足时不可执行" },
                    ]}
                    onAction={(label) => {
                      if (label === "详情" || label === "监控") {
                        onSelect(node.id);
                      }
                      onAction(`${node.name}：${label} 已处理`, label === "重启" ? "warning" : "info");
                    }}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  emptyMessage = "暂无数据",
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

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

function ActionMenu({
  actions,
  onAction,
}: {
  actions: RowAction[];
  onAction: (label: string) => void;
}) {
  return (
    <div className="action-menu">
      {actions.map((action) => (
        <ActionButton
          key={action.label}
          label={action.label}
          icon={action.icon ?? (action.label === "更多" ? MoreHorizontal : undefined)}
          compact
          danger={action.danger}
          confirm={action.confirm}
          disabled={action.disabled}
          title={action.title}
          onAction={() => onAction(action.label)}
        />
      ))}
    </div>
  );
}

function ActionButton({
  label,
  icon: Icon,
  primary = false,
  danger = false,
  compact = false,
  confirm = false,
  disabled = false,
  submit = false,
  title,
  onAction,
}: {
  label: string;
  icon?: LucideIcon;
  primary?: boolean;
  danger?: boolean;
  compact?: boolean;
  confirm?: boolean;
  disabled?: boolean;
  submit?: boolean;
  title?: string;
  onAction?: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const buttonLabel = confirm && armed ? `确认${label}` : label;

  return (
    <button
      className={[
        "action-button",
        primary ? "primary" : "",
        danger ? "danger" : "",
        compact ? "compact" : "",
        armed ? "armed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      type={submit ? "submit" : "button"}
      disabled={disabled}
      title={title}
      aria-label={buttonLabel}
      onClick={() => {
        if (submit) {
          return;
        }
        if (confirm && !armed) {
          setArmed(true);
          return;
        }
        setArmed(false);
        onAction?.();
      }}
    >
      {Icon && <Icon size={compact ? 15 : 16} />}
      <span>{buttonLabel}</span>
    </button>
  );
}

function IconButton({
  label,
  icon: Icon,
  onAction,
}: {
  label: string;
  icon: LucideIcon;
  onAction: () => void;
}) {
  return (
    <button className="icon-button" type="button" aria-label={label} title={label} onClick={onAction}>
      <Icon size={18} />
    </button>
  );
}

function SearchBox({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="search-box">
      <Search size={16} />
      <span className="sr-only">{label}</span>
      <input
        value={value ?? ""}
        placeholder={placeholder}
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
    </label>
  );
}

function MetricCell({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: Tone;
}) {
  return (
    <article className={`metric-cell ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ResourceMeter({
  icon: Icon,
  label,
  value,
  suffix = "",
  tone = "info",
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  suffix?: string;
  tone?: Tone;
}) {
  const numericValue = typeof value === "number" ? value : 0;
  return (
    <article className={`resource-meter ${tone}`}>
      <div
        className="meter-ring"
        style={{ "--meter": `${numericValue * 3.6}deg` } as CSSProperties}
        aria-hidden="true"
      >
        <span>
          <Icon size={17} />
        </span>
      </div>
      <div>
        <span>{label}</span>
        <strong>
          {value}
          {suffix}
        </strong>
      </div>
    </article>
  );
}

function Usage({ value }: { value: number }) {
  return (
    <div className="usage" aria-label={`使用率 ${value || 0}%`}>
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

function ChartLine({
  title,
  values,
  unit = "%",
  tone,
}: {
  title: string;
  values: number[];
  unit?: string;
  tone: Tone;
}) {
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 100 - value;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <article className={`chart-line ${tone}`}>
      <div>
        <strong>{title}</strong>
        <span>
          {values.at(-1)}
          {unit}
        </span>
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label={`${title} 趋势图`} preserveAspectRatio="none">
        <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
    </article>
  );
}

function TaskList() {
  return (
    <div className="task-list">
      {queueTasks.map((task) => (
        <article className="task-item" key={task.id}>
          <span className={`state-dot ${task.state}`} aria-hidden="true" />
          <div>
            <strong>{task.title}</strong>
            <p>{task.target} · {task.detail}</p>
          </div>
          <em>{task.time}</em>
        </article>
      ))}
    </div>
  );
}

function AuditMiniList() {
  return (
    <div className="audit-mini-list">
      {audits.slice(0, 4).map((audit) => (
        <article key={audit.id}>
          <span>{audit.time} · {audit.user}</span>
          <strong>{audit.action}</strong>
          <p>{audit.detail}</p>
        </article>
      ))}
    </div>
  );
}

function NodeBadge({ state, label }: { state: NodeState; label: string }) {
  const map: Record<NodeState, { text: string; tone: Tone }> = {
    online: { text: "在线", tone: label === "正常" ? "success" : "warning" },
    offline: { text: "离线", tone: "danger" },
    warning: { text: "告警", tone: "warning" },
    permission: { text: "权限不足", tone: "danger" },
  };
  const item = map[state];
  return (
    <span className={`node-badge ${item.tone}`}>
      <i aria-hidden="true" />
      <span>{item.text}</span>
      {label !== "正常" && <em>{label}</em>}
    </span>
  );
}

function ServiceBadge({ state }: { state: ServiceState }) {
  return <StatusPill tone={serviceTone(state)}>{serviceStateText(state)}</StatusPill>;
}

function DeploymentBadge({ state }: { state: ReleaseState }) {
  const map: Record<ReleaseState, { text: string; tone: Tone }> = {
    success: { text: "成功", tone: "success" },
    running: { text: "发布中", tone: "warning" },
    failed: { text: "失败", tone: "danger" },
    rollback: { text: "回滚中", tone: "warning" },
    queued: { text: "排队中", tone: "muted" },
  };
  return <StatusPill tone={map[state].tone}>{map[state].text}</StatusPill>;
}

function HealthBadge({ health }: { health: SystemService["health"] }) {
  return <StatusPill tone={healthTone(health)}>{health}</StatusPill>;
}

function AuditBadge({ result }: { result: AuditResult }) {
  const tone: Tone = result === "成功" ? "success" : result === "失败" ? "danger" : "warning";
  return <StatusPill tone={tone}>{result}</StatusPill>;
}

function StatusPill({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function RuleAction({ action }: { action: FirewallRule["action"] }) {
  return (
    <StatusPill tone={action === "allow" ? "success" : "danger"}>
      {action === "allow" ? "放行" : "拒绝"}
    </StatusPill>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {error && <em role="alert">{error}</em>}
    </label>
  );
}

function CheckboxRow({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="checkbox-row">
      <Icon size={17} />
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="empty-state">
      <ClipboardList size={22} />
      <strong>{title}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

function validateFirewallDraft(draft: FirewallDraft) {
  const errors: Partial<Record<keyof FirewallDraft, string>> = {};
  const portParts = draft.port
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (portParts.length === 0) {
    errors.port = "端口必填";
  } else if (
    !portParts.every((part) => {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map(Number);
        return Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end <= 65535 && start <= end;
      }
      const value = Number(part);
      return Number.isInteger(value) && value >= 1 && value <= 65535;
    })
  ) {
    errors.port = "端口范围必须在 1-65535";
  }

  if (!draft.source.trim()) {
    errors.source = "来源必填";
  }

  return errors;
}

function serviceActions(service: SystemService): RowAction[] {
  if (service.state === "running") {
    return [
      { label: "重启", icon: RefreshCw, confirm: true },
      { label: "日志", icon: Eye },
      { label: "停止", icon: Square, danger: true, confirm: true },
    ];
  }
  if (service.state === "deploying") {
    return [
      { label: "日志", icon: Eye },
      { label: "停止", icon: Square, danger: true, confirm: true },
    ];
  }
  return [
    { label: "启动", icon: Play },
    { label: "日志", icon: Eye },
  ];
}

function serviceStateText(state: ServiceState) {
  return {
    running: "运行中",
    stopped: "已停止",
    failed: "异常",
    deploying: "部署中",
  }[state];
}

function serviceTone(state: ServiceState): Tone {
  return {
    running: "success",
    stopped: "muted",
    failed: "danger",
    deploying: "warning",
  }[state] as Tone;
}

function healthTone(health: SystemService["health"]): Tone {
  return {
    正常: "success",
    异常: "danger",
    等待: "muted",
    部署中: "warning",
  }[health] as Tone;
}

function stepText(state: DeploymentStep["state"]) {
  return {
    done: "完成",
    running: "执行中",
    failed: "失败",
    waiting: "等待",
  }[state];
}

function stepTone(state: DeploymentStep["state"]): Tone {
  return {
    done: "success",
    running: "warning",
    failed: "danger",
    waiting: "muted",
  }[state] as Tone;
}

function pageTitle(active: NavKey) {
  return navItems.find((item) => item.key === active)?.label ?? "总览";
}

export default App;
