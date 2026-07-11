import type { PageKey } from "../types/app";

function aclPagePreset(page: PageKey) {
  if (page === "acl-policies") return { tab: "policies" as const, subtitle: "权限项视图，按模块、风险级别和关联角色审查授权边界。" };
  if (page === "acl-roles") return { tab: "roles" as const, subtitle: "角色视图，管理不同角色的权限组合。" };
  return { tab: "users" as const, subtitle: "管理用户启用状态、MFA 和角色权限勾选。" };
}

function auditPagePreset(page: PageKey) {
  if (page === "audit-failed") return { result: "失败", user: "全部", search: "", mode: "list", subtitle: "失败操作视图，默认筛选审计中的失败记录。" };
  if (page === "audit-export") return { result: "全部", user: "全部", search: "", mode: "exports", subtitle: "导出记录视图，查看 CSV / JSON 导出历史。" };
  return { result: "全部", user: "全部", search: "", mode: "list", subtitle: "只读审计视图，支持关键字、用户和结果过滤。" };
}

function databasePagePreset(page: PageKey) {
  if (page === "databases-backups") return { type: "全部", status: "全部", host: "全部主机", search: "", mode: "backups", subtitle: "备份计划视图，聚焦备份成功率、最近任务和恢复演练。" };
  if (page === "databases-slow") return { type: "全部", status: "告警", host: "全部主机", search: "", mode: "slow", subtitle: "慢查询视图，默认筛选连接延迟或慢查询较多的实例。" };
  return { type: "全部", status: "全部", host: "全部主机", search: "", mode: "instances", subtitle: "集中管理和监控所有数据库实例的运行状态、备份与慢查询。" };
}

function deployPagePreset(page: PageKey) {
  if (page === "deploy-staging") return { env: "预发", mode: "list", subtitle: "预发环境视图，默认展示 rc 与验证发布任务。" };
  if (page === "deploy-rollbacks") return { env: "全部", mode: "rollbacks", subtitle: "回滚记录视图，聚焦可回滚基线、回滚进度和恢复原因。" };
  return { env: "生产", mode: "list", subtitle: "按环境查看发布任务，支持创建、完成、回滚、查看日志和重新部署。" };
}

function settingsPagePreset(page: PageKey) {
  if (page === "settings-proxy") return "代理";
  if (page === "settings-security") return "安全";
  if (page === "settings-notice") return "通知";
  if (page === "settings-backup") return "备份";
  if (page === "settings-audit") return "审计";
  return "基础";
}

function systemdPagePreset(page: PageKey) {
  if (page === "systemd-failed") return { status: "failed", search: "", mode: "list", subtitle: "Failed 服务视图，聚焦需要处理的异常服务。" };
  if (page === "systemd-logs") return { status: "全部", search: "", mode: "logs", subtitle: "服务日志视图，默认展开 journal 输出。" };
  return { status: page === "systemd-active" ? "active" : "全部", search: "", mode: "list", subtitle: "查看服务 active/failed/inactive 状态，并处理启停、重启和失败告警。" };
}

function terminalPagePreset(page: PageKey) {
  if (page === "terminal-snippets") return { panel: "snippets", subtitle: "常用命令视图，可一键填充到终端输入。" };
  if (page === "terminal-history") return { panel: "history", subtitle: "执行历史视图，展示今日命令记录并可复制会话。" };
  return { panel: "sessions", subtitle: "管理终端会话、命令草稿和输出记录。" };
}

export { aclPagePreset, auditPagePreset, databasePagePreset, deployPagePreset, settingsPagePreset, systemdPagePreset, terminalPagePreset };
