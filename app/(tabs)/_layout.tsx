import { Ionicons } from '@expo/vector-icons';
import { router, Tabs } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { AppState, Pressable, Text, type ColorValue } from 'react-native';
import { useStore } from '../../src/store.tsx';
import { useTheme } from '../../src/ui.tsx';

/** The helper view closes by itself when the app has been away this long, so the patient finds the simple view again. */
const HELPER_TIMEOUT_MS = 15 * 60 * 1000;

export default function TabsLayout() {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  // Simple view (the patient's): two big tabs, Today and Scan. Helper view adds Medicines and Settings.
  const helper = !!state.settings.helperView;
  const latest = useRef(state.settings);
  latest.current = state.settings;
  const awayAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') awayAt.current = Date.now();
      else if (awayAt.current && latest.current.helperView && Date.now() - awayAt.current > HELPER_TIMEOUT_MS) {
        saveSettings({ ...latest.current, helperView: false });
        router.navigate('/');
      }
    });
    return () => sub.remove();
  }, [saveSettings]);
  const icon = (name: keyof typeof Ionicons.glyphMap) =>
    function TabIcon({ color, size }: { color: ColorValue; size: number }) {
      return <Ionicons name={name} color={color as string} size={helper ? size : size + 6} />;
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
        tabBarLabelStyle: { fontSize: helper ? 13 : 16, fontWeight: '700' },
        headerStyle: { backgroundColor: t.bg },
        headerTintColor: t.text,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', headerShown: false, tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="scan" options={{ title: 'Scan', tabBarIcon: icon('scan-outline') }} />
      <Tabs.Screen name="meds" options={{ title: 'Medicines', href: helper ? undefined : null, tabBarIcon: icon('list-outline') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', href: helper ? undefined : null, tabBarIcon: icon('settings-outline') }} />
      {/* Stock is part of Medicines now; this page opens from a medicine or the low-stock line on Today. */}
      <Tabs.Screen name="inventory" options={{ href: null, title: 'Stock', headerLeft: back }} />
      {/* Pages that open from a tab but keep the tab bar visible (no tab of their own). */}
      <Tabs.Screen name="member/[id]" options={{ href: null, title: 'Family member', headerLeft: back }} />
      <Tabs.Screen name="about" options={{ href: null, title: 'About & safety', headerLeft: back }} />
      <Tabs.Screen name="history" options={{ href: null, title: 'Earlier versions of the list', headerLeft: back }} />
      <Tabs.Screen name="report" options={{ href: null, title: 'Report a problem', headerLeft: back }} />
    </Tabs>
  );
}
