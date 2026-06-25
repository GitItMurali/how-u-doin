/**
 * notifications/scheduler.ts
 * Phase 5 — wraps expo-notifications local-push scheduling and keeps the
 * SQLite `notification_schedule` table (db/notifications.ts) in sync.
 *
 * Two notification kinds (see SCHEMA-02 in issues log):
 *   - 'interval' : habit pings on a repeating cadence. Time-scheduled, and the
 *                  ONLY kind that gets rescheduled on snooze-resume / daily reset.
 *   - 'times_up' : fired when a Focus quota is hit. Event-driven (fires now),
 *                  NEVER rescheduled by time.
 *
 * Every expo call is mirrored into SQLite so we can bulk-cancel on snooze and
 * reschedule on resume without asking the OS what's pending.
 */

import * as Notifications from 'expo-notifications';
import {
  saveNotification,
  cancelNotificationById,
  cancelNotificationsForTask,
  cancelAllNotifications as dbCancelAllNotifications,
  getActiveNotificationsForTask,
  getCancelledIntervalNotifications,
} from '@/db/notifications';
import { getActiveHabitTasksBasic, getTask } from '@/db/tasks';

const ANDROID_CHANNEL_ID = 'default';

// ─── Interval (habit) notifications ─────────────────────────────────────────

/**
 * Schedule the NEXT interval ping for a habit task and record it.
 * No-op if the task has no interval_minutes (e.g. a focus task).
 * Returns the expo notification id, or null if nothing was scheduled.
 *
 * CALLER MUST cancel any existing interval notifications for this task first
 * (use cancelIntervalForTask) if the interval changed — otherwise duplicates ping.
 */
export async function scheduleIntervalNotification(
  taskId: number,
  name: string,
  intervalMinutes: number | null
): Promise<string | null> {
  if (!intervalMinutes || intervalMinutes <= 0) return null;

  const seconds = intervalMinutes * 60;
  const scheduledFor = Date.now() + seconds * 1000;

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: name,
      body: `Time for ${name}.`,
      data: { taskId, notificationType: 'interval' },
      ...(ANDROID_CHANNEL_ID ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: ANDROID_CHANNEL_ID,
    },
  });

  await saveNotification(taskId, notificationId, 'interval', scheduledFor);
  return notificationId;
}

/**
 * Cancel + DB-deactivate every interval/times_up notification for one task.
 * Used on task edit (interval change), archive, and delete.
 */
export async function cancelNotificationsForTaskFull(taskId: number): Promise<void> {
  const active = await getActiveNotificationsForTask(taskId);
  await Promise.all(
    active.map((n) => Notifications.cancelScheduledNotificationAsync(n.notification_id))
  );
  await cancelNotificationsForTask(taskId);
}

/**
 * Cancel one specific scheduled notification (expo + DB).
 */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
  await cancelNotificationById(notificationId);
}

// ─── Times-up (focus quota) notification ────────────────────────────────────

/**
 * Fire the Time's Up push immediately (a Focus quota was just hit).
 * Event-driven, so we use a null trigger (deliver now) and record it as
 * 'times_up' with scheduled_for = now. NEVER rescheduled (SCHEMA-02).
 *
 * @param nextName  name of the next pending focus task, or null if all done.
 */
export async function fireTimesUpNotification(
  taskId: number,
  taskName: string,
  nextName: string | null
): Promise<string> {
  const body = nextName
    ? `${taskName} — time's up. Next up: ${nextName}.`
    : 'You finished everything. Take a breath.';

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: nextName ? "Time's up" : 'All done',
      body,
      data: { taskId, notificationType: 'times_up' },
      ...(ANDROID_CHANNEL_ID ? { channelId: ANDROID_CHANNEL_ID } : {}),
    },
    trigger: null, // deliver immediately
  });

  await saveNotification(taskId, notificationId, 'times_up', Date.now());
  return notificationId;
}

// ─── Bulk ops (snooze / daily reset) ────────────────────────────────────────

/**
 * Cancel ALL scheduled notifications (expo + DB). Used when snooze activates.
 * DB records stay rows (is_active=0) so getCancelledIntervalNotifications can
 * find the future interval ones to reschedule on resume.
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await dbCancelAllNotifications();
}

/**
 * Reschedule all interval notifications that were cancelled by snooze and still
 * have a future fire time. Used when snooze is turned off.
 *
 * We reschedule from NOW using each task's interval_minutes (not the stale
 * scheduled_for) so the cadence restarts cleanly after the snooze window.
 * times_up notifications are intentionally excluded (SCHEMA-02).
 */
export async function rescheduleAllIntervalNotifications(): Promise<void> {
  const now = Date.now();
  const cancelled = await getCancelledIntervalNotifications(now);

  // De-dupe by task — a task may have multiple stale interval rows; reschedule once.
  const seen = new Set<number>();
  for (const rec of cancelled) {
    if (seen.has(rec.task_id)) continue;
    seen.add(rec.task_id);
    await scheduleIntervalNotification(rec.task_id, rec.name, rec.interval_minutes);
  }
}

/**
 * Schedule a fresh interval notification for every active habit task.
 * Used by the daily-reset handler (Phase 6) and as a belt-and-braces resume.
 */
export async function scheduleAllHabitNotifications(): Promise<void> {
  const habits = await getActiveHabitTasksBasic();
  for (const h of habits) {
    await scheduleIntervalNotification(h.id, h.name, h.interval_minutes);
  }
}

// ─── Fire-and-reschedule (notification received while app alive) ────────────

/**
 * When an interval notification fires, schedule the NEXT one so the habit keeps
 * pinging. Called from the notification-received handler in the app root.
 * Looks the task up fresh so an archived/deleted habit stops pinging.
 */
export async function rescheduleAfterIntervalFired(taskId: number): Promise<void> {
  const task = await getTask(taskId);
  if (!task || task.task_type !== 'habit') return;
  await scheduleIntervalNotification(task.id, task.name, task.interval_minutes);
}
