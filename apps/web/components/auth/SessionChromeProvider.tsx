"use client";

import * as React from "react";
import type { SessionUserChrome } from "@/lib/auth/session";
import { useAuthStore } from "@/lib/state/auth-store";

type ChromeSession = Promise<SessionUserChrome | null>;

const SessionChromeContext = React.createContext<ChromeSession | null>(null);

export function SessionChromeProvider({
  user,
  children,
}: {
  user: ChromeSession;
  children: React.ReactNode;
}) {
  return (
    <SessionChromeContext.Provider value={user}>
      <React.Suspense fallback={null}>
        <SyncSession user={user} />
      </React.Suspense>
      {children}
    </SessionChromeContext.Provider>
  );
}

function SyncSession({ user }: { user: ChromeSession }) {
  const resolvedUser = React.use(user);
  const setAuth = useAuthStore((state) => state.setAuth);

  React.useEffect(() => {
    setAuth(resolvedUser);
  }, [setAuth, resolvedUser]);
  return null;
}

export function useSessionChrome(): SessionUserChrome | null {
  const session = React.useContext(SessionChromeContext);
  const user = session ? React.use(session) : null;
  const status = useAuthStore((state) => state.status);
  return status === "signed-out" ? null : user;
}
