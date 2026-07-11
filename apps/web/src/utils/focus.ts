

function activateOnKeyboard(event: React.KeyboardEvent<HTMLElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  action();
}

const drawerFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function isFocusableElement(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.offsetParent !== null;
}

function drawerFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(drawerFocusableSelector)).filter(isFocusableElement);
}

function drawerRestoreFallback(drawer: HTMLElement) {
  const layout = drawer.closest(".module-layout");
  const scopes: Array<ParentNode | null> = [layout, document];
  const selectors = [
    ".module-main .module-row-link",
    ".module-main .table-actions button:not([disabled])",
    ".module-main button:not([disabled])",
    ".module-head button:not([disabled])",
  ];

  for (const scope of scopes) {
    if (!scope) continue;
    for (const selector of selectors) {
      const target = scope.querySelector<HTMLElement>(selector);
      if (target && !drawer.contains(target) && isFocusableElement(target)) return target;
    }
  }
  return null;
}

export { activateOnKeyboard, drawerFocusableSelector, isFocusableElement, drawerFocusableElements, drawerRestoreFallback };
