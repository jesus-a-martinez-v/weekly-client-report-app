"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type TokenState = {
  token: string | null;
  expiresAt: string | null;
};

type TokenResponse =
  | { token: string; expiresAt: string }
  | { token: null; expiresAt: null; reason: string };

const TriggerTokenContext = createContext<TokenState>({
  token: null,
  expiresAt: null,
});

const REFRESH_INTERVAL_MS = 20 * 60 * 1000;

export function useTriggerToken(): string | null {
  return useContext(TriggerTokenContext).token;
}

export function useTriggerTokenState(): TokenState {
  return useContext(TriggerTokenContext);
}

export function TriggerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TokenState>({
    token: null,
    expiresAt: null,
  });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/trigger/token", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as TokenResponse;
      setState({ token: body.token, expiresAt: body.expiresAt });
    } catch {
      // Swallow — the next refresh tick will retry. Phase A has no
      // consumers; in later phases the realtime hooks surface errors.
    }
  }, []);

  useEffect(() => {
    void refresh();
    timerRef.current = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  return (
    <TriggerTokenContext.Provider value={state}>
      {children}
    </TriggerTokenContext.Provider>
  );
}
