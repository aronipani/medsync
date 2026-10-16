import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import type { ColorValue } from 'react-native';
import { useTheme } from '../../src/ui.tsx';

export default function TabsLayout() {
  const t = useTheme();
  const icon = (name: keyof typeof Ionicons.glyphMap) =>
    function TabIcon({ color, size }: { color: ColorValue; size: number }) {
      return <Ionicons name={name} color={color as string} size={size} />;
    };
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.sub,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.line },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: icon('scan-outline') }} />
      <Tabs.Screen name="meds" options={{ title: 'Schedule', tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="inventory" options={{ title: 'Stock', tabBarIcon: icon('cube-outline') }} />
    </Tabs>
  );
}
