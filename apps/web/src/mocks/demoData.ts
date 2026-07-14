import type { TopbarNotification } from "../components/layout/types";
import type { AclPolicy, AclRole, AclUser } from "../features/access/types";
import type { AuditExportRecord, AuditRecord } from "../features/audit/types";
import type { FirewallDenyRecord, FirewallRule } from "../features/firewall/types";
import type { HostRecord } from "../features/hosts/types";
import type { ProxyEndpoint, ProxyRouteRule, SettingsChangeRow, TokenRow } from "../features/settings/types";
import type { SiteRecord } from "../features/sites/types";
import type { TerminalHistoryRecord, TerminalSessionRecord, TerminalSnippetRecord } from "../features/terminal/types";

const topbarNotifications: TopbarNotification[] = [];

const topbarHelpLinks = [
  { id: "help-1", title: "快捷排障手册", detail: "查看主机、服务、日志的标准路径" },
  { id: "help-2", title: "防火墙规则说明", detail: "端口、协议、来源的填写规范" },
  { id: "help-3", title: "部署回滚指南", detail: "失败后如何查看日志并回滚" },
] as const;

const auditRows = [
  ["05-22 10:24:31", "10.0.0.55", "李敏", "部署应用", "/api (sg-web-02)", "成功", "a1b2c3d4e5f6"],
  ["05-22 10:23:11", "10.0.1.100", "王工", "更新防火墙", "panel-bj-02", "成功", "b2c3d4e5f6g7"],
  ["05-22 10:22:05", "10.0.0.11", "系统", "备份数据库", "shop_db", "成功", "c3d4e5f6g7h8"],
  ["05-22 10:18:42", "10.0.2.77", "王强", "重启服务", "nginx", "成功", "d4e5f6g7h8i9"],
  ["05-22 10:15:19", "10.0.0.55", "系统", "上传文件", "/var/www/html", "成功", "e5f6g7h8i9j0"],
  ["05-22 10:12:08", "10.0.1.23", "赵磊", "修改配置", "php.ini", "成功", "f6g7h8i9j0k1"],
  ["05-22 10:08:33", "10.0.2.88", "陈晨", "删除文件", "/tmp/old.log", "失败", "h8i9j0k1l2m3"],
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
  { id: "rule-4", target: "localhost,127.0.0.1", type: "直连", endpointId: "direct", note: "工作站与开发服务", enabled: true },
];

const initialSettingsChanges: SettingsChangeRow[] = [
  ["2025-08-13 09:12:45", "管理员", "备份策略", "修改", "新增保留周期：14", "10.0.12.24"],
  ["2025-08-13 09:01:32", "管理员", "访问令牌", "创建", "创建令牌：CI 发布令牌", "10.0.12.24"],
  ["2025-08-12 18:47:09", "运维-张三", "安全设置", "修改", "会话超时时间：15 分钟 -> 30 分钟", "10.0.12.35"],
  ["2025-08-12 17:32:55", "运维-张三", "安全设置", "修改", "IP 白名单：172.16.0.0/12 -> 10.0.0.0/8, 172.16.0.0/12", "10.0.12.35"],
  ["2025-08-12 03:01:22", "系统任务", "备份策略", "验证", "备份验证成功：backup-20250812-0230", "127.0.0.1"],
];

const initialTokenRows: TokenRow[] = [
  { id: "token-ci", name: "CI 发布令牌", prefix: "stkp_12A9••••", scope: "主机(读写) / 部署 / 文件(读写)", createdAt: "2025-07-01 10:22", lastUsed: "2025-08-13 08:47", status: "已启用", access: "读写", risk: "正常" },
  { id: "token-readonly", name: "运维只读令牌", prefix: "stkp_6F3B••••", scope: "主机(只读) / 网站(只读) / 数据库(只读)", createdAt: "2025-06-15 14:05", lastUsed: "2025-08-12 17:32", status: "已启用", access: "只读", risk: "正常" },
  { id: "token-audit", name: "审计导出令牌", prefix: "stkp_8C7D••••", scope: "审计日志(读) / 导出", createdAt: "2025-07-20 09:11", lastUsed: "2025-08-08 11:02", status: "已启用", access: "只读", risk: "即将过期" },
  { id: "token-legacy-ci", name: "旧 CI 令牌（已停用）", prefix: "stkp_4B2E••••", scope: "主机(读写) / 部署", createdAt: "2025-03-18 16:30", lastUsed: "2025-07-01 12:10", status: "已停用", access: "读写", risk: "正常" },
];

const initialHostRecords: HostRecord[] = [
  { id: "host-1", name: "panel-se-01", ip: "10.0.0.11", env: "生产", health: "健康", cpu: "18%", memory: "42%", disk: "35%", os: "Ubuntu 22.04", uptime: "23 天", backup: "今天 02:15", update: "已是最新", services: ["nginx", "postgresql", "redis"] },
  { id: "host-2", name: "panel-bj-02", ip: "10.0.1.22", env: "预发", health: "健康", cpu: "27%", memory: "55%", disk: "62%", os: "Debian 12", uptime: "18 天", backup: "今天 02:20", update: "可更新 1", services: ["nginx", "worker", "systemd-resolved"] },
  { id: "host-3", name: "panel-hk-03", ip: "10.0.2.33", env: "生产", health: "警告", cpu: "63%", memory: "78%", disk: "83%", os: "Ubuntu 20.04", uptime: "9 天", backup: "昨天 02:18", update: "可更新 1", services: ["nginx", "mysql", "queue"] },
  { id: "host-4", name: "panel-dev-04", ip: "10.0.3.44", env: "开发", health: "离线", cpu: "0%", memory: "0%", disk: "47%", os: "Rocky Linux 9", uptime: "离线", backup: "3 天前", update: "待检查", services: ["docker", "node", "cron"] },
];

const initialSiteRecords: SiteRecord[] = [
  { id: "site-1", domain: "api.stackpilot.local", status: "运行中", runtime: "Node 20", host: "panel-se-01", certDays: 68, traffic: "128 GB", owner: "后端", latency: "38ms", errorRate: "0.03%", upstream: "node-api:3000", lastDeploy: "今天 09:42", certIssuer: "Let's Encrypt", certMode: "自动续期" },
  { id: "site-2", domain: "shop.example.com", status: "运行中", runtime: "PHP 8.3", host: "panel-bj-02", certDays: 12, traffic: "420 GB", owner: "电商", latency: "74ms", errorRate: "0.18%", upstream: "php-fpm:9000", lastDeploy: "昨天 22:18", certIssuer: "ZeroSSL", certMode: "DNS-01" },
  { id: "site-3", domain: "admin.example.com", status: "告警", runtime: "Nginx 静态", host: "panel-hk-03", certDays: 4, traffic: "86 GB", owner: "运营", latency: "211ms", errorRate: "1.26%", upstream: "static-root", lastDeploy: "今天 08:16", certIssuer: "Let's Encrypt", certMode: "手动确认" },
  { id: "site-4", domain: "docs.example.com", status: "已停止", runtime: "Static", host: "panel-dev-04", certDays: 90, traffic: "14 GB", owner: "文档", latency: "-", errorRate: "-", upstream: "docs-web", lastDeploy: "3 天前", certIssuer: "自签名", certMode: "人工导入" },
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


const initialFirewallRules: FirewallRule[] = [
  { id: "fw-1", name: "HTTPS 公网访问", port: "443", protocol: "TCP", source: "0.0.0.0/0", target: "全部主机", enabled: true },
  { id: "fw-2", name: "SSH 运维入口", port: "22", protocol: "TCP", source: "10.0.0.0/8", target: "生产环境", enabled: true },
  { id: "fw-3", name: "MySQL 内网", port: "3306", protocol: "TCP", source: "10.0.12.0/24", target: "数据库", enabled: true },
  { id: "fw-4", name: "UDP 探测", port: "9100", protocol: "UDP", source: "监控网段", target: "全部主机", enabled: false },
];

const initialFirewallDenyRecords: FirewallDenyRecord[] = [
  { id: "deny-1", time: "刚刚", source: "198.51.100.24", target: "panel-hk-03", port: "22", protocol: "TCP", rule: "SSH 运维入口", result: "拒绝", status: "待处理", reason: "来源不在运维白名单" },
  { id: "deny-2", time: "8 分钟前", source: "203.0.113.18", target: "全部主机", port: "9100", protocol: "UDP", rule: "UDP 探测", result: "拒绝", status: "待处理", reason: "探测流量超过阈值" },
  { id: "deny-3", time: "24 分钟前", source: "10.0.12.0/24", target: "数据库", port: "3306", protocol: "TCP", rule: "MySQL 内网", result: "放行", status: "已生效", reason: "已加入内网放行规则" },
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

const permissionOptions = ["主机读写", "网站发布", "数据库管理", "文件管理", "终端访问", "防火墙管理", "审计查看", "权限管理"];

const initialAclUsers: AclUser[] = [
  { id: "usr-1", name: "张工", email: "zhang@example.com", role: "管理员", enabled: true, mfa: "已启用", lastLogin: "今天 10:24" },
  { id: "usr-2", name: "李敏", email: "li@example.com", role: "发布经理", enabled: true, mfa: "已启用", lastLogin: "今天 09:52" },
  { id: "usr-3", name: "王工", email: "wang@example.com", role: "只读审计", enabled: true, mfa: "未启用", lastLogin: "昨天 18:33" },
  { id: "usr-4", name: "外包 CI", email: "ci@example.com", role: "发布机器人", enabled: false, mfa: "需重置", lastLogin: "7 天前" },
];

const initialAclRoles: AclRole[] = [
  { id: "role-1", name: "管理员", desc: "拥有全部控制台权限", permissions: permissionOptions },
  { id: "role-2", name: "发布经理", desc: "负责网站发布和部署回滚", permissions: ["主机读写", "网站发布", "文件管理", "审计查看"] },
  { id: "role-3", name: "只读审计", desc: "只查看日志与状态，不可变更", permissions: ["审计查看"] },
  { id: "role-4", name: "发布机器人", desc: "供 CI/CD 自动发布使用", permissions: ["网站发布", "文件管理"] },
];

const initialAclPolicies: AclPolicy[] = [
  { id: "pol-1", name: "主机读写", module: "主机", risk: "高", desc: "允许重启、备份、更新和修改主机配置。", roles: ["管理员", "发布经理"], lastUpdated: "今天 09:20" },
  { id: "pol-2", name: "网站发布", module: "网站", risk: "高", desc: "允许发布站点、启停站点和续期证书。", roles: ["管理员", "发布经理", "发布机器人"], lastUpdated: "今天 08:42" },
  { id: "pol-3", name: "数据库管理", module: "数据库", risk: "高", desc: "允许创建备份、恢复实例和查看慢查询明细。", roles: ["管理员"], lastUpdated: "昨天 22:15" },
  { id: "pol-4", name: "文件管理", module: "文件", risk: "中", desc: "允许上传、重命名、删除和恢复站点目录文件。", roles: ["管理员", "发布经理", "发布机器人"], lastUpdated: "昨天 18:10" },
  { id: "pol-5", name: "终端访问", module: "终端", risk: "高", desc: "允许连接主机终端并执行命令。", roles: ["管理员"], lastUpdated: "周一 11:06" },
  { id: "pol-6", name: "防火墙管理", module: "防火墙", risk: "高", desc: "允许新增、禁用和删除访问规则。", roles: ["管理员"], lastUpdated: "周一 10:44" },
  { id: "pol-7", name: "审计查看", module: "审计", risk: "低", desc: "允许查看审计日志和详情，不包含导出或归档生成。", roles: ["管理员", "发布经理", "只读审计"], lastUpdated: "昨天 16:01" },
  { id: "pol-8", name: "权限管理", module: "权限", risk: "高", desc: "允许变更用户、角色和权限项绑定。", roles: ["管理员"], lastUpdated: "今天 10:02" },
];

export { topbarNotifications, topbarHelpLinks, auditRows, initialProxyEndpoints, initialProxyRules, initialSettingsChanges, initialTokenRows, initialHostRecords, initialSiteRecords, initialTerminalSessions, initialTerminalSnippets, initialTerminalHistory, initialFirewallRules, initialFirewallDenyRecords, initialAuditRecords, initialAuditExports, permissionOptions, initialAclUsers, initialAclRoles, initialAclPolicies };
