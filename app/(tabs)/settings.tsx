/**
 * app/(tabs)/settings.tsx
 * Settings screen
 * Phase 6 shipped custom themed steppers; UX-WHEEL-01 upgraded them to an
 * alarm-style wheel (TimeOfDayPicker — hour 1–12 : minutes : AM/PM, still no
 * native picker dep, still no rebuild).
 * Phase 7a: SECURITY (Change PIN sheet, biometric toggle) + NOTIFICATIONS
 *           (permission status + open system settings) sections.
 * Phase 7c: ARCHIVE section — archived tasks (swipe right on Home) listed here
 *           with one-tap restore; restored habits get their interval ping back
 *           (unless snoozed), restored tasks land at the bottom of their list.
 *
 * Stored format: reset_time = 'HH:MM' (24h) in settings. Saved on every wheel
 * settle — the background task reads it fresh each run, so no re-registration
 * needed.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  Switch,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { CaretRight, X, ArrowCounterClockwise, Target, Repeat } from 'phosphor-react-native';

import { colors, typography, spacing, card, sheet } from '@/constants/theme';
import {
  getResetTime,
  setResetTime,
  isBiometricsEnabled,
  setBiometricsEnabled,
  getArchivedTasks,
  restoreTask,
  getTask,
  isSnoozeActive,
} from '@/db';
import type { Task } from '@/db';
import { scheduleIntervalNotification } from '@/notifications/scheduler';
import { verifyPin, setPin, PinStorageError } from '@/lib/pin';
import { useLockoutCountdown } from '@/hooks/useLockoutCountdown';
import { formatTime12h } from '@/lib/date';
import { toast } from '@/lib/toast';
import TimeOfDayPicker from '@/components/TimeOfDayPicker';
import PinPad from '@/components/PinPad';

// ─── Change PIN sheet ────────────────────────────────────────────────────────
// Verify current → new → confirm. Reuses the create/edit sheet chrome inside
// an RN Modal (settings is a tab screen, not a nav modal).

type PinStep = 'current' | 'new' | 'confirm';

const PIN_STEP_COPY: Record<PinStep, { title: string; sub: string }> = {
  current: { title: 'Current PIN', sub: 'Verify it to continue.' },
  new: { title: 'New PIN', sub: 'Pick 4 fresh digits.' },
  confirm: { title: 'Confirm it', sub: 'Type the new PIN again.' },
};

function ChangePinSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<PinStep>('current');
  const [newPin, setNewPin] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  // QA C3/M4: shared countdown hook + sync on open — a lockout started on the
  // LOCK SCREEN is now honoured here too (the pad disables immediately instead
  // of pretending attempts are available).
  const { lockoutSeconds, lockedOut: storeLockedOut, syncFromStore, startLockout } =
    useLockoutCountdown();

  // Reset the flow every time the sheet opens.
  useEffect(() => {
    if (visible) {
      setStep('current');
      setNewPin(null);
      setHint(null);
      void syncFromStore();
    }
  }, [visible, syncFromStore]);

  async function handlePin(pin: string): Promise<boolean> {
    try {
      if (step === 'current') {
        if (storeLockedOut) return false;
        const result = await verifyPin(pin);
        if (result.ok) {
          setHint(null);
          setStep('new');
          return true;
        }
        if (result.lockoutMs > 0) {
          startLockout(result.lockoutMs);
          setHint(null);
        } else {
          setHint(
            result.attemptsLeft === 1
              ? '1 try left'
              : `${result.attemptsLeft} tries left`
          );
        }
        return false;
      }
      if (step === 'new') {
        setNewPin(pin);
        setHint(null);
        setStep('confirm');
        return true;
      }
      // confirm
      if (pin !== newPin) {
        setHint("Didn't match — pick the new PIN again.");
        setTimeout(() => {
          setNewPin(null);
          setStep('new');
        }, 500);
        return false;
      }
      await setPin(pin);
      toast('PIN updated');
      onClose();
      return true;
    } catch (e) {
      setHint(
        e instanceof PinStorageError
          ? 'Secure storage failed. Try again.'
          : 'Something went wrong. Try again.'
      );
      return false;
    }
  }

  const lockedOut = step === 'current' && storeLockedOut;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Change PIN</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <X size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.pinStepTitle}>{PIN_STEP_COPY[step].title}</Text>
          <Text style={styles.pinStepSub}>{PIN_STEP_COPY[step].sub}</Text>

          <PinPad onComplete={handlePin} disabled={lockedOut} />

          <View style={styles.pinStatusWrap}>
            {lockedOut ? (
              <Text style={styles.pinLockoutText}>
                Too many tries. Try again in {lockoutSeconds}s
              </Text>
            ) : hint ? (
              <Text style={styles.pinHintText}>{hint}</Text>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  // null until loaded from the DB so we never flash the '00:00' default.
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState(0);

  // Phase 7a state
  const [pinSheetOpen, setPinSheetOpen] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [notifStatus, setNotifStatus] = useState<'granted' | 'denied' | 'undetermined'>(
    'undetermined'
  );
  // 7c — archived tasks (refreshed on focus: archiving happens on Home).
  const [archived, setArchived] = useState<Task[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const t = await getResetTime(); // 'HH:MM'
      const [h, m] = t.split(':').map((n) => parseInt(n, 10));
      if (mounted) {
        setMinute(Number.isFinite(m) ? m : 0);
        setHour(Number.isFinite(h) ? h : 0);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Biometric availability + preference (once — hardware doesn't change).
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [hasHw, enrolled, enabled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          isBiometricsEnabled(),
        ]);
        if (mounted) {
          setBioSupported(hasHw && enrolled);
          setBioEnabled(enabled);
        }
      } catch {
        if (mounted) setBioSupported(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Notification permission + archive list — re-read on every focus (the user
  // may return from the system settings screen or have archived on Home).
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      void (async () => {
        const [s, arch] = await Promise.all([
          Notifications.getPermissionsAsync(),
          getArchivedTasks(),
        ]);
        if (mounted) {
          setNotifStatus(s.status as typeof notifStatus);
          setArchived(arch);
        }
      })();
      return () => {
        mounted = false;
      };
    }, [])
  );

  // 7c — restore an archived task. Lands at the bottom of its tab's list;
  // habits get their interval ping rescheduled (restoreTask CALLER MUST —
  // INTEGRATION-06), unless snooze is active.
  const handleRestore = useCallback(async (taskId: number) => {
    await restoreTask(taskId);
    const task = await getTask(taskId);
    if (
      task?.task_type === 'habit' &&
      task.interval_minutes != null &&
      !(await isSnoozeActive())
    ) {
      await scheduleIntervalNotification(task.id, task.name, task.interval_minutes);
    }
    toast('Restored!');
    setArchived(await getArchivedTasks());
  }, []);

  // Wheel settled — update state and persist in one go.
  const handleTimeChange = useCallback((h: number, m: number) => {
    setHour(h);
    setMinute(m);
    void setResetTime(
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    );
  }, []);

  async function handleBioToggle(value: boolean) {
    setBioEnabled(value); // optimistic
    await setBiometricsEnabled(value);
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {/* ── DAILY RESET ── */}
        <Text style={styles.sectionLabel}>DAILY RESET</Text>

        {hour !== null && (
          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardLabel}>Day starts at</Text>
              <Text style={styles.timeDisplay}>
                {formatTime12h(hour, minute)}
              </Text>
            </View>

            <TimeOfDayPicker
              hour={hour}
              minute={minute}
              onChange={handleTimeChange}
            />
          </View>
        )}

        <Text style={styles.caption}>
          Progress resets and habit reminders start fresh at this time. It runs
          in the background, usually within 15 minutes.
        </Text>

        {/* ── SECURITY ── */}
        <Text style={[styles.sectionLabel, styles.sectionGap]}>SECURITY</Text>

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.row}
            onPress={() => setPinSheetOpen(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.rowLabel}>Change PIN</Text>
            <CaretRight size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {bioSupported && (
            <>
              <View style={styles.rowDivider} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Biometric unlock</Text>
                <Switch
                  value={bioEnabled}
                  onValueChange={(v) => void handleBioToggle(v)}
                  trackColor={{
                    false: 'rgba(122, 92, 62, 0.30)',
                    true: colors.accent,
                  }}
                  thumbColor={colors.white}
                />
              </View>
            </>
          )}
        </View>

        {/* ── NOTIFICATIONS ── */}
        <Text style={[styles.sectionLabel, styles.sectionGap]}>NOTIFICATIONS</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Permission</Text>
            <Text
              style={[
                styles.rowValue,
                { color: notifStatus === 'granted' ? colors.success : colors.danger },
              ]}
            >
              {notifStatus === 'granted' ? 'Granted' : 'Off'}
            </Text>
          </View>

          {notifStatus !== 'granted' && (
            <>
              <View style={styles.rowDivider} />
              <TouchableOpacity
                style={styles.row}
                onPress={() => void Linking.openSettings()}
                activeOpacity={0.8}
              >
                <Text style={[styles.rowLabel, { color: colors.primary }]}>
                  Open settings
                </Text>
                <CaretRight size={18} color={colors.primary} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {notifStatus !== 'granted' && (
          <Text style={styles.caption}>
            Habit pings and time's-up nudges are silent until notifications are
            allowed in system settings.
          </Text>
        )}

        {/* ── ARCHIVE (7c) ── */}
        <Text style={[styles.sectionLabel, styles.sectionGap]}>ARCHIVE</Text>

        {archived.length === 0 ? (
          <Text style={styles.caption}>
            Nothing archived. Swipe a task right on Home to tuck it away here —
            its history stays.
          </Text>
        ) : (
          <View style={styles.card}>
            {archived.map((t, i) => (
              <View key={t.id}>
                {i > 0 && <View style={styles.rowDivider} />}
                <View style={styles.row}>
                  <View style={styles.archiveRowLeft}>
                    {t.task_type === 'focus' ? (
                      <Target size={16} color={colors.primary} weight="fill" />
                    ) : (
                      <Repeat size={16} color={colors.accent} weight="fill" />
                    )}
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {t.name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => void handleRestore(t.id)}
                    hitSlop={8}
                    style={styles.restoreBtn}
                  >
                    <ArrowCounterClockwise size={16} color={colors.primary} weight="bold" />
                    <Text style={styles.restoreText}>Restore</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <ChangePinSheet visible={pinSheetOpen} onClose={() => setPinSheetOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.appTitle,
    color: colors.textPrimary,
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  sectionLabel: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  sectionGap: {
    marginTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: card.borderRadius,
    borderLeftWidth: card.accentBorderWidth,
    borderLeftColor: colors.accent,
    paddingHorizontal: card.paddingHorizontal,
    paddingVertical: spacing.sm,
    ...card.shadow,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  cardLabel: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.cardTitle,
    color: colors.textPrimary,
  },
  timeDisplay: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.screenTitle,
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  rowLabel: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.textPrimary,
  },
  rowValue: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(44, 26, 14, 0.10)',
  },
  archiveRowLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.sm,
  },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  restoreText: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.caption,
    color: colors.primary,
  },
  caption: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 18,
  },
  // ── Change PIN sheet ──
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(44, 26, 14, 0.40)',
  },
  modalSheet: {
    backgroundColor: sheet.backgroundColor,
    borderTopLeftRadius: sheet.borderTopLeftRadius,
    borderTopRightRadius: sheet.borderTopRightRadius,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  modalHandle: {
    alignSelf: 'center',
    width: sheet.handleWidth,
    height: sheet.handleHeight,
    borderRadius: sheet.handleBorderRadius,
    backgroundColor: sheet.handleColor,
    marginBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  modalTitle: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.screenTitle,
    color: colors.textPrimary,
  },
  pinStepTitle: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: typography.sizes.cardTitle,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  pinStepSub: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  pinStatusWrap: {
    minHeight: 22,
    marginTop: spacing.md,
    alignItems: 'center',
  },
  pinLockoutText: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.danger,
  },
  pinHintText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
  },
});
