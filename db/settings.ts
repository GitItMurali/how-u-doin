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

export async function getSnoozeActivatedAt(): Promise<number | null> {
  const val = await getSetting('snooze_activated_at');
  if (!val) return null;
  const ms = parseInt(val, 10);
  return isNaN(ms) ? null : ms;
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

// ─── Bulk read for app startup ────────────────────────────────────────────────

export interface AppSettings {
  reset_time: string;
  last_reset_date: string;
  snooze_active: boolean;
  snooze_activated_at: number | null;
  biometrics_enabled: boolean;
  onboarding_complete: boolean;
}

/**
 * Load all settings in a single query for app startup.
 * More efficient than calling individual getters one by one.
 */
export async function getAllSettings(): Promise<AppSettings> {
  const db = getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>(
    'SELECT key, value FROM app_settings;'
  );

  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const snoozeAt = map['snooze_activated_at'];
  const snoozeAtMs = snoozeAt ? parseInt(snoozeAt, 10) : null;

  return {
    reset_time:          map['reset_time']          ?? '00:00',
    last_reset_date:     map['last_reset_date']      ?? '',
    snooze_active:       map['snooze_active']        === '1',
    snooze_activated_at: snoozeAtMs && !isNaN(snoozeAtMs) ? snoozeAtMs : null,
    biometrics_enabled:  map['biometrics_enabled']   === '1',
    onboarding_complete: map['onboarding_complete']  === '1',
  };
}
