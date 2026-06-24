/**
 * components/navigation/TabNavigator.tsx
 * Bottom tab bar — Home / History / Settings
 * Design: Toasted Cream bg, Burnt Sienna active, Phosphor icons, no labels
 * Phase 2
 */
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
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
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
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
    height: bottomNav.height + (Platform.OS === 'android' ? 0 : 20),
    paddingBottom: Platform.OS === 'android' ? 8 : 20,
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
