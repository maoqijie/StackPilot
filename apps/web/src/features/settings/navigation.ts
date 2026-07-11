import type { PageKey } from "../../types/app";

const settingsTabs = ["基础", "安全", "代理", "通知", "备份", "审计"];

function settingsPageForTab(tab: string): PageKey {
  if (tab === "代理") return "settings-proxy";
  if (tab === "安全") return "settings-security";
  if (tab === "通知") return "settings-notice";
  if (tab === "备份") return "settings-backup";
  if (tab === "审计") return "settings-audit";
  return "settings-general";
}

export { settingsPageForTab, settingsTabs };
