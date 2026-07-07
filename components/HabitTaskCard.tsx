/**
 * components/HabitTaskCard.tsx
 * Habit task card — name, interval badge ("every 15 min"), next-ping countdown
 * (UX-COUNTDOWN-01), check-off button (records one interval done today),
 * swipe-left delete, swipe-right archive (7c). Phase 3; countdown added post-QA.
 *
 * Countdown: parent passes nextFireAt (Unix ms from notification_schedule via
 * getNextIntervalFireTimes). The card re-renders itself every 30s while one is
 * set, so the label stays fresh without the parent re-querying. null → no
 * label (nothing scheduled: snoozed / just reset). Once past due for >=1 min,
 * a gentle overdue line appears ("It's been 25m since this was due..." —
 * decimal hours past 60m).
 *
 * B7 (7c): legacy Swipeable → ReanimatedSwipeable. C1: exported memoized.
 *
 * Design tokens only (constants/theme.ts).
 */
import React, { memo, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Check, Bell, Trash, Archive } from 'phosphor-react-native';

import { colors, typography, spacing, card, swipe } from '@/constants/theme';
import type { HabitWithProgress } from '@/db';

interface HabitTaskCardProps {
  task: HabitWithProgress;
  nextFireAt: number | null; // Unix ms of next scheduled ping, null = none scheduled
  onPress: () => void;       // open edit modal
  onDelete: () => void;      // confirm + deleteTask (handled by parent)
  onArchive: () => void;     // archive immediately (handled by parent)
  onCheck: () => void;       // record one interval done today (QA A1)
}

function intervalLabel(mins: number | null): string {
  if (!mins || mins <= 0) return 'no interval';
  if (mins % 60 === 0) {
    const h = mins / 60;
    return h === 1 ? 'every hour' : `every ${h} hrs`;
  }
  return `every ${mins} min`;
}

/**
 * "next in 12m" / "next in 1h 05m" / "due now" (fire time passed but the
 * ping hasn't been handled/rescheduled yet). Ceil so the label never reads
 * a minute short — better to promise 3m and ping at 2:10 than the reverse.
 */
function countdownLabel(nextFireAt: number, now: number): string {
  const remainingMs = nextFireAt - now;
  if (remainingMs <= 0) return 'due now';
  const totalMin = Math.ceil(remainingMs / 60_000);
  if (totalMin < 60) return `next in ${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `next in ${h}h ${String(m).padStart(2, '0')}m`;
}

/**
 * Overdue line — shown once a due ping has sat unchecked for >=1 minute.
 * <60m -> "37m"; >=60m -> decimal hours ("1.5h", trailing .0 trimmed).
 */
function overdueLabel(nextFireAt: number, now: number): string | null {
  const mins = Math.floor((now - nextFireAt) / 60_000);
  if (mins < 1) return null;
  const y =
    mins < 60
      ? `${mins}m`
      : `${(Math.round((mins / 60) * 10) / 10).toString().replace(/\.0$/, '')}h`;
  return `It's been ${y} since this was due — better late than never.`;
}

function HabitTaskCard({ task, nextFireAt, onPress, onDelete, onArchive, onCheck }: HabitTaskCardProps) {
  const fired = task.interval_count ?? 0;

  // 30s self-tick keeps the countdown honest while the card is mounted.
  // No timer at all when nothing is scheduled.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (nextFireAt === null) return;
    setNow(Date.now()); // fresh baseline whenever the schedule changes
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [nextFireAt]);

  const overdue = nextFireAt !== null ? overdueLabel(nextFireAt, now) : null;

  function renderRightActions() {
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

  function renderLeftActions() {
    return (
      <View style={styles.archiveAction}>
        <Archive size={swipe.actionIconSize} color={colors.white} weight="bold" />
      </View>
    );
  }

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      rightThreshold={swipe.revealThreshold}
      leftThreshold={swipe.revealThreshold}
      overshootRight={false}
      overshootLeft={false}
      onSwipeableOpen={(direction) => {
        // Swipe right (left actions revealed) = archive immediately, no prompt.
        if (direction === 'left') onArchive();
      }}
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

          {/* Next-ping countdown (UX-COUNTDOWN-01) */}
          {nextFireAt !== null && (
            <Text style={styles.countdownText}>
              {countdownLabel(nextFireAt, now)}
            </Text>
          )}
          {overdue !== null && (
            <Text style={styles.overdueText}>{overdue}</Text>
          )}
        </View>

        {/* Check-off — records one interval done today */}
        <TouchableOpacity
          style={styles.checkButton}
          hitSlop={8}
          onPress={onCheck}
        >
          <Check size={22} color={colors.textSecondary} weight="bold" />
        </TouchableOpacity>
      </TouchableOpacity>
    </ReanimatedSwipeable>
  );
}

export default memo(HabitTaskCard);

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
  countdownText: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.caption,
    color: colors.primary,
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  overdueText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.snooze,
    marginTop: 2,
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
  archiveAction: {
    backgroundColor: swipe.archiveBackgroundColor,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: card.borderRadius,
    marginBottom: card.gap,
  },
});
