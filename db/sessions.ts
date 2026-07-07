/**
 * db/sessions.ts
 * CRUD for time_sessions -- live timer starts/stops and manual log entries.
 */

import { getDb } from './schema';

// ─── Types ────────────────────────────────────────────────────────────────────────────────

export interface TimeSession {
  id: number;
  task_id: number;
  date: string;
  started_at: number | null;
  ended_at: number | null;
  duration_minutes: number;
  duration_seconds: number;
  is_manual: number;   // 0 | 1
  is_active: number;   // 0 | 1
  created_at: number;
}

export interface ActiveSession extends TimeSession {
  /** Task name -- joined from tasks table for UI display. */
  name: string;
  quota_minutes: number | null;
}

/** Phase 7b — session log row: a finished session + its task's name. */
export interface SessionWithTaskName extends TimeSession {
  name: string;
}

// ─── Reads ─────────────────────────────────────────────────────────────────────────────────

/**
 * Find the currently running timer session across all tasks.
 * Returns null if no timer is running.
 * Called on app resume to recover in-progress timer state.
 */
export async function getActiveSession(): Promise<ActiveSession | null> {
  const db = getDb();
  return db.getFirstAsync<ActiveSession>(`
    SELECT ts.*, t.name, t.quota_minutes
    FROM time_sessions ts
    JOIN tasks t ON t.id = ts.task_id
    WHERE ts.is_active = 1
      AND t.is_deleted = 0
    LIMIT 1;
  `);
}

/**
 * Phase 7b — all FINISHED sessions in a date range for the History log,
 * newest first. Excludes: soft-deleted tasks (delete = history gone) and the
 * currently running session (is_active = 1 — it appears once stopped, matching
 * Home's behavior after pause). Archived tasks' sessions remain visible.
 */
export async function getSessionsInRange(
  startDate: string,
  endDate: string
): Promise<SessionWithTaskName[]> {
  const db = getDb();
  return db.getAllAsync<SessionWithTaskName>(`
    SELECT ts.*, t.name
    FROM time_sessions ts
    JOIN tasks t ON t.id = ts.task_id
    WHERE ts.date BETWEEN ? AND ?
      AND ts.is_active = 0
      AND t.is_deleted = 0
    ORDER BY ts.date DESC, ts.created_at DESC;
  `, [startDate, endDate]);
}

// ─── Timer writes ─────────────────────────────────────────────────────────────────────────────

/**
 * Start a timer session for a task.
 * CALLER is responsible for pausing any currently active session first
 * (single-timer rule enforced in useTimer hook).
 * Returns the new session id.
 */
export async function startSession(taskId: number, date: string): Promise<number> {
  const db = getDb();
  const now = Date.now();

  const result = await db.runAsync(`
    INSERT INTO time_sessions
      (task_id, date, started_at, ended_at, duration_minutes, is_manual, is_active, created_at)
    VALUES (?, ?, ?, NULL, 0, 0, 1, ?);
  `, [taskId, date, now, now]);

  return result.lastInsertRowId;
}

/**
 * Stop (pause or complete) a running timer session.
 * Records the elapsed duration and marks the session inactive.
 *
 * CALLER MUST also update daily_progress after stopping:
 *   await addLoggedSeconds(taskId, date, durationSeconds);
 * Then check if quota is now met and fire Time's Up if so (see the doc block
 * on addLoggedSeconds for the full pattern).
 */
export async function stopSession(
  sessionId: number,
  durationSeconds: number
): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const durationMinutes = Math.floor(durationSeconds / 60);

  await db.runAsync(`
    UPDATE time_sessions
    SET ended_at         = ?,
        duration_seconds = ?,
        duration_minutes = ?,
        is_active        = 0
    WHERE id = ?;
  `, [now, durationSeconds, durationMinutes, sessionId]);
}

/**
 * Close any orphaned active sessions on app launch.
 * Handles crash recovery -- calculates elapsed from stored started_at.
 * Minimum 1 second recorded to avoid zero-duration noise.
 *
 * FIX-B1 (audit): elapsed is CLAMPED at the end of the session's calendar day
 * (midnight after its `date`). Before this, an app killed mid-timer overnight
 * recovered the entire gap — e.g. 9 idle hours — as "logged time", which
 * History (Phase 7b) would render as a giant bar. The clamp caps the damage at
 * the day boundary; daily_progress for the dead day is deliberately NOT
 * backfilled (plan rule: never resurrect a finished day).
 */
export async function recoverOrphanedSessions(): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const orphans = await db.getAllAsync<{ id: number; started_at: number; date: string }>(
    'SELECT id, started_at, date FROM time_sessions WHERE is_active = 1 AND started_at IS NOT NULL AND ended_at IS NULL;'
  );

  for (const s of orphans) {
    // Midnight AFTER the session's own calendar date (local time).
    const [y, mo, d] = s.date.split('-').map((n) => parseInt(n, 10));
    const dayEnd =
      Number.isFinite(y) && Number.isFinite(mo) && Number.isFinite(d)
        ? new Date(y, mo - 1, d + 1).getTime()
        : now; // malformed date — fall back to old behavior
    const cutoff = Math.min(now, dayEnd);

    const elapsedSeconds = Math.max(1, Math.round((cutoff - s.started_at) / 1000));
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    await db.runAsync(
      'UPDATE time_sessions SET ended_at = ?, duration_seconds = ?, duration_minutes = ?, is_active = 0 WHERE id = ?;',
      [cutoff, elapsedSeconds, elapsedMinutes, s.id]
    );
  }
}

// ─── Manual log ───────────────────────────────────────────────────────────────────────────────

/**
 * Add a manually entered time session.
 * No started_at / ended_at -- just a duration.
 * Returns the new session id.
 *
 * CALLER MUST also update daily_progress after inserting:
 *   await addLoggedSeconds(taskId, date, durationMinutes * 60);
 * Then check if quota is now met and fire Time's Up if so (same pattern as stopSession).
 */
export async function addManualSession(
  taskId: number,
  date: string,
  durationMinutes: number
): Promise<number> {
  const db = getDb();
  const now = Date.now();

  const result = await db.runAsync(`
    INSERT INTO time_sessions
      (task_id, date, started_at, ended_at, duration_minutes, duration_seconds, is_manual, is_active, created_at)
    VALUES (?, ?, NULL, NULL, ?, ?, 1, 0, ?);
  `, [taskId, date, durationMinutes, durationMinutes * 60, now]);

  return result.lastInsertRowId;
}
