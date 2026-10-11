import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ACTION_SNOOZE, rescheduleAll, setupNotifications, snooze } from '../src/notifications.ts';
import { StoreProvider, useStore } from '../src/store.tsx';
import { dateKey } from '../src/time.ts';
import { PeriodProvider, useTheme } from '../src/ui.tsx';

function ReminderSync() {
  const { state, ready, now } = useStore();
  const today = dateKey(now);
  const snoozeMin = useRef(state.settings.snoozeMin);
  snoozeMin.current = state.settings.snoozeMin;
  // Reschedule when the schedule, today's logs or the day changes.
  const signature = useMemo(
    () =>
      JSON.stringify([
        state.members,
        state.meds.map((m) => [m.id, m.name, m.strength, m.unit, m.doses, m.active, m.endDate, m.memberId]),
        state.settings,
        state.logs.filter((l) => l.date >= today).map((l) => l.key),
        today,
      ]),
    [state, today],
  );
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => rescheduleAll(state), 600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ready]);

  useEffect(() => {
    setupNotifications().catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      if (res.actionIdentifier === ACTION_SNOOZE) {
        snooze(res.notification.request, snoozeMin.current).catch(() => {});
        return;
      }
      router.navigate('/scan');
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function Themed() {
  const { now } = useStore();
  return (
    <PeriodProvider now={now}>
      <Shell />
    </PeriodProvider>
  );
}

function Shell() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.isDark ? 'light' : 'dark'} />
      <ReminderSync />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.card },
          headerTintColor: t.text,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="med/[id]" options={{ presentation: 'modal', title: 'Medicine' }} />
        <Stack.Screen name="member/[id]" options={{ presentation: 'modal', title: 'Family member' }} />
        <Stack.Screen name="settings" options={{ title: 'Settings' }} />
        <Stack.Screen name="add" options={{ presentation: 'modal', title: 'Add medicine' }} />
        <Stack.Screen name="scan-add" options={{ title: 'Scan to add' }} />
        <Stack.Screen name="rx-review" options={{ title: 'Check prescription' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Themed />
      </StoreProvider>
    </SafeAreaProvider>
  );
}
