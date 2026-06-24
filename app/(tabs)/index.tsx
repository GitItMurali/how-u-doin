/**
 * app/(tabs)/index.tsx
 * Home screen — Focus | Habits segmented pill tabs
 * Phase 2: shell with pill tab switcher, placeholder lists
 * Phase 3: real task data, FocusTaskCard, HabitTaskCard
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Plus } from 'phosphor-react-native';

import { colors, typography, spacing, pillTab, fab } from '@/constants/theme';
import type { RootStackParamList } from '@/app/_layout';

type HomeNavProp = StackNavigationProp<RootStackParamList>;

type ActiveTab = 'focus' | 'habit';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<HomeNavProp>();
  const [activeTab, setActiveTab] = useState<ActiveTab>('focus');

  function handleFAB() {
    navigation.navigate('CreateTask', { defaultType: activeTab });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>How U Doin</Text>
          <Text style={styles.dateSubtitle}>{getTodayLabel()}</Text>
        </View>
        {/* Snooze toggle — wired in Phase 5 */}
        <View style={styles.snoozeButton} />
      </View>

      {/* ── Pill Tabs ── */}
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

      {/* ── Task List ── */}
      {activeTab === 'focus' ? (
        <FocusTabPlaceholder />
      ) : (
        <HabitsTabPlaceholder />
      )}

      {/* ── FAB ── */}
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

// ── Placeholder panes (replaced in Phase 3) ──────────────────────────────────

function FocusTabPlaceholder() {
  return (
    <FlatList
      data={[]}
      keyExtractor={(item) => item}
      renderItem={null}
      contentContainerStyle={styles.emptyContainer}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No focus tasks yet</Text>
          <Text style={styles.emptyBody}>Tap + to add your first task</Text>
        </View>
      }
    />
  );
}

function HabitsTabPlaceholder() {
  return (
    <FlatList
      data={[]}
      keyExtractor={(item) => item}
      renderItem={null}
      contentContainerStyle={styles.emptyContainer}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No habits yet</Text>
          <Text style={styles.emptyBody}>Tap + to add your first habit</Text>
        </View>
      }
    />
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getTodayLabel(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
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
    // wired Phase 5
  },

  // Pill tabs
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

  // Empty state
  emptyContainer: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyTitle: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.screenTitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
  },

  // FAB
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
