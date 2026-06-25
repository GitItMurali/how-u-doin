/**
 * db/tasks.ts
 * CRUD and query functions for the tasks table.
 */

import { getDb } from './schema';

// ─── Date utility ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns today's date as 'YYYY-MM-DD' in the device's local timezone.
 * Used as the canonical `date` value for all daily_progress and time_sessions rows.
 *
 * IMPORTANT: Always use this function -- never call `new Date().toISOString().slice(0, 10)`
 * which returns UTC date and will be wrong for users with non-UTC timezones, especially
 * around midnight and custom reset times.
 */
export function getCurrentDateString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const dd   = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────────────────

export type TaskType = 'focus' | 'habit';

export interface Task {
  id: number;
  name: string;
  notes: string | null;
  task_type: TaskType;
  quota_minutes: number | null;    // focus only
  interval_minutes: number | null; // habit only
  sort_order: number;
  is_archived: number;             // 0 | 1
  archived_at: number | null;      // Unix ms
  is_deleted: number;              // 0 | 1
  created_at: number;
  updated_at: number;
}

/** Task row joined with today's daily_progress (for home screen rendering). */
export interface TaskWithProgress extends Task {
  logged_minutes: number;
  is_complete: number;             // 0 | 1
}

/** Task row joined with today's daily_progress for Habits tab. */
export interface HabitWithProgress extends Task {
  interval_count: number;
  last_interval_fired_at: number | null;
}

export interface CreateFocusTaskInput {
  name: string;
  quota_minutes: number;
  notes?: string;
}

export interface CreateHabitTaskInput {
  name: string;
  interval_minutes: number;
  notes?: string;
}

export interface UpdateTaskInput {
  name?: string;
  notes?: string;
  quota_minutes?: number;    // focus only
  interval_minutes?: number; // habit only
}

export interface ReorderEntry {
  id: number;
  sort_order: number;
}

// ─── Reads ─────────────────────────────────────────────────────────────────────────────────

/**
 * Load all active focus tasks with today's progress.
 * Completed tasks are sorted to the bottom within priority order.
 */
export async function getFocusTasks(today: string): Promise<TaskWithProgress[]> {
  const db = getDb();
  return db.getAllAsync<TaskWithProgress>(`
    SELECT
      t.id, t.name, t.notes, t.task_type,
      t.quota_minutes, t.interval_minutes,
      t.sort_order, t.is_archived, t.archived_at,
      t.is_deleted, t.created_at, t.updated_at,
      COALESCE(dp.logged_minutes, 0) AS logged_minutes,
      COALESCE(dp.is_complete,    0) AS is_complete
    FROM tasks t
    LEFT JOIN daily_progress dp
      ON dp.task_id = t.id AND dp.date = ?
    WHERE t.is_deleted  = 0
      AND t.is_archived = 0
      AND t.task_type   = 'focus'
    ORDER BY is_complete ASC, t.sort_order ASC;
  `, [today]);
}

/**
 * Load all active habit tasks with today's interval progress.
 */
export async function getHabitTasks(today: string): Promise<HabitWithProgress[]> {
  const db = getDb();
  return db.getAllAsync<HabitWithProgress>(`
    SELECT
      t.id, t.name, t.notes, t.task_type,
      t.quota_minutes, t.interval_minutes,
      t.sort_order, t.is_archived, t.archived_at,
      t.is_deleted, t.created_at, t.updated_at,
      COALESCE(dp.interval_count, 0)    AS interval_count,
      dp.last_interval_fired_at
    FROM tasks t
    LEFT JOIN daily_progress dp
      ON dp.task_id = t.id AND dp.date = ?
    WHERE t.is_deleted  = 0
      AND t.is_archived = 0
      AND t.task_type   = 'habit'
    ORDER BY t.created_at ASC;
  `, [today]);
}

/**
 * Get a single task by id. Returns null if not found.
 */
export async function getTask(id: number): Promise<Task | null> {
  const db = getDb();
  return db.getFirstAsync<Task>(
    'SELECT * FROM tasks WHERE id = ?;',
    [id]
  );
}

/**
 * Find the next incomplete focus task after the one that just finished.
 * Used for the Time's Up notification -- returns null if all tasks are complete.
 *
 * NOTE: intentionally only searches tasks with sort_order HIGHER than the completed task.
 * Out-of-order manual completions (e.g. task B done before task A) do not route backward --
 * "next" always means lower priority (higher sort_order). This is correct by design.
 */
export async function getNextPendingFocusTask(
  completedTaskId: number,
  today: string
): Promise<Pick<Task, 'id' | 'name' | 'sort_order'> | null> {
  const db = getDb();

  const completed = await db.getFirstAsync<{ sort_order: number }>(
    'SELECT sort_order FROM tasks WHERE id = ?;',
    [completedTaskId]
  );
  if (!completed) return null;

  return db.getFirstAsync<Pick<Task, 'id' | 'name' | 'sort_order'>>(`
    SELECT t.id, t.name, t.sort_order
    FROM tasks t
    LEFT JOIN daily_progress dp
      ON dp.task_id = t.id AND dp.date = ?
    WHERE t.is_deleted  = 0
      AND t.is_archived = 0
      AND t.task_type   = 'focus'
      AND t.sort_order  > ?
      AND COALESCE(dp.is_complete, 0) = 0
    ORDER BY t.sort_order ASC
    LIMIT 1;
  `, [today, completed.sort_order]);
}

/**
 * Returns all active (non-archived, non-deleted) habit tasks with just the fields
 * needed for notification rescheduling: id, name, interval_minutes.
 *
 * Called by the daily reset background task to reschedule all interval notifications
 * from scratch. Does NOT join daily_progress -- no date context needed here.
 */
export async function getActiveHabitTasksBasic(): Promise<
  Pick<Task, 'id' | 'name' | 'interval_minutes'>[]
> {
  const db = getDb();
  return db.getAllAsync<Pick<Task, 'id' | 'name' | 'interval_minutes'>>(`
    SELECT id, name, interval_minutes
    FROM tasks
    WHERE task_type   = 'habit'
      AND is_deleted  = 0
      AND is_archived = 0
    ORDER BY created_at ASC;
  `);
}

/**
 * Load all archived tasks for Settings -> Archive screen.
 * Returns focus and habit tasks together; app layer groups them into sections.
 */
export async function getArchivedTasks(): Promise<Task[]> {
  const db = getDb();
  return db.getAllAsync<Task>(`
    SELECT *
    FROM tasks
    WHERE is_archived = 1
      AND is_deleted  = 0
    ORDER BY task_type ASC, archived_at DESC;
  `);
}

// ─── Writes ───────────────────────────────────────────────────────────────────────────────

/**
 * Create a new Focus task. Appends to bottom of priority list.
 */
export async function createFocusTask(input: CreateFocusTaskInput): Promise<number> {
  const db = getDb();
  const now = Date.now();

  const maxRow = await db.getFirstAsync<{ max_order: number }>(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_order
     FROM tasks
     WHERE task_type = 'focus' AND is_deleted = 0 AND is_archived = 0;`
  );
  const nextOrder = (maxRow?.max_order ?? 0) + 1;

  const result = await db.runAsync(`
    INSERT INTO tasks
      (name, notes, task_type, quota_minutes, interval_minutes,
       sort_order, is_archived, is_deleted, created_at, updated_at)
    VALUES (?, ?, 'focus', ?, NULL, ?, 0, 0, ?, ?);
  `, [input.name, input.notes ?? null, input.quota_minutes, nextOrder, now, now]);

  return result.lastInsertRowId;
}

/**
 * Create a new Habit task. sort_order is always 0 for habits.
 */
export async function createHabitTask(input: CreateHabitTaskInput): Promise<number> {
  const db = getDb();
  const now = Date.now();

  const result = await db.runAsync(`
    INSERT INTO tasks
      (name, notes, task_type, quota_minutes, interval_minutes,
       sort_order, is_archived, is_deleted, created_at, updated_at)
    VALUES (?, ?, 'habit', NULL, ?, 0, 0, 0, ?, ?);
  `, [input.name, input.notes ?? null, input.interval_minutes, now, now]);

  return result.lastInsertRowId;
}

/**
 * Update editable fields on a task (name, notes, quota, interval).
 * Only pass fields you want to change.
 *
 * IMPORTANT: if interval_minutes is changed on a habit task, CALLER MUST
 * cancel and reschedule the notification at the new interval:
 *   const notifs = await getActiveNotificationsForTask(id);
 *   for (const n of notifs) await Notifications.cancelScheduledNotificationAsync(n.notification_id);
 *   await cancelNotificationsForTask(id);
 *   const notifId = await Notifications.scheduleNotificationAsync(...new interval...);
 *   await saveNotification(id, notifId, 'interval', scheduledFor);
 */
export async function updateTask(id: number, input: UpdateTaskInput): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (input.name !== undefined)             { fields.push('name = ?');             values.push(input.name); }
  if (input.notes !== undefined)            { fields.push('notes = ?');            values.push(input.notes); }
  if (input.quota_minutes !== undefined)    { fields.push('quota_minutes = ?');    values.push(input.quota_minutes); }
  if (input.interval_minutes !== undefined) { fields.push('interval_minutes = ?'); values.push(input.interval_minutes); }

  if (fields.length === 0) return;

  fields.push('updated_at = ?');
  values.push(now, id);

  await db.runAsync(
    `UPDATE tasks SET ${fields.join(', ')} WHERE id = ?;`,
    values
  );
}

/**
 * Soft-delete a task. All history is retained.
 *
 * CALLER MUST also cancel notifications:
 *   const notifs = await getActiveNotificationsForTask(id);
 *   for (const n of notifs) await Notifications.cancelScheduledNotificationAsync(n.notification_id);
 *   await cancelNotificationsForTask(id);
 */
export async function deleteTask(id: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE tasks SET is_deleted = 1, updated_at = ? WHERE id = ?;',
    [Date.now(), id]
  );
}

/**
 * Archive a task (swipe right). Task disappears from home, appears in Settings -> Archive.
 *
 * CALLER MUST also cancel notifications:
 *   const notifs = await getActiveNotificationsForTask(id);
 *   for (const n of notifs) await Notifications.cancelScheduledNotificationAsync(n.notification_id);
 *   await cancelNotificationsForTask(id);
 */
export async function archiveTask(id: number): Promise<void> {
  const db = getDb();
  const now = Date.now();
  await db.runAsync(
    'UPDATE tasks SET is_archived = 1, archived_at = ?, updated_at = ? WHERE id = ?;',
    [now, now, id]
  );
}

/**
 * Restore an archived task. Appends to bottom of its tab's priority list.
 *
 * CALLER MUST also reschedule notifications if the task is a habit:
 *   const task = await getTask(id);  // call after restoreTask
 *   if (task?.task_type === 'habit') {
 *     const notifId = await Notifications.scheduleNotificationAsync(...);
 *     await saveNotification(task.id, notifId, 'interval', scheduledFor);
 *   }
 */
export async function restoreTask(id: number): Promise<void> {
  const db = getDb();
  const now = Date.now();

  const task = await getTask(id);
  if (!task) return;

  const maxRow = await db.getFirstAsync<{ max_order: number }>(`
    SELECT COALESCE(MAX(sort_order), 0) AS max_order
    FROM tasks
    WHERE task_type  = ?
      AND is_deleted  = 0
      AND is_archived = 0;
  `, [task.task_type]);

  // For habit tasks, all sort_order values are 0 so nextOrder = 1 -- harmless,
  // since sort_order is never read for habits. Focus tasks get the correct bottom position.
  const nextOrder = (maxRow?.max_order ?? 0) + 1;

  await db.runAsync(`
    UPDATE tasks
    SET is_archived = 0,
        archived_at = NULL,
        sort_order  = ?,
        updated_at  = ?
    WHERE id = ?;
  `, [nextOrder, now, id]);
}

/**
 * Reorder focus tasks after drag-and-drop.
 * Runs all sort_order updates in a single transaction.
 */
export async function reorderFocusTasks(newOrder: ReorderEntry[]): Promise<void> {
  const db = getDb();
  const now = Date.now();

  await db.withTransactionAsync(async () => {
    for (const entry of newOrder) {
      await db.runAsync(
        'UPDATE tasks SET sort_order = ?, updated_at = ? WHERE id = ?;',
        [entry.sort_order, now, entry.id]
      );
    }
  });
}
