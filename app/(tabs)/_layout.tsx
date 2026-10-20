import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { type ColorValue } from 'react-native';
import { BackButton } from '../../src/components/BackButton.tsx';
import { useTheme } from '../../src/ui.tsx';

/** One bottom bar for everyone: Today, Scan, Medicines, Settings, always visible (no separate helper view). */
export default function TabsLayout() {
  const t = useTheme();
  const icon = (name: keyof typeof Ionicons.glyphMap) =>
    function TabIcon({ color, size }: { color: ColorValue; size: number }) {
      return <Ionicons name={name} color={color as string} size={size + 4} />;
    };
  // Big, labelled back button for the pages above (same one the stack pages use).
  const back = () => <BackButton />;
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.sub,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line },
        headerShadowVisible: false,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '700' },
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', headerShown: false, tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: icon('scan-outline') }} />
      <Tabs.Screen name="meds" options={{ title: 'Medicines', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline') }} />
      {/* Stock is part of Medicines now; this page opens from a medicine or the low-stock line on Today. */}
      <Tabs.Screen name="inventory" options={{ href: null, title: 'Stock', headerLeft: back }} />
      <Tabs.Screen name="buy" options={{ href: null, title: 'Buy medicines', headerLeft: back }} />
      {/* Pages that open from a tab but keep the tab bar visible (no tab of their own). */}
      <Tabs.Screen name="member/[id]" options={{ href: null, title: 'Family member', headerLeft: back }} />
      <Tabs.Screen name="about" options={{ href: null, title: 'About & safety', headerLeft: back }} />
      <Tabs.Screen name="history" options={{ href: null, title: 'Earlier versions of the list', headerLeft: back }} />
    </Tabs>
  );
}
