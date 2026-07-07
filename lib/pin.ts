/**
 * lib/pin.ts
 * Phase 7a — PIN storage + verification. expo-secure-store ONLY (architecture
 * rule: the PIN never touches SQLite).
 *
 * Keys:
 *   pin                — the 4 digits
 *   pin_attempts       — consecutive misses ('0'..'4')
 *   pin_lockout_until  — epoch ms; set on the 5th miss (+30s)
 *
 * Attempts/lockout live in SecureStore too — memory-only state would let a
 * force-quit bypass the 30s lockout.
 *
 * Every SecureStore call is wrapped: some OEM keystores throw at runtime.
 * Failures raise PinStorageError so gate/onboarding callers can show a themed
 * retry UI instead of crashing the app shell.
 *
 * (Optional hardening later: store a salted SHA-256 via expo-crypto. Not
 * required for V1's local-only threat model — see 08_Phase7ab_Plan.md.)
 */

import * as SecureStore from 'expo-secure-store';

const KEY_PIN = 'pin';
const KEY_ATTEMPTS = 'pin_attempts';
const KEY_LOCKOUT_UNTIL = 'pin_lockout_until';

export const PIN_LENGTH = 4;
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 30_000;

/** Raised when the device keystore itself fails (read OR write). */
export class PinStorageError extends Error {
  constructor(cause: unknown) {
    super(
      `Secure storage failed: ${cause instanceof Error ? cause.message : String(cause)}`
    );
    this.name = 'PinStorageError';
  }
}

async function read(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    throw new PinStorageError(e);
  }
}

async function write(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    throw new PinStorageError(e);
  }
}

async function remove(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    throw new PinStorageError(e);
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function isPinSet(): Promise<boolean> {
  return (await read(KEY_PIN)) !== null;
}

/**
 * Milliseconds of lockout remaining. 0 when not locked out.
 * Reading past an expired lockout clears the stored timestamp.
 */
export async function getLockoutRemaining(): Promise<number> {
  const raw = await read(KEY_LOCKOUT_UNTIL);
  if (!raw) return 0;
  const until = parseInt(raw, 10);
  if (!Number.isFinite(until)) {
    await remove(KEY_LOCKOUT_UNTIL);
    return 0;
  }
  const remaining = until - Date.now();
  if (remaining <= 0) {
    await remove(KEY_LOCKOUT_UNTIL);
    return 0;
  }
  return remaining;
}

// ─── Writes ──────────────────────────────────────────────────────────────────

/** Store a new PIN (onboarding / change-PIN). Clears attempts + lockout. */
export async function setPin(pin: string): Promise<void> {
  await write(KEY_PIN, pin);
  await write(KEY_ATTEMPTS, '0');
  await remove(KEY_LOCKOUT_UNTIL);
}

export interface VerifyResult {
  ok: boolean;
  /** Misses left before lockout (only meaningful when !ok). */
  attemptsLeft: number;
  /** > 0 when a lockout is (now) active — pad should disable + count down. */
  lockoutMs: number;
}

/**
 * Check an entered PIN. Wrong entries increment the persisted attempt counter;
 * the 5th miss starts a 30s lockout (and resets the counter so the next window
 * is a fresh 5). Correct entry clears attempts + lockout.
 */
export async function verifyPin(pin: string): Promise<VerifyResult> {
  const lockedMs = await getLockoutRemaining();
  if (lockedMs > 0) {
    return { ok: false, attemptsLeft: 0, lockoutMs: lockedMs };
  }

  const stored = await read(KEY_PIN);
  if (stored !== null && pin === stored) {
    await write(KEY_ATTEMPTS, '0');
    await remove(KEY_LOCKOUT_UNTIL);
    return { ok: true, attemptsLeft: MAX_ATTEMPTS, lockoutMs: 0 };
  }

  const attempts = parseInt((await read(KEY_ATTEMPTS)) ?? '0', 10) + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await write(KEY_LOCKOUT_UNTIL, String(Date.now() + LOCKOUT_MS));
    await write(KEY_ATTEMPTS, '0');
    return { ok: false, attemptsLeft: 0, lockoutMs: LOCKOUT_MS };
  }

  await write(KEY_ATTEMPTS, String(attempts));
  return { ok: false, attemptsLeft: MAX_ATTEMPTS - attempts, lockoutMs: 0 };
}
