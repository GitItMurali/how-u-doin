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

/** Phase 7b — one bar on the History chart: a task's total over the range. */
export interface HistoryTotalsRow {
  id: number;
  name: string;
  quota_minutes: number | null;
  total_seconds: number;
}

/** Phase 7b — habit ping counts for the optional History footer chips. */
export interface HabitPingRow {
  id: number;
  name: string;
  ping_count: number;
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
 * Add SECONDS to a task's logged total for today. PRIMARY time-tracking write.
 *
 * After calling this, check if the new total has reached the quota:
 *   const progress = await getOrCreateProgress(taskId, date);
 *   if (task.quota_minutes && progress.logged_seconds >= task.quota_minutes * 60
 *       && !progress.is_complete) {
 *     await markComplete(taskId, date, task.quota_minutes);
 *     // then fire Time's Up notification via getNextPendingFocusTask()
 *   }
 *
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

/**
 * Re-evaluate today's completion state after a task's quota changes (FIX-QUOTA-EDIT).
 *
 * Why: is_complete was a one-way latch — set when a quota was hit and never
 * re-checked. Editing a finished task's quota upward left the green tick in
 * place, so the task looked done even though logged < new quota.
 *
 * Rules (compares logged_seconds, the source of truth, against the new quota):
 *   - logged_seconds <  quota*60  → is_complete = 0 (task resumes: x of y)
 *   - logged_seconds >= quota*60  → is_complete = 1 (quota lowered under logged
 *     time completes silently — no Time's Up push, it's an edit not a finish)
 *
 * No-op if there is no progress row today (nothing logged → nothing to reopen)
 * or if the state already matches. Never inflates logged time (unlike
 * markComplete) — the whole point is to preserve real logged time x so the
 * bar shows x → y.
 */
export async function reevaluateCompletion(
  taskId: number,
  date: string,
  quotaMinutes: number
): Promise<void> {
  const db = getDb();

  const row = await db.getFirstAsync<{ logged_seconds: number; is_complete: number }>(
    'SELECT logged_seconds, is_complete FROM daily_progress WHERE task_id = ? AND date = ?;',
    [taskId, date]
  );
  if (!row) return;

  const shouldBeComplete =
    quotaMinutes > 0 && row.logged_seconds >= quotaMinutes * 60 ? 1 : 0;
  if (shouldBeComplete === row.is_complete) return;

  await db.runAsync(`
    UPDATE daily_progress
    SET is_complete = ?,
        updated_at  = ?
    WHERE task_id = ? AND date = ?;
  `, [shouldBeComplete, Date.now(), taskId, date]);
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

// ─── History ──────────────────────────────────────────────────────────────────
// NOTE on the daily reset: daily_progress rows are per-date, so a reset has
// nothing to clear here — the new day starts with no rows (created lazily by
// getOrCreateProgress). The reset's real work lives in useDailyReset.runReset.
// (QA D-pass removed the resetDailyProgress() no-op and the per-day
// getHistory/getTodayHistory readers — Phase 7b's aggregate queries below are
// the only consumers of this table's history.)

/**
 * Phase 7b — per-task focus totals over a date range: one row = one bar.
 * Sums logged_seconds (source of truth). Excludes soft-deleted tasks
 * (PRD: delete = history gone); INCLUDES archived tasks (history shows
 * archived periods). Habits are out — no time dimension.
 */
export async function getHistoryTotals(
  startDate: string,
  endDate: string
): Promise<HistoryTotalsRow[]> {
  const db = getDb();
  return db.getAllAsync<HistoryTotalsRow>(`
    SELECT
      t.id,
      t.name,
      t.quota_minutes,
      SUM(dp.logged_seconds) AS total_seconds
    FROM daily_progress dp
    JOIN tasks t ON t.id = dp.task_id
    WHERE dp.date BETWEEN ? AND ?
      AND t.is_deleted = 0
      AND t.task_type  = 'focus'
    GROUP BY t.id
    HAVING SUM(dp.logged_seconds) > 0
    ORDER BY total_seconds DESC;
  `, [startDate, endDate]);
}

/**
 * Phase 7b — habit ping counts over a date range (History footer chips:
 * "Habit pings: Drink water ×6 · Stretch ×3"). Only rows with at least one
 * ping; same delete/archive visibility rules as getHistoryTotals.
 */
export async function getHabitPingCounts(
  startDate: string,
  endDate: string
): Promise<HabitPingRow[]> {
  const db = getDb();
  return db.getAllAsync<HabitPingRow>(`
    SELECT
      t.id,
      t.name,
      SUM(dp.interval_count) AS ping_count
    FROM daily_progress dp
    JOIN tasks t ON t.id = dp.task_id
    WHERE dp.date BETWEEN ? AND ?
      AND t.is_deleted = 0
      AND t.task_type  = 'habit'
    GROUP BY t.id
    HAVING SUM(dp.interval_count) > 0
    ORDER BY ping_count DESC;
  `, [startDate, endDate]);
}
