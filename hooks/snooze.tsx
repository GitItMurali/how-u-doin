/**
 * hooks/snooze.tsx
 * Phase 5 — global "snooze" mode: a one-tap quiet switch.
 *
 * (File named snooze.tsx rather than useSnooze.tsx because the old Phase 0
 * useSnooze.ts stub could not be removed on this mount; importing @/hooks/snooze
 * avoids the .ts-before-.tsx resolution collision.)
 *
 * When snooze is ON:
 *   - the running Focus timer (if any) is paused (elapsed time is saved),
 *   - every scheduled notification is cancelled (interval + times_up),
 *   - snooze_active is persisted so it survives a relaunch.
 *
 * When snooze is OFF:
 *   - interval (habit) notifications are rescheduled from now,
 *   - snooze_active is cleared.
 *   ('times_up' notifications are event-driven and never rescheduled — SCHEMA-02.)
 *
 * Provider lives INSIDE TimerProvider (see app/_layout.tsx) so it can pause the
 * active timer via useTimer(). .tsx because it renders a Provider (FIX-P4-01).
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';

import { isSnoozeActive, setSnoozeActive } from '@/db';
import { useTimer } from '@/hooks/useTimer';
import {
  cancelAllScheduledNotifications,
  rescheduleAllIntervalNotifications,
} from '@/notifications/scheduler';

interface SnoozeContextValue {
  /** true while snooze mode is active (notifications silenced, timer paused). */
  snoozed: boolean;
  /** Turn snooze on: pause timer, cancel all notifications, persist. */
  activateSnooze: () => Promise<void>;
  /** Turn snooze off: reschedule interval notifications, persist. */
  deactivateSnooze: () => Promise<void>;
  /** Convenience toggle. */
  toggleSnooze: () => Promise<void>;
}

const SnoozeContext = createContext<SnoozeContextValue | null>(null);

export function SnoozeProvider({ children }: { children: React.ReactNode }) {
  const [snoozed, setSnoozed] = useState(false);
  const { activeTaskId, pauseTimer } = useTimer();

  // Hydrate persisted snooze state on mount (survives relaunch).
  useEffect(() => {
    let mounted = true;
    (async () => {
      const active = await isSnoozeActive();
      if (mounted) setSnoozed(active);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const activateSnooze = useCallback(async () => {
    // Pause the running Focus timer first so its elapsed time is logged.
    if (activeTaskId !== null) {
      await pauseTimer(activeTaskId);
    }
    await cancelAllScheduledNotifications();
    await setSnoozeActive(true);
    setSnoozed(true);
  }, [activeTaskId, pauseTimer]);

  const deactivateSnooze = useCallback(async () => {
    await rescheduleAllIntervalNotifications();
    await setSnoozeActive(false);
    setSnoozed(false);
  }, []);

  const toggleSnooze = useCallback(async () => {
    if (snoozed) {
      await deactivateSnooze();
    } else {
      await activateSnooze();
    }
  }, [snoozed, activateSnooze, deactivateSnooze]);

  return (
    <SnoozeContext.Provider
      value={{ snoozed, activateSnooze, deactivateSnooze, toggleSnooze }}
    >
      {children}
    </SnoozeContext.Provider>
  );
}

export function useSnooze(): SnoozeContextValue {
  const ctx = useContext(SnoozeContext);
  if (!ctx) {
    throw new Error('useSnooze must be used within a SnoozeProvider');
  }
  return ctx;
}
