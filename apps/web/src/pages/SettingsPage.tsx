import { CheckCircle2, Download, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { settingsPagePreset } from "../app/pagePresets";
import { settingsPageForTab } from "../features/settings/navigation";
import { SettingsTabs } from "../features/settings/SettingsTabs";
import { resolvePageMeta, viewContextForPage } from "../app/navigation";
import { ModuleViewContext } from "../components/layout/ModulePageShell";
import { PanelCard } from "../components/ui/Cards";
import { DetailDrawer } from "../components/ui/DetailDrawer";
import { FormLine, FormSelectLine, ToggleLine } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import { TokenSecretDrawer, TokenTable } from "../features/settings/TokenManagement";
import type { BackupDraft, GeneratedTokenSecret, SettingsChangeRow, TokenRow, TokenStatus } from "../features/settings/types";
import { initialSettingsChanges, initialTokenRows } from "../mocks/demoData";
import type { Notify, PageKey, SetPage, SettingsReadOnlyState } from "../types/app";
import { currentDateTime } from "../utils/time";

function SettingsPage({
  page,
  setPage,
  notify,
  readOnlyState,
}: {
  page: PageKey;
  setPage: SetPage;
  notify: Notify;
  readOnlyState: SettingsReadOnlyState;
}) {
  const activeTab = settingsPagePreset(page);
  const { readOnly, setReadOnly } = readOnlyState;
  const [identityDraft, setIdentityDraft] = useState({
    panelName: "StackPilot 控制面板",
    publicUrl: "https://panel.example.com",
    adminEmail: "admin@example.com",
    timezone: "Asia/Shanghai (UTC+08:00)",
    language: "简体中文",
    version: "v1.8.2 (Build 20250810.1)",
  });
  const tokenSequence = useRef(initialTokenRows.length + 1);
  const identityPanelNameInputRef = useRef<HTMLInputElement>(null);
  const identityPublicUrlInputRef = useRef<HTMLInputElement>(null);
  const identityAdminEmailInputRef = useRef<HTMLInputElement>(null);
  const [identityErrors, setIdentityErrors] = useState({ panelName: "", publicUrl: "", adminEmail: "" });
  const [identitySavedAt, setIdentitySavedAt] = useState("2025-08-13 09:18");
  const [savedIdentitySignature, setSavedIdentitySignature] = useState("StackPilot 控制面板::https://panel.example.com::admin@example.com");
  const [tokenRows, setTokenRows] = useState<TokenRow[]>(initialTokenRows);
  const [generatedToken, setGeneratedToken] = useState<GeneratedTokenSecret | null>(null);
  const [settingsAuditRows, setSettingsAuditRows] = useState<SettingsChangeRow[]>(initialSettingsChanges);
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
  const [backupConnection, setBackupConnection] = useState<{ status: "未检查" | "配置已检查" | "需要检查"; detail: string; signature?: string }>({
    status: "未检查",
    detail: "保存前建议检查备份目标配置。",
  });
  const [backupTimeError, setBackupTimeError] = useState("");
  const [backupVerification, setBackupVerification] = useState({
    latest: "2025-08-12 03:01",
    delay: "上次备份延迟 18 分钟",
    delayTone: "warn",
    drill: "恢复演练未完成",
    drillTone: "error",
  });
  const [backupDrawer, setBackupDrawer] = useState<"verification" | "jobs" | null>(null);
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
    status: "格式已检查",
    detail: "通知格式已检查，预计响应 45ms",
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
  const backupConnectionValid = backupConnection.status === "配置已检查" && backupConnection.signature === backupTargetSignature;
  const backupConnectionTone = backupConnection.status === "配置已检查" ? "ok-line" : backupConnection.status === "需要检查" ? "error-line" : "warn-line";
  const immediateBackupRunning = backupJobs.some((job) => job.status === "运行中");
  const backupStateClass = (tone: string) => tone === "ok" ? "ok-line" : tone === "error" ? "error-line" : "warn-line";
  const settingsModalOpen = Boolean(generatedToken || backupDrawer);
  const guardSettingsWrite = (action: string) => {
    if (!readOnly) return true;
    notify(`只读模式已开启，无法${action}`, "warning");
    return false;
  };
  useEffect(() => {
    backupDraftRef.current = backupDraft;
  }, [backupDraft]);
  const identitySignature = (draft: typeof identityDraft) => `${draft.panelName.trim()}::${draft.publicUrl.trim()}::${draft.adminEmail.trim()}`;
  const normalizeIdentityDraft = (draft: typeof identityDraft) => ({
    ...draft,
    panelName: draft.panelName.trim(),
    publicUrl: draft.publicUrl.trim(),
    adminEmail: draft.adminEmail.trim(),
  });
  const isValidPublicUrl = (value: string) => {
    try {
      const url = new URL(value);
      const hostname = url.hostname;
      const domainLabels = hostname.split(".");
      const validIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
        && domainLabels.every((part) => Number(part) >= 0 && Number(part) <= 255);
      const validHostname = hostname === "localhost"
        || validIpv4
        || (domainLabels.length > 1 && domainLabels.every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part)));
      return url.protocol === "https:" && validHostname && !domainLabels.some((part) => part.length === 0);
    } catch {
      return false;
    }
  };
  const appendSettingsAudit = (module: string, action: string, detail: string, operator = "管理员") => {
    setSettingsAuditRows((current) => [[currentDateTime(), operator, module, action, detail, "10.0.12.24"], ...current.slice(0, 7)]);
  };
  const updateIdentityDraft = (key: keyof typeof identityDraft, value: string) => {
    setIdentityDraft((current) => ({ ...current, [key]: value }));
    if (key in identityErrors) {
      setIdentityErrors((current) => ({ ...current, [key]: "" }));
    }
  };
  const readIdentityDraft = () => ({
    ...identityDraft,
    panelName: identityPanelNameInputRef.current?.value ?? identityDraft.panelName,
    publicUrl: identityPublicUrlInputRef.current?.value ?? identityDraft.publicUrl,
    adminEmail: identityAdminEmailInputRef.current?.value ?? identityDraft.adminEmail,
  });
  const validateIdentityDraft = (draft: typeof identityDraft) => {
    const nextErrors = {
      panelName: draft.panelName.trim() ? "" : "面板名称不能为空",
      publicUrl: isValidPublicUrl(draft.publicUrl.trim()) ? "" : "公网访问地址必须是有效的 https:// 地址",
      adminEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.adminEmail.trim()) ? "" : "请输入有效管理员邮箱",
    };
    setIdentityErrors(nextErrors);
    return !nextErrors.panelName && !nextErrors.publicUrl && !nextErrors.adminEmail;
  };
  const saveIdentitySettings = () => {
    if (!guardSettingsWrite("保存设置")) return;
    const draft = normalizeIdentityDraft(readIdentityDraft());
    setIdentityDraft(draft);
    if (!validateIdentityDraft(draft)) {
      notify("面板身份设置有误", "danger");
      return;
    }
    setIdentitySavedAt("刚刚");
    setSavedIdentitySignature(identitySignature(draft));
    appendSettingsAudit("面板身份", "修改", `保存面板身份：${draft.panelName.trim()}`);
    notify("面板身份设置已保存");
  };
  const generateToken = () => {
    if (!guardSettingsWrite("生成令牌")) return;
    const nextIndex = tokenSequence.current;
    tokenSequence.current += 1;
    const createdAt = currentDateTime();
    const tokenSeed = `${String(nextIndex).padStart(2, "0")}${String(Date.now()).slice(-4)}`;
    const secretTail = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replaceAll("-", "")
      : `${Date.now()}${Math.random().toString(36).slice(2)}`.replace(/\W/g, "");
    const secret = `stkp_${tokenSeed}_${secretTail.slice(0, 32)}`;
    const next: TokenRow = {
      id: `token-local-${tokenSeed}`,
      name: `临时接入令牌 ${nextIndex}`,
      prefix: `${secret.slice(0, 13)}••••`,
      scope: "主机(只读) / 审计日志(读)",
      createdAt,
      lastUsed: "尚未使用",
      status: "已启用",
      access: "只读",
      risk: "正常",
    };
    setTokenRows((current) => [next, ...current]);
    setGeneratedToken({ token: next, secret });
    appendSettingsAudit("访问令牌", "创建", `创建令牌：${next.name}`);
    notify(`新访问令牌已生成，请立即复制`, "info");
  };
  const updateTokenStatus = (token: TokenRow, nextStatus: TokenStatus) => {
    if (!guardSettingsWrite("修改令牌")) return false;
    if (token.status === nextStatus) {
      notify(`${token.name} 已处于${nextStatus}`, "info");
      return false;
    }
    setTokenRows((current) => current.map((item) => item.id === token.id ? { ...item, status: nextStatus } : item));
    appendSettingsAudit("访问令牌", "修改", `${token.name} 状态：${token.status} -> ${nextStatus}`);
    notify(`${token.name} 已${nextStatus === "已停用" ? "停用" : "启用"}`, nextStatus === "已停用" ? "warning" : "success");
    return true;
  };
  const viewToken = (token: TokenRow) => {
    if (!readOnly) {
      appendSettingsAudit("访问令牌", "查看", `查看令牌：${token.name}`);
    }
    notify(`正在查看令牌：${token.name}`, "info");
  };
  const deleteToken = (token: TokenRow) => {
    if (!guardSettingsWrite("删除令牌")) return;
    setTokenRows((current) => current.filter((item) => item.id !== token.id));
    appendSettingsAudit("访问令牌", "删除", `删除令牌：${token.name}`);
    notify(`令牌已删除：${token.name}`, "warning");
  };
  const bulkDisableTokens = (ids: string[]) => {
    if (!guardSettingsWrite("停用令牌")) return false;
    const activeIds = ids.filter((id) => tokenRows.some((token) => token.id === id && token.status !== "已停用"));
    if (activeIds.length === 0) {
      notify("请先选择要停用的令牌", "warning");
      return false;
    }
    setTokenRows((current) => current.map((token) => activeIds.includes(token.id) ? { ...token, status: "已停用" } : token));
    appendSettingsAudit("访问令牌", "批量停用", `停用 ${activeIds.length} 个令牌`);
    notify(`已停用 ${activeIds.length} 个令牌`, "warning");
    return true;
  };
  const copyGeneratedToken = () => {
    if (!generatedToken) return;
    if (!navigator.clipboard?.writeText) {
      notify("当前浏览器不支持复制令牌", "warning");
      return;
    }
    void navigator.clipboard.writeText(generatedToken.secret)
      .then(() => notify("完整访问令牌已复制", "info"))
      .catch(() => notify("复制令牌失败，请检查剪贴板权限", "danger"));
  };
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
    if (!guardSettingsWrite("修改备份范围")) return;
    setBackupItems((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item]);
  };
  const updateBackupDraft = (key: keyof typeof backupDraft, value: string) => {
    if (!guardSettingsWrite("修改备份策略")) return;
    const next = { ...backupDraftRef.current, [key]: value };
    backupDraftRef.current = next;
    setBackupDraft(next);
    if (key === "runAt") {
      setBackupTimeError("");
    }
    if (key === "target" || key === "location") {
      setBackupConnection({ status: "未检查", detail: "备份目标已变更，需要重新检查配置。" });
    }
  };
  const testBackupConnection = () => {
    if (!guardSettingsWrite("检查备份配置")) return;
    const draft = readBackupDraft();
    syncBackupDraft(draft);
    const signature = `${draft.target}::${draft.location.trim()}`;
    if (!draft.location.trim()) {
      setBackupConnection({ status: "需要检查", detail: "请先填写存储位置。" });
      notify("存储位置不能为空", "danger");
      return;
    }
    setBackupConnection({ status: "配置已检查", detail: `${draft.target} 目标格式已检查，可保存到当前策略。`, signature });
    setBackupVerification((current) => ({ ...current, latest: "刚刚" }));
    notify(`${draft.target} 目标检查通过`);
  };
  const saveBackupPolicy = () => {
    if (!guardSettingsWrite("保存备份策略")) return;
    const draft = readBackupDraft();
    syncBackupDraft(draft);
    const signature = `${draft.target}::${draft.location.trim()}`;
    const connectionValid = backupConnection.status === "配置已检查" && backupConnection.signature === signature;
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
      setBackupConnection({ status: "需要检查", detail: "请先检查当前备份目标配置。" });
      notify("请先检查当前备份目标配置", "danger");
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
    if (!guardSettingsWrite("创建立即备份")) return;
    if (immediateBackupRunning) {
      notify("已有立即备份任务正在运行", "warning");
      return;
    }
    if (backupItems.length === 0) {
      notify("请先选择备份范围", "danger");
      return;
    }
    if (!backupConnectionValid) {
      notify("请先检查当前备份目标配置", "danger");
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
    if (!guardSettingsWrite("启动恢复演练")) return;
    setBackupVerification((current) => ({ ...current, drill: "恢复演练已排队", drillTone: "warn" }));
    notify("恢复演练已排队", "info");
  };
  const updateSecurityDraft = (key: keyof typeof securityDraft, value: string) => {
    if (!guardSettingsWrite("修改安全策略")) return;
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
    if (!guardSettingsWrite("保存安全策略")) return;
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
    if (!guardSettingsWrite("执行安全复核")) return;
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
    if (!guardSettingsWrite("修改通知设置")) return;
    const next = { ...noticeDraft, [key]: value };
    setNoticeDraft(next);
    setNoticeErrors((current) => ({ ...current, [key]: "" }));
    if (key === "webhook" || key === "recipients" && mailNotice) {
      setNoticeConnection({
        status: "待检查",
        detail: "通知渠道已变更，需要重新检查配置。",
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
    if (!guardSettingsWrite("修改通知事件")) return;
    setNoticeEvents((current) => current.includes(eventName) ? current.filter((item) => item !== eventName) : [...current, eventName]);
    setNoticeConnection((current) => ({
      ...current,
      status: "待保存",
      detail: "事件范围已变更，保存后生效。",
      tone: "warn",
    }));
  };
  const testNoticeConnection = () => {
    if (!guardSettingsWrite("检查通知渠道")) return false;
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
      status: "格式已检查",
      detail: `通知格式已检查，预计响应 ${latency}`,
      tone: "ok",
      signature: noticeSignature(draft),
    });
    notify(`通知渠道检查通过：${latency}`);
    return true;
  };
  const saveNoticeSettings = () => {
    if (!guardSettingsWrite("保存通知设置")) return;
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
      setNoticeConnection({ status: "待检查", detail: "请先检查当前通知渠道配置。", tone: "warn", signature: "" });
      notify("请先检查当前通知渠道配置", "warning");
      return;
    }
    setNoticeSavedAt("刚刚");
    setSavedNotice({ ...draft, mailEnabled: mailNotice, events: noticeEvents });
    setNoticeConnection((current) => ({
      ...current,
      status: "格式已检查",
      detail: "通知策略已保存，配置格式有效。",
      tone: "ok",
    }));
    notify("通知设置已保存");
  };
  const sendNoticePreview = () => {
    if (!guardSettingsWrite("发送通知预览")) return;
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
      setNoticeConnection({ status: "待检查", detail: "请先检查当前通知渠道配置。", tone: "warn", signature: "" });
      notify("请先检查当前通知渠道配置", "warning");
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
      <div className="page-head settings-title" inert={settingsModalOpen} aria-hidden={settingsModalOpen ? "true" : undefined}>
        <div>
          <h1>{resolvePageMeta(page).title}</h1>
        </div>
      </div>
      <div inert={settingsModalOpen} aria-hidden={settingsModalOpen ? "true" : undefined}>
        <ModuleViewContext context={viewContextForPage(activeSettingsPage) ?? {
          eyebrow: "设置 / 基础设置",
          title: activeTab,
          chips: [`Tab ${activeTab}`],
        }} />
      </div>
      <SettingsTabs activeTab={activeTab} setPage={setPage} inert={settingsModalOpen} />
      <div className={`settings-layout ${activeTab === "基础" ? "base-settings-layout" : ""}`} inert={settingsModalOpen} aria-hidden={settingsModalOpen ? "true" : undefined}>
        {activeTab === "基础" && <PanelCard title="面板身份" className="settings-card-tall">
          <div className="settings-form">
            <FormLine label="面板名称" value={identityDraft.panelName} onChange={readOnly ? undefined : (value) => updateIdentityDraft("panelName", value)} error={identityErrors.panelName} inputRef={identityPanelNameInputRef} />
            <FormLine label="公网访问地址" value={identityDraft.publicUrl} onChange={readOnly ? undefined : (value) => updateIdentityDraft("publicUrl", value)} error={identityErrors.publicUrl} success={!identityErrors.publicUrl && identitySignature(identityDraft) === savedIdentitySignature ? "已验证" : undefined} inputType="url" inputRef={identityPublicUrlInputRef} />
            <FormLine label="管理员邮箱" value={identityDraft.adminEmail} onChange={readOnly ? undefined : (value) => updateIdentityDraft("adminEmail", value)} error={identityErrors.adminEmail} inputType="email" inputRef={identityAdminEmailInputRef} />
            <FormSelectLine label="时区" value={identityDraft.timezone} options={["Asia/Shanghai (UTC+08:00)", "UTC", "America/Los_Angeles (UTC-08:00)"]} disabled={readOnly} onChange={(value) => updateIdentityDraft("timezone", value)} />
            <FormSelectLine label="语言" value={identityDraft.language} options={["简体中文", "English", "日本語"]} disabled={readOnly} onChange={(value) => updateIdentityDraft("language", value)} />
            <FormLine label="版本号" value={identityDraft.version} success="已是最新" />
            <ToggleLine label="只读模式" active={readOnly} onToggle={setReadOnly} hint="开启后所有操作将被强制转为只读" />
            <div className="identity-summary">
              <p><span>访问</span><b>{identityDraft.publicUrl || "未配置访问地址"}</b></p>
              <p><span>管理员</span><b>{identityDraft.adminEmail || "未配置邮箱"}</b></p>
              <p><span>保存</span><b>{identitySavedAt}</b></p>
            </div>
            <button className="primary save-button" type="button" disabled={readOnly} onClick={saveIdentitySettings}>保存设置</button>
          </div>
        </PanelCard>}
        {activeTab === "基础" && <PanelCard title="访问令牌" className="settings-card-wide">
          <div className="token-title">
            <span>用于 API 访问、CI/CD 集成或第三方工具接入，请妥善保管令牌，避免泄露。</span>
            <div><button className="primary" type="button" disabled={readOnly} onClick={generateToken}><Plus size={14} /> 生成令牌</button><button className="danger-soft" type="button" disabled={readOnly || tokenRows.every((token) => token.status === "已停用")} onClick={() => bulkDisableTokens(tokenRows.filter((token) => token.status !== "已停用").map((token) => token.id))}><Trash2 size={14} /> 停用全部</button></div>
          </div>
          <TokenTable rows={tokenRows} readOnly={readOnly} onView={viewToken} onUpdateStatus={updateTokenStatus} onDelete={deleteToken} onBulkDisable={bulkDisableTokens} />
        </PanelCard>}
        {activeTab === "备份" && <PanelCard title="备份策略">
          <div className="backup-grid">
            <FormSelectLine label="备份频率" value={backupDraft.frequency} options={["每日", "每周", "每 6 小时"]} disabled={readOnly} onChange={(value) => updateBackupDraft("frequency", value)} />
            <FormLine label="执行时间" value={backupDraft.runAt} disabled={readOnly} onChange={(value) => updateBackupDraft("runAt", value)} hint="24 小时制，如 02:30" error={backupTimeError} inputRef={backupRunAtInputRef} />
            <FormSelectLine label="保留策略" value={backupDraft.retention} options={["保留 7 份", "保留 14 份", "保留 30 份"]} disabled={readOnly} onChange={(value) => updateBackupDraft("retention", value)} />
            <FormSelectLine label="备份目标" value={backupDraft.target} options={["S3 / MinIO", "本地磁盘", "远端 SFTP"]} disabled={readOnly} onChange={(value) => updateBackupDraft("target", value)} />
            <FormLine label="存储位置" value={backupDraft.location} disabled={readOnly} onChange={(value) => updateBackupDraft("location", value)} inputRef={backupLocationInputRef} />
            <button className="ghost backup-test-button" type="button" disabled={readOnly} onClick={testBackupConnection}>检查配置</button>
            <FormSelectLine label="加密设置" value={backupDraft.encryption} options={["启用（AES-256）", "启用（KMS 托管）", "关闭"]} disabled={readOnly} onChange={(value) => updateBackupDraft("encryption", value)} />
          </div>
          <div className="backup-policy-summary">
            <p><span>当前策略</span><b>{backupDraft.frequency} {backupDraft.runAt}</b><em>{backupDraft.retention} · {backupDraft.encryption}</em></p>
            <p><span>备份目标</span><b>{backupDraft.target}</b><em>{backupDraft.location || "未填写存储位置"}</em></p>
            <p className={backupConnectionTone}><span>{backupConnectionValid ? "配置已检查" : backupConnection.status}</span><b>{backupConnection.detail}</b></p>
          </div>
          <div className="check-row">
            {["面板数据", "审计日志", "上传文件"].map((item) => (
              <button key={item} className={backupItems.includes(item) ? "checked" : ""} type="button" disabled={readOnly} aria-pressed={backupItems.includes(item)} onClick={() => toggleBackupItem(item)}>{item}</button>
            ))}
          </div>
          <div className="settings-buttons backup-actions"><button className="primary" type="button" disabled={readOnly} onClick={saveBackupPolicy}>保存策略</button><button className="primary" type="button" disabled={readOnly || immediateBackupRunning} onClick={createImmediateBackup}><Download size={14} /> 立即备份</button><button className="ghost" type="button" disabled={readOnly} onClick={startRestoreDrill}>恢复演练</button></div>
        </PanelCard>}
        {activeTab === "备份" && <PanelCard title="验证状态" className="settings-card-wide">
          <div className="verify-box">
            <p className="ok-line"><CheckCircle2 size={15} /> 最近验证成功：{backupVerification.latest}</p>
            <p className={backupStateClass(backupVerification.delayTone)}>{backupVerification.delay} <button type="button" onClick={() => setBackupDrawer("verification")}>查看详情</button></p>
            <p className={backupStateClass(backupVerification.drillTone)}>{backupVerification.drill} <button type="button" disabled={readOnly} onClick={startRestoreDrill}>前往演练</button></p>
          </div>
          <div className="backup-list">
            <div><strong>最近备份任务</strong><button type="button" onClick={() => setBackupDrawer("jobs")}>查看全部</button></div>
            {backupJobs.map((job) => (
              <p key={job.id}><span>{job.time}</span><StatusLight tone={job.status === "延迟" || job.status === "运行中" ? "orange" : "green"} /> <em>{job.status}</em><b>{job.size}</b><small>{job.duration}</small></p>
            ))}
          </div>
          <div className="storage-bar"><span style={{ width: "48%" }} /><em>可用空间：482.36 GB / 1.00 TB (48%)</em></div>
        </PanelCard>}
        {activeTab === "安全" && <PanelCard title="安全设置">
          <div className="right-settings">
            <ToggleLine label="强制启用两步验证（2FA）" active={twoFactor} disabled={readOnly} onToggle={(active) => {
              setTwoFactor(active);
              setSecurityReview("安全策略已变更，等待复核");
              setSecurityReviewTone("warn");
            }} />
            <FormSelectLine label="会话超时时间" value={securityDraft.sessionTimeout} options={["15 分钟", "30 分钟", "60 分钟"]} disabled={readOnly} onChange={(value) => updateSecurityDraft("sessionTimeout", value)} />
            <FormLine label="IP 访问白名单" value={securityDraft.ipWhitelist} disabled={readOnly} onChange={(value) => updateSecurityDraft("ipWhitelist", value)} error={securityError} hint="逗号分隔，支持 IPv4 / CIDR" inputRef={securityWhitelistInputRef} />
            <ToggleLine label="允许多地同时登录" active={multiLogin} disabled={readOnly} onToggle={(active) => {
              setMultiLogin(active);
              setSecurityReview("安全策略已变更，等待复核");
              setSecurityReviewTone("warn");
            }} />
            <FormSelectLine label="登录失败锁定" value={securityDraft.lockPolicy} options={["3 次 / 10 分钟", "5 次 / 15 分钟", "10 次 / 30 分钟"]} disabled={readOnly} onChange={(value) => updateSecurityDraft("lockPolicy", value)} />
            <div className="security-policy-summary">
              <p><span>会话</span><b>{securityDraft.sessionTimeout}</b><em>{securityDraft.lockPolicy}</em></p>
              <p><span>登录</span><b>{twoFactor ? "强制 MFA" : "未强制 MFA"}</b><em>{multiLogin ? "允许多地登录" : "禁止多地登录"}</em></p>
              <p><span>保存</span><b>{securitySavedAt}</b><em>{securityReview}</em></p>
            </div>
            <div className="settings-buttons security-actions"><button className="primary" type="button" disabled={readOnly} onClick={saveSecurityPolicy}>保存安全策略</button><button className="ghost" type="button" disabled={readOnly} onClick={runSecurityReview}>立即复核</button></div>
          </div>
        </PanelCard>}
        {activeTab === "安全" && <PanelCard title="安全验证">
          <div className="verify-box">
            <p className={twoFactor ? "ok-line" : "warn-line"}><CheckCircle2 size={15} /> MFA 覆盖率：{twoFactor ? "100%" : "未强制"}</p>
            <p className={securityReviewTone === "ok" ? "ok-line" : "warn-line"}>{securityReview} <button type="button" disabled={readOnly} onClick={runSecurityReview}>复核</button></p>
            <p className={securityReviewTone === "ok" ? "ok-line" : "warn-line"}><CheckCircle2 size={15} /> 登录策略：{securityReviewTone === "ok" ? "校验通过" : "等待复核"}</p>
          </div>
        </PanelCard>}
        {activeTab === "通知" && <PanelCard title="通知设置">
          <div className="right-settings">
            <FormLine label="Webhook 通知" value={noticeDraft.webhook} disabled={readOnly} onChange={(value) => updateNoticeDraft("webhook", value)} error={noticeErrors.webhook} hintButton="测试" hintAction={testNoticeConnection} inputRef={noticeWebhookInputRef} />
            <ToggleLine label="关键事件邮件通知" active={mailNotice} disabled={readOnly} onToggle={(active) => {
              const draft = readNoticeDraft();
              setMailNotice(active);
              setNoticeDraft(draft);
              setNoticeErrors((current) => ({ ...current, recipients: active ? current.recipients : "" }));
              setNoticeConnection((current) => {
                if (!active && current.tone === "ok") {
                  return { ...current, status: "格式已检查", detail: "邮件已关闭，Webhook 配置格式仍有效，保存后生效。", signature: noticeSignature(draft, false) };
                }
                return { status: "待检查", detail: "邮件通知状态已变更，需要重新检查渠道。", tone: "warn", signature: "" };
              });
            }} />
            <FormLine label="通知收件人" value={noticeDraft.recipients} disabled={readOnly} onChange={(value) => updateNoticeDraft("recipients", value)} error={noticeErrors.recipients} hint="多个邮箱用逗号分隔" inputRef={noticeRecipientsInputRef} />
            <FormSelectLine label="通知级别" value={noticeDraft.severity} options={["仅高危", "关键与告警", "全部事件"]} disabled={readOnly} onChange={(value) => updateNoticeDraft("severity", value)} />
            <FormSelectLine label="摘要频率" value={noticeDraft.digest} options={["实时推送", "每小时摘要", "每日摘要"]} disabled={readOnly} onChange={(value) => updateNoticeDraft("digest", value)} />
            <div className="check-row notice-event-row">
              {["高危告警", "备份失败", "部署完成", "登录异常"].map((item) => (
                <button key={item} className={noticeEvents.includes(item) ? "checked" : ""} type="button" disabled={readOnly} aria-pressed={noticeEvents.includes(item)} onClick={() => toggleNoticeEvent(item)}>{item}</button>
              ))}
            </div>
            <div className="notice-policy-summary">
              <p><span>渠道</span><b>{mailNotice ? "邮件 + Webhook" : "仅 Webhook"}</b><em>{noticeDraft.severity}</em></p>
              <p><span>范围</span><b>{noticeEvents.length ? noticeEvents.join(" / ") : "未选择事件"}</b><em>{noticeDraft.digest}</em></p>
              <p className={noticeConnection.tone === "ok" ? "ok-line" : noticeConnection.tone === "error" ? "error-line" : "warn-line"}><span>{noticeConnection.status}</span><b>{noticeConnection.detail}</b></p>
            </div>
            <div className="settings-buttons notice-actions"><button className="primary" type="button" disabled={readOnly} onClick={saveNoticeSettings}>保存通知设置</button><button className="ghost" type="button" disabled={readOnly} onClick={testNoticeConnection}>检查配置</button><button className="ghost" type="button" disabled={readOnly} onClick={sendNoticePreview}>发送预览</button></div>
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
            <div><strong>最近投递</strong><button type="button" disabled={readOnly} onClick={sendNoticePreview}>发送预览</button></div>
            {noticeDeliveries.map((row) => (
              <p key={row.id}><span>{row.time}</span><b>{row.channel}</b><em>{row.target}</em><StatusLight tone={row.result === "成功" ? "green" : "orange"} /><small>{row.result} · {row.latency}</small></p>
            ))}
          </div>
        </PanelCard>}
      </div>
      {(activeTab === "审计" || activeTab === "基础") && (
        <div inert={settingsModalOpen} aria-hidden={settingsModalOpen ? "true" : undefined}>
          <PanelCard title="最近配置变更" action="查看审计日志" onAction={() => setPage("settings-audit", { message: "已打开设置审计日志", tone: "info" })}>
            <div className="changes-table-wrap">
              <table className="mini-table changes-table">
                <caption>最近配置变更</caption>
                <thead>
                  <tr><th>时间</th><th>操作人</th><th>模块</th><th>动作</th><th>详情</th><th>来源 IP</th></tr>
                </thead>
                <tbody>
                  {settingsAuditRows.map((row) => (
                    <tr key={row.join("-")}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
              <div className="settings-change-card-list">
                {settingsAuditRows.map((row) => (
                  <article key={row.join("-")}>
                    <div><b>{row[2]}</b><span>{row[3]}</span></div>
                    <p>{row[4]}</p>
                    <em>{row[0]} · {row[1]} · {row[5]}</em>
                  </article>
                ))}
              </div>
            </div>
          </PanelCard>
        </div>
      )}
      {backupDrawer && (
        <DetailDrawer
          title={backupDrawer === "verification" ? "备份验证详情" : "全部备份任务"}
          subtitle={backupDrawer === "verification" ? backupVerification.delay : `${backupJobs.length} 条本地任务记录`}
          onClose={() => setBackupDrawer(null)}
          className="settings-detail-drawer"
          modal
          actions={backupDrawer === "verification"
            ? <><button className="ghost" type="button" disabled={readOnly} onClick={testBackupConnection}>重新检查</button><button className="primary" type="button" disabled={readOnly} onClick={startRestoreDrill}>启动演练</button></>
            : <><button className="ghost" type="button" disabled={readOnly || immediateBackupRunning} onClick={createImmediateBackup}>立即备份</button><button className="primary" type="button" disabled={readOnly} onClick={startRestoreDrill}>恢复演练</button></>}
        >
          <div className="settings-backup-drawer">
            {backupDrawer === "verification" ? (
              <>
                <div className="detail-kv">
                  <p><span>最近验证</span><b>{backupVerification.latest}</b></p>
                  <p><span>计划状态</span><b>{backupVerification.delay}</b></p>
                  <p><span>恢复演练</span><b>{backupVerification.drill}</b></p>
                  <p><span>备份目标</span><b>{backupDraft.target}</b></p>
                  <p><span>存储位置</span><b>{backupDraft.location || "未填写"}</b></p>
                  <p><span>备份范围</span><b>{backupItems.join(" / ") || "未选择"}</b></p>
                </div>
                <div className="drawer-list">
                  <strong>验证检查项</strong>
                  <p><StatusLight tone={backupConnectionValid ? "green" : "orange"} /> 目标配置<span>{backupConnection.status}</span></p>
                  <p><StatusLight tone={backupVerification.delayTone === "ok" ? "green" : "orange"} /> 计划延迟<span>{backupVerification.delay}</span></p>
                  <p><StatusLight tone={backupVerification.drillTone === "error" ? "red" : "green"} /> 恢复演练<span>{backupVerification.drill}</span></p>
                </div>
              </>
            ) : (
              <div className="drawer-list settings-backup-job-list">
                <strong>备份任务记录</strong>
                {backupJobs.map((job) => (
                  <p key={job.id}>
                    <StatusLight tone={job.status === "延迟" || job.status === "运行中" ? "orange" : "green"} />
                    {job.time}
                    <span>{job.status} · {job.size} · {job.duration}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </DetailDrawer>
      )}
      {generatedToken && (
        <TokenSecretDrawer
          generated={generatedToken}
          onCopy={copyGeneratedToken}
          onClose={() => setGeneratedToken(null)}
        />
      )}
    </div>
  );
}

export { SettingsPage };
