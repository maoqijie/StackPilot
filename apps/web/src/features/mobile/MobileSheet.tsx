import { X } from "lucide-react";
import { useEffect, useRef } from "react";
function MobileSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [title]);

  useEffect(() => () => {
    restoreFocusRef.current?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
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

  return (
    <div className="mobile-sheet-layer" role="presentation">
      <button className="mobile-sheet-scrim" type="button" aria-label="关闭移动端面板" onClick={() => onClose()} />
      <section ref={sheetRef} className="mobile-sheet" role="dialog" aria-modal="true" aria-label={title} aria-describedby="mobile-sheet-body" onKeyDown={handleKeyDown}>
        <header>
          <strong>{title}</strong>
          <button ref={closeButtonRef} type="button" aria-label="关闭" onClick={() => onClose()}><X size={18} /></button>
        </header>
        <div id="mobile-sheet-body" className="mobile-sheet-body">{children}</div>
      </section>
    </div>
  );
}

export { MobileSheet };
