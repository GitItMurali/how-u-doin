/**
 * components/WheelPicker.tsx
 * Timer-style scroll wheel — pure JS ScrollView with snap, NO native picker dep
 * (keeps the Autumn Bold theme and avoids a rebuild; same reasoning as the
 * Phase 6 steppers it upgrades).
 *
 * One vertical wheel. Items snap to a highlighted center band. Compose several
 * side-by-side for duration (DurationPicker) or clock time (TimeOfDayPicker).
 *
 * Uses a plain ScrollView, NOT FlatList (FIX-WHEEL-01): wheels have ≤13 rows so
 * virtualization buys nothing, and a FlatList inside the TaskForm ScrollView
 * triggered RN's "VirtualizedLists should never be nested inside plain
 * ScrollViews" console error. ScrollView-in-ScrollView is fine.
 *
 * Design tokens only (constants/theme.ts).
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';

import { colors, typography } from '@/constants/theme';

export const WHEEL_ITEM_HEIGHT = 40;

interface WheelPickerProps {
  /** Display strings, one per row (e.g. ['00','05','10',...]). */
  data: string[];
  /** Index of the currently selected row. */
  selectedIndex: number;
  /** Fired when the wheel settles on a new row. */
  onChange: (index: number) => void;
  /** Column width (dp). */
  width?: number;
  /** Rows visible at once (odd). 3 keeps sheets compact with the keyboard up. */
  visibleRows?: 3 | 5;
}

export default function WheelPicker({
  data,
  selectedIndex,
  onChange,
  width = 64,
  visibleRows = 3,
}: WheelPickerProps) {
  const listRef = useRef<ScrollView>(null);
  // Last index this wheel emitted (or was told to show). Guards the
  // prop-sync effect below from fighting an in-progress user scroll.
  const lastIndexRef = useRef(selectedIndex);

  const padHeight = ((visibleRows - 1) / 2) * WHEEL_ITEM_HEIGHT;
  const wheelHeight = visibleRows * WHEEL_ITEM_HEIGHT;

  const clampIndex = useCallback(
    (i: number) => Math.max(0, Math.min(data.length - 1, i)),
    [data.length]
  );

  // External selectedIndex change (e.g. parent snapped an off-step value) —
  // scroll the wheel to match. Skipped when we caused the change ourselves.
  useEffect(() => {
    if (selectedIndex !== lastIndexRef.current) {
      lastIndexRef.current = selectedIndex;
      listRef.current?.scrollTo({
        y: clampIndex(selectedIndex) * WHEEL_ITEM_HEIGHT,
        animated: false,
      });
    }
  }, [selectedIndex, clampIndex]);

  const handleMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const idx = clampIndex(
        Math.round(e.nativeEvent.contentOffset.y / WHEEL_ITEM_HEIGHT)
      );
      if (idx !== lastIndexRef.current) {
        lastIndexRef.current = idx;
        onChange(idx);
      }
    },
    [clampIndex, onChange]
  );

  return (
    <View style={[styles.wheel, { width, height: wheelHeight }]}>
      <ScrollView
        ref={listRef}
        contentContainerStyle={{ paddingVertical: padHeight }}
        contentOffset={{ x: 0, y: clampIndex(selectedIndex) * WHEEL_ITEM_HEIGHT }}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        nestedScrollEnabled
      >
        {data.map((item, index) => (
          <View key={index} style={styles.item}>
            <Text
              style={[
                styles.itemText,
                index === selectedIndex && styles.itemTextSelected,
              ]}
            >
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
      {/* Center highlight band — marks the selected row. Touch-transparent. */}
      <View
        pointerEvents="none"
        style={[styles.band, { top: padHeight, height: WHEEL_ITEM_HEIGHT }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wheel: {
    overflow: 'hidden',
  },
  item: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.cardTitle,
    color: colors.textSecondary,
    opacity: 0.55,
    fontVariant: ['tabular-nums'],
  },
  itemTextSelected: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: typography.sizes.cardTitle,
    color: colors.textPrimary,
    opacity: 1,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 8,
    backgroundColor: 'rgba(224, 138, 47, 0.12)', // Deep Amber wash
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(44, 26, 14, 0.15)',       // Espresso 15%
  },
});
