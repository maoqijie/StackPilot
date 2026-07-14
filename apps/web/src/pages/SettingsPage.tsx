import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import type { Permission } from "@stackpilot/contracts";
import { useRef, useState } from "react";
import { settingsPagePreset } from "../app/pagePresets";
import { settingsPageForTab } from "../features/settings/navigation";
import { SettingsTabs } from "../features/settings/SettingsTabs";
import { resolvePageMeta, viewContextForPage } from "../app/navigation";
import { ModuleViewContext } from "../components/layout/ModulePageShell";
import { PanelCard } from "../components/ui/Cards";
import { FormLine, FormSelectLine, ToggleLine } from "../components/ui/FormControls";
import { StatusLight } from "../components/ui/StatusVisuals";
import { TokenSecretDrawer, TokenTable } from "../features/settings/TokenManagement";
import { SystemBackupsPanel } from "../features/settings/SystemBackupsPanel";
import { useNotificationSettings } from "../features/settings/useNotificationSettings";
import { useSecuritySettings } from "../features/settings/useSecuritySettings";
import type { GeneratedTokenSecret, SettingsChangeRow, TokenRow, TokenStatus } from "../features/settings/types";
import { initialSettingsChanges, initialTokenRows } from "../mocks/demoData";
import type { Notify, PageKey, SetPage, SettingsReadOnlyState } from "../types/app";
import { currentDateTime } from "../utils/time";

function SettingsPage({
  page,
  setPage,
  notify,
  readOnlyState,
  permissions = [],
}: {
  page: PageKey;
  setPage: SetPage;
  notify: Notify;
  readOnlyState: SettingsReadOnlyState;
  permissions?: Permission[];
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
  const activeSettingsPage = settingsPageForTab(activeTab);
  const settingsModalOpen = Boolean(generatedToken);
  const guardSettingsWrite = (action: string) => {
    if (!readOnly) return true;
    notify(`只读模式已开启，无法${action}`, "warning");
    return false;
  };
  const security = useSecuritySettings(guardSettingsWrite, notify);
  const notice = useNotificationSettings(guardSettingsWrite, notify);
  const { twoFactor, setTwoFactor, multiLogin, setMultiLogin, securityWhitelistInputRef, securityDraft, securityError, securitySavedAt, securityReview, setSecurityReview, securityReviewTone, setSecurityReviewTone, updateSecurityDraft, saveSecurityPolicy, runSecurityReview } = security;
  const { mailNotice, setMailNotice, noticeWebhookInputRef, noticeRecipientsInputRef, noticeDraft, setNoticeDraft, savedNotice, noticeErrors, setNoticeErrors, noticeConnection, setNoticeConnection, noticeSavedAt, noticeEvents, noticeDeliveries, noticeSignature, updateNoticeDraft, toggleNoticeEvent, testNoticeConnection, saveNoticeSettings, sendNoticePreview, readNoticeDraft } = notice;
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
        {activeTab === "备份" && <div className="settings-card-wide"><SystemBackupsPanel notify={notify} permissions={permissions} readOnly={readOnly} /></div>}
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
