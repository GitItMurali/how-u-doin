/**
 * components/TimeOfDayPicker.tsx
 * Alarm-style clock-time wheel: hour (1–12) + minutes (00–55, 5-min steps)
 * + AM/PM. Replaces the Phase 6 +/- steppers on the Settings daily-reset card.
 *
 * Value contract: 24-hour {hour, minute} in/out (matches the stored 'HH:MM'
 * settings format — callers keep using formatTime12h for display). Off-step
 * minutes (legacy 15-step values are fine; e.g. a hand-edited :07 is not)
 * snap to the nearest 5 for display; onChange only emits aligned values.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, typography, spacing } from '@/constants/theme';
import WheelPicker from '@/components/WheelPicker';

const MINUTE_STEP = 5;

// Alarm convention: 12 first, then 1–11.
const HOURS_12 = ['12', ...Array.from({ length: 11 }, (_, i) => String(i + 1))];
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) =>
  String(i * MINUTE_STEP).padStart(2, '0')
);
const MERIDIEMS = ['AM', 'PM'];

interface TimeOfDayPickerProps {
  /** Hour in 24h form, 0–23. */
  hour: number;
  /** Minute, 0–59 (snapped to the 5-min wheel for display). */
  minute: number;
  /** Fired with the new 24h time whenever any wheel settles. */
  onChange: (hour: number, minute: number) => void;
}

export default function TimeOfDayPicker({ hour, minute, onChange }: TimeOfDayPickerProps) {
  const hourIndex = hour % 12;                    // 0 → '12', 1 → '1', ... 11 → '11'
  const minuteIndex = Math.min(
    MINUTES.length - 1,
    Math.round(minute / MINUTE_STEP) % (60 / MINUTE_STEP)
  );
  const meridiemIndex = hour < 12 ? 0 : 1;

  function emit(hIdx: number, mIdx: number, apIdx: number) {
    // hIdx 0 means '12' on the dial → 0 in 24h-AM, 12 in 24h-PM.
    const hour24 = hIdx + (apIdx === 1 ? 12 : 0);
    onChange(hour24, mIdx * MINUTE_STEP);
  }

  return (
    <View style={styles.row}>
      <WheelPicker
        data={HOURS_12}
        selectedIndex={hourIndex}
        onChange={(i) => emit(i, minuteIndex, meridiemIndex)}
      />
      <Text style={styles.colon}>:</Text>
      <WheelPicker
        data={MINUTES}
        selectedIndex={minuteIndex}
        onChange={(i) => emit(hourIndex, i, meridiemIndex)}
      />
      <WheelPicker
        data={MERIDIEMS}
        selectedIndex={meridiemIndex}
        onChange={(i) => emit(hourIndex, minuteIndex, i)}
        width={56}
      />
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
  colon: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: typography.sizes.cardTitle,
    color: colors.textSecondary,
    marginHorizontal: spacing.xs,
  },
});
