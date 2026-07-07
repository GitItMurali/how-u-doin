/**
 * components/FilterPills.tsx
 * Phase 7b — reusable segmented pill control, generalized from the Home
 * Focus|Habits pill row (same pillTab.* tokens). History uses the compact
 * variant (4 pills); Home adopted it in 7c with the default body-size labels.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

import { colors, pillTab, typography } from '@/constants/theme';

export interface FilterPillOption<K extends string = string> {
  key: K;
  label: string;
}

interface FilterPillsProps<K extends string> {
  options: FilterPillOption<K>[];
  active: K;
  onChange: (key: K) => void;
  /** Smaller caption-size labels — for rows of 4+ pills (History). */
  compact?: boolean;
}

export default function FilterPills<K extends string>({
  options,
  active,
  onChange,
  compact = false,
}: FilterPillsProps<K>) {
  return (
    <View style={styles.container}>
      {options.map((opt) => {
        const isActive = opt.key === active;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onChange(opt.key)}
            activeOpacity={0.8}
          >
            <Text
              style={[
                styles.pillText,
                compact && styles.pillTextCompact,
                isActive && styles.pillTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
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
  pillTextCompact: {
    fontSize: typography.sizes.caption,
  },
  pillTextActive: {
    color: pillTab.activeTextColor,
  },
});
