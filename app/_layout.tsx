/**
 * app/_layout.tsx
 * Root layout — DB init, font loading, AppProvider, navigation root.
 * Phase 2: Navigation structure.
 * Phase 3: initDb() gate added — DB must be ready before any screen queries it.
 * Phase 5: notification runtime init + tap/observer wiring (navigationRef).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
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

import { AppProvider } from '@/context/AppContext';
import { TimerProvider } from '@/hooks/useTimer';
import { SnoozeProvider } from '@/hooks/snooze';
import TabNavigator from '@/components/navigation/TabNavigator';
import CreateTaskModal from '@/app/task/create';
import EditTaskModal from '@/app/task/[id]';
import { colors, typography, spacing } from '@/constants/theme';
import { initDb } from '@/db';
import { initNotifications } from '@/notifications/setup';
import { useNotificationObserver } from '@/notifications/useNotificationObserver';

export type RootStackParamList = {
  Tabs: undefined;
  CreateTask: { defaultType?: 'focus' | 'habit' } | undefined;
  EditTask: { taskId: string };
};

const Stack = createStackNavigator<RootStackParamList>();

// Navigation ref so notification taps can route from outside the React tree.
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

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

  // Phase 5: notification runtime setup once the DB is ready (handler + channel
  // + permission). Fire-and-forget; scheduling happens on task create / timer.
  useEffect(() => {
    if (!dbReady) return;
    void initNotifications();
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

  if (!fontsLoaded || !dbReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <TimerProvider>
            <SnoozeProvider>
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
            </SnoozeProvider>
          </TimerProvider>
        </AppProvider>
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
