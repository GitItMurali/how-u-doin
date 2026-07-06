/**
 * app/(tabs)/settings.tsx
 * Settings screen
 * Phase 6: reset time picker — custom themed steppers (no native picker dep,
 *          keeps the Autumn Bold look and avoids a rebuild).
 * Phase 7a: PIN change, biometrics toggle
 * Phase 7c: archive section
 *
 * Stored format: reset_time = 'HH:MM' (24h) in settings. Saved on every tap —
 * the background task reads it fresh each run, so no re-registration needed.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Minus, Plus } from 'phosphor-react-native';

import { colors, typography, spacing, card } from '@/constants/theme';
import { getResetTime, setResetTime } from '@/db';

const MINUTE_STEP = 15;

function formatTime12h(hour: number, minute: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function formatHour12(hour: number): string {
  const suffix = hour < 12 ? 'AM' : 'PM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${suffix}`;
}

interface StepperProps {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}

function Stepper({ label, value, onMinus, onPlus }: StepperProps) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <Pressable
          style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
          onPress={onMinus}
          hitSlop={8}
        >
          <Minus size={16} color={colors.textPrimary} weight="bold" />
        </Pressable>
        <Text style={styles.stepValue}>{value}</Text>
        <Pressable
          style={({ pressed }) => [styles.stepBtn, pressed && styles.stepBtnPressed]}
          onPress={onPlus}
          hitSlop={8}
        >
          <Plus size={16} color={colors.textPrimary} weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  // null until loaded from the DB so we never flash the '00:00' default.
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState(0);

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

  const save = useCallback((h: number, m: number) => {
    void setResetTime(
      `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    );
  }, []);

  const stepHour = useCallback(
    (delta: number) => {
      if (hour === null) return;
      const next = (hour + delta + 24) % 24;
      setHour(next);
      save(next, minute);
    },
    [hour, minute, save]
  );

  const stepMinute = useCallback(
    (delta: number) => {
      if (hour === null) return;
      const next = (minute + delta * MINUTE_STEP + 60) % 60;
      setMinute(next);
      save(hour, next);
    },
    [hour, minute, save]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.sectionLabel}>DAILY RESET</Text>

        {hour !== null && (
          <View style={styles.card}>
            <View style={styles.cardTopRow}>
              <Text style={styles.cardLabel}>Day starts at</Text>
              <Text style={styles.timeDisplay}>
                {formatTime12h(hour, minute)}
              </Text>
            </View>

            <Stepper
              label="Hour"
              value={formatHour12(hour)}
              onMinus={() => stepHour(-1)}
              onPlus={() => stepHour(1)}
            />
            <Stepper
              label="Minutes"
              value={`:${String(minute).padStart(2, '0')}`}
              onMinus={() => stepMinute(-1)}
              onPlus={() => stepMinute(1)}
            />
          </View>
        )}

        <Text style={styles.caption}>
          Progress resets and habit reminders start fresh at this time. It runs
          in the background, usually within 15 minutes.
        </Text>
      </View>
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
  },
  sectionLabel: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: card.borderRadius,
    borderLeftWidth: card.accentBorderWidth,
    borderLeftColor: colors.accent,
    paddingHorizontal: card.paddingHorizontal,
    paddingVertical: card.paddingVertical,
    ...card.shadow,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
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
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  stepperLabel: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnPressed: {
    backgroundColor: colors.accent,
  },
  stepValue: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.cardTitle,
    color: colors.textPrimary,
    minWidth: 64,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 18,
  },
});
