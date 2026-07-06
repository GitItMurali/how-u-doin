/**
 * notifications/scheduler.ts
 * Phase 5 — wraps expo-notifications local-push scheduling and keeps the
 * SQLite `notification_schedule` table (db/notifications.ts) in sync.
 *
 * Two notification kinds (see SCHEMA-02 in issues log):
 *   - 'interval' : habit pings on a repeating cadence. Time-scheduled; restarted
 *                  fresh (scheduleAllHabitNotifications) on snooze-resume and at
 *                  the daily reset.
 *   - 'times_up' : fired when a Focus quota is hit. Event-driven (fires now),
 *                  NEVER rescheduled by time.
 *
 * Every expo call is mirrored into SQLite so we can bulk-cancel on snooze and
 * schedule fresh on resume without asking the OS what's pending.
 */

import * as Notifications from 'expo-notifications';
import {
  saveNotification,
  cancelNotificationById,
  cancelNotificationsForTask,
  cancelAllNotifications as dbCancelAllNotifications,
  getActiveNotificationsForTask,
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
 * (use cancelNotificationsForTaskFull) if the interval changed — otherwise
 * duplicates ping.
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
 * Event-driven: a channel-aware trigger delivers NOW on our Android channel
 * (QA D5 — channelId is a trigger concern, not a content field). Recorded as
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
    },
    // Channel-aware immediate trigger: delivers now, on our channel.
    trigger: { channelId: ANDROID_CHANNEL_ID },
  });

  await saveNotification(taskId, notificationId, 'times_up', Date.now());
  return notificationId;
}

// ─── Bulk ops (snooze / daily reset) ────────────────────────────────────────

/**
 * Cancel ALL scheduled notifications (expo + DB). Used when snooze activates
 * and as step 3 of the daily reset.
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await dbCancelAllNotifications();
}

/**
 * Schedule a fresh interval notification for every active habit task.
 * Used on snooze-resume (QA A2 — restarts cadence from now for ALL active
 * habits, even those whose window elapsed during the snooze; also can never
 * resurrect deleted/archived tasks, QA A3) and by the Phase 6 daily reset.
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
 * Looks the task up fresh — and checks soft-delete/archive flags (QA A4) — so a
 * deleted or archived habit genuinely stops pinging even if it disappears
 * between the fire and this handler.
 */
export async function rescheduleAfterIntervalFired(taskId: number): Promise<void> {
  const task = await getTask(taskId);
  if (
    !task ||
    task.task_type !== 'habit' ||
    task.is_deleted === 1 ||
    task.is_archived === 1
  ) {
    return;
  }
  await scheduleIntervalNotification(task.id, task.name, task.interval_minutes);
}
