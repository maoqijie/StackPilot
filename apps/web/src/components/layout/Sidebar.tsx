import { ChevronDown, ChevronLeft, CloudCog, Menu } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Permission } from "@stackpilot/contracts";
import { activeChildForPage, navChildMetaText, navItems, navPageFor } from "../../app/navigation";
import type { NavChild, NavItem } from "./types";
import type { PageKey, SetPage } from "../../types/app";

function Sidebar({
  page,
  setPage,
  collapsed,
  onToggleCollapsed,
  onExpandCollapsed,
  onNavigate,
  permissions,
}: {
  page: PageKey;
  setPage: SetPage;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onExpandCollapsed: () => void;
  onNavigate: () => void;
  permissions: Permission[];
}) {
  const activeParent = navPageFor(page);
  const activeChild = activeChildForPage(page);
  const [openOverride, setOpenOverride] = useState<{
    source: NavItem["key"];
    target: NavItem["key"];
    group: NavItem["key"] | null;
  } | null>(null);
  const groupElements = useRef(new Map<NavItem["key"], HTMLElement>());
  const groupPositions = useRef<Map<NavItem["key"], number> | null>(null);
  const overrideApplies = openOverride
    && (activeParent === openOverride.source || activeParent === openOverride.target);
  const openGroup = overrideApplies ? openOverride.group : activeParent;

  useLayoutEffect(() => {
    const previous = groupPositions.current;
    if (!previous || collapsed) return;
    groupPositions.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    groupElements.current.forEach((element, key) => {
      const previousTop = previous.get(key);
      if (previousTop === undefined) return;
      element.getAnimations().forEach((animation) => animation.cancel());
      const deltaY = previousTop - element.getBoundingClientRect().top;
      if (Math.abs(deltaY) < 0.5 || typeof element.animate !== "function") return;
      element.animate(
        [
          { transform: `translateY(${deltaY}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 440, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
    });
  });

  const captureGroupPositions = () => {
    groupPositions.current = new Map(
      [...groupElements.current].map(([key, element]) => [key, element.getBoundingClientRect().top]),
    );
  };

  const openParent = (item: NavItem) => {
    const currentOpen = openGroup === item.key;
    if (!collapsed) captureGroupPositions();
    setOpenOverride({
      source: activeParent,
      target: item.key,
      group: collapsed ? item.key : currentOpen ? null : item.key,
    });
    setPage(item.key, { message: `已进入${item.label}`, tone: "info" });
    if (collapsed) onExpandCollapsed();
  };

  const openChild = (parent: NavItem, child: NavChild) => {
    setOpenOverride({ source: activeParent, target: parent.key, group: parent.key });
    setPage(child.page ?? child.id, { message: `已打开${parent.label} / ${child.label}`, tone: "info" });
    onNavigate();
  };

  return (
    <aside className={`cloud-sidebar ${collapsed ? "is-collapsed" : ""}`} data-sidebar-root>
      <div className="cloud-sidebar-brand">
        <span className="cloud-sidebar-logo" aria-hidden="true"><CloudCog size={20} /></span>
        <span className="cloud-sidebar-brand-copy">
          <strong>StackPilot</strong>
          <small>Control plane</small>
        </span>
      </div>

      <nav className="cloud-sidebar-nav" aria-label="主导航">
        {navItems.map((item) => {
          const children = item.children.filter((child) => child.id !== "sites-create" || permissions.includes("sites:deploy"));
          const Icon = item.icon;
          const isActiveParent = item.key === activeParent;
          const isExactPage = item.key === page;
          const isOpen = openGroup === item.key && !collapsed;
          return (
            <section
              key={item.key}
              ref={(element) => {
                if (element) groupElements.current.set(item.key, element);
                else groupElements.current.delete(item.key);
              }}
              className={`cloud-sidebar-group ${isActiveParent ? "is-active" : ""} ${isOpen ? "is-open" : ""}`}
            >
              <button
                className="cloud-sidebar-parent"
                type="button"
                onClick={() => openParent(item)}
                aria-current={isExactPage ? "page" : undefined}
                aria-expanded={isOpen}
                aria-controls={`cloud-sidebar-children-${item.key}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="cloud-sidebar-parent-icon" size={18} aria-hidden="true" />
                <span className="cloud-sidebar-parent-label">{item.label}</span>
                {item.badge && <strong className="cloud-sidebar-badge">{item.badge}</strong>}
                <ChevronDown className="cloud-sidebar-chevron" size={15} aria-hidden="true" />
              </button>

              <div
                className="cloud-sidebar-children"
                id={`cloud-sidebar-children-${item.key}`}
                aria-hidden={!isOpen}
                style={{ "--cloud-sidebar-children-height": `${children.length * 52}px` } as CSSProperties}
              >
                <div className="cloud-sidebar-children-inner">
                  {children.map((child) => {
                    const metaText = navChildMetaText(child);
                    const isActiveChild = activeChild === child.id;
                    return (
                      <button
                        key={child.id}
                        className={`cloud-sidebar-child ${isActiveChild ? "is-active" : ""}`}
                        type="button"
                        tabIndex={isOpen ? 0 : -1}
                        aria-current={isOpen && isActiveChild ? "page" : undefined}
                        onClick={() => openChild(item, child)}
                      >
                        <span>
                          <strong>{child.label}</strong>
                          {metaText && <small>{metaText}</small>}
                        </span>
                        {child.badge && <em>{child.badge}</em>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </nav>

      <button
        className="cloud-sidebar-collapse"
        type="button"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
        title={collapsed ? "展开侧栏" : undefined}
      >
        <span className="cloud-sidebar-collapse-icons" aria-hidden="true">
          <ChevronLeft className="cloud-sidebar-collapse-close" size={17} />
          <Menu className="cloud-sidebar-collapse-open" size={17} />
        </span>
        <span>{collapsed ? "展开侧栏" : "收起侧栏"}</span>
      </button>
    </aside>
  );
}

export { Sidebar };
