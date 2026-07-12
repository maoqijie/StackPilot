import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useIsNarrowViewport } from "../../hooks/useIsNarrowViewport";
import { drawerFocusableElements, drawerRestoreFallback, isFocusableElement } from "../../utils/focus";

function DetailDrawer({
  title,
  subtitle,
  onClose,
  children,
  actions,
  className,
  modal,
  autoFocus = true,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  modal?: boolean;
  autoFocus?: boolean;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const isNarrowViewport = useIsNarrowViewport();
  const isModalDrawer = modal ?? isNarrowViewport;
  const drawerClassName = ["detail-drawer", className].filter(Boolean).join(" ");
  const scrimClassName = ["drawer-scrim", className ? `${className}-scrim` : ""].filter(Boolean).join(" ");

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    let focusFrame = 0;
    if (autoFocus) {
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const focusable = drawerFocusableElements(drawer);
      const firstBodyFocusTarget = focusable.find((element) => !element.classList.contains("drawer-close-button"));
      focusFrame = window.requestAnimationFrame(() => {
        if (document.contains(drawer)) {
          (firstBodyFocusTarget ?? focusable[0] ?? drawer).focus({ preventScroll: true });
        }
      });
    }

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !document.contains(drawer)) return;
      if (event.key === "Escape") {
        if (document.querySelector(".cloud-header-results")) return;
        onCloseRef.current();
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
      const fallbackTarget = restoreTarget && document.contains(restoreTarget) && isFocusableElement(restoreTarget)
        ? restoreTarget
        : drawerRestoreFallback(drawer);
      if (fallbackTarget) {
        fallbackTarget.focus({ preventScroll: true });
      }
    };
  }, [autoFocus, isModalDrawer]);

  const handleFocusCapture = (event: React.FocusEvent<HTMLElement>) => {
    const previousFocus = event.relatedTarget;
    if (previousFocus instanceof HTMLElement && !event.currentTarget.contains(previousFocus) && isFocusableElement(previousFocus)) {
      restoreFocusRef.current = previousFocus;
    }
  };

  return createPortal(
    <>
      <button className={scrimClassName} type="button" aria-label="关闭详情" onClick={onClose} tabIndex={-1} />
      <aside
        ref={drawerRef}
        className={drawerClassName}
        role={isModalDrawer ? "dialog" : "region"}
        aria-modal={isModalDrawer ? "true" : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        onFocusCapture={handleFocusCapture}
      >
        <div className="drawer-head">
          <div>
            <strong id={titleId}>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <button type="button" className="icon-action drawer-close-button" onClick={onClose} aria-label="关闭详情"><X size={16} /></button>
        </div>
        <div className="drawer-body">{children}</div>
        {actions && <div className="drawer-actions inline">{actions}</div>}
      </aside>
    </>,
    document.body,
  );
}

export { DetailDrawer };
