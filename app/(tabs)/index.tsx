/**
 * app/(tabs)/index.tsx
 * Home screen — Focus | Habits segmented pill tabs.
 * Phase 3: real task data, FocusTaskCard (draggable), HabitTaskCard, swipe-delete.
 *
 * Data rules:
 *  - dates ALWAYS via getCurrentDateString() (INTEGRATION-01) — never toISOString
 *  - types imported from @/db barrel (no redefinition)
 *  - reorder uses reorderFocusTasks() single-transaction (BUILD note: no new deps)
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  ToastAndroid,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Plus, BellSimpleZ, BellSimple } from 'phosphor-react-native';
import DraggableFlatList, {
  RenderItemParams,
} from 'react-native-draggable-flatlist';

import { colors, typography, spacing, pillTab, fab } from '@/constants/theme';
import type { RootStackParamList } from '@/app/_layout';
import {
  getCurrentDateString,
  getFocusTasks,
  getHabitTasks,
  reorderFocusTasks,
  deleteTask,
  getTask,
  getOrCreateProgress,
  markComplete,
  getNextPendingFocusTask,
  isSnoozeActive,
  recordIntervalFired,
} from '@/db';
import type { TaskWithProgress, HabitWithProgress, ReorderEntry } from '@/db';
import FocusTaskCard from '@/components/FocusTaskCard';
import HabitTaskCard from '@/components/HabitTaskCard';
import EmptyState from '@/components/EmptyState';
import { useTimer } from '@/hooks/useTimer';
import { useSnooze } from '@/hooks/snooze';
import SnoozeBanner from '@/components/SnoozeBanner';
import {
  cancelNotificationsForTaskFull,
  fireTimesUpNotification,
} from '@/notifications/scheduler';

type HomeNavProp = StackNavigationProp<RootStackParamList>;
type ActiveTab = 'focus' | 'habit';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<HomeNavProp>();
  const [activeTab, setActiveTab] = useState<ActiveTab>('focus');
  const { activeTaskId, elapsedSeconds, toggleTimer, pauseTimer, recoverTimer } = useTimer();
  const { snoozed, toggleSnooze } = useSnooze();

  const [focusTasks, setFocusTasks] = useState<TaskWithProgress[]>([]);
  const [habitTasks, setHabitTasks] = useState<HabitWithProgress[]>([]);

  // Stable id -> priority map. Recomputed only when the order actually changes,
  // so renderFocusItem's identity stays stable during a drag (no full remount flicker).
  const priorityById = useMemo(() => {
    const m: Record<number, number> = {};
    focusTasks.forEach((t, i) => { m[t.id] = i + 1; });
    return m;
  }, [focusTasks]);

  const loadTasks = useCallback(async () => {
    const today = getCurrentDateString();
    const [focus, habits] = await Promise.all([
      getFocusTasks(today),
      getHabitTasks(today),
    ]);
    setFocusTasks(focus);
    setHabitTasks(habits);
  }, []);

  // Refresh whenever the screen regains focus (e.g. returning from a modal).
  useFocusEffect(
    useCallback(() => {
      loadTasks();
      recoverTimer();
    }, [loadTasks, recoverTimer]),
  );

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

  function toast(message: string) {
    if (Platform.OS === 'android') ToastAndroid.show(message, ToastAndroid.SHORT);
  }

  // Toggle this task's timer; refresh persisted progress after a pause/stop.
  async function handleToggle(taskId: number) {
    const wasRunning = activeTaskId === taskId;
    await toggleTimer(taskId);
    if (wasRunning) {
      // Just paused/stopped — daily_progress changed; reload to show new totals.
      await loadTasks();
    }
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
      toast(next ? `${name} — time's up. Next up: ${next.name}.` : 'You finished everything. Take a breath.');
    }
    await loadTasks();
  }

  // Habit check-off (QA A1): count one interval as done and refresh the card.
  async function handleHabitCheck(taskId: number) {
    await recordIntervalFired(taskId, getCurrentDateString());
    await loadTasks();
  }

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
          onDragStart={drag}
          isActive={isActive}
          isRunning={activeTaskId === item.id}
          liveSeconds={activeTaskId === item.id ? elapsedSeconds : 0}
          onToggleTimer={() => handleToggle(item.id)}
          onComplete={() => handleComplete(item.id, item.name)}
        />
      );
    },
    [priorityById, activeTaskId, elapsedSeconds],
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

      {/* Pill Tabs */}
      <View style={styles.pillContainer}>
        <TouchableOpacity
          style={[styles.pill, activeTab === 'focus' && styles.pillActive]}
          onPress={() => setActiveTab('focus')}
          activeOpacity={0.8}
        >
          <Text style={[styles.pillText, activeTab === 'focus' && styles.pillTextActive]}>
            Focus
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pill, activeTab === 'habit' && styles.pillActive]}
          onPress={() => setActiveTab('habit')}
          activeOpacity={0.8}
        >
          <Text style={[styles.pillText, activeTab === 'habit' && styles.pillTextActive]}>
            Habits
          </Text>
        </TouchableOpacity>
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
          renderItem={({ item }) => (
            <HabitTaskCard
              task={item}
              onPress={() => openEdit(item.id)}
              onDelete={() => confirmDelete(item.id, item.name)}
              onCheck={() => handleHabitCheck(item.id)}
            />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { bottom: fab.bottom + insets.bottom }]}
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
  pillContainer: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    backgroundColor: pillTab.containerBackground,
    borderRadius: pillTab.containerBorderRadius,
    padding: pillTab.containerPadding,
  },
  pill: {
    flex: 1,
    height: pillTab.height,
    borderRadius: pillTab.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: pillTab.inactiveBackground,
  },
  pillActive: {
    backgroundColor: pillTab.activeBackground,
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 0,
    elevation: 2,
  },
  pillText: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: pillTab.inactiveTextColor,
  },
  pillTextActive: {
    color: pillTab.activeTextColor,
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
