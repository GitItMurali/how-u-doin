/**
 * components/navigation/TabNavigator.tsx
 * Bottom tab bar — Home / History / Settings
 * Design: Toasted Cream bg, Burnt Sienna active, Phosphor icons, no labels
 * Phase 2
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { House, ChartBar, Gear } from 'phosphor-react-native';

import HomeScreen from '@/app/(tabs)/index';
import HistoryScreen from '@/app/(tabs)/history';
import SettingsScreen from '@/app/(tabs)/settings';
import { colors, bottomNav } from '@/constants/theme';

export type TabParamList = {
  Home: undefined;
  History: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

function TabBarIcon({
  Icon,
  focused,
}: {
  Icon: React.ComponentType<{ size: number; color: string; weight: 'fill' | 'regular' }>;
  focused: boolean;
}) {
  return (
    <View style={styles.iconWrapper}>
      <Icon
        size={bottomNav.iconSize}
        color={focused ? colors.bottomNavActive : colors.textSecondary}
        weight={focused ? 'fill' : 'regular'}
      />
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

export default function TabNavigator() {
  // Edge-to-edge fix (2026-07-07): Android 15+ draws the app BEHIND the system
  // nav bar. A fixed tabBarStyle height defeats react-navigation's built-in
  // safe-area handling, so the tab bar slid under 3-button nav bars (~48dp
  // inset); gesture phones have a tiny inset, which is why the OnePlus looked
  // fine. max(inset, 8) preserves the old 8dp padding when there is no bar,
  // and also handles the iOS home-indicator (34dp) without Platform forks.
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 8);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: [
          styles.tabBar,
          { height: bottomNav.height - 8 + bottomPad, paddingBottom: bottomPad },
        ],
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabBarIcon Icon={House} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabBarIcon Icon={ChartBar} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabBarIcon Icon={Gear} focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: bottomNav.backgroundColor,
    borderTopColor: bottomNav.borderTopColor,
    borderTopWidth: bottomNav.borderTopWidth,
    // height + paddingBottom are set inline from safe-area insets — see above.
    paddingTop: 8,
    elevation: 8,
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 0,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  activeIndicator: {
    width: bottomNav.activeIndicatorHeight * 6,
    height: bottomNav.activeIndicatorHeight,
    borderRadius: bottomNav.activeIndicatorBorderRadius,
    backgroundColor: bottomNav.activeIndicatorColor,
  },
});
