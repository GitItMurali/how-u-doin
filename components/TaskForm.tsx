/**
 * components/TaskForm.tsx
 * Shared task form used by Create and Edit modals.
 * Focus: name (required) + quota duration wheel + notes.
 * Habit: name (required) + interval duration wheel + notes.
 * Phase 3 shipped preset chips; UX-WHEEL-01 replaced them with a timer-style
 * scroll wheel (DurationPicker — hours + minutes, '00' included, no extra deps).
 * QA D7: the leftover preset ARRAYS (only ever indexed for two numbers) became
 * DEFAULT_QUOTA_MINUTES / DEFAULT_INTERVAL_MINUTES.
 *
 * Type cannot be changed after creation: `lockType` hides the type selector.
 * Keyboard handling: ScrollView with bottom padding so quota/notes/submit
 * scroll above the keyboard (FIX-P3: keyboard was hiding lower fields).
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Target, Repeat } from 'phosphor-react-native';
import { colors, typography, spacing, card } from '@/constants/theme';
import type { TaskType } from '@/db';
import DurationPicker, { snapDuration } from '@/components/DurationPicker';

export const DEFAULT_QUOTA_MINUTES = 30;
export const DEFAULT_INTERVAL_MINUTES = 15;

export interface TaskFormValue {
  type: TaskType;
  name: string;
  notes: string;
  quotaMinutes: number;     // focus
  intervalMinutes: number;  // habit
}

interface TaskFormProps {
  initial: TaskFormValue;
  lockType?: boolean;        // edit mode — type selector hidden
  submitLabel: string;
  onSubmit: (value: TaskFormValue) => void;
}

export default function TaskForm({
  initial,
  lockType = false,
  submitLabel,
  onSubmit,
}: TaskFormProps) {
  const [type, setType] = useState<TaskType>(initial.type);
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.notes);
  // Snap legacy off-step values (e.g. an old 17-min quota) onto the wheel grid
  // so what the user sees is exactly what gets saved.
  const [quota, setQuota] = useState(() => snapDuration(initial.quotaMinutes));
  const [interval, setInterval] = useState(() => snapDuration(initial.intervalMinutes));

  const nameValid = name.trim().length > 0;
  // 0h 00m is selectable on the wheel but never submittable — a task with no
  // time budget / interval is meaningless (mirrors the name-required rule).
  const durationValid = type === 'focus' ? quota > 0 : interval > 0;
  const formValid = nameValid && durationValid;

  function handleSubmit() {
    if (!formValid) return;
    onSubmit({
      type,
      name: name.trim(),
      notes: notes.trim(),
      quotaMinutes: quota,
      intervalMinutes: interval,
    });
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      nestedScrollEnabled
    >
      {/* Type selector (create only) */}
      {!lockType && (
        <View style={styles.typeRow}>
          <TypeCard
            label="Focus"
            sub="Quota + timer"
            selected={type === 'focus'}
            onPress={() => setType('focus')}
            icon={<Target size={22} color={type === 'focus' ? colors.white : colors.primary} weight="fill" />}
          />
          <TypeCard
            label="Habit"
            sub="Interval ping"
            selected={type === 'habit'}
            onPress={() => setType('habit')}
            icon={<Repeat size={22} color={type === 'habit' ? colors.white : colors.accent} weight="fill" />}
          />
        </View>
      )}

      {/* Name */}
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder={type === 'focus' ? 'e.g. Deep work' : 'e.g. Drink water'}
        placeholderTextColor={colors.textSecondary}
        maxLength={60}
        returnKeyType="done"
      />

      {/* Quota or interval — timer-style scroll wheel (UX-WHEEL-01) */}
      {type === 'focus' ? (
        <>
          <Text style={styles.label}>Daily quota</Text>
          <DurationPicker value={quota} onChange={setQuota} />
          {!durationValid && (
            <Text style={styles.durationHint}>Pick a quota above 0 minutes.</Text>
          )}
        </>
      ) : (
        <>
          <Text style={styles.label}>Remind every</Text>
          <DurationPicker value={interval} onChange={setInterval} />
          {!durationValid && (
            <Text style={styles.durationHint}>Pick an interval above 0 minutes.</Text>
          )}
        </>
      )}

      {/* Notes */}
      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        style={[styles.input, styles.notesInput]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Add a note"
        placeholderTextColor={colors.textSecondary}
        multiline
        maxLength={200}
      />

      {/* Submit */}
      <TouchableOpacity
        style={[styles.submit, !formValid && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={!formValid}
        activeOpacity={0.85}
      >
        <Text style={styles.submitText}>{submitLabel}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function TypeCard({
  label,
  sub,
  selected,
  onPress,
  icon,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
  icon: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      style={[styles.typeCard, selected && styles.typeCardSelected]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {icon}
      <Text style={[styles.typeLabel, selected && styles.typeLabelSelected]}>{label}</Text>
      <Text style={[styles.typeSub, selected && styles.typeSubSelected]}>{sub}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  typeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  typeCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: card.borderRadius,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeCardSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeLabel: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: typography.sizes.cardTitle,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  typeLabelSelected: {
    color: colors.white,
  },
  typeSub: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  typeSubSelected: {
    color: colors.white,
  },
  label: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: card.borderRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textPrimary,
  },
  notesInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  durationHint: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.caption,
    color: colors.danger,
    marginTop: spacing.sm,
  },
  submit: {
    backgroundColor: colors.primary,
    borderRadius: card.borderRadius,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.xl,
    ...card.shadow,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: typography.sizes.cardTitle,
    color: colors.white,
  },
});
