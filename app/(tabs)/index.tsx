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
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Plus } from 'phosphor-react-native';
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
} from '@/db';
import type { TaskWithProgress, HabitWithProgress, ReorderEntry } from '@/db';
import FocusTaskCard from '@/components/FocusTaskCard';
import HabitTaskCard from '@/components/HabitTaskCard';
import EmptyState from '@/components/EmptyState';

type HomeNavProp = StackNavigationProp<RootStackParamList>;
type ActiveTab = 'focus' | 'habit';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<HomeNavProp>();
  const [activeTab, setActiveTab] = useState<ActiveTab>('focus');

  const [focusTasks, setFocusTasks] = useState<TaskWithProgress[]>([]);
  const [habitTasks, setHabitTasks] = useState<HabitWithProgress[]>([]);

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
    }, [loadTasks]),
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
            // Phase 5: cancel any scheduled notifications for this task first
            // (INTEGRATION-06 — deleteTask CALLER MUST cancel notifications).
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

  const renderFocusItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<TaskWithProgress>) => {
      const index = getIndex();
      return (
        <FocusTaskCard
          task={item}
          priority={(index ?? 0) + 1}
          onPress={() => openEdit(item.id)}
          onDelete={() => confirmDelete(item.id, item.name)}
          onDragStart={drag}
          isActive={isActive}
        />
      );
    },
    [],
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
        <View style={styles.snoozeButton} />
      </View>

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
