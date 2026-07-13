import { flushSync } from "react-dom";

function commitPageUpdate(update: () => void) {
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }

  document.documentElement.classList.add("supports-view-transitions");
  document.startViewTransition(() => flushSync(update));
}

export { commitPageUpdate };
