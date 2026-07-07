/**
 * hooks/useLockoutCountdown.ts
 * QA consolidation — the PIN-lockout countdown state machine, previously
 * duplicated in app/lock.tsx and the Settings ChangePinSheet.
 *
 * Seconds tick down locally (1s interval, only while > 0); syncFromStore()
 * pulls the persisted pin_lockout_until so a lockout started elsewhere (or
 * surviving a force-quit) is honoured on mount/open.
 */
import { useCallback, useEffect, useState } from 'react';

import { getLockoutRemaining } from '@/lib/pin';

export function useLockoutCountdown() {
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const id = setInterval(
      () => setLockoutSeconds((s) => (s <= 1 ? 0 : s - 1)),
      1000
    );
    return () => clearInterval(id);
  }, [lockoutSeconds > 0]);

  /** Read the persisted lockout (SecureStore). Safe to call on mount/open. */
  const syncFromStore = useCallback(async () => {
    try {
      const ms = await getLockoutRemaining();
      setLockoutSeconds(Math.ceil(ms / 1000));
    } catch {
      // Keystore read failed — leave the pad enabled; verifyPin will surface it.
    }
  }, []);

  /** Start/refresh a lockout from a verifyPin result's lockoutMs. */
  const startLockout = useCallback((ms: number) => {
    setLockoutSeconds(Math.ceil(ms / 1000));
  }, []);

  return { lockoutSeconds, lockedOut: lockoutSeconds > 0, syncFromStore, startLockout };
}
