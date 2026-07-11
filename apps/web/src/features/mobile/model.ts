import type { Tone } from "../../types/app";
import type { MobileActionKind, MobileHostRecord, MobileSiteRecord, MobileTaskRecord } from "./types";

function mobileActionTitle(action: MobileActionKind, host: MobileHostRecord | null, site: MobileSiteRecord | null, task: MobileTaskRecord | null, pushEnabled: boolean, mfaEnabled: boolean, label = "") {
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

function mobileActionSummary(action: MobileActionKind, host: MobileHostRecord | null, site: MobileSiteRecord | null, task: MobileTaskRecord | null, pushEnabled: boolean, mfaEnabled: boolean, label = "") {
  if (action === "notification-open") return [["对象", label || "通知详情"], ["来源", "通知中心"], ["动作", "打开详情"]];
  if (action === "terminal-open") return [["对象", host?.name ?? (label || "主机")], ["IP", host?.ip ?? "-"], ["权限", "admin 会话"]];
  if (action.startsWith("host")) return [["对象", host?.name ?? "主机"], ["环境", host?.env ?? "-"], ["IP", host?.ip ?? "-"]];
  if (action.startsWith("site")) return [["对象", site?.domain ?? "网站"], ["运行时", site?.runtime ?? "-"], ["证书", site ? `${site.certDays} 天` : "-"]];
  if (action.startsWith("task")) return [["对象", task?.title ?? "任务"], ["当前状态", task?.status ?? "-"], ["触发人", task?.operator ?? "-"]];
  if (action === "push-toggle") return [["对象", "通知推送"], ["当前状态", pushEnabled ? "开启" : "关闭"], ["变更后", pushEnabled ? "关闭" : "开启"]];
  if (action === "mfa-toggle") return [["对象", "MFA 验证"], ["当前状态", mfaEnabled ? "启用" : "暂停"], ["变更后", mfaEnabled ? "暂停" : "启用"]];
  if (action === "audit-view") return [["范围", "我的审计"], ["记录数", "128 条"], ["筛选", "当前用户"]];
  if (action === "diagnostics") return [["范围", "移动端诊断"], ["状态", "正常"], ["格式", "摘要文本"]];
  return [["对象", "管理员资料"], ["会话", "3 台"], ["状态", "实时同步"]];
}

function mobileActionImpact(action: MobileActionKind, host: MobileHostRecord | null, site: MobileSiteRecord | null, task: MobileTaskRecord | null, pushEnabled: boolean, mfaEnabled: boolean, label = "") {
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

export { mobileActionImpact, mobileActionSummary, mobileActionTitle, mobileActionTone };
