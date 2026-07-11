import { viewContextForPage } from "../../app/navigation";
import { useIsNarrowViewport } from "../../hooks/useIsNarrowViewport";
import type { PageKey, ViewContext } from "../../types/app";

function ModulePageShell({
  title,
  page,
  viewContext,
  tabs,
  actions,
  filters,
  metrics,
  side,
  children,
}: {
  title: string;
  subtitle?: string | null;
  page?: PageKey;
  viewContext?: ViewContext | false | null;
  tabs?: React.ReactNode;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  metrics?: React.ReactNode;
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  const effectiveViewContext = viewContext === false ? null : viewContext ?? (page ? viewContextForPage(page) : null);
  const isNarrowViewport = useIsNarrowViewport();
  const isModalSide = Boolean(side) && isNarrowViewport;
  return (
    <div className={`module-page ${page ? `module-page-${page}` : ""}`}>
      <div className="page-head module-head" inert={isModalSide} aria-hidden={isModalSide ? "true" : undefined}>
        <div>
          <h1>{title}</h1>
        </div>
        {actions && <div>{actions}</div>}
      </div>
      <div className={`module-layout ${side ? "has-side" : ""}`}>
        <section className="module-main" inert={isModalSide} aria-hidden={isModalSide ? "true" : undefined}>
          {effectiveViewContext && <ModuleViewContext context={effectiveViewContext} />}
          {tabs}
          {filters && <div className="module-filter-line">{filters}</div>}
          {metrics && <div className="module-metrics">{metrics}</div>}
          {children}
        </section>
        {side}
      </div>
    </div>
  );
}

function ModuleViewContext({ context }: { context: ViewContext }) {
  return (
    <div className="module-view-context">
      <div>
        <span>{context.eyebrow}</span>
        <strong>{context.title}</strong>
      </div>
      <div>
        {context.chips.map((chip) => <em key={chip}>{chip}</em>)}
      </div>
    </div>
  );
}

export { ModulePageShell, ModuleViewContext };
