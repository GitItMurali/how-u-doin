/**
 * db/progress.ts
 * CRUD for daily_progress — per-task, per-day accumulated time and completion state.
 */

import { getDb } from './schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyProgress {
  id: number;
  task_id: number;
  date: string;
  logged_minutes: number;          // derived: floor(logged_seconds / 60)
  logged_seconds: number;          // source of truth
  is_complete: number;             // 0 | 1
  interval_count: number;
  last_interval_fired_at: number | null;
  created_at: number;
  updated_at: number;
}

/** For the History screen bar chart — one row per task per day in range. */
export interface HistoryRow {
  name: string;
  date: string;
  logged_minutes: number;
  quota_minutes: number | null;
}

// ─── Get or create ────────────────────────────────────────────────────────────

/**
 * Return the daily_progress row for a task on a given date.
 * Creates the row lazily (INSERT OR IGNORE) on first interaction.
 * Always returns a valid row — safe to call before reading logged_minutes.
 */
export async function getOrCreateProgress(
  taskId: number,
  date: string
): Promise<DailyProgress> {
  const db = getDb();
  const now = Date.now();

  await db.runAsync(`
    INSERT OR IGNORE INTO daily_progress
      (task_id, date, logged_minutes, logged_seconds, is_complete,
       interval_count, last_interval_fired_at, created_at, updated_at)
    VALUES (?, ?, 0, 0, 0, 0, NULL, ?, ?);
  `, [taskId, date, now, now]);

  return db.getFirstAsync<DailyProgress>(
    'SELECT * FROM daily_progress WHERE task_id = ? AND date = ?;',
    [taskId, date]
  ) as Promise<DailyProgress>;
}

// ─── Time tracking ────────────────────────────────────────────────────────────

/**
 * Add minutes to a task's logged total for today.
 * Used after a timer session stops or a manual session is added.
 *
 * After calling this, check if the new total has reached the quota:
 *   const progress = await getOrCreateProgress(taskId, date);
 *   if (task.quota_minutes && progress.logged_minutes >= task.quota_minutes && !progress.is_complete) {
 *     await markComplete(taskId, date, task.quota_minutes);
 *     // then fire Time's Up notification via getNextPendingFocusTask()
 *   }
 */
export async function addLoggedMinutes(
  taskId: number,
  date: string,
  minutesToAdd: number
): Promise<void> {
  // Delegate to the seconds-granular primary so logged_minutes stays derived.
  await addLoggedSeconds(taskId, date, Math.round(minutesToAdd * 60));
}

/**
 * Add SECONDS to a task's logged total for today. PRIMARY time-tracking write.
 * logged_seconds is the source of truth; logged_minutes is kept in sync as
 * floor(logged_seconds / 60) so all existing minute-based readers stay correct.
 * No minimum floor — a 5-second session logs exactly 5 seconds (fixes the old
 * Math.max(1, ...) inflation where a quick pause counted as a full minute).
 */
export async function addLoggedSeconds(
  taskId: number,
  date: string,
  secondsToAdd: number
): Promise<void> {
  const db = getDb();
  await getOrCreateProgress(taskId, date);

  await db.runAsync(`
    UPDATE daily_progress
    SET logged_seconds = logged_seconds + ?,
        logged_minutes = (logged_seconds + ?) / 60,
        updated_at     = ?
    WHERE task_id = ? AND date = ?;
  `, [secondsToAdd, secondsToAdd, Date.now(), taskId, date]);
}

/**
 * Mark a focus task as complete for today.
 * Sets is_complete = 1. Also ensures logged_minutes >= quota_minutes if provided.
 */
export async function markComplete(
  taskId: number,
  date: string,
  quotaMinutes?: number
): Promise<void> {
  const db = getDb();
  await getOrCreateProgress(taskId, date);
  const now = Date.now();

  if (quotaMinutes !== undefined) {
    const quotaSeconds = quotaMinutes * 60;
    await db.runAsync(`
      UPDATE daily_progress
      SET is_complete    = 1,
          logged_seconds = MAX(logged_seconds, ?),
          logged_minutes = MAX(logged_minutes, ?),
          updated_at     = ?
      WHERE task_id = ? AND date = ?;
    `, [quotaSeconds, quotaMinutes, now, taskId, date]);
  } else {
    await db.runAsync(`
      UPDATE daily_progress
      SET is_complete = 1,
          updated_at  = ?
      WHERE task_id = ? AND date = ?;
    `, [now, taskId, date]);
  }
}

// ─── Interval tracking ────────────────────────────────────────────────────────

/**
 * Increment the interval_count and record the fire timestamp for a habit task.
 * Called when a habit notification fires and the user acknowledges it.
 */
export async function recordIntervalFired(
  taskId: number,
  date: string
): Promise<void> {
  const db = getDb();
  await getOrCreateProgress(taskId, date);
  const now = Date.now();

  await db.runAsync(`
    UPDATE daily_progress
    SET interval_count         = interval_count + 1,
        last_interval_fired_at = ?,
        updated_at             = ?
    WHERE task_id = ? AND date = ?;
  `, [now, now, taskId, date]);
}

// ─── Daily reset ──────────────────────────────────────────────────────────────

/**
 * No-op: daily_progress rows are per-date, so there is nothing to clear.
 * The new day starts with no rows — they are created lazily on first interaction
 * via getOrCreateProgress(). Yesterday's rows stay intact as history.
 *
 * What the daily reset DOES need to do (handled in their respective modules):
 *   - Stop any active timer sessions (sessions.ts -> recoverOrphanedSessions)
 *   - Turn off snooze (settings.ts -> setSnoozeActive(false))
 *   - Clear and reschedule notifications (notifications.ts -> clearAllNotificationRecords,
 *     then tasks.ts -> getActiveHabitTasksBasic to reschedule each habit)
 *   - Update last_reset_date (settings.ts -> setLastResetDate)
 */
export async function resetDailyProgress(): Promise<void> {
  // Intentional no-op — see doc comment above.
}

// ─── History ──────────────────────────────────────────────────────────────────

/**
 * Load time history for all tasks within a date range.
 * Includes archived tasks (history shows gaps during archived period).
 * Excludes soft-deleted tasks.
 */
export async function getHistory(
  startDate: string,
  endDate: string
): Promise<HistoryRow[]> {
  const db = getDb();
  return db.getAllAsync<HistoryRow>(`
    SELECT
      t.name,
      dp.date,
      dp.logged_minutes,
      t.quota_minutes
    FROM daily_progress dp
    JOIN tasks t ON t.id = dp.task_id
    WHERE dp.date BETWEEN ? AND ?
      AND t.is_deleted = 0
    ORDER BY t.id ASC, dp.date ASC;
  `, [startDate, endDate]);
}

/**
 * Load today's history. Convenience wrapper around getHistory().
 */
export async function getTodayHistory(today: string): Promise<HistoryRow[]> {
  return getHistory(today, today);
}
