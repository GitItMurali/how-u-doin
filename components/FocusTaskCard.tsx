/**
 * components/FocusTaskCard.tsx
 * Focus task card — priority number, name, LIVE progress bar, time label,
 * play/pause + check buttons, drag handle, swipe-left delete, swipe-right
 * archive (7c — immediate, no prompt, per design brief).
 *
 * PERF C1/C2 (7c): exported with React.memo, and the live elapsed display is
 * computed CARD-LOCALLY from `liveStartedAt` with a 1s tick that only exists
 * while this card is the running one. Only the running card re-renders each
 * second — the rest of the list is untouched.
 *
 * B7 (7c): legacy Swipeable → ReanimatedSwipeable (gesture-handler 2.x's
 * maintained implementation; the old one is deprecated).
 *
 * Design tokens only (constants/theme.ts) — no magic numbers.
 */
import React, { memo, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
// FIX-ARCHIVE-02: the archive button MUST be a gesture-handler touchable.
// ReanimatedSwipeable renders the right-actions wrapper (absoluteFill) on top
// of the left-actions wrapper, so RN's hit-testing hands taps in the archive
// area to that empty overlay and a plain RN TouchableOpacity below never
// fires. RNGH touchables use the gesture system's own hit-testing, which
// reaches views under empty overlays.
import { TouchableOpacity as GHTouchableOpacity } from 'react-native-gesture-handler';
import { Play, Pause, Check, DotsSixVertical, Trash, Archive } from 'phosphor-react-native';

import { colors, typography, spacing, card, progressBar, swipe } from '@/constants/theme';
import type { TaskWithProgress } from '@/db';
// Phase 7b consolidation: formatClock moved to lib/date.ts (History uses it too).
import { formatClock } from '@/lib/date';

interface FocusTaskCardProps {
  task: TaskWithProgress;
  priority: number;            // 1-based position in the list
  onPress: () => void;         // open edit modal
  onDelete: () => void;        // confirm + deleteTask (handled by parent)
  onArchive: () => void;       // archive immediately (handled by parent)
  onDragStart: () => void;     // long-press drag handle
  isActive: boolean;           // true while being dragged
  // ── Timer wiring ──
  /** ms epoch this card's session started at; null when not running (PERF C2). */
  liveStartedAt: number | null;
  onToggleTimer: () => void;   // start/pause this task's timer
  onComplete: () => void;      // mark task complete now
}

function FocusTaskCard({
  task,
  priority,
  onPress,
  onDelete,
  onArchive,
  onDragStart,
  isActive,
  liveStartedAt,
  onToggleTimer,
  onComplete,
}: FocusTaskCardProps) {
  const isRunning = liveStartedAt !== null;

  // Card-local 1s tick — mounts only while running (PERF C2).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (liveStartedAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [liveStartedAt]);

  const quota = task.quota_minutes ?? 0;        // quota in minutes
  const quotaSeconds = quota * 60;
  const baseSeconds = task.logged_seconds ?? 0; // persisted, seconds-granular

  // While running, provisional progress = persisted seconds + live elapsed seconds.
  const liveSec =
    liveStartedAt !== null
      ? Math.max(0, Math.floor((now - liveStartedAt) / 1000))
      : 0;
  const displaySeconds = baseSeconds + liveSec;

  const complete =
    task.is_complete === 1 || (quotaSeconds > 0 && displaySeconds >= quotaSeconds);
  const pct = quotaSeconds > 0 ? Math.min(1, displaySeconds / quotaSeconds) : 0;

  // Time label: "MM:SS / 25m". Persisted time shown as a clock so short sessions
  // (e.g. 5s) read as 0:05, not a rounded-up "1m".
  const timeLabel = isRunning
    ? `${formatClock(displaySeconds)}  /  ${quota}m`
    : `${formatClock(baseSeconds)} / ${quota}m`;

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
    // FIX-ARCHIVE-01/02: GH touchable (see import note) so the revealed
    // button actually receives taps. FIX-ARCHIVE-03: the plain View owns ALL
    // sizing and visuals (identical to the original full-height amber block,
    // stretched by the actions row); the GH touchable simply absolute-fills
    // it, immune to the GH touchable's own content-sizing quirks.
    return (
      <View style={styles.archiveAction}>
        <GHTouchableOpacity
          style={styles.archiveActionPress}
          onPress={onArchive}
          activeOpacity={0.85}
        >
          <Archive size={swipe.actionIconSize} color={colors.white} weight="bold" />
        </GHTouchableOpacity>
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
    </ReanimatedSwipeable>
  );
}

// PERF C1: memoized — with renderFocusItem's deps now excluding per-second
// state, unchanged cards skip re-rendering entirely.
export default memo(FocusTaskCard);

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
  archiveAction: {
    backgroundColor: swipe.archiveBackgroundColor,
    justifyContent: 'center',
    alignItems: 'center',
    width: 72,
    borderRadius: card.borderRadius,
    marginBottom: card.gap,
  },
  archiveActionPress: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
