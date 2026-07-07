/**
 * db/settings.ts
 * Read/write helpers for the app_settings key-value table.
 * PIN is NEVER stored here — use expo-secure-store for PIN operations.
 */

import { getDb } from './schema';

// ─── Generic get/set ─────────────────────────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?;',
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);',
    [key, value]
  );
}

// ─── Reset time ───────────────────────────────────────────────────────────────

export async function getResetTime(): Promise<string> {
  return (await getSetting('reset_time')) ?? '00:00';
}

export async function setResetTime(time: string): Promise<void> {
  await setSetting('reset_time', time);
}

// ─── Last reset date ──────────────────────────────────────────────────────────

export async function getLastResetDate(): Promise<string> {
  return (await getSetting('last_reset_date')) ?? '';
}

export async function setLastResetDate(date: string): Promise<void> {
  await setSetting('last_reset_date', date);
}

// ─── Snooze ───────────────────────────────────────────────────────────────────

export async function isSnoozeActive(): Promise<boolean> {
  return (await getSetting('snooze_active')) === '1';
}

export async function setSnoozeActive(active: boolean): Promise<void> {
  await setSetting('snooze_active', active ? '1' : '0');
  if (active) {
    await setSetting('snooze_activated_at', String(Date.now()));
  } else {
    await setSetting('snooze_activated_at', '');
  }
}

// ─── Biometrics ───────────────────────────────────────────────────────────────

export async function isBiometricsEnabled(): Promise<boolean> {
  return (await getSetting('biometrics_enabled')) === '1';
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  await setSetting('biometrics_enabled', enabled ? '1' : '0');
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export async function isOnboardingComplete(): Promise<boolean> {
  return (await getSetting('onboarding_complete')) === '1';
}

export async function setOnboardingComplete(complete: boolean): Promise<void> {
  await setSetting('onboarding_complete', complete ? '1' : '0');
}
