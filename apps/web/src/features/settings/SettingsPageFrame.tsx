import { resolvePageMeta } from "../../app/navigation";
import { settingsPagePreset } from "../../app/pagePresets";
import { ModulePageShell } from "../../components/layout/ModulePageShell";
import type { PageKey, SetPage } from "../../types/app";
import { SettingsTabs } from "./SettingsTabs";

const settingsCopy: Record<string, { subtitle: string; chips: string[] }> = {
  "settings-general": {
    subtitle: "管理面板身份、区域偏好、只读状态与访问令牌。",
    chips: ["面板身份", "访问令牌", "配置变更"],
  },
  "settings-proxy": {
    subtitle: "管理代理节点、路由规则和运行时环境变量。",
    chips: ["代理节点", "路由规则", "NO_PROXY"],
  },
  "settings-security": {
    subtitle: "集中维护登录保护、会话边界和来源网络访问策略。",
    chips: ["MFA", "会话策略", "IP 白名单"],
  },
  "settings-notice": {
    subtitle: "配置事件范围、通知渠道和投递策略，并核对最近投递结果。",
    chips: ["Webhook", "邮件", "投递记录"],
  },
  "settings-backup": {
    subtitle: "管理 Controller 控制面数据的系统备份、完整性校验与隔离恢复演练。",
    chips: ["SQLite", "完整性校验", "恢复演练"],
  },
  "settings-audit": {
    subtitle: "只读查看设置变更，快速定位操作人、来源地址和具体修改内容。",
    chips: ["只读", "配置变更", "来源追踪"],
  },
};

function SettingsPageFrame({
  page,
  setPage,
  inert,
  actions,
  filters,
  metrics,
  side,
  sideModal,
  children,
}: {
  page: PageKey;
  setPage: SetPage;
  inert?: boolean;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  metrics?: React.ReactNode;
  side?: React.ReactNode;
  sideModal?: boolean;
  children: React.ReactNode;
}) {
  const copy = settingsCopy[page] ?? settingsCopy["settings-general"];
  return (
    <ModulePageShell
      title={resolvePageMeta(page).title}
      subtitle={copy.subtitle}
      page={page}
      className="settings-page"
      viewContext={{
        eyebrow: `设置 / ${resolvePageMeta(page).title}`,
        title: resolvePageMeta(page).title,
        chips: copy.chips,
      }}
      tabs={<SettingsTabs activeTab={settingsPagePreset(page)} setPage={setPage} inert={inert} />}
      actions={actions}
      filters={filters}
      metrics={metrics}
      side={side}
      sideModal={sideModal}
    >
      {children}
    </ModulePageShell>
  );
}

export { SettingsPageFrame };
