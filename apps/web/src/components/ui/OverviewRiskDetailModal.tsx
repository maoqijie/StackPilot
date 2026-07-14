import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileSearch,
  ShieldAlert,
  Target,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import type { OverviewRiskRecord } from "../../api/overviewApi";
import { useExitMotion } from "./useExitMotion";

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
  const { closing, requestClose } = useExitMotion(onClose);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const closeButton = modalRef.current?.querySelector<HTMLButtonElement>(".risk-modal-close");
    closeButton?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
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
  }, [requestClose]);

  const steps = suggestionSteps(risk.suggestion);
  const evidence = risk.evidence ?? [];

  return createPortal(
    <>
      <button className="risk-modal-scrim" data-closing={closing || undefined} type="button" aria-label="关闭风险详情" onClick={requestClose} tabIndex={-1} disabled={closing} />
      <div ref={modalRef} className="risk-detail-modal" data-closing={closing || undefined} role="dialog" aria-modal="true" aria-labelledby={titleId} inert={closing || undefined}>
        <header className="risk-modal-head">
          <div className="risk-modal-title">
            <span>{risk.traceId}</span>
            <strong id={titleId}>{risk.title}</strong>
            <div className="risk-modal-flags" aria-label="风险状态">
              <b className={`risk-level-text ${riskTone(risk.level)}`}>{risk.level === "高危" ? <ShieldAlert size={14} /> : <AlertTriangle size={14} />}{risk.level}</b>
              <b className="risk-status"><Clock3 size={14} />{risk.status}</b>
            </div>
          </div>
          <button className="icon-action risk-modal-close" type="button" disabled={closing} onClick={requestClose} aria-label="关闭风险详情">
            <X size={16} />
          </button>
        </header>

        <div className="risk-modal-body">
          <section className="risk-modal-summary" aria-label="风险详情">
            <p><span><Target size={14} />目标</span><b>{risk.target}</b></p>
            <p><span><UserRound size={14} />负责人</span><b>{risk.owner}</b></p>
            <p><span><CalendarClock size={14} />发现时间</span><b>{risk.detected}</b></p>
            <p><span><Zap size={14} />影响</span><b>{risk.impact}</b></p>
          </section>

          <section className="risk-evidence-panel" aria-label="当前依据">
            <header><FileSearch size={18} /><strong>当前依据</strong></header>
            {evidence.length > 0 ? (
              <div>
                {evidence.map((item, index) => (
                  <p key={`${risk.id}-evidence-${index}`}>
                    <span>{item.label}</span>
                    <b>{item.value}</b>
                  </p>
                ))}
              </div>
            ) : (
              <div className="risk-evidence-empty"><FileSearch size={18} /><span><b>暂无证据明细</b><em>本次扫描未返回更细的采集依据。</em></span></div>
            )}
          </section>

          <section className="overview-risk-note" aria-label="处理建议">
            <header><CheckCircle2 size={18} /><strong>处理建议</strong></header>
            <ol>
              {steps.map((item, index) => <li key={`${risk.id}-suggestion-${index}`}>{item}</li>)}
            </ol>
          </section>
        </div>
      </div>
    </>,
    document.body,
  );
}
