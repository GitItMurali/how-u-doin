/**
 * notifications/setup.ts
 * Phase 5 — one-time expo-notifications runtime configuration:
 *   - foreground presentation handler (how a push shows while the app is open)
 *   - Android notification channel ('default', matches app.json plugin config)
 *   - permission request helper (called from onboarding / first launch)
 *
 * Pure side-effect setup; no SQLite here. Scheduling lives in scheduler.ts.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { colors } from '@/constants/theme';

const ANDROID_CHANNEL_ID = 'default';

/**
 * Foreground handler — show the alert + play sound even when the app is open,
 * so interval pings are visible without backgrounding. Set once at module load
 * from the app root.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Create the Android notification channel. Idempotent — safe to call on every
 * launch. iOS ignores channels. Color/name match the app.json expo-notifications
 * plugin (Burnt Sienna).
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Reminders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: colors.primary,
  });
}

/**
 * Ask the OS for notification permission. Returns true if granted.
 * Called from onboarding (Phase 7a) and as a fallback on first launch.
 * Safe to call repeatedly — returns existing status without re-prompting
 * once the user has answered.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  let status = settings.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  return status === 'granted';
}

/**
 * Run all one-time notification setup. Call once from the app root after the
 * DB is ready. Returns whether permission is granted (so the caller can decide
 * whether to schedule anything).
 *
 * Phase 7a: onboarding step 5 OWNS the first permission prompt. Pass
 * `requestPermission = false` while onboarding hasn't completed so launch
 * doesn't fire the OS dialog over the Welcome screen; the handler + channel
 * are still configured either way.
 */
export async function initNotifications(
  requestPermission: boolean = true
): Promise<boolean> {
  configureNotificationHandler();
  await ensureAndroidChannel();
  if (requestPermission) {
    return requestNotificationPermission();
  }
  const settings = await Notifications.getPermissionsAsync();
  return settings.status === 'granted';
}
