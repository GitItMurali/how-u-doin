/**
 * app/_layout.tsx
 * Root layout — DB init, font loading, AppProvider, navigation root.
 * Phase 2: Navigation structure.
 * Phase 3: initDb() gate added — DB must be ready before any screen queries it.
 * Phase 5: notification runtime init + tap/observer wiring (navigationRef).
 * Phase 6: daily reset — background-fetch registration + foreground safety net.
 * Phase 7a: gate state machine (boot → onboarding → locked → ready). The gate
 *           lives HERE, above the NavigationContainer — lock/onboarding never
 *           enter the nav stack, so there are no back-button or deep-link
 *           bypasses. Providers (Timer/Snooze/DailyResetRunner) stay mounted
 *           around the gate so the daily reset still runs while locked.
 *           Relock policy: cold start + every AppState exit from 'active'
 *           (only when a PIN exists).
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, AppState } from 'react-native';
import {
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Fraunces_900Black } from '@expo-google-fonts/fraunces';
import {
  DMSans_400Regular,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';

import { TimerProvider, useTimer } from '@/hooks/useTimer';
import { SnoozeProvider, useSnooze } from '@/hooks/snooze';
import { useDailyReset } from '@/hooks/useDailyReset';
import TabNavigator from '@/components/navigation/TabNavigator';
import CreateTaskModal from '@/app/task/create';
import EditTaskModal from '@/app/task/[id]';
import { colors, typography, spacing } from '@/constants/theme';
import { initDb, isOnboardingComplete } from '@/db';
import { isPinSet } from '@/lib/pin';
import LockScreen from '@/app/lock';
import Onboarding from '@/app/onboarding';
import { initNotifications } from '@/notifications/setup';
import { useNotificationObserver } from '@/notifications/useNotificationObserver';
// Side-effect import: defines the headless background task at module top level
// (required by expo-task-manager), and exposes the idempotent register call.
import { registerDailyResetTask } from '@/notifications/backgroundReset';

export type RootStackParamList = {
  Tabs: undefined;
  CreateTask: { defaultType?: 'focus' | 'habit' } | undefined;
  EditTask: { taskId: string };
};

const Stack = createStackNavigator<RootStackParamList>();

// Navigation ref so notification taps can route from outside the React tree.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/**
 * Phase 6 — foreground daily-reset safety net. Renders nothing.
 * Lives INSIDE TimerProvider + SnoozeProvider so it can:
 *   - pause a running Focus timer BEFORE the reset closes its session
 *     (elapsed time gets logged instead of orphan-recovered),
 *   - re-sync the snooze UI AFTER the reset cleared snooze_active in the DB
 *     (deactivateSnooze after runReset is a safe no-op reschedule — the
 *     notification_schedule table was just wiped and freshly rescheduled).
 */
function DailyResetRunner() {
  const { activeTaskId, pauseTimer } = useTimer();
  const { snoozed, deactivateSnooze } = useSnooze();

  useDailyReset({
    beforeReset: async () => {
      if (activeTaskId !== null) {
        await pauseTimer(activeTaskId);
      }
    },
    afterReset: async () => {
      if (snoozed) {
        await deactivateSnooze();
      }
    },
  });

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_900Black,
    DMSans_400Regular,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  // DB init gate — open the database + run migrations before any screen mounts.
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Phase 7a gate. 'boot' until the onboarding/PIN decision is made.
  const [gate, setGate] = useState<'boot' | 'onboarding' | 'locked' | 'ready'>('boot');
  // Whether a PIN exists — governs relock-on-background. Kept in a ref so the
  // AppState listener never holds a stale value.
  const pinExistsRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await initDb();
        if (mounted) setDbReady(true);
      } catch (e) {
        if (mounted) setDbError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Phase 7a: entry decision once the DB is up. SecureStore failure here must
  // not brick the app — treat "can't read PIN" as "no PIN" (local-only threat
  // model; the alternative is an unusable app).
  useEffect(() => {
    if (!dbReady) return;
    let mounted = true;
    (async () => {
      const onboarded = await isOnboardingComplete();
      let pinExists = false;
      try {
        pinExists = await isPinSet();
      } catch {
        pinExists = false;
      }
      if (!mounted) return;
      pinExistsRef.current = pinExists;
      if (!onboarded) setGate('onboarding');
      else if (pinExists) setGate('locked');
      else setGate('ready');
    })();
    return () => {
      mounted = false;
    };
  }, [dbReady]);

  // Phase 7a: relock whenever the app leaves 'active' while unlocked.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && pinExistsRef.current) {
        setGate((g) => (g === 'ready' ? 'locked' : g));
      }
    });
    return () => sub.remove();
  }, []);

  // Phase 5: notification runtime setup once the DB is ready (handler + channel).
  // Phase 7a: the OS permission prompt is only fired here AFTER onboarding has
  // run (onboarding step 5 owns the first ask). Phase 6: register the background
  // daily-reset task (idempotent, interval-based — never needs re-registration
  // when reset_time changes).
  useEffect(() => {
    if (!dbReady) return;
    void (async () => {
      void initNotifications(await isOnboardingComplete());
      void registerDailyResetTask();
    })();
  }, [dbReady]);

  // Phase 5: observe notification taps (routing) + interval fires (reschedule).
  useNotificationObserver(navigationRef);

  if (dbError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Couldn't start the database</Text>
        <Text style={styles.errorBody}>{dbError}</Text>
      </View>
    );
  }

  if (!fontsLoaded || !dbReady || gate === 'boot') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <TimerProvider>
            <SnoozeProvider>
              <DailyResetRunner />
              {gate === 'onboarding' ? (
                <Onboarding
                  onDone={() => {
                    // Onboarding just set a PIN — arm relock-on-background and
                    // enter the app unlocked (they proved the PIN seconds ago).
                    pinExistsRef.current = true;
                    setGate('ready');
                  }}
                />
              ) : gate === 'locked' ? (
                <LockScreen onUnlocked={() => setGate('ready')} />
              ) : (
                <NavigationContainer ref={navigationRef}>
                  <Stack.Navigator screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="Tabs" component={TabNavigator} />
                    <Stack.Screen
                      name="CreateTask"
                      component={CreateTaskModal}
                      options={{
                        presentation: 'modal',
                        cardStyle: { backgroundColor: 'transparent' },
                      }}
                    />
                    <Stack.Screen
                      name="EditTask"
                      component={EditTaskModal}
                      options={{
                        presentation: 'modal',
                        cardStyle: { backgroundColor: 'transparent' },
                      }}
                    />
                  </Stack.Navigator>
                </NavigationContainer>
              )}
            </SnoozeProvider>
        </TimerProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = {
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: spacing.xl,
  },
  errorTitle: {
    fontFamily: typography.fonts.heading,
    fontSize: typography.sizes.screenTitle,
    color: colors.danger,
    marginBottom: spacing.sm,
    textAlign: 'center' as const,
  },
  errorBody: {
    fontFamily: typography.fonts.body,
    fontSize: typography.sizes.body,
    color: colors.textSecondary,
    textAlign: 'center' as const,
  },
};
