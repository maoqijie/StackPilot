import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useIsNarrowViewport } from "../../hooks/useIsNarrowViewport";
import { drawerFocusableElements, drawerRestoreFallback, isFocusableElement } from "../../utils/focus";
import { useExitMotion } from "./useExitMotion";

const modalDrawerClasses = new Set(["schedule-job-modal", "file-delete-dialog", "upload-create-modal", "health-node-modal", "task-log-modal", "firewall-rule-modal"]);

function DetailDrawer({
  title,
  subtitle,
  onClose,
  children,
  actions,
  className,
  modal,
  autoFocus = true,
  closeLabel = "关闭详情",
  restoreFocusTarget,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  modal?: boolean;
  autoFocus?: boolean;
  closeLabel?: string;
  restoreFocusTarget?: HTMLElement | null;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(
    restoreFocusTarget ?? (typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null),
  );
  const titleId = useId();
  const { closing, requestClose } = useExitMotion(onClose);
  const isNarrowViewport = useIsNarrowViewport();
  const isModalDrawer = modal ?? isNarrowViewport;
  const customClassNames = className?.split(/\s+/).filter(Boolean) ?? [];
  const drawerClassName = ["detail-drawer", ...customClassNames].join(" ");
  const scrimClassName = ["drawer-scrim", ...customClassNames.map((name) => `${name}-scrim`)].join(" ");
  const motionSurface = isModalDrawer || drawerClassName.split(" ").some((name) => modalDrawerClasses.has(name)) ? "modal" : "drawer";

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    let focusFrame = 0;
    if (restoreFocusTarget && document.contains(restoreFocusTarget)) {
      restoreFocusRef.current = restoreFocusTarget;
    }
    if (autoFocus) {
      if (
        document.activeElement instanceof HTMLElement
        && document.activeElement !== document.body
        && !drawer.contains(document.activeElement)
      ) {
        restoreFocusRef.current = document.activeElement;
      }
      const focusable = drawerFocusableElements(drawer);
      const firstBodyFocusTarget = focusable.find((element) => !element.classList.contains("drawer-close-button"));
      const initialFocusTarget = firstBodyFocusTarget ?? focusable[0] ?? drawer;
      initialFocusTarget.focus({ preventScroll: true });
      focusFrame = window.requestAnimationFrame(() => {
        if (document.contains(drawer) && !drawer.contains(document.activeElement)) {
          initialFocusTarget.focus({ preventScroll: true });
        }
      });
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !document.contains(drawer)) return;
      if (event.key === "Escape") {
        if (document.querySelector(".cloud-header-results")) return;
        requestClose();
        return;
      }
      if (event.key !== "Tab" || !isModalDrawer) return;
      const focusable = drawerFocusableElements(drawer);
      if (focusable.length === 0) {
        event.preventDefault();
        drawer.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (!drawer.contains(activeElement)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
        return;
      }
      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
        return;
      }
      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      if (focusFrame) window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDocumentKeyDown);
      const activeElement = document.activeElement;
      const shouldRestoreFocus = !activeElement || activeElement === document.body || drawer.contains(activeElement);
      if (!shouldRestoreFocus) return;
      const restoreTarget = restoreFocusRef.current;
      const fallbackTarget = drawerRestoreFallback(drawer);
      const restoreFocus = () => {
        if (restoreTarget && document.contains(restoreTarget)) {
          restoreTarget.focus({ preventScroll: true });
          if (document.activeElement === restoreTarget) return true;
        }
        fallbackTarget?.focus({ preventScroll: true });
        return Boolean(fallbackTarget && document.activeElement === fallbackTarget);
      };
      const retryRestoreFocus = () => {
        if (restoreFocus()) return;
        window.requestAnimationFrame(() => {
          if (restoreFocus()) return;
          window.setTimeout(restoreFocus, 0);
        });
      };
      queueMicrotask(retryRestoreFocus);
    };
  }, [autoFocus, isModalDrawer, requestClose, restoreFocusTarget]);

  const handleFocusCapture = (event: React.FocusEvent<HTMLElement>) => {
    const previousFocus = event.relatedTarget;
    if (previousFocus instanceof HTMLElement && !event.currentTarget.contains(previousFocus) && isFocusableElement(previousFocus)) {
      restoreFocusRef.current = previousFocus;
    }
  };

  return createPortal(
    <>
      <button className={scrimClassName} data-closing={closing || undefined} type="button" aria-label={closeLabel} onClick={requestClose} tabIndex={-1} disabled={closing} />
      <aside
        ref={drawerRef}
        className={drawerClassName}
        data-closing={closing || undefined}
        data-motion-surface={motionSurface}
        role={isModalDrawer ? "dialog" : "region"}
        aria-modal={isModalDrawer ? "true" : undefined}
        aria-labelledby={titleId}
        inert={closing || undefined}
        tabIndex={-1}
        onFocusCapture={handleFocusCapture}
      >
        <div className="drawer-head">
          <div>
            <strong id={titleId}>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <button type="button" className="icon-action drawer-close-button" disabled={closing} onClick={requestClose} aria-label={closeLabel}><X size={16} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {actions && <div className="drawer-actions inline">{actions}</div>}
      </aside>
    </>,
    document.body,
  );
}

export { DetailDrawer };
