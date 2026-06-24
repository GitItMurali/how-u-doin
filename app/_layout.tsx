/**
 * app/_layout.tsx
 * Root layout — font loading, AppProvider, navigation root
 * Phase 2: Navigation structure
 */
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
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
import TabNavigator from '@/components/navigation/TabNavigator';
import CreateTaskModal from '@/app/task/create';
import EditTaskModal from '@/app/task/[id]';
import { colors } from '@/constants/theme';

export type RootStackParamList = {
  Tabs: undefined;
  CreateTask: { defaultType?: 'focus' | 'habit' } | undefined;
  EditTask: { taskId: string };
};

const Stack = createStackNavigator<RootStackParamList>();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_900Black,
    DMSans_400Regular,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <NavigationContainer>
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
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
