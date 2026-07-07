/**
 * components/PinPad.tsx
 * Phase 7a — custom themed PIN pad. NO TextInput (avoids the keyboard
 * entirely). Reused by LockScreen, Onboarding (set + confirm) and the
 * Settings Change-PIN sheet.
 *
 * 4 dot indicators (Espresso outline → Burnt Sienna fill) above a 3×4 grid
 * (1–9 / blank / 0 / backspace) with the design system's hard-shadow keys.
 *
 * Contract: when 4 digits are entered, `onComplete(pin)` fires. Return (or
 * resolve) FALSE to reject — the pad shakes, flashes the dots Rust Red, and
 * clears itself. Return TRUE to accept (the parent usually navigates away;
 * the pad clears anyway so reuse is safe).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
} from 'react-native';
import { Backspace } from 'phosphor-react-native';

import { colors, typography, spacing, card } from '@/constants/theme';
import { PIN_LENGTH } from '@/lib/pin';

interface PinPadProps {
  /** Called with the full PIN. false (sync or async) → shake + clear. */
  onComplete: (pin: string) => boolean | Promise<boolean>;
  /** Disables all keys (e.g. during lockout). */
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const;

export default function PinPad({ onComplete, disabled = false }: PinPadProps) {
  const [digits, setDigits] = useState('');
  const [errorFlash, setErrorFlash] = useState(false);
  // Blocks input while onComplete is being awaited (double-entry guard).
  const busyRef = useRef(false);
  const shakeX = useRef(new Animated.Value(0)).current;

  function shake() {
    setErrorFlash(true);
    Animated.sequence(
      [10, -10, 8, -8, 4, -4, 0].map((x) =>
        Animated.timing(shakeX, { toValue: x, duration: 40, useNativeDriver: true })
      )
    ).start(() => setErrorFlash(false));
  }

  // QA M1: submission runs in an EFFECT, not inside the setState updater —
  // React may invoke updaters twice (StrictMode/concurrent), which double-fired
  // onComplete and could burn 2 of the 5 lockout attempts per wrong entry.
  // The busyRef entry guard makes the submit single-flight either way.
  const latestOnComplete = useRef(onComplete);
  latestOnComplete.current = onComplete;

  useEffect(() => {
    if (digits.length !== PIN_LENGTH || busyRef.current) return;
    busyRef.current = true;
    void (async () => {
      try {
        const accepted = await latestOnComplete.current(digits);
        if (!accepted) shake();
      } finally {
        setDigits('');
        busyRef.current = false;
      }
    })();
  }, [digits]);

  function handleKey(key: string) {
    if (disabled || busyRef.current || key === '') return;
    if (key === 'back') {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    setDigits((d) => (d.length >= PIN_LENGTH ? d : d + key));
  }

  return (
    <View style={styles.wrap}>
      {/* Dots */}
      <Animated.View
        style={[styles.dotsRow, { transform: [{ translateX: shakeX }] }]}
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => {
          const filled = i < digits.length;
          return (
            <View
              key={i}
              style={[
                styles.dot,
                filled && styles.dotFilled,
                errorFlash && styles.dotError,
              ]}
            />
          );
        })}
      </Animated.View>

      {/* Key grid */}
      <View style={[styles.grid, disabled && styles.gridDisabled]}>
        {KEYS.map((key, i) => {
          if (key === '') {
            return <View key={i} style={styles.keySpacer} />;
          }
          return (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.key,
                pressed && !disabled && styles.keyPressed,
              ]}
              onPress={() => handleKey(key)}
              disabled={disabled}
            >
              {key === 'back' ? (
                <Backspace size={24} color={colors.textPrimary} />
              ) : (
                <Text style={styles.keyText}>{key}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const KEY_SIZE = 68;

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.textPrimary,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dotError: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: KEY_SIZE * 3 + spacing.md * 2,
    gap: spacing.md,
    justifyContent: 'center',
  },
  gridDisabled: {
    opacity: 0.4,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: card.borderRadius,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...card.shadow,
  },
  keyPressed: {
    backgroundColor: colors.accent,
  },
  keySpacer: {
    width: KEY_SIZE,
    height: KEY_SIZE,
  },
  keyText: {
    fontFamily: typography.fonts.bodyBold,
    fontSize: typography.sizes.screenTitle,
    color: colors.textPrimary,
  },
});
