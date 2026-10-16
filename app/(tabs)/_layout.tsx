import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React from 'react';
import { Pressable, Text, type ColorValue } from 'react-native';
import { useTheme } from '../../src/ui.tsx';

export default function TabsLayout() {
  const t = useTheme();
  const icon = (name: keyof typeof Ionicons.glyphMap) =>
    function TabIcon({ color, size }: { color: ColorValue; size: number }) {
      return <Ionicons name={name} color={color as string} size={size} />;
    };
  // Big, labelled back button for the pages above.
  const back = () => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={() => (router.canGoBack() ? router.back() : router.navigate('/settings'))}
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 12 }}
    >
      <Ionicons name="chevron-back" size={26} color={t.brand} />
      <Text style={{ color: t.brand, fontSize: 17, fontWeight: '700' }}>Back</Text>
    </Pressable>
  );
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.sub,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line },
        headerShadowVisible: false,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', headerShown: false, tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: icon('scan-outline') }} />
      <Tabs.Screen name="meds" options={{ title: 'Schedule', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="inventory" options={{ title: 'Stock', tabBarIcon: icon('cube-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('settings-outline') }} />
      {/* Pages that open from a tab but keep the tab bar visible (no tab of their own). */}
      <Tabs.Screen name="member/[id]" options={{ href: null, title: 'Family member', headerLeft: back }} />
      <Tabs.Screen name="about" options={{ href: null, title: 'About & safety', headerLeft: back }} />
      <Tabs.Screen name="history" options={{ href: null, title: 'Earlier versions of the list', headerLeft: back }} />
      <Tabs.Screen name="report" options={{ href: null, title: 'Report a problem', headerLeft: back }} />
    </Tabs>
  );
}
