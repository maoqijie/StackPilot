import { Activity, Bell, CloudUpload, Database, FileText, Globe2, Home, KeyRound, Menu, RefreshCw, Server, Shield, TerminalSquare, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cleanCurrentRouteForPage, isStaleTransientRoute, pushPageRoute, readUrlParams, setQuickRoute, writeRouteState } from "../../app/routing";
import { ClipboardIcon } from "../../components/ui/Cards";
import { Sparkline, StatusLight } from "../../components/ui/StatusVisuals";
import { MobileSheet } from "./MobileSheet";
import { mobileActionImpact, mobileActionSummary, mobileActionTitle, mobileActionTone } from "./model";
import type { MobileActionKind, MobileHostRecord, MobileQuickAction, MobileSheetState, MobileSiteRecord, MobileTab, MobileTabIcon, MobileTaskRecord } from "./types";
import { mobileAuditRows, mobileNoticeRows, mobileQuickActions } from "../../mocks/demoData";
import type { Notify, PageKey, QuickIntent, Tone } from "../../types/app";
import { activateOnKeyboard } from "../../utils/focus";

const mobileTabs: Array<[MobileTabIcon, MobileTab]> = [
  [Home, "首页"],
  [Server, "主机"],
  [Globe2, "网站"],
  [ClipboardIcon, "任务"],
  [UserRound, "我的"],
];

const mobileTabValues = mobileTabs.map(([, label]) => label);

function isMobileTab(value: string): value is MobileTab {
  return mobileTabValues.includes(value as MobileTab);
}

function readMobileTabFromUrl(): MobileTab {
  if (typeof window === "undefined") return "首页";
  const tab = readUrlParams().get("mobileTab");
  return tab && isMobileTab(tab) ? tab : "首页";
}

function writeMobileSheetToUrl(sheet: MobileSheetState | null, historyMode: "push" | "replace" = "push") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const activeTab = readMobileTabFromUrl();
  if (activeTab === "首页") {
    url.searchParams.delete("mobileTab");
  } else {
    url.searchParams.set("mobileTab", activeTab);
  }
  url.hash = "mobile";
  ["mobileSheet", "sheetAction", "sheetTarget", "sheetLabel"].forEach((key) => url.searchParams.delete(key));
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  if (nextUrl === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  writeRouteState(sheet ? "replace" : historyMode, nextUrl, url.searchParams);
}

function clearMobileSheetFromUrl(historyMode: "push" | "replace" = "push") {
  writeMobileSheetToUrl(null, historyMode);
}

function MobileApp({ notify }: { notify: Notify }) {
  const [activeTab, setActiveTab] = useState<MobileTab>(() => readMobileTabFromUrl());
  const mobileContentRef = useRef<HTMLDivElement>(null);
  const [activeQuick, setActiveQuick] = useState("添加主机");
  const [quickDrafts, setQuickDrafts] = useState<string[]>([]);
  const [favoriteQuickActions, setFavoriteQuickActions] = useState<string[]>(["添加主机", "终端连接"]);
  const [hostFilter, setHostFilter] = useState("全部");
  const [siteFilter, setSiteFilter] = useState("全部");
  const [taskFilter, setTaskFilter] = useState("全部");
  const [unreadNoticeIds, setUnreadNoticeIds] = useState(() => mobileNoticeRows.map((notice) => notice.id));
  const [pushEnabled, setPushEnabled] = useState(true);
  const [mfaEnabled, setMfaEnabled] = useState(true);
  const [mobileSheet, setMobileSheet] = useState<MobileSheetState | null>(null);
  const [mobileHosts, setMobileHosts] = useState<MobileHostRecord[]>([
    { id: "web-01", name: "web-01", env: "生产环境", ip: "203.0.113.10", os: "Ubuntu 22.04", cpu: "12%", memory: "38%", uptime: "2 天", health: "健康" },
    { id: "web-02", name: "web-02", env: "生产环境", ip: "203.0.113.11", os: "Ubuntu 22.04", cpu: "22%", memory: "45%", uptime: "5 天", health: "健康" },
    { id: "db-01", name: "db-01", env: "数据库", ip: "203.0.113.20", os: "Ubuntu 22.04", cpu: "35%", memory: "62%", uptime: "12 天", health: "告警" },
    { id: "dev-01", name: "dev-01", env: "开发环境", ip: "10.0.4.21", os: "Debian 12", cpu: "8%", memory: "29%", uptime: "18 小时", health: "健康" },
  ]);
  const [mobileSites, setMobileSites] = useState<MobileSiteRecord[]>([
    { id: "site-main", domain: "stackpilot.io", runtime: "Node 20", host: "web-01", status: "运行中", certDays: 72, traffic: "128 GB" },
    { id: "site-shop", domain: "shop.example.com", runtime: "PHP 8.3", host: "web-02", status: "运行中", certDays: 11, traffic: "86 GB" },
    { id: "site-docs", domain: "docs.example.com", runtime: "Static", host: "web-01", status: "运行中", certDays: 45, traffic: "24 GB" },
    { id: "site-lab", domain: "lab.internal", runtime: "Node 18", host: "dev-01", status: "已停止", certDays: 30, traffic: "3 GB" },
  ]);
  const [mobileTasks, setMobileTasks] = useState<MobileTaskRecord[]>([
    { id: "deploy-laravel", icon: CloudUpload, title: "部署 Laravel 应用到 web-01", operator: "admin 触发", status: "成功", time: "2 分钟前" },
    { id: "backup-shop", icon: Database, title: "备份数据库 shop_db", operator: "system 自动", status: "成功", time: "15 分钟前" },
    { id: "update-web02", icon: RefreshCw, title: "更新系统组件 /web-02", operator: "admin 触发", status: "警告", time: "32 分钟前" },
    { id: "restart-nginx", icon: Server, title: "重启 Nginx 服务（web-01）", operator: "自动监控", status: "成功", time: "1 小时前" },
    { id: "login-terminal", icon: TerminalSquare, title: "登录到 203.0.113.10", operator: "admin 登录", status: "信息", time: "1 小时前" },
  ]);
  const mobileSiteDisplayStatus = (site: MobileSiteRecord) => (
    site.certDays <= 14 && site.status === "运行中" ? "证书告警" : site.status
  );
  const tabSummary: Record<MobileTab, string> = {
    首页: `${mobileHosts.filter((host) => host.health === "健康").length} 台主机在线 · ${mobileHosts.filter((host) => host.health === "告警").length} 个告警`,
    主机: `${mobileHosts.length} 台主机 · ${mobileHosts.filter((host) => host.health === "告警").length} 台需要关注`,
    网站: `${mobileSites.filter((site) => mobileSiteDisplayStatus(site) === "运行中").length} 个网站正常运行`,
    任务: `${mobileTasks.length} 条最近任务 · ${mobileTasks.filter((task) => task.status === "警告").length} 条警告`,
    我的: `管理员 · 推送${pushEnabled ? "已开启" : "已关闭"}`,
  };
  const visibleHosts = mobileHosts.filter((host) => (
    hostFilter === "全部" || host.env === hostFilter || host.health === hostFilter
  ));
  const visibleSites = mobileSites.filter((site) => (
    siteFilter === "全部" || mobileSiteDisplayStatus(site) === siteFilter
  ));
  const visibleTasks = mobileTasks.filter((task) => taskFilter === "全部" || task.status === taskFilter);
  const unreadNoticeCount = unreadNoticeIds.length;
  const selectedHost = mobileSheet?.type === "host" ? mobileHosts.find((host) => host.id === mobileSheet.hostId) ?? null : null;
  const selectedSite = mobileSheet?.type === "site" ? mobileSites.find((site) => site.id === mobileSheet.siteId) ?? null : null;
  const selectedTask = mobileSheet?.type === "task" ? mobileTasks.find((task) => task.id === mobileSheet.taskId) ?? null : null;
  const selectedQuickAction = mobileSheet?.type === "quick"
    ? mobileQuickActions.find((action) => action.label === mobileSheet.action) ?? null
    : null;
  const selectedModuleAction = mobileSheet?.type === "module"
    ? mobileQuickActions.find((action) => action.label === mobileSheet.action) ?? null
    : null;
  const selectedActionHost = mobileSheet?.type === "action" && mobileSheet.targetId
    ? mobileHosts.find((host) => host.id === mobileSheet.targetId) ?? null
    : null;
  const selectedActionSite = mobileSheet?.type === "action" && mobileSheet.targetId
    ? mobileSites.find((site) => site.id === mobileSheet.targetId) ?? null
    : null;
  const selectedActionTask = mobileSheet?.type === "action" && mobileSheet.targetId
    ? mobileTasks.find((task) => task.id === mobileSheet.targetId) ?? null
    : null;
  const selectedActionLabel = mobileSheet?.type === "action" ? mobileSheet.label ?? "" : "";
  const openMobileSheet = (sheet: MobileSheetState, historyMode: "push" | "replace" = "push") => {
    setMobileSheet(sheet);
    writeMobileSheetToUrl(sheet, historyMode);
  };
  const replaceMobileSheet = (sheet: MobileSheetState) => openMobileSheet(sheet, "replace");
  const closeMobileSheet = (historyMode: "push" | "replace" = "replace") => {
    setMobileSheet(null);
    clearMobileSheetFromUrl(historyMode);
  };
  const openMobileTabFromSheet = (tab: MobileTab, shouldNotify = true) => {
    setMobileTab(tab, shouldNotify, "replace");
  };
  const openDesktopPageFromMobileSheet = (page: PageKey, notifyMessage: string, intent?: QuickIntent) => {
    setMobileSheet(null);
    clearMobileSheetFromUrl("replace");
    if (intent) {
      setQuickRoute(page, intent);
    } else {
      pushPageRoute(page);
    }
    notify(notifyMessage, "info");
  };
  useEffect(() => {
    const syncMobileRoute = () => {
      if (isStaleTransientRoute()) {
        window.history.replaceState(null, "", cleanCurrentRouteForPage("mobile"));
      }
      if (readUrlParams().has("mobileSheet")) {
        window.history.replaceState(null, "", cleanCurrentRouteForPage("mobile"));
      }
      setActiveTab(readMobileTabFromUrl());
      setMobileSheet(null);
      window.requestAnimationFrame(() => mobileContentRef.current?.scrollTo({ top: 0 }));
    };
    window.addEventListener("popstate", syncMobileRoute);
    window.addEventListener("hashchange", syncMobileRoute);
    window.addEventListener("pageshow", syncMobileRoute);
    return () => {
      window.removeEventListener("popstate", syncMobileRoute);
      window.removeEventListener("hashchange", syncMobileRoute);
      window.removeEventListener("pageshow", syncMobileRoute);
    };
  }, []);

  const setMobileTab = (tab: MobileTab, shouldNotify = true, historyMode: "push" | "replace" = "push") => {
    setActiveTab(tab);
    setMobileSheet(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (tab === "首页") {
        url.searchParams.delete("mobileTab");
      } else {
        url.searchParams.set("mobileTab", tab);
      }
      ["mobileSheet", "sheetAction", "sheetTarget", "sheetLabel"].forEach((key) => url.searchParams.delete(key));
      url.hash = "mobile";
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
        writeRouteState(historyMode, nextUrl, url.searchParams);
      }
    }
    if (shouldNotify) notify(`已切换到移动端${tab}`, "info");
  };
  useEffect(() => {
    const isInvalidSheet = (
      (mobileSheet?.type === "host" && !selectedHost)
      || (mobileSheet?.type === "site" && !selectedSite)
      || (mobileSheet?.type === "task" && !selectedTask)
      || (mobileSheet?.type === "quick" && !selectedQuickAction)
      || (mobileSheet?.type === "module" && !selectedModuleAction)
    );
    if (!isInvalidSheet) return undefined;
    const frame = window.requestAnimationFrame(() => closeMobileSheet("replace"));
    return () => window.cancelAnimationFrame(frame);
  }, [mobileSheet, selectedHost, selectedSite, selectedTask, selectedQuickAction, selectedModuleAction]);
  const updateHost = (id: string, patch: Partial<MobileHostRecord>) => {
    setMobileHosts((current) => current.map((host) => (host.id === id ? { ...host, ...patch } : host)));
  };
  const updateSite = (id: string, patch: Partial<MobileSiteRecord>) => {
    setMobileSites((current) => current.map((site) => (site.id === id ? { ...site, ...patch } : site)));
  };
  const updateTask = (id: string, patch: Partial<MobileTaskRecord>) => {
    setMobileTasks((current) => current.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  };
  const statusTone = (status: string): Tone => {
    if (status === "警告" || status === "告警" || status === "证书告警") return "orange";
    if (status === "信息" || status === "运行中") return "blue";
    if (status === "已停止") return "gray";
    return "green";
  };
  const openQuickTarget = (action: MobileQuickAction) => {
    if (["首页", "主机", "网站", "任务", "我的"].includes(action.target)) {
      openMobileTabFromSheet(action.target as MobileTab, false);
      notify(`已打开${action.targetHint}`, "info");
      return;
    }
    if (action.target === "数据库") {
      openDesktopPageFromMobileSheet("databases", `已打开${action.targetHint}`, "create-database");
    } else if (action.target === "文件") {
      openDesktopPageFromMobileSheet("files-upload", `已打开${action.targetHint}`);
    } else if (action.target === "终端") {
      openDesktopPageFromMobileSheet("terminal", `已打开${action.targetHint}`, "open-terminal");
    } else if (action.target === "系统服务") {
      openDesktopPageFromMobileSheet("systemd", `已打开${action.targetHint}`);
    } else if (action.target === "防火墙") {
      openDesktopPageFromMobileSheet("firewall", `已打开${action.targetHint}`);
    }
  };
  const saveQuickDraft = (action: MobileQuickAction) => {
    setQuickDrafts((current) => (
      current.includes(action.label) ? current : [...current, action.label]
    ));
    notify(`${action.draft}已创建`, "info");
  };
  const toggleFavoriteQuick = (action: MobileQuickAction) => {
    setFavoriteQuickActions((current) => (
      current.includes(action.label)
        ? current.filter((item) => item !== action.label)
        : [...current, action.label]
    ));
  };
  const runMobileAction = (action: MobileActionKind, targetId?: string) => {
    if (action === "host-restart" && targetId) {
      const host = mobileHosts.find((item) => item.id === targetId);
      updateHost(targetId, { uptime: "刚刚重启", health: "健康" });
      notify(`${host?.name ?? "主机"} 已重启`);
      closeMobileSheet();
      return;
    }
    if (action === "host-backup" && targetId) {
      const host = mobileHosts.find((item) => item.id === targetId);
      const nextTask: MobileTaskRecord = {
        id: `mobile-backup-${targetId}-${Date.now()}`,
        icon: Database,
        title: `备份主机 ${host?.name ?? targetId}`,
        operator: "admin 触发",
        status: "成功",
        time: "刚刚",
      };
      setMobileTasks((current) => [nextTask, ...current]);
      notify(`${host?.name ?? "主机"} 已创建备份`, "info");
      closeMobileSheet();
      return;
    }
    if (action === "site-toggle" && targetId) {
      const site = mobileSites.find((item) => item.id === targetId);
      if (site) {
        updateSite(targetId, { status: site.status === "已停止" ? "运行中" : "已停止" });
        notify(`${site.domain} 已${site.status === "已停止" ? "启动" : "停止"}`);
      }
      closeMobileSheet();
      return;
    }
    if (action === "site-renew" && targetId) {
      const site = mobileSites.find((item) => item.id === targetId);
      updateSite(targetId, { certDays: 90, status: "运行中" });
      notify(`${site?.domain ?? "网站"} 证书已续期`);
      closeMobileSheet();
      return;
    }
    if (action === "task-rerun" && targetId) {
      const task = mobileTasks.find((item) => item.id === targetId);
      updateTask(targetId, { status: "运行中", time: "刚刚" });
      notify(`已重新执行：${task?.title ?? "任务"}`);
      closeMobileSheet();
      return;
    }
    if (action === "task-complete" && targetId) {
      updateTask(targetId, { status: "成功", time: "刚刚完成" });
      notify("任务已标记完成");
      closeMobileSheet();
      return;
    }
    if (action === "profile-refresh") {
      notify("移动端资料已刷新", "info");
      closeMobileSheet();
      return;
    }
    if (action === "push-toggle") {
      setPushEnabled((value) => !value);
      notify(`移动端推送已${pushEnabled ? "关闭" : "开启"}`);
      closeMobileSheet();
      return;
    }
    if (action === "mfa-toggle") {
      setMfaEnabled((value) => !value);
      notify(`MFA 已${mfaEnabled ? "暂停" : "启用"}`, "info");
      closeMobileSheet();
      return;
    }
    if (action === "audit-view") {
      replaceMobileSheet({ type: "audit" });
      notify("已打开移动端审计记录", "info");
      return;
    }
    if (action === "diagnostics") {
      const summary = [
        "StackPilot mobile diagnostics",
        `hosts=${mobileHosts.length}`,
        `alerts=${mobileHosts.filter((host) => host.health === "告警").length}`,
        `sites=${mobileSites.length}`,
        `tasks=${mobileTasks.length}`,
        `push=${pushEnabled ? "enabled" : "disabled"}`,
        `mfa=${mfaEnabled ? "enabled" : "paused"}`,
      ].join("\n");
      if (!navigator.clipboard?.writeText) {
        notify("当前浏览器不支持复制诊断摘要", "warning");
        closeMobileSheet();
        return;
      }
      void navigator.clipboard.writeText(summary)
        .then(() => notify("移动端诊断摘要已复制", "info"))
        .catch(() => notify("复制诊断摘要失败，请检查剪贴板权限", "danger"));
      closeMobileSheet();
      return;
    }
    if (action === "notification-open") {
      if (targetId) {
        setUnreadNoticeIds((current) => current.filter((id) => id !== targetId));
      }
      notify(`已打开通知：${selectedActionLabel || "通知详情"}`, "info");
      closeMobileSheet();
      return;
    }
    if (action === "terminal-open") {
      notify(`${selectedActionLabel || "主机"} 终端已准备`, "info");
      closeMobileSheet();
    }
  };

  useEffect(() => {
    mobileContentRef.current?.scrollTo({ top: 0 });
  }, [activeTab]);

  return (
    <section className="mobile-app-shell">
      <header className="mobile-top" inert={Boolean(mobileSheet)} aria-hidden={mobileSheet ? "true" : undefined}>
        <button type="button" className="mobile-icon-button" aria-label="打开菜单" onClick={() => openMobileSheet({ type: "menu" })}><Menu size={20} /></button>
        <div className="mobile-brand"><div className="brand-gem small" /><strong>StackPilot</strong></div>
        <div className="mobile-icons">
          <button
            type="button"
            aria-label={unreadNoticeCount > 0 ? `查看通知，${unreadNoticeCount} 条未读` : "查看通知，无未读"}
            onClick={() => openMobileSheet({ type: "notifications" })}
          >
            <Bell size={18} />
          </button>
          {unreadNoticeCount > 0 && <i aria-hidden="true">{unreadNoticeCount}</i>}
          <button type="button" aria-label="打开个人中心" onClick={() => setMobileTab("我的")}><b>U</b></button>
        </div>
      </header>
      <div className="mobile-content" ref={mobileContentRef} inert={Boolean(mobileSheet)} aria-hidden={mobileSheet ? "true" : undefined}>
        <h2>{activeTab === "首页" ? "上午好，管理员" : activeTab}</h2>
        <p>{activeTab} · {tabSummary[activeTab]}</p>
        {activeTab === "首页" && (
          <>
            <div className="mobile-stats">
              {[
                [Server, "主机", `${mobileHosts.length}`, `${mobileHosts.filter((host) => host.health === "健康").length} 台在线`, "green"],
                [Globe2, "网站", `${mobileSites.filter((site) => mobileSiteDisplayStatus(site) === "运行中").length}`, `${mobileSites.filter((site) => mobileSiteDisplayStatus(site) !== "运行中").length} 个待处理`, "green"],
                [Database, "数据库", "8", "运行中", "green"],
                [Shield, "告警", `${mobileHosts.filter((host) => host.health === "告警").length + mobileTasks.filter((task) => task.status === "警告").length}`, "需要处理", "orange"],
              ].map(([Icon, label, value, desc, tone]) => (
                <article key={label as string}>
                  <Icon className={tone as string} size={20} />
                  <span>{label as string}</span>
                  <strong>{value as string}</strong>
                  <em><StatusLight tone={tone as Tone} />{desc as string}</em>
                </article>
              ))}
            </div>
            <MobileCard title="系统状态" action="查看详情" onAction={() => openMobileSheet({ type: "system" })}>
              <div className="mobile-resource">
                {[
                  ["CPU", "18%", "负载 0.38", [18, 14, 23, 16, 28, 18, 22]],
                  ["内存", "42%", "3.2 / 7.6 GB", [38, 42, 39, 46, 41, 43, 45]],
                  ["磁盘", "37%", "180 / 480 GB", [35, 39, 37, 42, 36, 41, 38]],
                ].map(([label, value, desc, values]) => (
                  <article key={label as string}>
                    <span>{label as string}</span>
                    <strong>{value as string}</strong>
                    <Sparkline values={values as number[]} tone="blue" />
                    <em>{desc as string}</em>
                  </article>
                ))}
              </div>
            </MobileCard>
            <MobileCard title="最近任务" action="查看全部" onAction={() => { setTaskFilter("全部"); setMobileTab("任务"); }}>
              <div className="mobile-task-list">
                {mobileTasks.slice(0, 4).map((task) => {
                  const Icon = task.icon;
                  const openTask = () => openMobileSheet({ type: "task", taskId: task.id });
                  return (
                    <div key={task.id} role="button" tabIndex={0} onClick={openTask} onKeyDown={(event) => activateOnKeyboard(event, openTask)}>
                      <span className="mobile-task-icon"><Icon size={14} /></span>
                      <p><strong>{task.title}</strong><em>{task.operator}</em></p>
                      <StatusLight tone={statusTone(task.status)} />
                      <b>{task.status}</b>
                      <small>{task.time}</small>
                    </div>
                  );
                })}
              </div>
            </MobileCard>
            <MobileCard title="快捷操作">
              <div className="mobile-quick">
                {mobileQuickActions.map((action) => (
                  <button
                    className={action.label === activeQuick ? "active" : ""}
                    key={action.label}
                    type="button"
                    aria-current={action.label === activeQuick ? "true" : undefined}
                    onClick={() => {
                      setActiveQuick(action.label);
                      openMobileSheet({ type: "quick", action: action.label });
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            </MobileCard>
          </>
        )}
        {activeTab === "主机" && (
          <>
            <div className="mobile-filter-tabs" role="group" aria-label="主机筛选">
              {["全部", "生产环境", "开发环境", "告警"].map((filter) => (
                <button className={hostFilter === filter ? "active" : ""} key={filter} type="button" aria-pressed={hostFilter === filter} onClick={() => setHostFilter(filter)}>{filter}</button>
              ))}
            </div>
            <div className="mobile-list">
              {visibleHosts.map((host) => (
                <article className="mobile-list-item" key={host.id}>
                  <header>
                    <StatusLight tone={host.health === "告警" ? "orange" : "green"} />
                    <h3>{host.name}</h3>
                    <span className={`mobile-status-pill ${statusTone(host.health)}`}>{host.health}</span>
                  </header>
                  <p>{host.env} · {host.ip} · {host.os}</p>
                  <div className="mobile-row-meta">
                    <span>CPU <b>{host.cpu}</b></span>
                    <span>内存 <b>{host.memory}</b></span>
                    <span>运行 <b>{host.uptime}</b></span>
                  </div>
                  <div className="mobile-row-actions">
                    <button type="button" aria-label={`重启主机 ${host.name}`} onClick={() => openMobileSheet({ type: "action", action: "host-restart", targetId: host.id })}>重启</button>
                    <button type="button" aria-label={`备份主机 ${host.name}`} onClick={() => openMobileSheet({ type: "action", action: "host-backup", targetId: host.id })}>备份</button>
                    <button type="button" aria-label={`查看主机 ${host.name} 详情`} onClick={() => openMobileSheet({ type: "host", hostId: host.id })}>详情</button>
                  </div>
                </article>
              ))}
              {visibleHosts.length === 0 && <div className="mobile-empty">没有匹配的主机</div>}
            </div>
          </>
        )}
        {activeTab === "网站" && (
          <>
            <div className="mobile-filter-tabs" role="group" aria-label="网站筛选">
              {["全部", "运行中", "已停止", "证书告警"].map((filter) => (
                <button className={siteFilter === filter ? "active" : ""} key={filter} type="button" aria-pressed={siteFilter === filter} onClick={() => setSiteFilter(filter)}>{filter}</button>
              ))}
            </div>
            <div className="mobile-list">
              {visibleSites.map((site) => {
                const displayStatus = mobileSiteDisplayStatus(site);
                return (
                  <article className="mobile-list-item" key={site.id}>
                    <header>
                      <StatusLight tone={statusTone(displayStatus)} />
                      <h3>{site.domain}</h3>
                      <span className={`mobile-status-pill ${statusTone(displayStatus)}`}>{displayStatus}</span>
                    </header>
                    <p>{site.runtime} · {site.host} · {site.traffic}</p>
                    <div className="mobile-row-meta">
                      <span>证书 <b className={site.certDays <= 14 ? "orange-text" : "green-text"}>{site.certDays} 天</b></span>
                      <span>主机 <b>{site.host}</b></span>
                      <span>流量 <b>{site.traffic}</b></span>
                    </div>
                    <div className="mobile-row-actions">
                      <button type="button" aria-label={`${site.status === "已停止" ? "启动" : "停止"}网站 ${site.domain}`} onClick={() => openMobileSheet({ type: "action", action: "site-toggle", targetId: site.id })}>{site.status === "已停止" ? "启动" : "停止"}</button>
                      <button type="button" aria-label={`续期网站 ${site.domain} 证书`} onClick={() => openMobileSheet({ type: "action", action: "site-renew", targetId: site.id })}>续期</button>
                      <button type="button" aria-label={`查看网站 ${site.domain} 日志`} onClick={() => openMobileSheet({ type: "site", siteId: site.id })}>日志</button>
                    </div>
                  </article>
                );
              })}
              {visibleSites.length === 0 && <div className="mobile-empty">没有匹配的网站</div>}
            </div>
          </>
        )}
        {activeTab === "任务" && (
          <>
            <div className="mobile-filter-tabs" role="group" aria-label="任务筛选">
              {["全部", "运行中", "警告", "成功"].map((filter) => (
                <button className={taskFilter === filter ? "active" : ""} key={filter} type="button" aria-pressed={taskFilter === filter} onClick={() => setTaskFilter(filter)}>{filter}</button>
              ))}
            </div>
            <div className="mobile-list">
              {visibleTasks.map((task) => {
                const Icon = task.icon;
                return (
                  <article className="mobile-list-item" key={task.id}>
                    <header>
                      <span className="mobile-task-icon"><Icon size={14} /></span>
                      <h3>{task.title}</h3>
                      <span className={`mobile-status-pill ${statusTone(task.status)}`}>{task.status}</span>
                    </header>
                    <p>{task.operator} · {task.time}</p>
                    <div className="mobile-row-actions">
                      <button type="button" aria-label={`查看任务 ${task.title} 日志`} onClick={() => openMobileSheet({ type: "task", taskId: task.id })}>日志</button>
                      <button type="button" aria-label={`重跑任务 ${task.title}`} onClick={() => openMobileSheet({ type: "action", action: "task-rerun", targetId: task.id })}>重跑</button>
                      <button type="button" aria-label={`完成任务 ${task.title}`} onClick={() => openMobileSheet({ type: "action", action: "task-complete", targetId: task.id })}>完成</button>
                    </div>
                  </article>
                );
              })}
              {visibleTasks.length === 0 && <div className="mobile-empty">没有匹配的任务</div>}
            </div>
          </>
        )}
        {activeTab === "我的" && (
          <>
            <div className="mobile-profile">
              <section className="mobile-profile-hero">
                <b>U</b>
                <div><strong>管理员</strong><span>生产运维空间 · 超级管理员</span></div>
                <button type="button" onClick={() => openMobileSheet({ type: "action", action: "profile-refresh" })}><RefreshCw size={14} />刷新</button>
              </section>
              <div className="mobile-row-meta">
                <span>MFA <b>{mfaEnabled ? "已启用" : "未启用"}</b></span>
                <span>推送 <b>{pushEnabled ? "开启" : "关闭"}</b></span>
                <span>会话 <b>3 台</b></span>
              </div>
            </div>
            <MobileCard title="账号设置">
              <div className="mobile-settings-list">
                <button
                  type="button"
                  aria-label={`通知推送，当前${pushEnabled ? "开启" : "关闭"}，打开确认`}
                  aria-haspopup="dialog"
                  aria-expanded={mobileSheet?.type === "action" && mobileSheet.action === "push-toggle"}
                  onClick={() => openMobileSheet({ type: "action", action: "push-toggle" })}
                >
                  <span><Bell size={16} />通知推送</span><b>{pushEnabled ? "开启" : "关闭"}</b>
                </button>
                <button
                  type="button"
                  aria-label={`MFA 验证，当前${mfaEnabled ? "启用" : "暂停"}，打开确认`}
                  aria-haspopup="dialog"
                  aria-expanded={mobileSheet?.type === "action" && mobileSheet.action === "mfa-toggle"}
                  onClick={() => openMobileSheet({ type: "action", action: "mfa-toggle" })}
                >
                  <span><KeyRound size={16} />MFA 验证</span><b>{mfaEnabled ? "启用" : "暂停"}</b>
                </button>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  aria-expanded={mobileSheet?.type === "audit"}
                  onClick={() => openMobileSheet({ type: "audit" })}
                >
                  <span><FileText size={16} />我的审计</span><b>128 条</b>
                </button>
                <button type="button" onClick={() => openMobileSheet({ type: "action", action: "diagnostics" })}>
                  <span><Activity size={16} />诊断摘要</span><b>正常</b>
                </button>
              </div>
            </MobileCard>
          </>
        )}
      </div>
      <nav className="mobile-tabbar" aria-label="移动端主导航" inert={Boolean(mobileSheet)} aria-hidden={mobileSheet ? "true" : undefined}>
        {mobileTabs.map(([Icon, label]) => (
          <button
            className={label === activeTab ? "active" : ""}
            key={label}
            type="button"
            aria-current={label === activeTab ? "page" : undefined}
            onClick={() => {
              if (label !== activeTab) {
                setMobileTab(label);
              }
            }}
          >
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {mobileSheet && (
        <MobileSheet
          title={
            mobileSheet.type === "menu" ? "快捷菜单"
              : mobileSheet.type === "system" ? "系统状态"
                : mobileSheet.type === "notifications" ? "通知中心"
                  : mobileSheet.type === "audit" ? "我的审计"
                    : mobileSheet.type === "quick" ? mobileSheet.action
                      : mobileSheet.type === "module" ? selectedModuleAction?.target ?? "模块入口"
                        : mobileSheet.type === "action" ? mobileActionTitle(mobileSheet.action, selectedActionHost, selectedActionSite, selectedActionTask, pushEnabled, mfaEnabled, selectedActionLabel)
                          : mobileSheet.type === "host" ? selectedHost?.name ?? "主机详情"
                            : mobileSheet.type === "site" ? selectedSite?.domain ?? "网站日志"
                              : selectedTask?.title ?? "任务详情"
          }
          onClose={() => closeMobileSheet("replace")}
        >
          {mobileSheet.type === "menu" && (
            <div className="mobile-sheet-actions">
              {mobileTabs.map(([, label]) => (
                <button key={label} type="button" onClick={() => openMobileTabFromSheet(label, true)}>{label}</button>
              ))}
              <button type="button" onClick={() => replaceMobileSheet({ type: "system" })}>系统状态</button>
              <button type="button" onClick={() => replaceMobileSheet({ type: "notifications" })}>通知中心</button>
            </div>
          )}
          {mobileSheet.type === "notifications" && (
            <>
              <div className="mobile-sheet-list">
                {mobileNoticeRows.map((notice) => (
                  <button key={notice.id} type="button" onClick={() => replaceMobileSheet({ type: "action", action: "notification-open", targetId: notice.id, label: notice.title })}>
                    <StatusLight tone={notice.tone} />
                    <span>
                      <b>{notice.title}</b>
                      <em>{notice.detail}</em>
                    </span>
                    <small>{unreadNoticeIds.includes(notice.id) ? "未读" : notice.time}</small>
                  </button>
                ))}
              </div>
              <div className="mobile-sheet-actions split">
                <button type="button" onClick={() => { setUnreadNoticeIds([]); notify("通知已全部标记为已读", "info"); }}>全部已读</button>
                <button type="button" onClick={() => { openMobileTabFromSheet("任务", false); notify("已打开任务列表处理通知", "info"); }}>去处理</button>
              </div>
            </>
          )}
          {mobileSheet.type === "system" && (
            <div className="mobile-sheet-metrics">
              {[
                ["CPU", "18%", "负载 0.38"],
                ["内存", "42%", "3.2 / 7.6 GB"],
                ["磁盘", "37%", "180 / 480 GB"],
                ["在线主机", `${mobileHosts.filter((host) => host.health === "健康").length}/${mobileHosts.length}`, "实时同步"],
              ].map(([label, value, desc]) => (
                <p key={label}><span>{label}</span><b>{value}</b><em>{desc}</em></p>
              ))}
            </div>
          )}
          {mobileSheet.type === "audit" && (
            <>
              <div className="mobile-sheet-list audit-sheet-list">
                {mobileAuditRows.map((row) => (
                  <article key={row.id} aria-label={`${row.action}，${row.result}，${row.object}，${row.time}`}>
                    <StatusLight tone={row.result === "成功" ? "green" : "red"} />
                    <span>
                      <b>{row.action}</b>
                      <em>{row.object} · {row.ip}</em>
                    </span>
                    <small>{row.result} · {row.time}</small>
                  </article>
                ))}
              </div>
              <div className="mobile-sheet-actions split">
                <button type="button" onClick={() => closeMobileSheet()}>关闭</button>
                <button type="button" onClick={() => openDesktopPageFromMobileSheet("audit", "已打开完整审计日志")}>完整审计</button>
              </div>
            </>
          )}
          {mobileSheet.type === "quick" && selectedQuickAction && (
            <>
              <div className="mobile-sheet-kv">
                <p><span>目标</span><b>{selectedQuickAction.targetHint}</b></p>
                <p><span>草稿</span><b>{quickDrafts.includes(selectedQuickAction.label) ? "已创建" : "未创建"}</b></p>
                <p><span>常用</span><b>{favoriteQuickActions.includes(selectedQuickAction.label) ? "已固定" : "未固定"}</b></p>
              </div>
              <div className="mobile-sheet-actions">
                <button type="button" onClick={() => openQuickTarget(selectedQuickAction)}>打开模块</button>
                <button type="button" onClick={() => saveQuickDraft(selectedQuickAction)}>创建草稿</button>
                <button type="button" onClick={() => { toggleFavoriteQuick(selectedQuickAction); notify(`${selectedQuickAction.label}${favoriteQuickActions.includes(selectedQuickAction.label) ? "已取消常用" : "已加入常用"}`, "info"); }}>
                  {favoriteQuickActions.includes(selectedQuickAction.label) ? "取消常用" : "设为常用"}
                </button>
              </div>
            </>
          )}
          {mobileSheet.type === "module" && selectedModuleAction && (
            <>
              <div className="mobile-sheet-kv">
                <p><span>入口</span><b>{selectedModuleAction.target}</b></p>
                <p><span>位置</span><b>{selectedModuleAction.targetHint}</b></p>
                <p><span>草稿</span><b>{quickDrafts.includes(selectedModuleAction.label) ? "已创建" : "未创建"}</b></p>
              </div>
              <div className="mobile-sheet-log">
                <p>模块入口：{selectedModuleAction.target}</p>
                <p>{selectedModuleAction.draft} 已准备</p>
                <p>触发来源：{selectedModuleAction.label}</p>
              </div>
              <div className="mobile-sheet-actions">
                <button type="button" onClick={() => replaceMobileSheet({ type: "quick", action: selectedModuleAction.label })}>返回操作</button>
                <button type="button" onClick={() => saveQuickDraft(selectedModuleAction)}>创建草稿</button>
              </div>
            </>
          )}
          {mobileSheet.type === "action" && (
            <>
              <div className="mobile-action-summary">
                {mobileActionSummary(mobileSheet.action, selectedActionHost, selectedActionSite, selectedActionTask, pushEnabled, mfaEnabled, selectedActionLabel).map((item) => (
                  <p key={item[0]}><span>{item[0]}</span><b>{item[1]}</b></p>
                ))}
              </div>
              <div className="mobile-action-impact">
                <StatusLight tone={mobileActionTone(mobileSheet.action)} />
                <span>{mobileActionImpact(mobileSheet.action, selectedActionHost, selectedActionSite, selectedActionTask, pushEnabled, mfaEnabled, selectedActionLabel)}</span>
              </div>
              <div className="mobile-sheet-actions split">
                <button type="button" onClick={() => closeMobileSheet()}>取消</button>
                <button className={mobileActionTone(mobileSheet.action) === "orange" ? "warning" : ""} type="button" onClick={() => runMobileAction(mobileSheet.action, mobileSheet.targetId)}>确认执行</button>
              </div>
            </>
          )}
          {mobileSheet.type === "host" && selectedHost && (
            <>
              <div className="mobile-sheet-kv">
                <p><span>环境</span><b>{selectedHost.env}</b></p>
                <p><span>IP</span><b>{selectedHost.ip}</b></p>
                <p><span>系统</span><b>{selectedHost.os}</b></p>
                <p><span>CPU</span><b>{selectedHost.cpu}</b></p>
                <p><span>内存</span><b>{selectedHost.memory}</b></p>
                <p><span>运行</span><b>{selectedHost.uptime}</b></p>
              </div>
              <div className="mobile-sheet-actions">
                <button type="button" onClick={() => replaceMobileSheet({ type: "action", action: "host-restart", targetId: selectedHost.id })}>重启主机</button>
                <button type="button" onClick={() => replaceMobileSheet({ type: "action", action: "terminal-open", targetId: selectedHost.id, label: selectedHost.name })}>打开终端</button>
              </div>
            </>
          )}
          {mobileSheet.type === "site" && selectedSite && (
            <>
              <div className="mobile-sheet-kv">
                <p><span>运行时</span><b>{selectedSite.runtime}</b></p>
                <p><span>主机</span><b>{selectedSite.host}</b></p>
                <p><span>证书</span><b>{selectedSite.certDays} 天</b></p>
                <p><span>流量</span><b>{selectedSite.traffic}</b></p>
              </div>
              <div className="mobile-sheet-log">
                <p>200 GET /login 24ms</p>
                <p>{selectedSite.certDays <= 14 ? "tls certificate renewal recommended" : "tls certificate healthy"}</p>
                <p>upstream {selectedSite.host} healthy</p>
              </div>
            </>
          )}
          {mobileSheet.type === "task" && selectedTask && (
            <>
              <div className="mobile-sheet-kv">
                <p><span>状态</span><b>{selectedTask.status}</b></p>
                <p><span>操作人</span><b>{selectedTask.operator}</b></p>
                <p><span>时间</span><b>{selectedTask.time}</b></p>
              </div>
              <div className="mobile-sheet-log">
                <p>queued by {selectedTask.operator}</p>
                <p>{selectedTask.status === "警告" ? "warning: retry required" : "finished with status 0"}</p>
                <p>trace id mobile-{selectedTask.id}</p>
              </div>
            </>
          )}
        </MobileSheet>
      )}
    </section>
  );
}

function MobileCard({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mobile-card">
      <header><strong>{title}</strong>{action && <button type="button" onClick={onAction}>{action}</button>}</header>
      {children}
    </section>
  );
}

export { MobileApp, MobileCard };
