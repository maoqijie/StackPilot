import { useCallback, useEffect, useRef, useState } from "react";

const overlayMotionDurationMs = 180;

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useExitMotion(onClose: () => void) {
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeRef = useRef(onClose);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (prefersReducedMotion()) {
      closeRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    timerRef.current = window.setTimeout(() => closeRef.current(), overlayMotionDurationMs);
  }, []);

  return { closing, requestClose };
}

export { overlayMotionDurationMs, useExitMotion };
