/**
 * components/SessionLogRow.tsx
 * Phase 7b — one line of the History session log:
 *   "9:41 AM · 25:00 · timer"  /  "— · 15:00 · manual"  + task name.
 * Day header rows (range > 1 day) are rendered by history.tsx itself.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, typography, spacing, card } from '@/constants/theme';
import type { SessionWithTaskName } from '@/db';
import { formatClock, formatTimeOfDay } from '@/lib/date';

interface SessionLogRowProps {
  session: SessionWithTaskName;
}

export default function SessionLogRow({ session }: SessionLogRowProps) {
  const startLabel =
    session.is_manual === 1 || session.started_at === null
      ? '—'
      : formatTimeOfDay(session.started_at);
  const kind = session.is_manual === 1 ? 'manual' : 'timer';

  return (
    <View style={styles.row}>
      <Text style={styles.name} numberOfLines={1}>
        {session.name}
      </Text>
      <Text style={styles.meta}>
        {startLabel} · {formatClock(session.duration_seconds)} · {kind}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: card.borderRadius,
    paddingHorizontal: card.paddingHorizontal,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  name: {
    flex: 1,
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.textPrimary,
    marginRight: spacing.sm,
  },
  meta: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
