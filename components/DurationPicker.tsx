/**
 * components/DurationPicker.tsx
 * Timer-style duration wheel: hours (0–12) + minutes (00–55 in 5-min steps,
 * '00' included). Replaces the Phase 3 preset chips in TaskForm for focus
 * quota and habit interval.
 *
 * Value contract: total minutes in/out. Off-step inputs (e.g. a legacy 17-min
 * value) are snapped to the nearest wheel position for display; onChange only
 * ever emits step-aligned values. A 0h 00m selection emits 0 — the FORM is
 * responsible for blocking submit on 0 (mirrors the name-required rule).
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, typography, spacing } from '@/constants/theme';
import WheelPicker from '@/components/WheelPicker';

export const DURATION_MAX_HOURS = 12;
export const DURATION_MINUTE_STEP = 5;

const HOURS = Array.from({ length: DURATION_MAX_HOURS + 1 }, (_, i) => String(i));
const MINUTES = Array.from({ length: 60 / DURATION_MINUTE_STEP }, (_, i) =>
  String(i * DURATION_MINUTE_STEP).padStart(2, '0')
);

interface DurationPickerProps {
  /** Total minutes. */
  value: number;
  /** Fired with the new total minutes whenever either wheel settles. */
  onChange: (totalMinutes: number) => void;
}

/** Snap any minute total to the nearest representable wheel position. */
export function snapDuration(totalMinutes: number): number {
  const max = DURATION_MAX_HOURS * 60;
  const clamped = Math.max(0, Math.min(max, totalMinutes));
  return Math.round(clamped / DURATION_MINUTE_STEP) * DURATION_MINUTE_STEP;
}

export default function DurationPicker({ value, onChange }: DurationPickerProps) {
  const snapped = snapDuration(value);
  const hourIndex = Math.floor(snapped / 60);
  const minuteIndex = (snapped % 60) / DURATION_MINUTE_STEP;

  function handleHour(idx: number) {
    onChange(idx * 60 + minuteIndex * DURATION_MINUTE_STEP);
  }

  function handleMinute(idx: number) {
    onChange(hourIndex * 60 + idx * DURATION_MINUTE_STEP);
  }

  return (
    <View style={styles.row}>
      <WheelPicker
        data={HOURS}
        selectedIndex={hourIndex}
        onChange={handleHour}
      />
      <Text style={styles.unit}>h</Text>
      <WheelPicker
        data={MINUTES}
        selectedIndex={minuteIndex}
        onChange={handleMinute}
      />
      <Text style={styles.unit}>m</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: spacing.sm,
  },
  unit: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    marginRight: spacing.lg,
  },
});
