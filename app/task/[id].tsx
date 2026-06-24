/**
 * app/task/[id].tsx
 * Edit Task modal stub
 * Phase 2: modal chrome matching Create modal
 * Phase 3: pre-filled form, save to DB
 *
 * Receives route param: taskId: string
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { X } from 'phosphor-react-native';
import { colors, typography, spacing, sheet } from '@/constants/theme';
import type { RootStackParamList } from '@/app/_layout';

type EditTaskRoute = RouteProp<RootStackParamList, 'EditTask'>;

export default function EditTaskModal() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<EditTaskRoute>();
  const { taskId } = route.params;

  return (
    <View style={styles.overlay}>
      <TouchableOpacity style={styles.backdrop} onPress={() => navigation.goBack()} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Edit Task</Text>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={12}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Body placeholder — Phase 3 */}
        <View style={styles.body}>
          <Text style={styles.placeholder}>Task {taskId} — Phase 3</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(44, 26, 14, 0.40)',
  },
  sheet: {
    backgroundColor: sheet.backgroundColor,
    borderTopLeftRadius: sheet.borderTopLeftRadius,
    borderTopRightRadius: sheet.borderTopRightRadius,
    minHeight: 320,
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
    marginBottom: spacing.xl,
  },
  title: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.screenTitle,
    color: colors.textPrimary,
  },
  body: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
  },
  placeholder: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
  },
});
