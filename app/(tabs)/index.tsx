/**
 * app/(tabs)/index.tsx
 * Home screen — Focus | Habits segmented pill tabs (FilterPills since 7c).
 * Phase 3: real task data, FocusTaskCard (draggable), HabitTaskCard, swipe-delete.
 * Phase 7c: swipe-right archive on both card types; PERF C2 — cards self-tick
 * from activeStartedAt, so this screen no longer re-renders every second.
 *
 * Data rules:
 *  - dates ALWAYS via getCurrentDateString() (INTEGRATION-01) — never toISOString
 *  - types imported from @/db barrel (no redefinition)
 *  - reorder uses reorderFocusTasks() single-transaction (BUILD note: no new deps)
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ListRenderItemInfo,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Plus, BellSimpleZ, BellSimple } from 'phosphor-react-native';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';

import { colors, typography, spacing, fab } from '@/constants/theme';
import type { RootStackParamList } from '@/app/_layout';
import {
  getCurrentDateString,
  getFocusTasks,
  getHabitTasks,
  reorderFocusTasks,
  deleteTask,
  archiveTask,
  getTask,
  getOrCreateProgress,
  markComplete,
  getNextPendingFocusTask,
  isSnoozeActive,
  recordIntervalFired,
  getNextIntervalFireTimes,
} from '@/db';
import type { TaskWithProgress, HabitWithProgress, ReorderEntry } from '@/db';
import FocusTaskCard from '@/components/FocusTaskCard';
import HabitTaskCard from '@/components/HabitTaskCard';
import EmptyState from '@/components/EmptyState';
import FilterPills from '@/components/FilterPills';
import { useTimer } from '@/hooks/useTimer';
import { toast } from '@/lib/toast';
import { useSnooze } from '@/hooks/snooze';
import SnoozeBanner from '@/components/SnoozeBanner';
import {
  cancelNotificationsForTaskFull,
  fireTimesUpNotification,
  restartHabitCadence,
} from '@/notifications/scheduler';

type HomeNavProp = StackNavigationProp<RootStackParamList>;
type ActiveTab = 'focus' | 'habit';

const TAB_OPTIONS: { key: ActiveTab; label: string }[] = [
  { key: 'focus', label: 'Focus' },
  { key: 'habit', label: 'Habits' },
];

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<HomeNavProp>();
  const [activeTab, setActiveTab] = useState<ActiveTab>('focus');
  const { activeTaskId, activeStartedAt, sessionsVersion, toggleTimer, pauseTimer, recoverTimer } =
    useTimer();
  const { snoozed, toggleSnooze } = useSnooze();

  const [focusTasks, setFocusTasks] = useState<TaskWithProgress[]>([]);
  const [habitTasks, setHabitTasks] = useState<HabitWithProgress[]>([]);
  // task_id -> next scheduled interval ping (Unix ms). UX-COUNTDOWN-01.
  const [nextFireByTask, setNextFireByTask] = useState<Record<number, number>>({});

  // Stable id -> priority map. Recomputed only when the order actually changes,
  // so renderFocusItem's identity stays stable during a drag (no full remount flicker).
  const priorityById = useMemo(() => {
    const m: Record<number, number> = {};
    focusTasks.forEach((t, i) => { m[t.id] = i + 1; });
    return m;
  }, [focusTasks]);

  const loadTasks = useCallback(async () => {
    const today = getCurrentDateString();
    const [focus, habits, fires] = await Promise.all([
      getFocusTasks(today),
      getHabitTasks(today),
      getNextIntervalFireTimes(),
    ]);
    setFocusTasks(focus);
    setHabitTasks(habits);
    setNextFireByTask(
      Object.fromEntries(fires.map((f) => [f.task_id, f.next_fire_at]))
    );
  }, []);

  // Refresh whenever the screen regains focus (e.g. returning from a modal).
  useFocusEffect(
    useCallback(() => {
      loadTasks();
      recoverTimer();
    }, [loadTasks, recoverTimer]),
  );

  // FIX-QUOTA-STOP: a session was finalized WITHOUT a user interaction (quota
  // auto-stop, or single-timer auto-pause) — reload so the card flips to its
  // persisted state (green tick, quota logged) instead of showing stale totals.
  // QA M2: skip the mount run — the focus effect above already loads then,
  // so reacting to the initial sessionsVersion=0 double-fetched 3 queries.
  const lastSessionsVersionRef = useRef(sessionsVersion);
  useEffect(() => {
    if (sessionsVersion === lastSessionsVersionRef.current) return;
    lastSessionsVersionRef.current = sessionsVersion;
    void loadTasks();
  }, [sessionsVersion, loadTasks]);

  function handleFAB() {
    navigation.navigate('CreateTask', { defaultType: activeTab });
  }

  function openEdit(taskId: number) {
    navigation.navigate('EditTask', { taskId: String(taskId) });
  }

  function confirmDelete(taskId: number, name: string) {
    Alert.alert(
      'Delete task?',
      `"${name}" will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // QA A6 — stop this task's timer first so its session is closed and
            // elapsed time logged before the task disappears.
            if (activeTaskId === taskId) {
              await pauseTimer(taskId);
            }
            // INTEGRATION-06 — deleteTask CALLER MUST cancel notifications first.
            await cancelNotificationsForTaskFull(taskId);
            await deleteTask(taskId);
            await loadTasks();
          },
        },
      ],
    );
  }

  // Archive flow (user decision 2026-07-13): swipe right reveals the button,
  // tapping it asks for confirmation, same pattern as delete. Same caller
  // duties as delete: stop the timer, cancel notifications.
  function confirmArchive(taskId: number, name: string) {
    Alert.alert(
      'Archive task?',
      `"${name}" will move to Settings. Its history stays.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Archive', onPress: () => void handleArchive(taskId) },
      ],
    );
  }

  async function handleArchive(taskId: number) {
    if (activeTaskId === taskId) {
      await pauseTimer(taskId);
    }
    await cancelNotificationsForTaskFull(taskId);
    await archiveTask(taskId);
    toast('Archived. Find it in Settings');
    await loadTasks();
  }

  async function handleDragEnd(data: TaskWithProgress[]) {
    // Optimistic UI update
    setFocusTasks(data);
    // Persist new sort_order in one transaction (reorderFocusTasks).
    const newOrder: ReorderEntry[] = data.map((t, idx) => ({
      id: t.id,
      sort_order: idx + 1,
    }));
    await reorderFocusTasks(newOrder);
  }

  // Toggle this task's timer. QA M2: no manual reload — a pause finalizes the
  // session, which bumps sessionsVersion, and the effect above reloads once.
  async function handleToggle(taskId: number) {
    await toggleTimer(taskId);
  }

  // Manual "mark complete" from the check button.
  // Pauses the timer first if this task is running (so its minutes are logged),
  // then marks complete and fires the Time's Up surface (Phase 5: real push).
  async function handleComplete(taskId: number, name: string) {
    if (activeTaskId === taskId) {
      await pauseTimer(taskId); // logs elapsed; may already mark complete on quota hit
    }
    const today = getCurrentDateString();
    const progress = await getOrCreateProgress(taskId, today);
    if (progress.is_complete === 0) {
      const task = await getTask(taskId);
      await markComplete(taskId, today, task?.quota_minutes ?? undefined);
      // getNextPendingFocusTask only looks forward by sort_order — by design (QA-02).
      const next = await getNextPendingFocusTask(taskId, today);
      // Phase 5: fire a real local push (notification_type 'times_up', never
      // rescheduled — SCHEMA-02), unless snooze is active. QA A5: read snooze
      // from the DB, not the snoozed prop — this callback can be captured stale
      // by the memoized renderFocusItem. Keep the toast as in-app feedback.
      if (!(await isSnoozeActive())) {
        await fireTimesUpNotification(taskId, name, next?.name ?? null);
      }
      toast(next ? `Time's up for ${name}. Next up: ${next.name}.` : 'You finished everything. Take a breath.');
    }
    await loadTasks();
  }

  // Habit check-off (QA A1): count one interval as done, then restart the
  // cadence from NOW (2026-07-07 fix) — cancels the repeating ping and
  // schedules a fresh one, so the countdown resets to the full interval
  // instead of sticking on "due now".
  // QA4: re-entrancy guard (B6 class) — a double-tap raced two
  // cancel+reschedule cycles and could leave a duplicate repeating ping.
  const habitCheckBusyRef = useRef(false);
  async function handleHabitCheck(taskId: number) {
    if (habitCheckBusyRef.current) return;
    habitCheckBusyRef.current = true;
    try {
      await recordIntervalFired(taskId, getCurrentDateString());
      await restartHabitCadence(taskId);
      await loadTasks();
    } finally {
      habitCheckBusyRef.current = false;
    }
  }

  // QA C4: stable renderItem so HabitTaskCard's memo actually skips re-renders.
  const renderHabitItem = useCallback(
    ({ item }: ListRenderItemInfo<HabitWithProgress>) => (
      <HabitTaskCard
        task={item}
        nextFireAt={nextFireByTask[item.id] ?? null}
        onPress={() => openEdit(item.id)}
        onDelete={() => confirmDelete(item.id, item.name)}
        onArchive={() => confirmArchive(item.id, item.name)}
        onCheck={() => handleHabitCheck(item.id)}
      />
    ),
    [nextFireByTask, activeTaskId],
  );

  const renderFocusItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<TaskWithProgress>) => {
      // Priority from a stable per-order map (avoids stale getIndex() duplicates
      // AND avoids re-creating this callback on every focusTasks change).
      const priority = priorityById[item.id] ?? 0;
      return (
        <FocusTaskCard
          task={item}
          priority={priority}
          onPress={() => openEdit(item.id)}
          onDelete={() => confirmDelete(item.id, item.name)}
          onArchive={() => confirmArchive(item.id, item.name)}
          onDragStart={drag}
          isActive={isActive}
          liveStartedAt={activeTaskId === item.id ? activeStartedAt : null}
          onToggleTimer={() => handleToggle(item.id)}
          onComplete={() => handleComplete(item.id, item.name)}
        />
      );
    },
    // PERF C2: no per-second dep here — identity changes only on reorder or
    // timer start/stop, so cards are not re-created every second any more.
    [priorityById, activeTaskId, activeStartedAt],
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>How U Doin</Text>
          <Text style={styles.dateSubtitle}>{getTodayLabel()}</Text>
        </View>
        <TouchableOpacity
          style={[styles.snoozeButton, snoozed && styles.snoozeButtonActive]}
          onPress={toggleSnooze}
          activeOpacity={0.8}
          hitSlop={8}
          accessibilityLabel={snoozed ? 'Resume notifications' : 'Snooze notifications'}
        >
          {snoozed ? (
            <BellSimpleZ size={22} color={colors.white} weight="fill" />
          ) : (
            <BellSimple size={22} color={colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Snooze banner — slides in below header while snoozed */}
      <SnoozeBanner visible={snoozed} onResume={toggleSnooze} />

      {/* Pill Tabs (FilterPills — 7c adoption) */}
      <View style={styles.pillWrap}>
        <FilterPills options={TAB_OPTIONS} active={activeTab} onChange={setActiveTab} />
      </View>

      {/* Task List */}
      {activeTab === 'focus' ? (
        focusTasks.length === 0 ? (
          <EmptyState title="No focus tasks yet" body="Tap + to add your first task" />
        ) : (
          <DraggableFlatList
            data={focusTasks}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderFocusItem}
            onDragEnd={({ data }) => handleDragEnd(data)}
            contentContainerStyle={styles.listContent}
          />
        )
      ) : habitTasks.length === 0 ? (
        <EmptyState title="No habits yet" body="Tap + to add your first habit" />
      ) : (
        <FlatList
          data={habitTasks}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderHabitItem}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: fab.bottom }]}
        onPress={handleFAB}
        activeOpacity={0.85}
      >
        <Plus size={28} color={colors.white} weight="bold" />
      </TouchableOpacity>
    </View>
  );
}

function getTodayLabel(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  appTitle: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.appTitle,
    color: colors.textPrimary,
  },
  dateSubtitle: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  snoozeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  snoozeButtonActive: {
    backgroundColor: colors.snooze,
  },
  pillWrap: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: 100,
  },
  fab: {
    position: 'absolute',
    right: fab.right,
    width: fab.size,
    height: fab.size,
    borderRadius: fab.borderRadius,
    backgroundColor: fab.backgroundColor,
    alignItems: 'center',
    justifyContent: 'center',
    ...fab.shadow,
  },
});
