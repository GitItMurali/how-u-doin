/**
 * components/HabitTaskCard.tsx
 * Habit task card — name, interval badge ("every 15 min"), next-fire hint,
 * check-off button (Phase 5 no-op), swipe-left to delete.
 * Phase 3.
 *
 * Design tokens only (constants/theme.ts).
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Check, Bell, Trash } from 'phosphor-react-native';

import { colors, typography, spacing, card, swipe } from '@/constants/theme';
import type { HabitWithProgress } from '@/db';

interface HabitTaskCardProps {
  task: HabitWithProgress;
  onPress: () => void;     // open edit modal
  onDelete: () => void;    // confirm + deleteTask (handled by parent)
}

function intervalLabel(mins: number | null): string {
  if (!mins || mins <= 0) return 'no interval';
  if (mins % 60 === 0) {
    const h = mins / 60;
    return h === 1 ? 'every hour' : `every ${h} hrs`;
  }
  return `every ${mins} min`;
}

export default function HabitTaskCard({ task, onPress, onDelete }: HabitTaskCardProps) {
  const fired = task.interval_count ?? 0;

  function renderRightActions(
    _progress: Animated.AnimatedInterpolation<number>,
  ) {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={onDelete}
        activeOpacity={0.85}
      >
        <Trash size={swipe.actionIconSize} color={colors.white} weight="bold" />
      </TouchableOpacity>
    );
  }

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      rightThreshold={swipe.revealThreshold}
      overshootRight={false}
    >
      <TouchableOpacity
        style={styles.card}
        onPress={onPress}
        activeOpacity={0.9}
      >
        <View style={styles.content}>
          <Text style={styles.name} numberOfLines={1}>
            {task.name}
          </Text>

          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Bell size={12} color={colors.accent} weight="fill" />
              <Text style={styles.badgeText}>
                {intervalLabel(task.interval_minutes)}
              </Text>
            </View>
            <Text style={styles.firedText}>
              {fired} {fired === 1 ? 'time' : 'times'} today
            </Text>
          </View>
        </View>

        {/* Check-off (Phase 5: record interval) */}
        <TouchableOpacity
          style={styles.checkButton}
          hitSlop={8}
          onPress={() => { /* Phase 5: check off this interval */ }}
        >
          <Check size={22} color={colors.textSecondary} weight="bold" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: card.borderRadius,
    borderLeftWidth: card.accentBorderWidth,
    borderLeftColor: colors.accent,
    paddingHorizontal: card.paddingHorizontal,
    paddingVertical: card.paddingVertical,
    marginBottom: card.gap,
    ...card.shadow,
  },
  content: {
    flex: 1,
  },
  name: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.cardTitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(224, 138, 47, 0.15)',
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginRight: spacing.sm,
  },
  badgeText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  firedText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
  },
  checkButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  deleteAction: {
    backgroundColor: swipe.deleteBackgroundColor,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: card.borderRadius,
    marginBottom: card.gap,
  },
});
