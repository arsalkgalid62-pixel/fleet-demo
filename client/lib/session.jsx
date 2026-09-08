import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createApi } from './api.js';

export const SessionContext = createContext(null);

/**
 * Holds one seat's session. Each role route mounts its own provider, so a
 * passenger tab and a dispatch tab never share an identity.
 */
export function SessionProvider({ seat, children }) {
  const api = useMemo(() => createApi(seat), [seat]);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .session()
      .then((data) => live && setUser(data.user))
      .catch((e) => live && setError(e.message))
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, [api]);

  const signIn = useCallback(
    async (username, password) => {
      setError(null);
      setUser(await api.signIn(username, password));
    },
    [api],
  );

  const signOut = useCallback(async () => {
    await api.signOut();
    setUser(null);
    await api.session();
  }, [api]);

  const value = useMemo(
    () => ({ api, seat, user, ready, error, signIn, signOut }),
    [api, seat, user, ready, error, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside a SessionProvider');
  return value;
}

/**
 * Short polling of an authorised endpoint. The database stays authoritative;
 * this only decides how often the browser asks. Consecutive failures are
 * surfaced rather than hidden, and the last good data stays on screen.
 */
export function usePoll(load, { intervalMs = 3000, enabled = true } = {}) {
  const [data, setData] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [failures, setFailures] = useState(0);
  const [error, setError] = useState(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  const refresh = useCallback(async () => {
    try {
      const next = await loadRef.current();
      setData(next);
      setUpdatedAt(new Date());
      setFailures(0);
      setError(null);
      return next;
    } catch (e) {
      setFailures((n) => n + 1);
      setError(e.message);
      return null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    let stopped = false;
    let timer;
    const tick = async () => {
      if (stopped) return;
      await refresh();
      if (!stopped) timer = setTimeout(tick, intervalMs);
    };
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [enabled, intervalMs, refresh]);

  return { data, updatedAt, failures, error, refresh, offline: failures >= 2 };
}
