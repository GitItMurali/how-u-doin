/**
 * app/onboarding.tsx
 * Phase 7a — one-time onboarding. NOT a nav route: rendered by the RootLayout
 * gate, ONE screen with an internal step index (no nav stack — the user can't
 * back out of a half-made PIN).
 *
 * Steps: 1 Welcome → 2 Set PIN → 3 Confirm PIN → 4 Day start time →
 *        5 Notifications → done.
 *
 * Persistence rules (plan §7a):
 *  - Nothing is committed until step 5 completes (setOnboardingComplete),
 *    EXCEPT reset_time (step 4 write-through — harmless) and the PIN itself
 *    (committed at confirm; backgrounding after that simply lands on the lock
 *    screen next launch, which is correct).
 *  - Confirm mismatch → shake, back to step 2.
 *  - SecureStore write failure → themed retry UI; onboarding is NOT marked
 *    complete.
 *  - Step 4 reuses TimeOfDayPicker (supersedes the plan's TimeStepper extract).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';

import { colors, typography, spacing, card } from '@/constants/theme';
import { setPin, PinStorageError } from '@/lib/pin';
import { getResetTime, setResetTime, setOnboardingComplete } from '@/db';
import { requestNotificationPermission } from '@/notifications/setup';
import PinPad from '@/components/PinPad';
import TimeOfDayPicker from '@/components/TimeOfDayPicker';

interface OnboardingProps {
  onDone: () => void;
}

const STEP_COUNT = 5;

export default function Onboarding({ onDone }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [pendingPin, setPendingPin] = useState<string | null>(null);
  // Set when SecureStore rejects the PIN write — shows retry UI on step 3.
  const [failedPin, setFailedPin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 4 state — write-through like Settings. QA M3: hydrate from the DB —
  // existing installs (onboarding runs once over live data) already have a
  // reset_time; showing the 12:00 AM default would misrepresent it.
  const [hour, setHour] = useState(0);
  const [minute, setMinute] = useState(0);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      const t = await getResetTime(); // 'HH:MM'
      const [h, m] = t.split(':').map((n) => parseInt(n, 10));
      if (mounted) {
        setHour(Number.isFinite(h) ? h : 0);
        setMinute(Number.isFinite(m) ? m : 0);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function commitPin(pin: string): Promise<boolean> {
    try {
      await setPin(pin);
      setFailedPin(null);
      setStep(3);
      return true;
    } catch (e) {
      if (e instanceof PinStorageError) {
        setFailedPin(pin); // themed retry UI, stay on step 3
        return true;       // no shake — this isn't a wrong entry
      }
      throw e;
    }
  }

  // Step 2 — first entry.
  function handleSetPin(pin: string): boolean {
    setPendingPin(pin);
    setStep(2);
    return true;
  }

  // Step 3 — confirmation.
  async function handleConfirmPin(pin: string): Promise<boolean> {
    if (pin !== pendingPin) {
      // Shake now; bounce back to "Set a PIN" once the animation lands.
      setTimeout(() => {
        setPendingPin(null);
        setStep(1);
      }, 500);
      return false;
    }
    return commitPin(pin);
  }

  function handleTimeChange(h: number, m: number) {
    setHour(h);
    setMinute(m);
    void setResetTime(
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    );
  }

  async function finish(askPermission: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      if (askPermission) {
        await requestNotificationPermission();
      }
      await setOnboardingComplete(true);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.body}>
        {step === 0 && (
          <>
            <Image source={require('../assets/logo.png')} style={styles.logoImg} />
            <Text style={styles.logo}>How U Doin</Text>
            <Text style={styles.lede}>
              A time budget for your day. Focus tasks get a quota and a timer;
              habits get a gentle ping. Everything stays on your phone.
            </Text>
            <PrimaryButton label="Get started" onPress={() => setStep(1)} />
          </>
        )}

        {step === 1 && (
          <>
            <Text style={styles.title}>Set a PIN</Text>
            <Text style={styles.sub}>4 digits. It locks the app, not your data.</Text>
            <PinPad onComplete={handleSetPin} />
          </>
        )}

        {step === 2 && (
          <>
            <Text style={styles.title}>Confirm it</Text>
            <Text style={styles.sub}>Type the same 4 digits again.</Text>
            {failedPin !== null ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorText}>
                  Couldn't save your PIN to secure storage.
                </Text>
                <PrimaryButton
                  label="Try again"
                  onPress={() => void commitPin(failedPin)}
                />
              </View>
            ) : (
              <PinPad onComplete={handleConfirmPin} />
            )}
          </>
        )}

        {step === 3 && (
          <>
            <Text style={styles.title}>When does your day start?</Text>
            <Text style={styles.sub}>
              Progress resets and habit reminders start fresh at this time.
            </Text>
            <View style={styles.pickerCard}>
              <TimeOfDayPicker hour={hour} minute={minute} onChange={handleTimeChange} />
            </View>
            <PrimaryButton label="Continue" onPress={() => setStep(4)} />
          </>
        )}

        {step === 4 && (
          <>
            <Text style={styles.title}>Stay on track</Text>
            <Text style={styles.sub}>
              Habit pings and "time's up" nudges arrive as notifications. You
              can snooze them all with one tap any time.
            </Text>
            <PrimaryButton
              label="Turn on reminders"
              onPress={() => void finish(true)}
              disabled={busy}
            />
            <TouchableOpacity
              onPress={() => void finish(false)}
              disabled={busy}
              hitSlop={8}
            >
              <Text style={styles.skipText}>Maybe later</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Progress dots */}
      <View style={styles.dotsRow}>
        {Array.from({ length: STEP_COUNT }, (_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, disabled && styles.primaryBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <Text style={styles.primaryBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImg: {
    width: 128,
    height: 128,
    marginBottom: spacing.lg,
  },
  logo: {
    fontFamily: typography.fonts.heading,
    fontSize: 34,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  title: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.appTitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  lede: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.cardTitle,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xxl,
  },
  sub: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  pickerCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: card.borderRadius,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xl,
    ...card.shadow,
  },
  errorCard: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: card.borderRadius,
    borderLeftWidth: card.accentBorderWidth,
    borderLeftColor: colors.danger,
    padding: spacing.lg,
    ...card.shadow,
  },
  errorText: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    backgroundColor: colors.primary,
    borderRadius: card.borderRadius,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    ...card.shadow,
  },
  primaryBtnDisabled: {
    opacity: 0.45,
  },
  primaryBtnText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: typography.sizes.cardTitle,
    color: colors.white,
  },
  skipText: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(44, 26, 14, 0.20)',
  },
  dotActive: {
    backgroundColor: colors.primary,
  },
});
