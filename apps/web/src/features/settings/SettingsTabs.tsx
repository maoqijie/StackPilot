import type { SetPage } from "../../types/app";
import { settingsPageForTab, settingsTabs } from "./navigation";

function SettingsTabs({ activeTab, setPage, inert }: { activeTab: string; setPage: SetPage; inert?: boolean }) {
  return (
    <nav className="settings-tabs" aria-label="设置分区" inert={Boolean(inert)} aria-hidden={inert ? "true" : undefined}>
      {settingsTabs.map((tab) => (
        <button className={tab === activeTab ? "active" : ""} type="button" aria-current={tab === activeTab ? "page" : undefined} key={tab} onClick={() => setPage(settingsPageForTab(tab), { message: `已切换到${tab}设置`, tone: "info" })}>
          {tab}
        </button>
      ))}
    </nav>
  );
}

export { SettingsTabs };
