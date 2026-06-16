import { useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Cloud,
  Code2,
  Copy,
  Database,
  GitBranch,
  HardDrive,
  LayoutDashboard,
  Lock,
  Moon,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Settings,
  Shield,
  Square,
  Sun,
  TerminalSquare,
  UploadCloud,
} from "lucide-react";

type Theme = "light" | "dark";
type NavKey =
  | "overview"
  | "servers"
  | "monitor"
  | "services"
  | "firewall"
  | "deployments"
  | "audit"
  | "settings";
type NodeState = "online" | "offline" | "warning" | "initializing";
type ServiceState = "running" | "failed" | "inactive";
type ReleaseState = "success" | "running" | "failed" | "queued";
type AuditResult = "成功" | "失败" | "等待确认";

type ServerNode = {
  id: string;
  name: string;
  host: string;
  os: string;
  state: NodeState;
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
  profile: "Static" | "Node pnpm";
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

const navItems: Array<{
  key: NavKey;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { key: "overview", label: "总览", icon: LayoutDashboard },
  { key: "servers", label: "服务器", icon: Server },
  { key: "monitor", label: "监控", icon: Activity },
  { key: "services", label: "服务", icon: TerminalSquare },
  { key: "firewall", label: "防火墙", icon: Shield },
  { key: "deployments", label: "发布", icon: GitBranch },
  { key: "audit", label: "审计日志", icon: ClipboardList },
  { key: "settings", label: "设置", icon: Settings },
];

const nodes: ServerNode[] = [
  {
    id: "sg-prod-01",
    name: "新加坡生产 01",
    host: "213.111.158.139",
    os: "Ubuntu 24.04 LTS",
    state: "online",
    cpu: 34,
    memory: 61,
    disk: 73,
    network: "18.4 Mbps",
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
    cpu: 18,
    memory: 42,
    disk: 39,
    network: "6.8 Mbps",
    heartbeat: "19 秒前",
    agent: "v0.1.0",
    risk: "健康",
  },
  {
    id: "jp-edge-03",
    name: "东京边缘 03",
    host: "172.18.0.13",
    os: "Ubuntu 22.04 LTS",
    state: "warning",
    cpu: 72,
    memory: 66,
    disk: 58,
    network: "31.2 Mbps",
    heartbeat: "44 秒前",
    agent: "v0.1.0",
    risk: "nginx failed",
  },
  {
    id: "lab-node-04",
    name: "测试节点 04",
    host: "192.168.1.42",
    os: "Debian 12",
    state: "offline",
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
    description: "反向代理与静态资源服务",
    lastAction: "12 分钟前 restart 成功",
  },
  {
    name: "stackpilot-agent.service",
    node: "新加坡生产 01",
    state: "running",
    description: "StackPilot Agent",
    lastAction: "2 小时前自动重连",
  },
  {
    name: "postgresql.service",
    node: "香港 Web 02",
    state: "running",
    description: "PostgreSQL 数据库",
    lastAction: "今天 09:12 start 成功",
  },
  {
    name: "app-web.service",
    node: "东京边缘 03",
    state: "failed",
    description: "Node 前端服务",
    lastAction: "4 分钟前健康检查失败",
  },
  {
    name: "backup.timer",
    node: "香港 Web 02",
    state: "inactive",
    description: "每日备份计划",
    lastAction: "昨天 23:00 执行完成",
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
    repo: "github.com/acme/docs-web",
    branch: "main",
    profile: "Static",
    state: "success",
    commit: "8f3a91c",
    duration: "46s",
    updatedAt: "10 分钟前",
  },
  {
    project: "customer-portal",
    node: "香港 Web 02",
    repo: "gitlab.com/acme/customer-portal",
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
    repo: "github.com/acme/status-page",
    branch: "main",
    profile: "Static",
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
    detail: "Webhook 触发，commit 31de8a0",
  },
  {
    time: "10:36:03",
    user: "admin",
    node: "新加坡生产 01",
    action: "重启 nginx.service",
    result: "成功",
    detail: "审计 ID AUD-2048",
  },
  {
    time: "10:12:44",
    user: "admin",
    node: "东京边缘 03",
    action: "发布 status-page",
    result: "失败",
    detail: "健康检查 /health 返回 502",
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

const releaseLogs = [
  "[10:42:19] webhook verified: GitLab push refs/heads/release",
  "[10:42:20] checkout 31de8a0 into releases/31de8a0",
  "[10:42:31] pnpm install --frozen-lockfile completed",
  "[10:43:02] pnpm build completed",
  "[10:43:09] waiting for health check /health",
];

function App() {
  const [active, setActive] = useState<NavKey>("overview");
  const [theme, setTheme] = useState<Theme>("light");
  const [query, setQuery] = useState("");

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
    <div className="app" data-theme={theme}>
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <Cloud size={22} />
          </div>
          <div>
            <strong>StackPilot</strong>
            <span>服务器总控台</span>
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
                onClick={() => setActive(item.key)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-card">
          <div className="sidebar-card-title">
            <Shield size={17} />
            安全策略
          </div>
          <p>危险操作默认二次确认，所有写操作进入审计日志。</p>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">中心端在线 · gRPC Agent 通道正常</p>
            <h1>{pageTitle(active)}</h1>
          </div>
          <div className="topbar-actions">
            <div className="status-pill good">
              <CheckCircle2 size={16} />
              {onlineCount}/{nodes.length} 在线
            </div>
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
            />
          )}
          {active === "servers" && <Servers nodes={filteredNodes} />}
          {active === "monitor" && <Monitor node={selectedNode} />}
          {active === "services" && <Services />}
          {active === "firewall" && <Firewall />}
          {active === "deployments" && <Deployments />}
          {active === "audit" && <AuditLog />}
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
}: {
  issueCount: number;
  query: string;
  setQuery: (query: string) => void;
  filteredNodes: ServerNode[];
}) {
  return (
    <>
      <section className="metric-grid" aria-label="服务器健康摘要">
        <MetricCard
          icon={Server}
          label="托管服务器"
          value={`${nodes.length} 台`}
          trend="3 台已完成初始化"
        />
        <MetricCard
          icon={Activity}
          label="平均 CPU"
          value="31%"
          trend="近 15 分钟稳定"
        />
        <MetricCard
          icon={HardDrive}
          label="磁盘最高占用"
          value="73%"
          trend="建议关注新加坡生产 01"
        />
        <MetricCard
          icon={Shield}
          label="待处理事项"
          value={`${issueCount} 项`}
          trend="服务异常与 Agent 失联"
          tone="warning"
        />
      </section>

      <section className="split-layout">
        <Panel
          title="服务器列表"
          description="参考多节点面板的信息组织，保留常用安全操作入口。"
          actions={
            <>
              <div className="search-box">
                <Search size={17} />
                <input
                  aria-label="搜索服务器"
                  placeholder="搜索名称、IP、系统或风险"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <button className="primary-button" type="button">
                <Plus size={17} />
                添加服务器
              </button>
            </>
          }
        >
          <ServerTable nodes={filteredNodes} compact />
        </Panel>

        <aside className="stack">
          <Panel title="需要处理" description="新手优先看到影响最大的状态。">
            <div className="todo-list">
              <TodoItem
                tone="warning"
                title="app-web.service 异常"
                detail="东京边缘 03 健康检查失败，建议查看日志后重启。"
              />
              <TodoItem
                tone="danger"
                title="测试节点 Agent 失联"
                detail="最后心跳 17 分钟前，检查网络和 systemd 状态。"
              />
              <TodoItem
                tone="info"
                title="磁盘接近阈值"
                detail="新加坡生产 01 已达 73%，建议清理旧发布版本。"
              />
            </div>
          </Panel>

          <Panel title="最近审计" description="所有关键动作可追踪。">
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
        title="添加服务器"
        description="中心生成一次性安装命令，Agent 安装后主动连接中心。"
        actions={
          <button className="primary-button" type="button">
            <Copy size={17} />
            复制安装命令
          </button>
        }
      >
        <div className="install-box">
          <code>
            curl -fsSL https://panel.example.com/install.sh | sudo bash -s --
            --token sp_once_xxxx
          </code>
        </div>
      </Panel>

      <Panel
        title="服务器"
        description="状态、资源、Agent 版本和常用操作集中呈现。"
      >
        <ServerTable nodes={nodes} />
      </Panel>
    </div>
  );
}

function Monitor({ node }: { node: ServerNode }) {
  return (
    <div className="stack">
      <Panel
        title={`${node.name} 资源监控`}
        description="折线图保持清晰，不做复杂大屏效果。"
        actions={
          <SegmentedControl options={["近 1 小时", "6 小时", "24 小时"]} />
        }
      >
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
            color="violet"
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
      description="只允许对白名单服务执行 start、stop、restart，并写入审计。"
      actions={
        <>
          <button className="secondary-button" type="button">
            <RefreshCw size={17} />
            刷新
          </button>
          <button className="primary-button" type="button">
            <Plus size={17} />
            登记服务
          </button>
        </>
      }
    >
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>服务</th>
              <th>服务器</th>
              <th>状态</th>
              <th>说明</th>
              <th>最近动作</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={`${service.node}-${service.name}`}>
                <td>
                  <strong>{service.name}</strong>
                </td>
                <td>{service.node}</td>
                <td>
                  <StateBadge state={service.state} />
                </td>
                <td>{service.description}</td>
                <td>{service.lastAction}</td>
                <td>
                  <div className="row-actions">
                    <button className="ghost-button" type="button">
                      <Play size={15} />
                      start
                    </button>
                    <button className="ghost-button" type="button">
                      <RotateCcw size={15} />
                      restart
                    </button>
                    <button className="danger-button" type="button">
                      <Square size={14} />
                      stop
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Firewall() {
  return (
    <div className="split-layout equal">
      <Panel
        title="ufw 规则"
        description="只做单条 allow/deny 规则，不覆盖整套防火墙配置。"
      >
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>服务器</th>
                <th>动作</th>
                <th>端口</th>
                <th>协议</th>
                <th>来源</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {firewallRules.map((rule) => (
                <tr key={rule.id}>
                  <td>{rule.node}</td>
                  <td>
                    <span className={`rule-action ${rule.action}`}>
                      {rule.action}
                    </span>
                  </td>
                  <td>{rule.port}</td>
                  <td>{rule.protocol}</td>
                  <td>{rule.from}</td>
                  <td>{rule.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="添加单条规则"
        description="危险端口会显示强提示，并要求二次确认。"
      >
        <form className="rule-form">
          <label>
            动作
            <select defaultValue="allow">
              <option>allow</option>
              <option>deny</option>
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
            SSH 相关规则受保护，变更前会检查当前连接入口。
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
        title="项目发布"
        description="GitHub/GitLab Webhook 触发声明式发布，禁止任意 shell。"
        actions={
          <button className="primary-button" type="button">
            <UploadCloud size={17} />
            新建项目
          </button>
        }
      >
        <div className="deployment-list">
          {deployments.map((deployment) => (
            <article className="deployment-card" key={deployment.project}>
              <div>
                <div className="deployment-title">
                  <Code2 size={18} />
                  <strong>{deployment.project}</strong>
                  <StateBadge state={deployment.state} />
                </div>
                <p>{deployment.repo}</p>
              </div>
              <div className="deployment-meta">
                <span>{deployment.node}</span>
                <span>{deployment.branch}</span>
                <span>{deployment.profile}</span>
                <span>{deployment.commit}</span>
              </div>
              <div className="row-actions">
                <button className="ghost-button" type="button">
                  发布
                </button>
                <button className="ghost-button" type="button">
                  回滚
                </button>
                <button className="icon-button small" type="button" aria-label="更多">
                  <MoreHorizontal size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      </Panel>

      <Panel
        title="实时发布日志"
        description="MCSM 式阶段反馈，但仅显示结构化发布任务。"
      >
        <div className="log-window" aria-label="发布日志">
          {releaseLogs.map((log) => (
            <p key={log}>{log}</p>
          ))}
          <p className="log-cursor">[10:43:15] waiting...</p>
        </div>
      </Panel>
    </div>
  );
}

function AuditLog() {
  return (
    <Panel
      title="审计日志"
      description="按时间、服务器、动作、结果筛选，所有关键操作可解释。"
      actions={<SegmentedControl options={["今天", "7 天", "30 天"]} />}
    >
      <div className="filter-row">
        <div className="search-box">
          <Search size={17} />
          <input aria-label="搜索审计日志" placeholder="搜索动作、服务器或详情" />
        </div>
        <button className="secondary-button" type="button">
          <ChevronDown size={17} />
          结果筛选
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>服务器</th>
              <th>动作</th>
              <th>结果</th>
              <th>详情</th>
            </tr>
          </thead>
          <tbody>
            {audits.map((audit) => (
              <tr key={`${audit.time}-${audit.action}`}>
                <td>{audit.time}</td>
                <td>{audit.user}</td>
                <td>{audit.node}</td>
                <td>{audit.action}</td>
                <td>
                  <AuditBadge result={audit.result} />
                </td>
                <td>{audit.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SettingsPage({ theme }: { theme: Theme }) {
  return (
    <div className="settings-grid">
      <Panel title="中心端设置" description="MVP 保持最小配置面。">
        <div className="settings-list">
          <SettingRow label="中心地址" value="https://panel.example.com" />
          <SettingRow label="Agent 注册 token" value="一次性 · 30 分钟过期" />
          <SettingRow label="指标保留" value="30 天" />
          <SettingRow label="发布记录" value="最近 20 次/项目" />
        </div>
      </Panel>
      <Panel title="版本检查" description="首版只提示新版本和手动升级命令。">
        <div className="version-box">
          <Database size={22} />
          <div>
            <strong>中心端 v0.1.0</strong>
            <p>Agent v0.1.0 · 暂无可用更新</p>
          </div>
        </div>
      </Panel>
      <Panel title="界面主题" description="浅色优先，暗色可选。">
        <div className="theme-preview">
          <div className="preview-surface">
            <span>{theme === "light" ? "浅色模式已启用" : "暗色模式已启用"}</span>
          </div>
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

function MetricCard({
  icon: Icon,
  label,
  value,
  trend,
  tone = "default",
}: {
  icon: typeof Server;
  label: string;
  value: string;
  trend: string;
  tone?: "default" | "warning";
}) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon">
        <Icon size={20} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{trend}</p>
    </article>
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
            <th>服务器</th>
            <th>状态</th>
            <th>CPU</th>
            <th>内存</th>
            <th>磁盘</th>
            <th>网络</th>
            <th>心跳</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => (
            <tr key={node.id}>
              <td>
                <div className="node-cell">
                  <strong>{node.name}</strong>
                  <span>
                    {node.host} · {node.os}
                  </span>
                </div>
              </td>
              <td>
                <NodeBadge state={node.state} label={node.risk} />
              </td>
              <td>
                <Usage value={node.cpu} />
              </td>
              <td>
                <Usage value={node.memory} />
              </td>
              <td>
                <Usage value={node.disk} />
              </td>
              <td>{node.network}</td>
              <td>{node.heartbeat}</td>
              <td>
                <div className="row-actions">
                  <button className="ghost-button" type="button">
                    详情
                  </button>
                  <button className="ghost-button" type="button">
                    服务
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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

function ChartCard({
  title,
  values,
  color,
}: {
  title: string;
  values: number[];
  color: string;
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
        <span>{values.at(-1)}%</span>
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

function TodoItem({
  tone,
  title,
  detail,
}: {
  tone: "warning" | "danger" | "info";
  title: string;
  detail: string;
}) {
  return (
    <article className={`todo-item ${tone}`}>
      <span />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </article>
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
    <span className={`badge ${state}`}>
      {text}
      <em>{label}</em>
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

  return <span className={`state-badge ${state}`}>{map[state]}</span>;
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
  return navItems.find((item) => item.key === active)?.label ?? "总览";
}

export default App;
