import { useEffect, useState } from "react";

function useIsNarrowViewport() {
  const [isNarrow, setIsNarrow] = useState(() => (
    typeof window !== "undefined" && window.matchMedia("(max-width: 773px)").matches
  ));

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 773px)");
    const syncNarrow = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsNarrow(event.matches);
    };

    syncNarrow(mediaQuery);
    mediaQuery.addEventListener("change", syncNarrow);
    return () => mediaQuery.removeEventListener("change", syncNarrow);
  }, []);

  return isNarrow;
}

export { useIsNarrowViewport };
