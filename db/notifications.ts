/**
 * db/notifications.ts
 * Tracks scheduled expo-notification identifiers in SQLite.
 * Enables bulk cancel on snooze and reschedule on resume/reset.
 */

import { getDb } from './schema';

// ─── Types ────────────────────────────────────────────────────────────────────────────────

export type NotificationType = 'interval' | 'times_up';

export interface NotificationRecord {
  id: number;
  task_id: number;
  notification_id: string;
  notification_type: NotificationType;
  scheduled_for: number;   // Unix ms
  is_active: number;       // 0 | 1
  created_at: number;
}

/**
 * NotificationRecord extended with task fields needed for snooze-resume rescheduling.
 * Returned by getCancelledIntervalNotifications().
 */
export interface CancelledIntervalNotification extends NotificationRecord {
  interval_minutes: number;
  name: string;
}

// ─── Writes ───────────────────────────────────────────────────────────────────────────────

/**
 * Record a newly scheduled notification.
 * Call immediately after expo-notifications.scheduleNotificationAsync() succeeds.
 *
 * For `notification_type = 'times_up'`: pass `scheduledFor = Date.now()` --
 * times_up fires immediately (event-driven on quota hit, not time-scheduled).
 * For `notification_type = 'interval'`: pass the actual future fire timestamp
 * so getCancelledIntervalNotifications() can check if it's still in the future
 * after snooze is deactivated.
 */
export async function saveNotification(
  taskId: number,
  notificationId: string,
  notificationType: NotificationType,
  scheduledFor: number
): Promise<void> {
  const db = getDb();
  await db.runAsync(`
    INSERT INTO notification_schedule
      (task_id, notification_id, notification_type, scheduled_for, is_active, created_at)
    VALUES (?, ?, ?, ?, 1, ?);
  `, [taskId, notificationId, notificationType, scheduledFor, Date.now()]);
}

/**
 * Mark a specific notification as cancelled (by its expo identifier).
 * Call after expo-notifications.cancelScheduledNotificationAsync().
 */
export async function cancelNotificationById(notificationId: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE notification_schedule SET is_active = 0 WHERE notification_id = ?;',
    [notificationId]
  );
}

/**
 * Mark all notifications for a task as cancelled.
 * Used when a task is archived, deleted, or its interval changes.
 */
export async function cancelNotificationsForTask(taskId: number): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE notification_schedule SET is_active = 0 WHERE task_id = ?;',
    [taskId]
  );
}

/**
 * Mark ALL active notifications as cancelled.
 * Called when snooze is activated.
 * Caller must also call expo-notifications.cancelAllScheduledNotificationsAsync().
 */
export async function cancelAllNotifications(): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'UPDATE notification_schedule SET is_active = 0 WHERE is_active = 1;'
  );
}

/**
 * Delete all notification records (cleanup at daily reset).
 * Called after all notifications are cancelled and before rescheduling fresh ones.
 */
export async function clearAllNotificationRecords(): Promise<void> {
  const db = getDb();
  await db.execAsync('DELETE FROM notification_schedule;');
}

// ─── Reads ─────────────────────────────────────────────────────────────────────────────────

/**
 * Get all active notification records for a task.
 * Used before archiving/deleting/updating interval -- caller needs the
 * expo notification_id strings to call expo-notifications cancel API.
 */
export async function getActiveNotificationsForTask(
  taskId: number
): Promise<NotificationRecord[]> {
  const db = getDb();
  return db.getAllAsync<NotificationRecord>(`
    SELECT * FROM notification_schedule
    WHERE task_id = ? AND is_active = 1
    ORDER BY scheduled_for ASC;
  `, [taskId]);
}

/**
 * Look up a notification record by its expo-notifications identifier string.
 * Called by the notification tap response handler to determine:
 *   - which task was tapped (task_id)
 *   - what type it was ('interval' -> open Habits tab, 'times_up' -> open Focus tab)
 *
 * Returns null if the record has been cleaned up (e.g. after daily reset).
 * In that case, fall back to opening the default Home tab.
 */
export async function getNotificationByExpoId(
  notificationId: string
): Promise<NotificationRecord | null> {
  const db = getDb();
  return db.getFirstAsync<NotificationRecord>(
    'SELECT * FROM notification_schedule WHERE notification_id = ? LIMIT 1;',
    [notificationId]
  );
}

/**
 * Get all cancelled INTERVAL notifications that still have a future fire time.
 * Used when snooze is turned off to know which habit notifications to reschedule.
 *
 * Note: 'times_up' notifications are NOT rescheduled -- they are event-driven
 * (fire when quota is hit, not on a time schedule).
 */
export async function getCancelledIntervalNotifications(
  now: number
): Promise<CancelledIntervalNotification[]> {
  const db = getDb();
  return db.getAllAsync<CancelledIntervalNotification>(`
    SELECT ns.*, t.interval_minutes, t.name
    FROM notification_schedule ns
    JOIN tasks t ON t.id = ns.task_id
    WHERE ns.notification_type = 'interval'
      AND ns.is_active         = 0
      AND ns.scheduled_for     > ?
    ORDER BY ns.scheduled_for ASC;
  `, [now]);
}

/**
 * Get all currently active notification records.
 * Used for debugging / sanity check.
 */
export async function getAllActiveNotifications(): Promise<NotificationRecord[]> {
  const db = getDb();
  return db.getAllAsync<NotificationRecord>(
    'SELECT * FROM notification_schedule WHERE is_active = 1 ORDER BY scheduled_for ASC;'
  );
}
