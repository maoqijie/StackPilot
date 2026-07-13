import { useLayoutEffect, useRef, type ReactNode } from "react";

function PageTransition({ page, children }: { page: string; children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const previousPageRef = useRef(page);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || previousPageRef.current === page) return;

    previousPageRef.current = page;
    if (document.documentElement.classList.contains("supports-view-transitions")) return;
    content.classList.remove("is-page-entering");
    void content.offsetWidth;
    content.classList.add("is-page-entering");
  }, [page]);

  return (
    <div ref={contentRef} className="desktop-page-transition" data-page={page}>
      {children}
    </div>
  );
}

export { PageTransition };
