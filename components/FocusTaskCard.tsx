/**
 * components/FocusTaskCard.tsx
 * Focus task card — priority number, name, static progress bar, time label,
 * timer + check buttons (Phase 4 no-ops), drag handle, swipe-left to delete.
 * Phase 3.
 *
 * Design tokens only (constants/theme.ts) — no magic numbers.
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
import { Play, Check, DotsSixVertical, Trash } from 'phosphor-react-native';

import { colors, typography, spacing, card, progressBar, swipe } from '@/constants/theme';
import type { TaskWithProgress } from '@/db';

interface FocusTaskCardProps {
  task: TaskWithProgress;
  priority: number;            // 1-based position in the list
  onPress: () => void;         // open edit modal
  onDelete: () => void;        // confirm + deleteTask (handled by parent)
  onDragStart: () => void;     // long-press drag handle
  isActive: boolean;           // true while being dragged
}

export default function FocusTaskCard({
  task,
  priority,
  onPress,
  onDelete,
  onDragStart,
  isActive,
}: FocusTaskCardProps) {
  const quota = task.quota_minutes ?? 0;
  const logged = task.logged_minutes ?? 0;
  const complete = task.is_complete === 1 || (quota > 0 && logged >= quota);
  const pct = quota > 0 ? Math.min(1, logged / quota) : 0;

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
        style={[
          styles.card,
          { borderLeftColor: complete ? colors.success : colors.primary },
          isActive && styles.cardActive,
        ]}
        onPress={onPress}
        activeOpacity={0.9}
      >
        {/* Priority number */}
        <View style={styles.priorityWrap}>
          <Text style={styles.priorityNum}>{priority}</Text>
        </View>

        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.name} numberOfLines={1}>
            {task.name}
          </Text>

          {/* Static progress bar (Phase 4 makes it live) */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${pct * 100}%`,
                  backgroundColor: complete
                    ? progressBar.fillColorComplete
                    : progressBar.fillColor,
                },
              ]}
            />
          </View>

          <Text style={styles.timeLabel}>
            {logged}m / {quota}m
          </Text>
        </View>

        {/* Action buttons (Phase 4: wire timer + completion) */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.iconButton}
            hitSlop={8}
            onPress={() => { /* Phase 4: start/stop timer */ }}
          >
            {complete ? (
              <Check size={22} color={colors.success} weight="bold" />
            ) : (
              <Play size={22} color={colors.primary} weight="fill" />
            )}
          </TouchableOpacity>

          {/* Drag handle — long-press to reorder */}
          <TouchableOpacity
            style={styles.dragHandle}
            onLongPress={onDragStart}
            delayLongPress={150}
            hitSlop={8}
          >
            <DotsSixVertical size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
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
    paddingHorizontal: card.paddingHorizontal,
    paddingVertical: card.paddingVertical,
    marginBottom: card.gap,
    ...card.shadow,
  },
  cardActive: {
    opacity: 0.9,
    transform: [{ scale: 1.02 }],
  },
  priorityWrap: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  priorityNum: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.cardTitle,
    color: colors.textSecondary,
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
  progressTrack: {
    height: progressBar.height,
    borderRadius: progressBar.borderRadius,
    backgroundColor: progressBar.trackColor,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: progressBar.borderRadius,
  },
  timeLabel: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.sm,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandle: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
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
