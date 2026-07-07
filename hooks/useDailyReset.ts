/**
 * hooks/useDailyReset.ts
 * Phase 6 — daily reset logic + foreground safety-net hook.
 *
 * The "day" flips at the user's reset_time (Settings), not midnight.
 * checkIfResetNeeded / runReset are plain async functions so the headless
 * background-fetch task (notifications/backgroundReset.ts) can reuse them.
 *
 * Reset sequence (QA-07 — exact order matters):
 *   1. recoverOrphanedSessions()        — close any active timer sessions
 *   2. setSnoozeActive(false)           — daily reset always clears snooze
 *   3. cancelAllScheduledNotifications()— expo + DB cancel of everything pending
 *   4. clearAllNotificationRecords()    — wipe notification_schedule rows
 *   5+6. scheduleAllHabitNotifications()— fresh interval ping per active habit
 *   7. setLastResetDate(today)
 *
 * NOTE: daily_progress needs NO reset step — rows are per-date, so the new
 * day simply starts with no rows (created lazily by getOrCreateProgress).
 */

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import {
  getCurrentDateString,
  getLastResetDate,
  setLastResetDate,
  getResetTime,
  setSnoozeActive,
  recoverOrphanedSessions,
  clearAllNotificationRecords,
} from '@/db';
import {
  cancelAllScheduledNotifications,
  scheduleAllHabitNotifications,
} from '@/notifications/scheduler';
// Phase 7b consolidation: dateStringDaysAgo moved to lib/date.ts.
import { dateStringDaysAgo } from '@/lib/date';

// ─── Check ───────────────────────────────────────────────────────────────────

/**
 * True when the daily reset should run:
 *  - never runs twice on the same calendar day,
 *  - due today once the clock passes reset_time,
 *  - if a whole day was missed (app closed through the window), runs immediately.
 */
export async function checkIfResetNeeded(): Promise<boolean> {
  const today = getCurrentDateString();
  const last = await getLastResetDate();
  if (last === today) return false;

  // Missed at least one full reset window → catch up now regardless of clock.
  if (last !== '' && last !== dateStringDaysAgo(1)) return true;

  const resetTime = await getResetTime(); // 'HH:MM' (24h)
  const [h, m] = resetTime.split(':').map((n) => parseInt(n, 10));
  const resetMinutes =
    (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= resetMinutes;
}

// ─── Reset ───────────────────────────────────────────────────────────────────

/**
 * Execute the full reset sequence (order documented in the header).
 * Safe to call from the headless background task — no React, no UI state.
 * Callers that hold UI state (running timer, snooze banner) should pause the
 * timer BEFORE and re-sync snooze state AFTER — see DailyResetRunner in
 * app/_layout.tsx.
 */
export async function runReset(): Promise<void> {
  await recoverOrphanedSessions();
  await setSnoozeActive(false);
  await cancelAllScheduledNotifications();
  await clearAllNotificationRecords();
  await scheduleAllHabitNotifications();
  await setLastResetDate(getCurrentDateString());
}

/** Combined helper for the background task: returns true if a reset ran. */
export async function checkAndRunReset(): Promise<boolean> {
  if (!(await checkIfResetNeeded())) return false;
  await runReset();
  return true;
}

// ─── Foreground safety net ───────────────────────────────────────────────────

interface DailyResetHandlers {
  /** Runs after the check passes, BEFORE the reset (e.g. pause the live timer). */
  beforeReset?: () => Promise<void> | void;
  /** Runs after the reset (e.g. re-sync snooze UI state). */
  afterReset?: () => Promise<void> | void;
}

/**
 * Checks for a due reset on mount (app launch) and whenever the app returns
 * to the foreground. Complements the background-fetch task — this is the path
 * that catches the reset when background fetch was throttled or denied.
 */
export function useDailyReset(handlers?: DailyResetHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const runningRef = useRef(false);

  useEffect(() => {
    const maybeRun = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        if (await checkIfResetNeeded()) {
          await handlersRef.current?.beforeReset?.();
          await runReset();
          await handlersRef.current?.afterReset?.();
        }
      } catch (e) {
        console.warn('[dailyReset] foreground check failed:', e);
      } finally {
        runningRef.current = false;
      }
    };

    void maybeRun(); // app launch
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void maybeRun();
    });
    return () => sub.remove();
  }, []);
}
