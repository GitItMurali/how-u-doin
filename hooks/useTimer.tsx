/**
 * hooks/useTimer.ts
 * Phase 4 — live timer for Focus tasks.
 *
 * Provides a single global timer context (TimerProvider) so the whole app shares
 * one source of truth for "which Focus task is currently running" and its live
 * elapsed seconds. This enforces the SINGLE-TIMER RULE: starting a timer auto-pauses
 * any other running Focus timer (saving its elapsed time) and shows a toast.
 *
 * Persistence model (DB is source of truth):
 *  - startTimer  -> startSession() inserts an is_active row with started_at = now.
 *  - pause/stop  -> stopSession() records duration (seconds), then addLoggedSeconds() updates
 *                   daily_progress; quota check fires markComplete + Time's Up.
 *  - foreground  -> recoverTimer() reads getActiveSession() and resumes the live tick
 *                   from the stored started_at (survives backgrounding / cold-ish resume).
 *
 * Date rule: ALWAYS getCurrentDateString() (INTEGRATION-01) — never toISOString.
 *
 * Phase 5: on quota completion this fires a real local 'times_up' push via
 * notifications/scheduler.ts (unless snooze is active) AND surfaces a toast as
 * immediate in-app feedback.
 */
import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { ToastAndroid, Platform } from 'react-native';

import {
  getCurrentDateString,
  getTask,
  getActiveSession,
  startSession,
  stopSession,
  addLoggedSeconds,
  getOrCreateProgress,
  markComplete,
  getNextPendingFocusTask,
  isSnoozeActive,
} from '@/db';
import { fireTimesUpNotification } from '@/notifications/scheduler';

// ─── Toast helper ───────────────────────────────────────────────────────────────
// Android-first app. ToastAndroid is the paused/Time's-Up surface for now.
function toast(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  }
  // iOS has no native toast; Phase 7c polish can add a custom snackbar if needed.
}

// ─── Context shape ──────────────────────────────────────────────────────────────

interface TimerContextValue {
  /** id of the Focus task whose timer is currently running, or null. */
  activeTaskId: number | null;
  /** live elapsed seconds for the active task (0 when nothing is running). */
  elapsedSeconds: number;
  /** Start (or resume) the timer for a focus task. Auto-pauses any other running timer. */
  startTimer: (taskId: number) => Promise<void>;
  /** Pause the running timer and persist elapsed minutes. No-op if taskId isn't active. */
  pauseTimer: (taskId: number) => Promise<void>;
  /** Toggle convenience: start if not running, pause if it is. */
  toggleTimer: (taskId: number) => Promise<void>;
  /** Recover an in-progress session on app launch / foreground. */
  recoverTimer: () => Promise<void>;
}

const TimerContext = createContext<TimerContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────────

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Refs survive re-renders without re-triggering effects.
  const sessionIdRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null); // ms epoch of session start
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Begin the 1s display tick. Computes elapsed from startedAt so it stays
  // accurate even if a tick is missed (e.g. JS thread was busy).
  const beginTick = useCallback(() => {
    clearTick();
    tickRef.current = setInterval(() => {
      if (startedAtRef.current !== null) {
        const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSeconds(secs);
      }
    }, 1000);
  }, [clearTick]);

  /**
   * Internal: stop the currently active session, persist its minutes, run the
   * quota -> complete -> Time's Up check. Returns nothing; leaves no active timer.
   * Caller is responsible for clearing UI state if needed.
   */
  const finalizeActiveSession = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const startedAt = startedAtRef.current;
    const taskId = activeTaskId;

    clearTick();

    if (sessionId === null || startedAt === null || taskId === null) {
      // Nothing genuinely running — just reset.
      sessionIdRef.current = null;
      startedAtRef.current = null;
      return;
    }

    const today = getCurrentDateString();
    // Real elapsed SECONDS — no minimum floor. A 5-second session logs 5 seconds,
    // not a full minute (fixes the old Math.max(1, ...) inflation where a quick
    // pause counted as 1 min and repeated pauses kept stacking minutes).
    const durationSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));

    // 1) Close the session row (sessions.ts is source of truth for raw time).
    await stopSession(sessionId, durationSeconds);
    // 2) Roll the seconds into daily_progress (QA-04: stopSession CALLER MUST do this).
    await addLoggedSeconds(taskId, today, durationSeconds);

    // 3) Quota check (pattern documented on addLoggedMinutes / stopSession).
    const task = await getTask(taskId);
    const progress = await getOrCreateProgress(taskId, today);
    if (
      task &&
      task.quota_minutes != null &&
      progress.logged_seconds >= task.quota_minutes * 60 &&
      progress.is_complete === 0
    ) {
      await markComplete(taskId, today, task.quota_minutes);

      // getNextPendingFocusTask only looks forward by sort_order — by design (QA-02).
      const next = await getNextPendingFocusTask(taskId, today);

      // Phase 5: fire a real local push (notification_type 'times_up', never
      // rescheduled — SCHEMA-02) unless snooze is active. Keep the toast as
      // immediate in-app feedback either way.
      if (!(await isSnoozeActive())) {
        await fireTimesUpNotification(taskId, task.name, next?.name ?? null);
      }
      if (next) {
        toast(`${task.name} — time's up. Next up: ${next.name}.`);
      } else {
        toast('You finished everything. Take a breath.');
      }
    }

    sessionIdRef.current = null;
    startedAtRef.current = null;
  }, [activeTaskId, clearTick]);

  const startTimer = useCallback(
    async (taskId: number) => {
      // Single-timer rule: if a DIFFERENT focus timer is running, pause it first.
      if (activeTaskId !== null && activeTaskId !== taskId) {
        const previous = await getTask(activeTaskId);
        await finalizeActiveSession();
        if (previous) toast(`${previous.name} paused`);
      }

      const today = getCurrentDateString();
      const sessionId = await startSession(taskId, today);

      sessionIdRef.current = sessionId;
      startedAtRef.current = Date.now();
      setActiveTaskId(taskId);
      setElapsedSeconds(0);
      beginTick();
    },
    [activeTaskId, finalizeActiveSession, beginTick],
  );

  const pauseTimer = useCallback(
    async (taskId: number) => {
      if (activeTaskId !== taskId) return; // not the running one — ignore
      await finalizeActiveSession();
      setActiveTaskId(null);
      setElapsedSeconds(0);
    },
    [activeTaskId, finalizeActiveSession],
  );

  const toggleTimer = useCallback(
    async (taskId: number) => {
      if (activeTaskId === taskId) {
        await pauseTimer(taskId);
      } else {
        await startTimer(taskId);
      }
    },
    [activeTaskId, pauseTimer, startTimer],
  );

  /**
   * On launch / foreground: if the DB has an active session (app was killed mid-run,
   * or screen remounted), resume the live tick from its stored started_at.
   */
  const recoverTimer = useCallback(async () => {
    const active = await getActiveSession();
    // QA-R2-01: never resume a session from a PREVIOUS day (app killed mid-timer
    // overnight). Left alone it resumes with hours on the clock, and the daily
    // reset's beforeReset pause would dump the whole overnight gap into TODAY's
    // progress. recoverOrphanedSessions() (daily reset) closes it instead.
    if (active && active.date !== getCurrentDateString()) return;
    if (active && active.started_at != null) {
      sessionIdRef.current = active.id;
      startedAtRef.current = active.started_at;
      setActiveTaskId(active.task_id);
      setElapsedSeconds(Math.floor((Date.now() - active.started_at) / 1000));
      beginTick();
    }
  }, [beginTick]);

  // Clean up the interval if the provider unmounts.
  useEffect(() => clearTick, [clearTick]);

  const value: TimerContextValue = {
    activeTaskId,
    elapsedSeconds,
    startTimer,
    pauseTimer,
    toggleTimer,
    recoverTimer,
  };

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

// ─── Hook ───────────────────────────────────────────────────────────────────────

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error('useTimer must be used within a TimerProvider');
  return ctx;
}
