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
 * Get all sessions for a task on a given date, newest first.
 * Used for history detail view and three-dot menu "Total today" display.
 */
export async function getSessionsForDate(
  taskId: number,
  date: string
): Promise<TimeSession[]> {
  const db = getDb();
  return db.getAllAsync<TimeSession>(`
    SELECT * FROM time_sessions
    WHERE task_id = ? AND date = ?
    ORDER BY created_at DESC;
  `, [taskId, date]);
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
 *   await addLoggedMinutes(taskId, date, durationMinutes);
 * Then check if quota is now met and fire Time's Up if so:
 *   const progress = await getOrCreateProgress(taskId, date);
 *   if (task.quota_minutes && progress.logged_minutes >= task.quota_minutes && !progress.is_complete) {
 *     await markComplete(taskId, date, task.quota_minutes);
 *     // then fire Time's Up notification via getNextPendingFocusTask()
 *   }
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
 * Minimum 1 minute recorded to avoid zero-duration noise.
 */
export async function recoverOrphanedSessions(): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const orphans = await db.getAllAsync<{ id: number; started_at: number }>(
    'SELECT id, started_at FROM time_sessions WHERE is_active = 1 AND started_at IS NOT NULL AND ended_at IS NULL;'
  );

  for (const s of orphans) {
    const elapsedSeconds = Math.max(1, Math.round((now - s.started_at) / 1000));
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    await db.runAsync(
      'UPDATE time_sessions SET ended_at = ?, duration_seconds = ?, duration_minutes = ?, is_active = 0 WHERE id = ?;',
      [now, elapsedSeconds, elapsedMinutes, s.id]
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
 *   await addLoggedMinutes(taskId, date, durationMinutes);
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
