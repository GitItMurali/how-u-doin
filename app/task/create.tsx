/**
 * app/task/create.tsx
 * Create Task modal — Phase 3.
 * Type selector (honors defaultType param) + TaskForm + DB insert.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { X } from 'phosphor-react-native';

import { colors, typography, spacing, sheet } from '@/constants/theme';
import type { RootStackParamList } from '@/app/_layout';
import { createFocusTask, createHabitTask, isSnoozeActive } from '@/db';
import { scheduleIntervalNotification } from '@/notifications/scheduler';
import TaskForm, { TaskFormValue, QUOTA_PRESETS, INTERVAL_PRESETS } from '@/components/TaskForm';

type CreateTaskRoute = RouteProp<RootStackParamList, 'CreateTask'>;

export default function CreateTaskModal() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<CreateTaskRoute>();
  const defaultType = route.params?.defaultType ?? 'focus';

  async function handleSubmit(value: TaskFormValue) {
    if (value.type === 'focus') {
      await createFocusTask({
        name: value.name,
        quota_minutes: value.quotaMinutes,
        notes: value.notes || undefined,
      });
    } else {
      const habitId = await createHabitTask({
        name: value.name,
        interval_minutes: value.intervalMinutes,
        notes: value.notes || undefined,
      });
      // Phase 5: start the interval ping immediately, unless snooze is active
      // (snooze keeps everything quiet until the user un-snoozes).
      if (!(await isSnoozeActive())) {
        await scheduleIntervalNotification(habitId, value.name, value.intervalMinutes);
      }
    }
    // Home re-loads via useFocusEffect on return.
    navigation.goBack();
  }

  return (
    <KeyboardAvoidingView
      style={styles.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <TouchableOpacity style={styles.backdrop} onPress={() => navigation.goBack()} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>New Task</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TaskForm
          initial={{
            type: defaultType,
            name: '',
            notes: '',
            quotaMinutes: QUOTA_PRESETS[1],     // 30
            intervalMinutes: INTERVAL_PRESETS[0], // 15
          }}
          submitLabel="Create task"
          onSubmit={handleSubmit}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(44, 26, 14, 0.40)',
  },
  sheet: {
    backgroundColor: sheet.backgroundColor,
    borderTopLeftRadius: sheet.borderTopLeftRadius,
    borderTopRightRadius: sheet.borderTopRightRadius,
    maxHeight: '90%',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: sheet.handleWidth,
    height: sheet.handleHeight,
    borderRadius: sheet.handleBorderRadius,
    backgroundColor: sheet.handleColor,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  title: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.screenTitle,
    color: colors.textPrimary,
  },
});
