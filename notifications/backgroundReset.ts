/**
 * notifications/backgroundReset.ts
 * Phase 6 — headless background-fetch task that runs the daily reset while the
 * app is backgrounded or closed. Android services the fetch roughly every
 * 15 minutes at best, so the reset lands within ~15 min of reset_time.
 *
 * IMPORTANT: TaskManager.defineTask MUST execute at module top level, so this
 * file is imported for its side effect from app/_layout.tsx.
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

import { getDb, initDb } from '@/db';
import { checkAndRunReset } from '@/hooks/useDailyReset';

export const DAILY_RESET_TASK = 'how-u-doin-daily-reset';

/**
 * Headless context has no root-layout init gate — open the DB if this JS
 * context hasn't already. getDb() throws when uninitialised (FIX-P3-01 guard),
 * which doubles as our "is it open" probe so we never re-open a live handle.
 */
async function ensureDb(): Promise<void> {
  try {
    getDb();
  } catch {
    await initDb();
  }
}

TaskManager.defineTask(DAILY_RESET_TASK, async () => {
  try {
    await ensureDb();
    const ran = await checkAndRunReset();
    return ran
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (e) {
    console.warn('[dailyReset] background task failed:', e);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

/**
 * Register the background-fetch task (idempotent). Called once from the root
 * layout after the DB is ready. The schedule is interval-based and the task
 * itself decides whether a reset is due (checkIfResetNeeded), so registration
 * never needs to change when the user edits reset_time in Settings.
 */
export async function registerDailyResetTask(): Promise<void> {
  const status = await BackgroundFetch.getStatusAsync();
  if (
    status === null ||
    status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
    status === BackgroundFetch.BackgroundFetchStatus.Denied
  ) {
    // OS forbids background fetch — the foreground safety net still covers us.
    return;
  }
  if (await TaskManager.isTaskRegisteredAsync(DAILY_RESET_TASK)) return;
  await BackgroundFetch.registerTaskAsync(DAILY_RESET_TASK, {
    minimumInterval: 15 * 60, // seconds; OS treats this as inexact
    stopOnTerminate: false, // Android: keep running after the app is swiped away
    startOnBoot: true, // Android: re-arm after device reboot
  });
}
