/**
 * hooks/useTimer.ts
 * Phase 4 — live timer for Focus tasks.
 *
 * Provides a single global timer context (TimerProvider) so the whole app shares
 * one source of truth for "which Focus task is currently running". This enforces
 * the SINGLE-TIMER RULE: starting a timer auto-pauses any other running Focus
 * timer (saving its elapsed time) and shows a toast.
 *
 * Persistence model (DB is source of truth):
 *  - startTimer  -> startSession() inserts an is_active row with started_at = now.
 *  - pause/stop  -> stopSession() records duration (seconds), then addLoggedSeconds() updates
 *                   daily_progress; quota check fires markComplete + Time's Up.
 *  - foreground  -> recoverTimer() reads getActiveSession() and resumes from the
 *                   stored started_at (survives backgrounding / cold-ish resume).
 *
 * Date rule: ALWAYS getCurrentDateString() (INTEGRATION-01) — never toISOString.
 *
 * FIX-QUOTA-STOP (2026-07-07): the provider's internal 1s tick watches a quota
 * deadline and auto-pauses the timer the moment the quota is hit.
 *
 * PERF C1/C2 (7c): the context NO LONGER exposes per-second state. It exposes
 * `activeStartedAt` (changes only on start/pause), and the running FocusTaskCard
 * computes its own elapsed display from it with a card-local tick. Before this,
 * elapsedSeconds state updated every second → new context value → EVERY consumer
 * (whole Home list) re-rendered once per second while a timer ran.
 *
 * B6 (7c): startTimer/pauseTimer are re-entrancy-guarded — a double-tap on play
 * could previously interleave two startSession calls (two active rows).
 */
import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
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
import { toast } from '@/lib/toast';

// ─── Context shape ──────────────────────────────────────────────────────────────

interface TimerContextValue {
  /** id of the Focus task whose timer is currently running, or null. */
  activeTaskId: number | null;
  /**
   * ms epoch the running session started at (null when nothing runs).
   * PERF C2: cards derive their live elapsed display from this with their own
   * 1s tick — the context itself only changes on start/pause/recover.
   */
  activeStartedAt: number | null;
  /**
   * Bumped every time a session is finalized (manual pause, single-timer
   * auto-pause, OR quota auto-stop). Screens should reload persisted progress
   * when this changes — it's how the quota auto-stop (FIX-QUOTA-STOP) reaches
   * the Home list without a user interaction.
   */
  sessionsVersion: number;
  /** Start (or resume) the timer for a focus task. Auto-pauses any other running timer. */
  startTimer: (taskId: number) => Promise<void>;
  /** Pause the running timer and persist elapsed time. No-op if taskId isn't active. */
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
  const [activeStartedAt, setActiveStartedAt] = useState<number | null>(null);
  const [sessionsVersion, setSessionsVersion] = useState(0);

  // Refs survive re-renders without re-triggering effects.
  const sessionIdRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null); // ms epoch of session start
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // FIX-QUOTA-STOP: the tick needs stable access to "who is running", "when the
  // quota will be hit", and "how to pause" without stale closures.
  const activeTaskIdRef = useRef<number | null>(null);
  const quotaDeadlineRef = useRef<number | null>(null); // ms epoch when quota hits
  const autoStoppingRef = useRef(false);                // one-shot guard
  const pauseRef = useRef<(taskId: number) => Promise<void>>(async () => {});

  // B6: one timer mutation at a time. A fast double-tap on play used to run
  // two overlapping startTimer calls -> two is_active session rows.
  const opInProgressRef = useRef(false);

  const clearTick = useCallback(() => {
    if (tickRef.current !== null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  // Internal 1s tick — exists ONLY for the quota auto-stop watcher now (PERF
  // C2 moved the elapsed display into the running card). No state updates here.
  const beginTick = useCallback(() => {
    clearTick();
    tickRef.current = setInterval(() => {
      if (
        quotaDeadlineRef.current !== null &&
        Date.now() >= quotaDeadlineRef.current &&
        !autoStoppingRef.current &&
        activeTaskIdRef.current !== null
      ) {
        autoStoppingRef.current = true;
        void pauseRef.current(activeTaskIdRef.current);
      }
    }, 1000);
  }, [clearTick]);

  /**
   * FIX-QUOTA-STOP: compute the ms-epoch moment this session will hit the
   * task's quota (already-logged seconds count toward it). null when the task
   * has no quota, is already complete, or is already past quota — those
   * sessions run un-clamped, exactly as before.
   */
  const computeQuotaDeadline = useCallback(
    async (taskId: number, sessionStartedAt: number): Promise<number | null> => {
      const task = await getTask(taskId);
      if (!task || task.quota_minutes == null || task.quota_minutes <= 0) return null;
      const progress = await getOrCreateProgress(taskId, getCurrentDateString());
      if (progress.is_complete === 1) return null;
      const remainingSeconds = task.quota_minutes * 60 - progress.logged_seconds;
      if (remainingSeconds <= 0) return null;
      return sessionStartedAt + remainingSeconds * 1000;
    },
    [],
  );

  /**
   * Internal: stop the currently active session, persist its time, run the
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

    // 3) Quota check (pattern documented on addLoggedSeconds / stopSession).
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
    // Persisted progress just changed — tell subscribed screens to reload.
    setSessionsVersion((v) => v + 1);
  }, [activeTaskId, clearTick]);

  const startTimer = useCallback(
    async (taskId: number) => {
      if (opInProgressRef.current) return; // B6 re-entrancy guard
      opInProgressRef.current = true;
      try {
        // Single-timer rule: if a DIFFERENT focus timer is running, pause it first.
        if (activeTaskId !== null && activeTaskId !== taskId) {
          const previous = await getTask(activeTaskId);
          await finalizeActiveSession();
          if (previous) toast(`${previous.name} paused`);
        }

        const today = getCurrentDateString();
        const sessionId = await startSession(taskId, today);
        const startedAt = Date.now();

        sessionIdRef.current = sessionId;
        startedAtRef.current = startedAt;
        activeTaskIdRef.current = taskId;
        autoStoppingRef.current = false;
        quotaDeadlineRef.current = await computeQuotaDeadline(taskId, startedAt);
        setActiveTaskId(taskId);
        setActiveStartedAt(startedAt);
        beginTick();
      } finally {
        opInProgressRef.current = false;
      }
    },
    [activeTaskId, finalizeActiveSession, beginTick, computeQuotaDeadline],
  );

  const pauseTimer = useCallback(
    async (taskId: number) => {
      if (activeTaskId !== taskId) return; // not the running one — ignore
      if (opInProgressRef.current) return; // B6 re-entrancy guard
      opInProgressRef.current = true;
      try {
        quotaDeadlineRef.current = null;
        activeTaskIdRef.current = null;
        await finalizeActiveSession();
        setActiveTaskId(null);
        setActiveStartedAt(null);
      } finally {
        opInProgressRef.current = false;
      }
    },
    [activeTaskId, finalizeActiveSession],
  );

  // Keep the tick's pause handle fresh (it can't hold a stale closure).
  useEffect(() => {
    pauseRef.current = pauseTimer;
  }, [pauseTimer]);

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
   * or screen remounted), resume from its stored started_at.
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
      activeTaskIdRef.current = active.task_id;
      autoStoppingRef.current = false;
      // FIX-QUOTA-STOP: recompute the deadline from the ORIGINAL started_at —
      // if the quota was crossed while backgrounded, the next tick (≤1s away)
      // auto-pauses immediately.
      quotaDeadlineRef.current = await computeQuotaDeadline(
        active.task_id,
        active.started_at,
      );
      setActiveTaskId(active.task_id);
      setActiveStartedAt(active.started_at);
      beginTick();
    }
  }, [beginTick, computeQuotaDeadline]);

  // Clean up the interval if the provider unmounts.
  useEffect(() => clearTick, [clearTick]);

  const value: TimerContextValue = {
    activeTaskId,
    activeStartedAt,
    sessionsVersion,
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
