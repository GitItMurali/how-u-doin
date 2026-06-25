/**
 * app/task/[id].tsx
 * Edit Task modal — Phase 3.
 * Prefills from getTask(id). Type is locked (cannot change after creation).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { X } from 'phosphor-react-native';

import { colors, typography, spacing, sheet } from '@/constants/theme';
import type { RootStackParamList } from '@/app/_layout';
import { getTask, updateTask } from '@/db';
import type { Task } from '@/db';
import TaskForm, { TaskFormValue, QUOTA_PRESETS, INTERVAL_PRESETS } from '@/components/TaskForm';

type EditTaskRoute = RouteProp<RootStackParamList, 'EditTask'>;

export default function EditTaskModal() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<EditTaskRoute>();
  const taskId = Number(route.params.taskId);

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const t = await getTask(taskId);
      if (mounted) {
        setTask(t);
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [taskId]);

  async function handleSubmit(value: TaskFormValue) {
    // updateTask only writes provided fields. interval change => Phase 5 must
    // reschedule notifications (INTEGRATION-06 updateTask CALLER MUST contract).
    if (value.type === 'focus') {
      await updateTask(taskId, {
        name: value.name,
        notes: value.notes || undefined,
        quota_minutes: value.quotaMinutes,
      });
    } else {
      await updateTask(taskId, {
        name: value.name,
        notes: value.notes || undefined,
        interval_minutes: value.intervalMinutes,
      });
    }
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
          <Text style={styles.title}>Edit Task</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : !task ? (
          <View style={styles.center}>
            <Text style={styles.missing}>Task not found.</Text>
          </View>
        ) : (
          <TaskForm
            lockType
            initial={{
              type: task.task_type,
              name: task.name,
              notes: task.notes ?? '',
              quotaMinutes: task.quota_minutes ?? QUOTA_PRESETS[1],
              intervalMinutes: task.interval_minutes ?? INTERVAL_PRESETS[0],
            }}
            submitLabel="Save changes"
            onSubmit={handleSubmit}
          />
        )}
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
    minHeight: 280,
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
  center: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  missing: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
  },
});
