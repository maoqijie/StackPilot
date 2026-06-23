import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import type { OverviewRiskRecord } from "./overviewApi";

type Tone = "green" | "blue" | "orange" | "red" | "gray" | "purple";

const modalFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function riskTone(level: OverviewRiskRecord["level"]): Tone {
  if (level === "高危") return "red";
  if (level === "中危") return "orange";
  return "blue";
}

function StatusLight({ tone }: { tone: Tone }) {
  return <i className={`status-light ${tone}`} />;
}

function suggestionSteps(suggestion: string) {
  return suggestion.split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

export function OverviewRiskDetailModal({
  risk,
  onClose,
}: {
  risk: OverviewRiskRecord;
  onClose: () => void;
}) {
  const titleId = useId();
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeButton = modalRef.current?.querySelector<HTMLButtonElement>(".risk-modal-close");
    closeButton?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !modalRef.current) return;

      const focusable = Array.from(modalRef.current.querySelectorAll<HTMLElement>(modalFocusableSelector));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocus && document.contains(previousFocus)) previousFocus.focus({ preventScroll: true });
    };
  }, [onClose]);

  const steps = suggestionSteps(risk.suggestion);

  return (
    <>
      <button className="risk-modal-scrim" type="button" aria-label="关闭风险详情" onClick={onClose} tabIndex={-1} />
      <div ref={modalRef} className="risk-detail-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="risk-modal-head">
          <div>
            <span>{risk.traceId}</span>
            <strong id={titleId}>{risk.title}</strong>
          </div>
          <button className="icon-action risk-modal-close" type="button" onClick={onClose} aria-label="关闭风险详情">
            <X size={16} />
          </button>
        </header>

        <div className="risk-modal-body">
          <section className="risk-modal-summary" aria-label="风险详情">
            <p><span>等级</span><b><StatusLight tone={riskTone(risk.level)} /> {risk.level}</b></p>
            <p><span>状态</span><b>{risk.status}</b></p>
            <p><span>目标</span><b>{risk.target}</b></p>
            <p><span>负责人</span><b>{risk.owner}</b></p>
            <p><span>发现时间</span><b>{risk.detected}</b></p>
            <p><span>影响</span><b>{risk.impact}</b></p>
          </section>

          <section className="overview-risk-note" aria-label="处理建议">
            <strong>处理建议</strong>
            <ol>
              {steps.map((item, index) => <li key={`${risk.id}-suggestion-${index}`}>{item}</li>)}
            </ol>
          </section>
        </div>
      </div>
    </>
  );
}
