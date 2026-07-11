import { useCallback, useEffect, useRef, useState } from "react";
import { cleanCurrentRouteForPage, collectUrlParams, deleteContextRouteParams, expireTransientRoutes, hasExpiredInteractionParams, hasHashRouteQuery, isStaleTransientRoute, lockedRouteForPage, readPageFromHash, writeRouteState } from "./routing";
import { DesktopShell, SessionLockOverlay } from "../components/layout/DesktopShell";
import { MobileApp } from "../features/mobile/MobileApp";
import type { Notify, PageKey, SetPage, ToastState } from "../types/app";
import { AuthGate } from "../features/auth/AuthGate";
import { logout } from "../api/authApi";

function AuthenticatedApp() {
  const [page, setPageState] = useState<PageKey>(readPageFromHash);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [topbarUnreadCount, setTopbarUnreadCount] = useState(0);
  const [sessionLocked, setSessionLocked] = useState(false);
  const pageRef = useRef(page);
  const sessionLockedRef = useRef(sessionLocked);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    sessionLockedRef.current = sessionLocked;
  }, [sessionLocked]);

  useEffect(() => {
    const syncRouteFromLocation = () => {
      if (sessionLockedRef.current) {
        const lockedRoute = lockedRouteForPage(pageRef.current);
        if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== lockedRoute) {
          window.history.replaceState(null, "", lockedRoute);
        }
        return;
      }
      if (isStaleTransientRoute()) {
        window.history.replaceState(null, "", cleanCurrentRouteForPage());
      }
      if (hasHashRouteQuery() || hasExpiredInteractionParams(collectUrlParams())) {
        window.history.replaceState(null, "", cleanCurrentRouteForPage());
      }
      setPageState(readPageFromHash());
    };
    syncRouteFromLocation();
    window.addEventListener("hashchange", syncRouteFromLocation);
    window.addEventListener("popstate", syncRouteFromLocation);
    window.addEventListener("pageshow", syncRouteFromLocation);
    return () => {
      window.removeEventListener("hashchange", syncRouteFromLocation);
      window.removeEventListener("popstate", syncRouteFromLocation);
      window.removeEventListener("pageshow", syncRouteFromLocation);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = useCallback<Notify>((message, tone = "success") => {
    setToast({ message, tone });
  }, []);

  const lockSession = useCallback(() => {
    void logout();
    expireTransientRoutes();
    const lockedRoute = lockedRouteForPage(pageRef.current);
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== lockedRoute) {
      window.history.replaceState(null, "", lockedRoute);
    }
    setSessionLocked(true);
  }, []);

  const setPage = useCallback<SetPage>((next, nextToast) => {
    if (sessionLocked) return;
    setPageState(next);
    pageRef.current = next;
    if (nextToast) {
      setToast(nextToast);
    }
    const params = new URLSearchParams(window.location.search);
    deleteContextRouteParams(params);
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}#${next}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      writeRouteState("push", nextUrl, params);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  }, [sessionLocked]);

  return (
    <main className={`shot-canvas ${page === "mobile" ? "mobile-canvas" : ""}`}>
      <div className="app-interaction-layer" inert={sessionLocked} aria-hidden={sessionLocked ? "true" : undefined}>
        {page === "mobile" ? (
          <MobileApp notify={notify} />
        ) : (
          <DesktopShell page={page} setPage={setPage} notify={notify} topbarUnreadCount={topbarUnreadCount} setTopbarUnreadCount={setTopbarUnreadCount} sessionLocked={sessionLocked} onLogout={lockSession} />
        )}
      </div>
      {sessionLocked && (
        <SessionLockOverlay
          page={page}
          onRestore={() => {
            setSessionLocked(false);
            notify("已重新进入控制台", "info");
          }}
        />
      )}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{toast?.message ?? ""}</div>
    </main>
  );
}

function App(){return <AuthGate>{()=><AuthenticatedApp/>}</AuthGate>;}

export { App };
export default App;
