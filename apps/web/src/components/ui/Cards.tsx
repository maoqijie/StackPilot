import { FileText, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Tone } from "../../types/app";

function ModuleSearch({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <label className="module-search">
      <span className="sr-only">{placeholder}</span>
      <Search size={14} />
      <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function MetricTile({ icon: Icon, label, value, tone }: { icon: LucideIcon; label: string; value: string; tone: Tone | string }) {
  return (
    <article>
      <Icon className={tone} size={26} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ClipboardIcon({ size = 22 }: { size?: number }) {
  return <FileText size={size} />;
}

function PanelCard({
  title,
  action,
  tabs,
  activeTab,
  className,
  onTabChange,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  tabs?: string[];
  activeTab?: string;
  className?: string;
  onTabChange?: (tab: string) => void;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`panel-card ${className ?? ""}`}>
      <header>
        <strong>{title}</strong>
        <div>
          {tabs?.map((tab, index) => (
            <button
              className={(activeTab ?? tabs[0]) === tab || (!activeTab && index === 0) ? "active" : ""}
              key={tab}
              type="button"
              onClick={() => onTabChange?.(tab)}
            >
              {tab}
            </button>
          ))}
          {action && <button className="panel-link" type="button" onClick={onAction}>{action}</button>}
        </div>
      </header>
      {children}
    </section>
  );
}

export { ModuleSearch, MetricTile, ClipboardIcon, PanelCard };
