import { AlertTriangle, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { drawerFocusableElements, drawerRestoreFallback, isFocusableElement } from "../../utils/focus";

function ConfirmDialog({
  title,
  message,
  detail,
  confirmLabel,
  onConfirm,
  onClose,
  tone = "danger",
  className,
  confirmDisabled = false,
  children,
}: {
  title: string;
  message: string;
  detail?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  tone?: "danger" | "warning";
  className?: string;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      dialog.querySelector<HTMLElement>("[data-confirm-initial], [data-confirm-cancel]")?.focus({ preventScroll: true });
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !document.contains(dialog)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = drawerFocusableElements(dialog);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (!dialog.contains(activeElement)) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      const restoreTarget = previousFocus && document.contains(previousFocus) && isFocusableElement(previousFocus)
        ? previousFocus
        : drawerRestoreFallback(dialog);
      restoreTarget?.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <>
      <button className={["confirm-dialog-scrim", className ? `${className}-scrim` : ""].filter(Boolean).join(" ")} type="button" aria-label="关闭确认弹窗" onClick={onClose} tabIndex={-1} />
      <div
        ref={dialogRef}
        className={["confirm-dialog", className].filter(Boolean).join(" ")}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
      >
        <header>
          <span className={`confirm-dialog-icon ${tone}`}><AlertTriangle size={20} /></span>
          <strong id={titleId}>{title}</strong>
          <button className="icon-action" type="button" aria-label="关闭确认弹窗" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="confirm-dialog-body">
          <p id={descriptionId}>{message}</p>
          {detail && <code>{detail}</code>}
          {children}
        </div>
        <footer>
          <button className="ghost" type="button" data-confirm-cancel onClick={onClose}>取消</button>
          <button className={tone === "danger" ? "trash-destructive" : "primary"} type="button" disabled={confirmDisabled} onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </div>
    </>,
    document.body,
  );
}

export { ConfirmDialog };
