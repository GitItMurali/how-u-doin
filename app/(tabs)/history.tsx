/**
 * app/(tabs)/history.tsx
 * Phase 7b — History screen: filter ranges, per-task bars with quota markers,
 * session log with day headers.
 *
 * Decisions locked in 08_Phase7ab_Plan.md:
 *  - B2 CLOSED: ranges are calendar-date keyed (getCurrentDateString world).
 *  - Custom View bars, NOT victory-native (skia 2.x risk; token-perfect).
 *  - Week/Month = per-task TOTALS over the range + day-grouped log below
 *    (replaces App Flow's unreadable grouped-by-day bars).
 *  - Custom range = day steppers, NO native date picker (Phase 6 precedent).
 *
 * Layout: ONE FlatList; everything above the log lives in ListHeaderComponent
 * (avoids nested-scroll issues). Habits are OUT of the chart (no time
 * dimension) but get the footer ping chips.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { CaretLeft, CaretRight } from 'phosphor-react-native';

import { colors, typography, spacing, card } from '@/constants/theme';
import {
  getHistoryTotals,
  getSessionsInRange,
  getHabitPingCounts,
} from '@/db';
import type { HistoryTotalsRow, SessionWithTaskName, HabitPingRow } from '@/db';
import {
  getCurrentDateString,
  dateStringDaysAgo,
  addDaysToDateString,
  formatHoursMinutes,
  formatDayHeading,
} from '@/lib/date';
import FilterPills from '@/components/FilterPills';
import HistoryBar from '@/components/HistoryBar';
import SessionLogRow from '@/components/SessionLogRow';
import EmptyState from '@/components/EmptyState';

type Filter = 'today' | 'week' | 'month' | 'custom';

const FILTER_OPTIONS: { key: Filter; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'custom', label: 'Custom' },
];

/** Session log list item — plain sessions plus injected day headers. */
type LogItem =
  | { type: 'header'; key: string; date: string }
  | { type: 'session'; key: string; session: SessionWithTaskName };

/** Compact day stepper: ‹ 1 Jul › (custom range — no native date picker). */
function DayStepper({
  label,
  date,
  onStep,
  canBack,
  canForward,
}: {
  label: string;
  date: string;
  onStep: (delta: number) => void;
  canBack: boolean;
  canForward: boolean;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperControls}>
        <TouchableOpacity
          onPress={() => onStep(-1)}
          disabled={!canBack}
          hitSlop={8}
          style={[styles.stepperBtn, !canBack && styles.stepperBtnDisabled]}
        >
          <CaretLeft size={16} color={colors.textPrimary} weight="bold" />
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{formatDayHeading(date)}</Text>
        <TouchableOpacity
          onPress={() => onStep(1)}
          disabled={!canForward}
          hitSlop={8}
          style={[styles.stepperBtn, !canForward && styles.stepperBtnDisabled]}
        >
          <CaretRight size={16} color={colors.textPrimary} weight="bold" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('today');
  const [customStart, setCustomStart] = useState(() => dateStringDaysAgo(6));
  const [customEnd, setCustomEnd] = useState(() => getCurrentDateString());

  const [totals, setTotals] = useState<HistoryTotalsRow[]>([]);
  const [sessions, setSessions] = useState<SessionWithTaskName[]>([]);
  const [pings, setPings] = useState<HabitPingRow[]>([]);

  // Resolve the active date range. Recomputed per render — getCurrentDateString
  // is cheap, and this keeps "today" honest across the daily flip.
  const today = getCurrentDateString();
  const [startDate, endDate] =
    filter === 'today'
      ? [today, today]
      : filter === 'week'
        ? [dateStringDaysAgo(6), today]
        : filter === 'month'
          ? [dateStringDaysAgo(29), today]
          : [customStart, customEnd];

  const load = useCallback(async (start: string, end: string) => {
    const [t, s, p] = await Promise.all([
      getHistoryTotals(start, end),
      getSessionsInRange(start, end),
      getHabitPingCounts(start, end),
    ]);
    setTotals(t);
    setSessions(s);
    setPings(p);
  }, []);

  // Refresh on focus AND whenever the resolved range changes.
  useFocusEffect(
    useCallback(() => {
      void load(startDate, endDate);
    }, [load, startDate, endDate])
  );

  // ── Derived view data ──
  const multiDay = startDate !== endDate;
  const maxSeconds = totals.reduce((m, r) => Math.max(m, r.total_seconds), 0);
  const grandTotal = totals.reduce((sum, r) => sum + r.total_seconds, 0);
  const isEmpty = totals.length === 0 && sessions.length === 0;

  const logItems = useMemo<LogItem[]>(() => {
    const items: LogItem[] = [];
    let lastDate: string | null = null;
    for (const s of sessions) {
      if (multiDay && s.date !== lastDate) {
        items.push({ type: 'header', key: `h-${s.date}`, date: s.date });
        lastDate = s.date;
      }
      items.push({ type: 'session', key: `s-${s.id}`, session: s });
    }
    return items;
  }, [sessions, multiDay]);

  // ── Custom range steppers (clamped: start ≤ end ≤ today) ──
  function stepStart(delta: number) {
    const next = addDaysToDateString(customStart, delta);
    if (next <= customEnd) setCustomStart(next);
  }
  function stepEnd(delta: number) {
    const next = addDaysToDateString(customEnd, delta);
    if (next >= customStart && next <= today) setCustomEnd(next);
  }

  const header = (
    <View>
      <FilterPills options={FILTER_OPTIONS} active={filter} onChange={setFilter} compact />

      {filter === 'custom' && (
        <View style={styles.customCard}>
          <DayStepper
            label="From"
            date={customStart}
            onStep={stepStart}
            canBack
            canForward={customStart < customEnd}
          />
          <DayStepper
            label="To"
            date={customEnd}
            onStep={stepEnd}
            canBack={customEnd > customStart}
            canForward={customEnd < today}
          />
        </View>
      )}

      {!isEmpty && (
        <>
          {/* Summary line */}
          <Text style={styles.summary}>
            {formatHoursMinutes(grandTotal)} across{' '}
            {totals.length === 1 ? '1 task' : `${totals.length} tasks`}
          </Text>

          {/* Bars */}
          {totals.length > 0 && (
            <View style={styles.barsCard}>
              {totals.map((row) => (
                <HistoryBar
                  key={row.id}
                  name={row.name}
                  totalSeconds={row.total_seconds}
                  quotaMinutes={row.quota_minutes}
                  maxSeconds={maxSeconds}
                  showQuotaMarker={!multiDay}
                />
              ))}
            </View>
          )}

          {/* Habit ping chips */}
          {pings.length > 0 && (
            <Text style={styles.pingLine} numberOfLines={2}>
              Habit pings:{' '}
              {pings.map((p) => `${p.name} ×${p.ping_count}`).join(' · ')}
            </Text>
          )}

          {sessions.length > 0 && <Text style={styles.logLabel}>LOG</Text>}
        </>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
      </View>

      <FlatList
        data={logItems}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Text style={styles.dayHeader}>{formatDayHeading(item.date)}</Text>
          ) : (
            <SessionLogRow session={item.session} />
          )
        }
        ListHeaderComponent={header}
        ListEmptyComponent={
          isEmpty ? (
            <EmptyState
              title={filter === 'custom' ? 'Nothing logged here' : 'No logs yet'}
              body={
                filter === 'custom'
                  ? 'Quiet week.'
                  : "The timer's waiting."
              }
            />
          ) : null
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  customCard: {
    backgroundColor: colors.surface,
    borderRadius: card.borderRadius,
    borderLeftWidth: card.accentBorderWidth,
    borderLeftColor: colors.accent,
    paddingHorizontal: card.paddingHorizontal,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    ...card.shadow,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
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
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperBtnDisabled: {
    opacity: 0.35,
  },
  stepperValue: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.textPrimary,
    minWidth: 132,
    textAlign: 'center',
  },
  summary: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.screenTitle,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
  },
  barsCard: {
    backgroundColor: colors.surface,
    borderRadius: card.borderRadius,
    borderLeftWidth: card.accentBorderWidth,
    borderLeftColor: colors.accent,
    paddingHorizontal: card.paddingHorizontal,
    paddingTop: card.paddingVertical,
    paddingBottom: spacing.xs,
    ...card.shadow,
  },
  pingLine: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  logLabel: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    letterSpacing: 1.2,
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  dayHeader: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
});
