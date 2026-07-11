import type { OverviewSummaryPayload } from "../../api/overviewApi";
import { Bell, CheckCircle2, ChevronDown, CircleHelp, FileText, Moon, Search, Sun, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { navItems, navPageFor, resolvePageMeta, topbarSearchResults } from "../../app/navigation";
import type { HelpDrawerState, TopbarActivity, TopbarChrome, TopbarMenuPanel, TopbarPanel, TopbarSearchResult } from "./types";
import { DetailDrawer } from "../ui/DetailDrawer";
import { StatusDot, StatusLight } from "../ui/StatusVisuals";
import { useIsNarrowViewport } from "../../hooks/useIsNarrowViewport";
import { topbarHelpLinks, topbarNotifications } from "../../mocks/demoData";
import type { Notify, PageKey, SetPage, Tone } from "../../types/app";
import { drawerFocusableElements } from "../../utils/focus";
import { useTheme } from "../../theme/theme";

function topbarStatusText(overview: OverviewSummaryPayload | null) {
  if (!overview) return "正在采集面板状态";
  return `${overview.cluster.health} · ${overview.cluster.latency} · ${overview.lastRefresh}`;
}

function topbarUserName(overview: OverviewSummaryPayload | null) {
  return overview?.cluster.current || "本机节点";
}

function topbarActivitiesFromOverview(overview: OverviewSummaryPayload | null): TopbarActivity[] {
  return (overview?.audits ?? []).slice(0, 5).map((row) => ({
    id: row[6],
    title: row[3],
    detail: `${row[2]} · ${row[4]} · ${row[5]}`,
    time: row[0],
  }));
}

function TopBar({
  page,
  setPage,
  chrome,
  notify,
  unreadCount,
  setUnreadCount,
  overview,
  interactionsDisabled,
  onLogout,
}: {
  page: PageKey;
  setPage: SetPage;
  chrome: TopbarChrome;
  notify: Notify;
  unreadCount: number;
  setUnreadCount: React.Dispatch<React.SetStateAction<number>>;
  overview: OverviewSummaryPayload | null;
  interactionsDisabled: boolean;
  onLogout: () => void;
}) {
  const [query, setQuery] = useState("");
  const [openPanel, setOpenPanel] = useState<TopbarPanel>(null);
  const [helpDrawer, setHelpDrawer] = useState<HelpDrawerState>(null);
  const [lastMenuTrigger, setLastMenuTrigger] = useState<TopbarMenuPanel | null>(null);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const { theme, toggleTheme } = useTheme();
  const topbarRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuTriggerRefs = useRef<Partial<Record<TopbarMenuPanel, HTMLButtonElement | null>>>({});
  const meta = resolvePageMeta(page);
  const isCompactTopbar = useIsNarrowViewport();
  const userName = topbarUserName(overview);
  const statusText = topbarStatusText(overview);
  const activities = topbarActivitiesFromOverview(overview);
  const searchResults = topbarSearchResults(query);
  const boundedSearchIndex = searchResults.length > 0 ? Math.min(activeSearchIndex, searchResults.length - 1) : 0;
  const visiblePanel = interactionsDisabled ? null : openPanel;
  const activeSearchOptionId = visiblePanel === "search" && searchResults.length > 0 ? `topbar-search-option-${boundedSearchIndex}` : undefined;
  const compactSearchHidden = interactionsDisabled || (isCompactTopbar && visiblePanel !== "search");
  const togglePanel = (panel: TopbarMenuPanel) => {
    setLastMenuTrigger(panel);
    setOpenPanel((current) => (current === panel ? null : panel));
  };
  const closeMenuPanel = () => {
    const trigger = lastMenuTrigger ? menuTriggerRefs.current[lastMenuTrigger] : null;
    setOpenPanel(null);
    window.requestAnimationFrame(() => trigger?.focus());
  };
  const lockSession = () => {
    setOpenPanel(null);
    onLogout();
  };
  const openHelpDrawer = (item?: { id: string; title: string; detail: string }) => {
    setOpenPanel(null);
    setHelpDrawer(item ?? topbarHelpLinks[0]);
  };
  const closeSearchPanel = (restoreFocus = false) => {
    setOpenPanel(null);
    searchInputRef.current?.blur();
    if (restoreFocus) {
      window.requestAnimationFrame(() => searchTriggerRef.current?.focus({ preventScroll: true }));
    }
  };
  const openSearchPanel = () => {
    setActiveSearchIndex(0);
    setOpenPanel("search");
    window.requestAnimationFrame(() => searchInputRef.current?.focus());
  };
  const openSearchResult = (result: TopbarSearchResult) => {
    setOpenPanel(null);
    setQuery("");
    setActiveSearchIndex(0);
    searchInputRef.current?.blur();
    window.requestAnimationFrame(() => {
      setPage(result.page, { message: `已打开${result.label}`, tone: "info" });
      window.requestAnimationFrame(() => {
        const heading = document.querySelector<HTMLElement>(".page-head h1, .overview-page h1, .settings-title h1, .mobile-content h2");
        if (!heading) return;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      });
    });
  };

  useEffect(() => {
    if (interactionsDisabled) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (topbarRef.current?.contains(event.target as Node) || searchRef.current?.contains(event.target as Node)) return;
      closeSearchPanel();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearchPanel();
        return;
      }
      if (event.key === "Escape") closeSearchPanel(true);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [interactionsDisabled]);

  return (
    <header className={`topbar-mock ${chrome.white ? "white" : ""}`}>
      {chrome.showBreadcrumb && (
        <div className="breadcrumb-title">
          <span>{meta.breadcrumb}</span>
          <em>/</em>
          <strong>{meta.title}</strong>
        </div>
      )}
      <div className={`mock-search ${visiblePanel === "search" ? "active" : ""}`} ref={searchRef} inert={compactSearchHidden} aria-hidden={compactSearchHidden ? "true" : undefined}>
        <Search size={13} />
        <span id="topbar-search-label" className="sr-only">全局搜索</span>
        <input
          ref={searchInputRef}
          value={query}
          placeholder={meta.search}
          tabIndex={compactSearchHidden ? -1 : 0}
          aria-labelledby="topbar-search-label"
          role="combobox"
          aria-haspopup="listbox"
          onFocus={() => setOpenPanel("search")}
          onBlur={(event) => {
            if (searchRef.current?.contains(event.relatedTarget as Node)) return;
            if (visiblePanel === "search") closeSearchPanel();
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveSearchIndex(0);
            setOpenPanel("search");
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" && searchResults.length > 0) {
              event.preventDefault();
              setOpenPanel("search");
              setActiveSearchIndex((current) => (current + 1) % searchResults.length);
              return;
            }
            if (event.key === "ArrowUp" && searchResults.length > 0) {
              event.preventDefault();
              setOpenPanel("search");
              setActiveSearchIndex((current) => (current - 1 + searchResults.length) % searchResults.length);
              return;
            }
            if (event.key === "Home" && searchResults.length > 0) {
              event.preventDefault();
              setActiveSearchIndex(0);
              return;
            }
            if (event.key === "End" && searchResults.length > 0) {
              event.preventDefault();
              setActiveSearchIndex(searchResults.length - 1);
              return;
            }
            if (event.key === "Enter") {
              const result = searchResults[boundedSearchIndex];
              if (result) {
                event.preventDefault();
                openSearchResult(result);
              }
            }
          }}
          aria-expanded={visiblePanel === "search"}
          aria-controls={visiblePanel === "search" ? "topbar-search-panel" : undefined}
          aria-activedescendant={activeSearchOptionId}
        />
        <kbd>⌘K</kbd>
        {visiblePanel === "search" && (
          <div className="topbar-search-panel" id="topbar-search-panel" role="listbox" aria-label="全局搜索结果">
            <div className="topbar-search-head">
              <span>{query.trim() ? `搜索 ${query.trim()}` : "快速打开"}</span>
              <em>{searchResults.length} 项</em>
            </div>
            {searchResults.length > 0 ? (
              searchResults.map((result, index) => (
                <button
                  key={result.id}
                  id={`topbar-search-option-${index}`}
                  type="button"
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === boundedSearchIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveSearchIndex(index)}
                  onClick={() => openSearchResult(result)}
                >
                  <b>{result.kind}</b>
                  <span>
                    <strong>{result.label}</strong>
                    <em>{result.detail}</em>
                  </span>
                </button>
              ))
            ) : (
              <p>没有匹配结果</p>
            )}
          </div>
        )}
      </div>
      <div className="top-spacer" />
      <div className="top-actions" ref={topbarRef}>
        {chrome.showCompactSearch && (
          <button
            ref={searchTriggerRef}
            type="button"
            className={`icon-action compact-search-trigger ${visiblePanel === "search" ? "active" : ""}`}
            onClick={openSearchPanel}
            aria-label="打开全局搜索"
            aria-haspopup="listbox"
            aria-expanded={visiblePanel === "search"}
            aria-controls={visiblePanel === "search" ? "topbar-search-panel" : undefined}
          >
            <Search size={17} />
          </button>
        )}
        {chrome.showStatus && <StatusDot text={statusText} />}
        <button
          type="button"
          className="icon-action theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "light" ? "切换到深色主题" : "切换到浅色主题"}
          title={theme === "light" ? "深色主题" : "浅色主题"}
        >
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </button>
        <span className="notification-wrap">
          <button
            ref={(node) => { menuTriggerRefs.current.notifications = node; }}
            type="button"
            className={`icon-action ${visiblePanel === "notifications" ? "active" : ""}`}
            onClick={() => togglePanel("notifications")}
            aria-label={`通知${unreadCount > 0 ? `，${unreadCount} 条未读` : "，无未读"}`}
            aria-haspopup="dialog"
            aria-expanded={visiblePanel === "notifications"}
            aria-controls={visiblePanel === "notifications" ? "topbar-notifications-panel" : undefined}
          >
            <Bell size={18} />
          </button>
          {unreadCount > 0 && <span className="red-badge" aria-hidden="true">{unreadCount}</span>}
        </span>
        {chrome.showActivity && (
          <button
            ref={(node) => { menuTriggerRefs.current.activity = node; }}
            type="button"
            className={`icon-action ${visiblePanel === "activity" ? "active" : ""}`}
            onClick={() => togglePanel("activity")}
            aria-label="操作记录"
            aria-haspopup="dialog"
            aria-expanded={visiblePanel === "activity"}
            aria-controls={visiblePanel === "activity" ? "topbar-activity-panel" : undefined}
          >
            <FileText size={17} />
          </button>
        )}
        <button
          ref={(node) => { menuTriggerRefs.current.help = node; }}
          type="button"
          className={`icon-action ${visiblePanel === "help" ? "active" : ""}`}
          onClick={() => togglePanel("help")}
          aria-label="帮助"
          aria-haspopup="dialog"
          aria-expanded={visiblePanel === "help"}
          aria-controls={visiblePanel === "help" ? "topbar-help-panel" : undefined}
        >
          <CircleHelp size={17} />
        </button>
        <button
          ref={(node) => { menuTriggerRefs.current.user = node; }}
          type="button"
          className={`user-menu-button ${visiblePanel === "user" ? "active" : ""}`}
          onClick={() => togglePanel("user")}
          aria-label="用户菜单"
          aria-haspopup="menu"
          aria-expanded={visiblePanel === "user"}
          aria-controls={visiblePanel === "user" ? "topbar-user-panel" : undefined}
        >
          <span className="avatar-mini" aria-hidden="true">
            <UserRound size={18} />
          </span>
          <strong>{userName}</strong>
          <ChevronDown size={13} />
        </button>
        {visiblePanel && visiblePanel !== "search" && (
          <TopbarDropdown
            panel={visiblePanel}
            page={page}
            userName={userName}
            activities={activities}
            unreadCount={unreadCount}
            setPage={setPage}
            onOpenHelp={openHelpDrawer}
            onClose={closeMenuPanel}
            onMarkRead={() => {
              setUnreadCount(0);
              notify("通知已全部标记为已读", "info");
            }}
            onLogout={lockSession}
            notify={notify}
          />
        )}
      </div>
      {helpDrawer && (
        <TopbarHelpDrawer
          page={page}
          item={helpDrawer}
          setPage={setPage}
          notify={notify}
          onClose={() => setHelpDrawer(null)}
        />
      )}
    </header>
  );
}

function TopbarHelpDrawer({
  page,
  item,
  setPage,
  notify,
  onClose,
}: {
  page: PageKey;
  item: { id: string; title: string; detail: string };
  setPage: SetPage;
  notify: Notify;
  onClose: () => void;
}) {
  const meta = resolvePageMeta(page);
  const activeModule = navItems.find((nav) => nav.key === navPageFor(page));
  const relatedChildren = activeModule?.children.slice(0, 3) ?? [];
  const checklist = [
    `当前页面：${meta.title}`,
    `搜索入口：${meta.search}`,
    "优先检查筛选条件、行操作、详情抽屉和 toast 反馈",
  ];

  const copyChecklist = () => {
    const text = [`${item.title} - ${meta.title}`, item.detail, ...checklist].join("\n");
    if (!navigator.clipboard?.writeText) {
      notify("当前浏览器不支持复制检查清单", "warning");
      return;
    }
    void navigator.clipboard.writeText(text)
      .then(() => notify("帮助检查清单已复制", "info"))
      .catch(() => notify("复制检查清单失败，请检查剪贴板权限", "danger"));
  };

  return (
    <DetailDrawer
      title={item.title}
      subtitle={`${meta.breadcrumb} / ${meta.title}`}
      onClose={onClose}
      className="topbar-help-drawer"
      modal
      actions={<><button className="ghost" type="button" onClick={copyChecklist}>复制清单</button><button className="primary" type="button" onClick={() => { setPage("audit", { message: "已打开审计日志", tone: "info" }); onClose(); }}>查看审计</button></>}
    >
      <div className="help-drawer-body">
        <section>
          <span>当前上下文</span>
          <strong>{meta.title}</strong>
          <p>{item.detail}</p>
        </section>
        <div className="help-checklist">
          {checklist.map((line) => (
            <p key={line}><CheckCircle2 size={14} />{line}</p>
          ))}
        </div>
        {relatedChildren.length > 0 && (
          <div className="help-related">
            <span>相关入口</span>
            {relatedChildren.map((child) => (
              <button key={child.id} type="button" aria-label={`打开帮助相关入口 ${child.label}，${child.meta}`} onClick={() => { setPage(child.page ?? child.id, { message: `已打开${child.label}`, tone: "info" }); onClose(); }}>
                <strong>{child.label}</strong>
                <em>{child.meta}</em>
              </button>
            ))}
          </div>
        )}
      </div>
    </DetailDrawer>
  );
}

function TopbarDropdown({
  panel,
  page,
  userName,
  activities,
  unreadCount,
  setPage,
  onOpenHelp,
  onClose,
  onMarkRead,
  onLogout,
  notify,
}: {
  panel: TopbarMenuPanel;
  page: PageKey;
  userName: string;
  activities: TopbarActivity[];
  unreadCount: number;
  setPage: SetPage;
  onOpenHelp: (item?: { id: string; title: string; detail: string }) => void;
  onClose: () => void;
  onMarkRead: () => void;
  onLogout: () => void;
  notify: Notify;
}) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const firstControl = dropdownRef.current ? drawerFocusableElements(dropdownRef.current)[0] : null;
    firstControl?.focus();
  }, [panel]);

  const trapDropdownFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const controls = dropdownRef.current ? drawerFocusableElements(dropdownRef.current) : [];
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && panel === "user") {
      event.preventDefault();
      if (controls.length === 0) return;
      const currentIndex = Math.max(controls.indexOf(document.activeElement as HTMLElement), 0);
      const nextIndex = event.key === "ArrowDown"
        ? (currentIndex + 1) % controls.length
        : (currentIndex - 1 + controls.length) % controls.length;
      controls[nextIndex]?.focus();
      return;
    }
    if (event.key !== "Tab" || !dropdownRef.current) return;
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (panel === "user") {
    const userMenuItems = [
      { label: "个人资料", page: "settings-general", message: "已打开个人资料设置" },
      { label: "访问令牌", page: "settings-general", message: "已打开访问令牌设置" },
      { label: "登录记录", page: "audit", message: "已打开登录记录审计" },
      { label: "操作记录", page: "audit", message: "已打开操作记录审计" },
    ];
    return (
      <div ref={dropdownRef} className="topbar-dropdown user-dropdown" id="topbar-user-panel" role="menu" aria-label="用户菜单" onKeyDown={trapDropdownFocus}>
        <div className="topbar-dropdown-head">
          <span>当前账号</span>
          <strong>{userName}</strong>
        </div>
        {userMenuItems.map((item) => (
          <button key={item.label} type="button" role="menuitem" onClick={() => { setPage(item.page, { message: item.message, tone: "info" }); onClose(); }}>
            {item.label}
          </button>
        ))}
        <button type="button" role="menuitem" onClick={() => { onOpenHelp(); onClose(); }}>
          帮助中心
        </button>
        <button type="button" role="menuitem" className="danger-item" onClick={() => { onLogout(); notify("本地会话已锁定", "warning"); }}>
          退出登录
        </button>
      </div>
    );
  }

  const panelMeta = {
    notifications: { title: "通知中心", subtitle: `${unreadCount} 条未读`, action: "全部已读" },
    activity: { title: "操作记录", subtitle: resolvePageMeta(page).title, action: "查看审计" },
    help: { title: "帮助中心", subtitle: "当前页上下文", action: "打开文档" },
  }[panel];
  const items = panel === "notifications" ? topbarNotifications : panel === "activity" ? activities : topbarHelpLinks;
  const isEmptyNotifications = panel === "notifications" && items.length === 0;
  const isEmptyActivity = panel === "activity" && items.length === 0;

  return (
    <div ref={dropdownRef} className={`topbar-dropdown ${panel}-dropdown`} id={`topbar-${panel}-panel`} role="dialog" aria-label={panelMeta.title} onKeyDown={trapDropdownFocus}>
      <div className="topbar-dropdown-head">
        <span>{panelMeta.title}</span>
        <button
          type="button"
          onClick={() => {
            if (panel === "notifications") onMarkRead();
            else if (panel === "activity") {
              setPage("audit", { message: "已打开审计日志", tone: "info" });
              onClose();
            } else {
              onOpenHelp();
              onClose();
            }
          }}
        >
          {panelMeta.action}
        </button>
      </div>
      <p className="topbar-dropdown-subtitle">{panelMeta.subtitle}</p>
      <div className="topbar-dropdown-list">
        {isEmptyNotifications || isEmptyActivity ? (
          <p className="topbar-empty-state">{isEmptyActivity ? "暂无真实操作记录" : "暂无通知"}</p>
        ) : items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="topbar-dropdown-item"
            onClick={() => {
              if (panel === "activity") {
                setPage("audit", { message: `已打开记录：${item.title}`, tone: "info" });
              } else if (panel === "notifications") {
                const notificationTarget: PageKey = item.id === "ntf-1" ? "databases-backups" : item.id === "ntf-2" ? "sites-cert" : "deploy";
                setPage(notificationTarget, { message: `已打开通知：${item.title}`, tone: "info" });
              } else {
                onOpenHelp(item);
              }
              onClose();
            }}
          >
            {panel === "notifications" && <StatusLight tone={"tone" in item ? (item.tone as Tone) : "blue"} />}
            <span>
              <strong>{item.title}</strong>
              <em>{item.detail}</em>
            </span>
            {"time" in item && <small>{item.time}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

export { TopBar, TopbarHelpDrawer, TopbarDropdown };
