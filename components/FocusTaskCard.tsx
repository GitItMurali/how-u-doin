/**
 * components/FocusTaskCard.tsx
 * Focus task card — priority number, name, LIVE progress bar, time label,
 * play/pause + check buttons, drag handle, swipe-left to delete.
 * Phase 4: timer wired (play/pause toggles the live timer; check marks complete).
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
import { Play, Pause, Check, DotsSixVertical, Trash } from 'phosphor-react-native';

import { colors, typography, spacing, card, progressBar, swipe } from '@/constants/theme';
import type { TaskWithProgress } from '@/db';

interface FocusTaskCardProps {
  task: TaskWithProgress;
  priority: number;            // 1-based position in the list
  onPress: () => void;         // open edit modal
  onDelete: () => void;        // confirm + deleteTask (handled by parent)
  onDragStart: () => void;     // long-press drag handle
  isActive: boolean;           // true while being dragged
  // ── Phase 4 timer wiring ──
  isRunning: boolean;          // this card's timer is the active one
  liveSeconds: number;         // live elapsed seconds while running (0 otherwise)
  onToggleTimer: () => void;   // start/pause this task's timer
  onComplete: () => void;      // mark task complete now
}

export default function FocusTaskCard({
  task,
  priority,
  onPress,
  onDelete,
  onDragStart,
  isActive,
  isRunning,
  liveSeconds,
  onToggleTimer,
  onComplete,
}: FocusTaskCardProps) {
  const quota = task.quota_minutes ?? 0;
  const baseLogged = task.logged_minutes ?? 0;

  // While running, show provisional progress = persisted minutes + live elapsed.
  const liveMinutes = isRunning ? liveSeconds / 60 : 0;
  const displayMinutes = baseLogged + liveMinutes;

  const complete = task.is_complete === 1 || (quota > 0 && displayMinutes >= quota);
  const pct = quota > 0 ? Math.min(1, displayMinutes / quota) : 0;

  // Time label: "12:34 / 25m" while running, "12m / 25m" otherwise.
  const runningLabel = formatClock(liveSeconds);
  const timeLabel = isRunning
    ? `${runningLabel}  (+${baseLogged}m)  /  ${quota}m`
    : `${baseLogged}m / ${quota}m`;

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
          isRunning && styles.cardRunning,
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

          {/* Live progress bar */}
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

          <Text style={styles.timeLabel}>{timeLabel}</Text>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          {complete ? (
            // Completed: show a static success check (no toggle).
            <View style={styles.iconButton}>
              <Check size={22} color={colors.success} weight="bold" />
            </View>
          ) : (
            <>
              {/* Play / Pause toggle */}
              <TouchableOpacity
                style={styles.iconButton}
                hitSlop={8}
                onPress={onToggleTimer}
              >
                {isRunning ? (
                  <Pause size={22} color={colors.primary} weight="fill" />
                ) : (
                  <Play size={22} color={colors.primary} weight="fill" />
                )}
              </TouchableOpacity>

              {/* Mark complete */}
              <TouchableOpacity
                style={styles.iconButton}
                hitSlop={8}
                onPress={onComplete}
              >
                <Check size={22} color={colors.textSecondary} weight="bold" />
              </TouchableOpacity>
            </>
          )}

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

/** Seconds -> "M:SS" (or "H:MM:SS" past an hour). */
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
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
  cardRunning: {
    borderLeftColor: colors.accent,
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
