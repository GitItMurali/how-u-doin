/**
 * app/lock.tsx
 * Phase 7a — Lock screen. NOT a nav route: rendered by the RootLayout gate
 * above the NavigationContainer, so back-button / deep-links can't bypass it.
 *
 * 7c: real HUD logo mark (assets/logo.png) above the wordmark.
 *
 * Biometrics: auto-prompts ONCE on mount when enabled + enrolled; cancel or
 * failure falls through to the PIN silently (no error state, per plan).
 *
 * Lockout: after 5 misses lib/pin.ts persists pin_lockout_until — the pad
 * disables and a 1s countdown shows until it expires (survives force-quit).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Fingerprint } from 'phosphor-react-native';

import { colors, typography, spacing } from '@/constants/theme';
import { verifyPin, PinStorageError } from '@/lib/pin';
import { isBiometricsEnabled } from '@/db';
import { useLockoutCountdown } from '@/hooks/useLockoutCountdown';
import PinPad from '@/components/PinPad';

interface LockScreenProps {
  onUnlocked: () => void;
}

export default function LockScreen({ onUnlocked }: LockScreenProps) {
  const [attemptsHint, setAttemptsHint] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [biometricsReady, setBiometricsReady] = useState(false);

  // ── Lockout countdown (QA C3: shared hook, also used by Change-PIN sheet) ──
  const { lockoutSeconds, lockedOut, syncFromStore, startLockout } = useLockoutCountdown();

  useEffect(() => {
    void syncFromStore();
  }, [syncFromStore]);

  // ── Biometrics ── availability check + one auto-prompt on mount.
  const promptedRef = useRef(false);

  const tryBiometrics = useCallback(async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock How U Doin',
      });
      if (result.success) onUnlocked();
      // Cancel/fail → fall through to PIN silently.
    } catch {
      // Same: PIN remains available.
    }
  }, [onUnlocked]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [enabled, hasHw, enrolled] = await Promise.all([
          isBiometricsEnabled(),
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        const available = enabled && hasHw && enrolled;
        if (!mounted) return;
        setBiometricsReady(available);
        if (available && !promptedRef.current) {
          promptedRef.current = true;
          void tryBiometrics();
        }
      } catch {
        // Biometric probe failed — PIN-only.
      }
    })();
    return () => {
      mounted = false;
    };
  }, [tryBiometrics]);

  // ── PIN entry ──
  async function handlePin(pin: string): Promise<boolean> {
    if (lockedOut) return false;
    try {
      const result = await verifyPin(pin);
      if (result.ok) {
        setAttemptsHint(null);
        onUnlocked();
        return true;
      }
      if (result.lockoutMs > 0) {
        startLockout(result.lockoutMs);
        setAttemptsHint(null);
      } else {
        setAttemptsHint(
          result.attemptsLeft === 1
            ? '1 try left'
            : `${result.attemptsLeft} tries left`
        );
      }
      return false;
    } catch (e) {
      setStorageError(
        e instanceof PinStorageError
          ? 'Secure storage is unavailable. Restart the app and try again.'
          : 'Something went wrong. Try again.'
      );
      return false;
    }
  }

  return (
    <View style={styles.container}>
      {/* HUD logo mark (7c) */}
      <Image source={require('../assets/logo.png')} style={styles.logoImg} />
      <Text style={styles.logo}>How U Doin</Text>
      <Text style={styles.subtitle}>Enter your PIN</Text>

      <PinPad onComplete={handlePin} disabled={lockedOut} />

      {/* Status line: lockout countdown > attempts hint > storage error */}
      <View style={styles.statusWrap}>
        {lockedOut ? (
          <Text style={styles.lockoutText}>
            Too many tries. Try again in {lockoutSeconds}s
          </Text>
        ) : storageError ? (
          <Text style={styles.lockoutText}>{storageError}</Text>
        ) : attemptsHint ? (
          <Text style={styles.hintText}>{attemptsHint}</Text>
        ) : null}
      </View>

      {/* Biometric retry (auto-prompt already fired on mount) */}
      {biometricsReady && !lockedOut && (
        <TouchableOpacity
          style={styles.bioButton}
          onPress={tryBiometrics}
          activeOpacity={0.85}
        >
          <Fingerprint size={20} color={colors.primary} weight="bold" />
          <Text style={styles.bioText}>Use fingerprint</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoImg: {
    width: 96,
    height: 96,
    marginBottom: spacing.md,
  },
  logo: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.appTitle,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  statusWrap: {
    minHeight: 24,
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  lockoutText: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.danger,
    textAlign: 'center',
  },
  hintText: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
  },
  bioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  bioText: {
    fontFamily: typography.fonts.bodySemiBold,
    fontSize: typography.sizes.body,
    color: colors.primary,
  },
});
