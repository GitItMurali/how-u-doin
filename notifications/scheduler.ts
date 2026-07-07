/**
 * notifications/scheduler.ts
 * Phase 5 — wraps expo-notifications local-push scheduling and keeps the
 * SQLite `notification_schedule` table (db/notifications.ts) in sync.
 *
 * Two notification kinds (see SCHEMA-02 in issues log):
 *   - 'interval' : habit pings on a repeating cadence (repeats:true — the OS
 *                  re-fires every interval, app alive or not). Restarted fresh
 *                  on habit check-off (restartHabitCadence), snooze-resume and
 *                  daily reset (scheduleAllHabitNotifications).
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
import { isSnoozeActive } from '@/db/settings';

const ANDROID_CHANNEL_ID = 'default';

// ─── Interval (habit) notifications ─────────────────────────────────────────

/**
 * Schedule the REPEATING interval ping for a habit task and record it.
 * repeats:true — first fire after `seconds`, then every `seconds` again, even
 * with the app backgrounded or dead (2026-07-07 fix: the old one-shot +
 * reschedule-on-fire only ran foregrounded, so habits pinged once then went
 * silent). scheduled_for stores the FIRST fire — the "due at" anchor for the
 * card countdown/overdue line; it moves only on check-off or reschedule.
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
      repeats: true,
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

// ─── Check-off cadence restart ──────────────────────────────────────────────

/**
 * User checked a habit off — restart its cadence from NOW. Cancels the live
 * repeating notification (expo + DB) and schedules a fresh one, so the card
 * countdown resets to the full interval and the "due at" anchor
 * (notification_schedule.scheduled_for) moves forward.
 *
 * Replaces rescheduleAfterIntervalFired (Phase 5): pings are repeats:true now,
 * so the OS keeps firing them with the app backgrounded/dead and nothing needs
 * rescheduling on fire. Looks the task up fresh — and checks soft-delete/
 * archive flags (QA A4) — so a deleted or archived habit never gets a new ping.
 * While snoozed: cancel only; snooze-resume schedules all habits fresh (QA A2).
 */
export async function restartHabitCadence(taskId: number): Promise<void> {
  const task = await getTask(taskId);
  if (
    !task ||
    task.task_type !== 'habit' ||
    task.is_deleted === 1 ||
    task.is_archived === 1
  ) {
    return;
  }
  await cancelNotificationsForTaskFull(taskId);
  if (await isSnoozeActive()) return;
  await scheduleIntervalNotification(task.id, task.name, task.interval_minutes);
}
