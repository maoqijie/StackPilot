import type { TopbarNotification } from "../components/layout/types";
import type { AclPolicy, AclRole, AclUser } from "../features/access/types";
import type { AuditExportRecord, AuditRecord } from "../features/audit/types";
import type { DatabaseBackupPlan, DatabaseBackupTask, DatabaseInstance, DatabaseRestorePoint, DatabaseSlowQuery } from "../features/databases/types";
import type { DeployJob, RollbackRecord } from "../features/deployments/types";
import type { FileRecord, FileUploadRecord, TrashFileRecord } from "../features/files/types";
import type { FirewallDenyRecord, FirewallRule } from "../features/firewall/types";
import type { HostRecord } from "../features/hosts/types";
import type { ServiceRecord } from "../features/services/types";
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

const dbRows: DatabaseInstance[] = [
  { id: "db-prod-postgres-01", name: "prod-postgres-01", engine: "PostgreSQL 15.5", host: "10.0.12.24", port: "5432", connectionHealth: "正常", backupStatus: "成功", slowQueries: 2, lastBackup: "2025-03-08 02:14", access: "读写", owner: "DBA", storage: "18.6 GB", connections: "42 / 160", latency: "38ms", region: "新加坡", autoBackup: true, remoteAccess: false },
  { id: "db-billing-mysql-02", name: "billing-mysql-02", engine: "MySQL 8.0.36", host: "10.0.12.31", port: "3306", connectionHealth: "延迟 180ms", backupStatus: "等待确认", slowQueries: 9, lastBackup: "2025-03-07 23:10", access: "读写", owner: "研发", storage: "7.8 GB", connections: "68 / 120", latency: "180ms", region: "北京", autoBackup: true, remoteAccess: false },
  { id: "db-staging-pg-03", name: "staging-pg-03", engine: "PostgreSQL 16.2", host: "10.0.14.18", port: "5432", connectionHealth: "正常", backupStatus: "成功", slowQueries: 0, lastBackup: "2025-03-08 01:32", access: "读写", owner: "研发", storage: "3.2 GB", connections: "16 / 80", latency: "41ms", region: "预发", autoBackup: true, remoteAccess: false },
  { id: "db-analytics-mysql-01", name: "analytics-mysql-01", engine: "MySQL 8.0.32", host: "10.0.13.15", port: "3306", connectionHealth: "延迟 560ms", backupStatus: "失败", slowQueries: 23, lastBackup: "2025-03-07 20:45", access: "读写", owner: "运维", storage: "34.5 GB", connections: "96 / 140", latency: "560ms", region: "香港", autoBackup: true, remoteAccess: false },
  { id: "db-archive-pg-02", name: "archive-pg-02", engine: "PostgreSQL 14.9", host: "10.0.15.22", port: "5432", connectionHealth: "正常", backupStatus: "成功", slowQueries: 1, lastBackup: "2025-03-07 22:30", access: "只读", owner: "研发", storage: "46.2 GB", connections: "9 / 60", latency: "55ms", region: "归档", autoBackup: true, remoteAccess: false },
  { id: "db-test-mysql-01", name: "test-mysql-01", engine: "MySQL 8.0.30", host: "10.0.16.11", port: "3306", connectionHealth: "正常", backupStatus: "成功", slowQueries: 0, lastBackup: "2025-03-08 00:22", access: "读写", owner: "仅团队", storage: "1.8 GB", connections: "11 / 40", latency: "29ms", region: "测试", autoBackup: true, remoteAccess: false },
  { id: "db-metrics-pg-01", name: "metrics-pg-01", engine: "PostgreSQL 15.3", host: "10.0.13.21", port: "5432", connectionHealth: "延迟 220ms", backupStatus: "成功", slowQueries: 6, lastBackup: "2025-03-07 21:05", access: "读写", owner: "运维", storage: "12.4 GB", connections: "53 / 100", latency: "220ms", region: "监控", autoBackup: true, remoteAccess: false },
  { id: "db-logs-mysql-02", name: "logs-mysql-02", engine: "MySQL 8.0.28", host: "10.0.17.19", port: "3306", connectionHealth: "正常", backupStatus: "成功", slowQueries: 0, lastBackup: "2025-03-08 02:00", access: "仅备份", owner: "运维", storage: "28.1 GB", connections: "21 / 90", latency: "33ms", region: "日志", autoBackup: true, remoteAccess: false },
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

const initialFirewallDenyRecords: FirewallDenyRecord[] = [
  { id: "deny-1", time: "刚刚", source: "198.51.100.24", target: "panel-hk-03", port: "22", protocol: "TCP", rule: "SSH 运维入口", result: "拒绝", status: "待处理", reason: "来源不在运维白名单" },
  { id: "deny-2", time: "8 分钟前", source: "203.0.113.18", target: "全部主机", port: "9100", protocol: "UDP", rule: "UDP 探测", result: "拒绝", status: "待处理", reason: "探测流量超过阈值" },
  { id: "deny-3", time: "24 分钟前", source: "10.0.12.0/24", target: "数据库", port: "3306", protocol: "TCP", rule: "MySQL 内网", result: "放行", status: "已生效", reason: "已加入内网放行规则" },
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

const databaseAuditRecords: AuditRecord[] = [
  { id: "db-audit-readonly", time: "05-22 10:42:08", ip: "10.0.12.24", user: "张工", action: "创建只读用户", object: "readonly_reporter", result: "成功", traceId: "DB-AUD-1001", summary: "张工为 readonly_reporter 创建数据库只读访问，限制到报表 schema。" },
  { id: "db-audit-backup", time: "05-22 09:15:42", ip: "10.0.12.31", user: "李工", action: "触发手动备份", object: "billing-mysql-02", result: "成功", traceId: "DB-AUD-1002", summary: "李工为 billing-mysql-02 触发手动备份，任务已加入备份队列。" },
  { id: "db-audit-pool", time: "05-22 08:51:30", ip: "127.0.0.1", user: "系统", action: "修改连接池配置", object: "analytics-mysql-01", result: "成功", traceId: "DB-AUD-1003", summary: "系统根据慢查询治理策略调整 analytics-mysql-01 连接池上限。" },
  { id: "db-audit-policy", time: "昨天 23:30", ip: "127.0.0.1", user: "系统", action: "新增备份策略", object: "analytics-mysql-01", result: "成功", traceId: "DB-AUD-1004", summary: "系统为 analytics-mysql-01 新增夜间归档备份策略。" },
];

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

export { topbarNotifications, topbarHelpLinks, auditRows, dbRows, initialDatabaseBackupPlans, initialDatabaseBackupTasks, initialDatabaseRestorePoints, initialDatabaseSlowQueries, initialProxyEndpoints, initialProxyRules, initialSettingsChanges, initialTokenRows, initialHostRecords, initialSiteRecords, initialFileRecords, initialFileUploads, initialTrashFiles, initialTerminalSessions, initialTerminalSnippets, initialTerminalHistory, initialServiceRecords, initialFirewallRules, initialFirewallDenyRecords, initialDeployJobs, initialRollbackRecords, initialAuditRecords, databaseAuditRecords, initialAuditExports, permissionOptions, initialAclUsers, initialAclRoles, initialAclPolicies };
