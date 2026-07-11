import { ChevronDown, ChevronLeft, Menu } from "lucide-react";
import { useState } from "react";
import { activeChildForPage, navChildMetaText, navItems, navPageFor } from "../../app/navigation";
import type { NavChild, NavItem } from "./types";
import type { Notify, PageKey, SetPage } from "../../types/app";

function Sidebar({
  page,
  setPage,
  notify,
  collapsed,
  onToggleCollapsed,
  onExpandCollapsed,
  onNavigate,
}: {
  page: PageKey;
  setPage: SetPage;
  notify: Notify;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onExpandCollapsed: () => void;
  onNavigate: () => void;
}) {
  const [openGroups, setOpenGroups] = useState<Partial<Record<NavItem["key"], boolean>>>(() => ({
    overview: true,
  }));
  const [manuallyClosedActiveGroup, setManuallyClosedActiveGroup] = useState<{ key: NavItem["key"]; page: PageKey } | null>(null);
  const activeChild = activeChildForPage(page);
  const activeNavPage = navPageFor(page);

  const toggleGroup = (key: NavItem["key"], label: string) => {
    const currentOpen = openGroups[key] ?? key === activeNavPage;
    const nextOpen = !currentOpen;
    setManuallyClosedActiveGroup(!nextOpen && key === activeNavPage && activeChild ? { key, page } : null);
    setOpenGroups((current) => ({ ...current, [key]: nextOpen }));
    notify(`${label} 下拉项目已${nextOpen ? "展开" : "收起"}`, "info");
  };

  const openNavPage = (key: NavItem["key"], label: string) => {
    setManuallyClosedActiveGroup(null);
    setPage(key, { message: `已进入${label}`, tone: "info" });
    setOpenGroups((current) => ({ ...current, [key]: true }));
    onNavigate();
  };

  const handleMainNavClick = (item: NavItem) => {
    if (collapsed && item.children.length > 0) {
      setManuallyClosedActiveGroup(null);
      setOpenGroups((current) => ({ ...current, [item.key]: true }));
      onExpandCollapsed();
      notify(`已展开${item.label}下拉项目`, "info");
      return;
    }
    openNavPage(item.key, item.label);
  };

  const openNavChild = (parent: NavItem, child: NavChild) => {
    setManuallyClosedActiveGroup(null);
    setPage(child.page ?? child.id, { message: `已打开${parent.label} / ${child.label}`, tone: "info" });
    setOpenGroups((current) => ({ ...current, [parent.key]: true }));
    onNavigate();
  };

  return (
    <aside className={`sidebar-mock ${collapsed ? "collapsed" : ""}`}>
      <div className="side-brand">
        <div className="brand-gem" />
        <strong>StackPilot</strong>
      </div>
      <nav className="side-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === activeNavPage;
          const exactActive = item.key === page;
          const hasActiveChild = active && !exactActive && item.children.some((child) => child.id === activeChild);
          const wasManuallyClosedForThisPage = manuallyClosedActiveGroup?.key === item.key && manuallyClosedActiveGroup?.page === page;
          const open = ((openGroups[item.key] ?? active) || (hasActiveChild && !wasManuallyClosedForThisPage)) && !collapsed;
          const parentCurrent = exactActive || (!open && hasActiveChild);
          const activeChildLabel = item.children.find((child) => child.id === activeChild)?.label;
          return (
            <section
              key={item.key}
              className={[
                "side-nav-group",
                active ? "active" : "",
                exactActive ? "exact-active" : "",
                hasActiveChild ? "has-active-child" : "",
                open ? "open" : "",
              ].filter(Boolean).join(" ")}
            >
              <div className="side-nav-row">
                <button
                  className="side-main-button"
                  type="button"
                  onClick={() => handleMainNavClick(item)}
                  aria-current={parentCurrent ? "page" : undefined}
                  aria-label={parentCurrent && activeChildLabel ? `${item.label}，当前页面：${activeChildLabel}${collapsed ? "，点击展开侧栏查看下拉项目" : ""}` : undefined}
                >
                  <Icon size={17} />
                  <span>{item.label}</span>
                  {item.badge && <b>{item.badge}</b>}
                </button>
                {!collapsed && (
                  <button
                    className="side-toggle-button"
                    type="button"
                    onClick={() => toggleGroup(item.key, item.label)}
                    aria-label={`${open ? "收起" : "展开"}${item.label}下拉项目`}
                    aria-expanded={open}
                    aria-controls={`side-submenu-${item.key}`}
                  >
                    <ChevronDown className="side-chevron" size={13} />
                  </button>
                )}
              </div>
              {!collapsed && (
                <div
                  className="side-submenu"
                  id={`side-submenu-${item.key}`}
                  aria-hidden={!open}
                >
                  <div className="side-submenu-inner">
                    {item.children.map((child) => {
                      const metaText = navChildMetaText(child);
                      const labelDetail = child.meta ?? child.badge ?? "";
                      return (
                        <button
                          key={child.id}
                          className={[
                            "side-child",
                            metaText ? "has-child-meta" : "",
                            activeChild === child.id ? "is-child-active" : "",
                          ].filter(Boolean).join(" ")}
                          type="button"
                          tabIndex={open ? 0 : -1}
                          aria-current={open && activeChild === child.id ? "page" : undefined}
                          aria-label={[child.label, labelDetail].filter(Boolean).join("，")}
                          onClick={() => openNavChild(item, child)}
                        >
                          <i />
                          <span className="side-child-copy">
                            <span className="side-child-label">{child.label}</span>
                            {metaText && <em>{metaText}</em>}
                          </span>
                          {child.badge && <strong className="side-child-badge">{child.badge}</strong>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </nav>
      <button
        className="collapse-side"
        type="button"
        onClick={() => {
          onToggleCollapsed();
          notify(collapsed ? "侧栏已展开" : "侧栏已收起", "info");
        }}
        aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
      >
        <ChevronLeft className="collapse-icon collapse-icon-close" size={15} />
        <Menu className="collapse-icon collapse-icon-open" size={15} />
        <span>{collapsed ? "展开侧栏" : "收起侧栏"}</span>
      </button>
    </aside>
  );
}

export { Sidebar };
