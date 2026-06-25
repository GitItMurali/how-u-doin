/**
 * components/TaskForm.tsx
 * Shared task form used by Create and Edit modals.
 * Focus: name (required) + quota chips + notes.
 * Habit: name (required) + interval chips + notes.
 * Phase 3 — preset chips (decision: tappable presets, no extra deps).
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

export const QUOTA_PRESETS = [15, 30, 45, 60, 90] as const;
export const INTERVAL_PRESETS = [15, 30, 60] as const;

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
  const [quota, setQuota] = useState(initial.quotaMinutes);
  const [interval, setInterval] = useState(initial.intervalMinutes);

  const nameValid = name.trim().length > 0;

  function handleSubmit() {
    if (!nameValid) return;
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

      {/* Quota or interval chips */}
      {type === 'focus' ? (
        <>
          <Text style={styles.label}>Daily quota</Text>
          <ChipRow
            options={QUOTA_PRESETS as unknown as number[]}
            value={quota}
            suffix="m"
            onSelect={setQuota}
          />
        </>
      ) : (
        <>
          <Text style={styles.label}>Remind every</Text>
          <ChipRow
            options={INTERVAL_PRESETS as unknown as number[]}
            value={interval}
            suffix=" min"
            onSelect={setInterval}
          />
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
        style={[styles.submit, !nameValid && styles.submitDisabled]}
        onPress={handleSubmit}
        disabled={!nameValid}
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

function ChipRow({
  options,
  value,
  suffix,
  onSelect,
}: {
  options: number[];
  value: number;
  suffix: string;
  onSelect: (v: number) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const active = opt === value;
        return (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(opt)}
            activeOpacity={0.85}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {opt}{suffix}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.white,
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
