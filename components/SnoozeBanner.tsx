/**
 * components/SnoozeBanner.tsx
 * Phase 5 — slim banner that slides in below the header while snooze is active.
 * Dusty Mauve (colors.snooze). Tapping "Resume" un-snoozes (reschedules pings).
 *
 * Animates height + opacity so it doesn't jolt the list when toggled.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { BellSimpleZ } from 'phosphor-react-native';

import { colors, typography, spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  onResume: () => void;
}

export default function SnoozeBanner({ visible, onResume }: Props) {
  const anim = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: false, // animating height
    }).start();
  }, [visible, anim]);

  // Keep mounted at height 0 when hidden so the slide animation can run both ways.
  const height = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 48] });
  const opacity = anim;

  return (
    <Animated.View
      style={[styles.wrap, { height, opacity }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <BellSimpleZ size={18} color={colors.white} weight="fill" />
      <Text style={styles.label}>Snoozed — notifications paused</Text>
      <TouchableOpacity onPress={onResume} hitSlop={10} activeOpacity={0.8}>
        <Text style={styles.resume}>Resume</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.snooze,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 10,
    overflow: 'hidden',
  },
  label: {
    flex: 1,
    marginLeft: spacing.sm,
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.white,
  },
  resume: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.white,
    textDecorationLine: Platform.OS === 'ios' ? 'none' : 'underline',
  },
});
