import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FirstRunNotice } from '../src/components/FirstRunNotice.tsx';
import { needsNotice } from '../src/legal.ts';
import { ACTION_SNOOZE, rescheduleAll, setupNotifications, snooze } from '../src/notifications.ts';
import { StoreProvider, useStore } from '../src/store.tsx';
import { phrase } from '../src/phrases.ts';
import { dueNow } from '../src/schedule.ts';
import { say } from '../src/speech.ts';
import { dateKey } from '../src/time.ts';
import { PeriodProvider, useTheme } from '../src/ui.tsx';

function ReminderSync() {
  const { state, ready, now } = useStore();
  const today = dateKey(now);
  const snoozeMin = useRef(state.settings.snoozeMin);
  snoozeMin.current = state.settings.snoozeMin;
  const latest = useRef(state);
  latest.current = state;
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
    // Reminder arrives while the app is open: say it in the language of whoever has a dose due.
    const received = Notifications.addNotificationReceivedListener(() => {
      const st = latest.current;
      const who = st.members.find((m) => m.voice !== false && dueNow(st, new Date(), m.id).length);
      if (who) say(who.language ?? 'en', `${who.name}. ${phrase(who.language ?? 'en', 'time')}`, undefined, `${who.name}. ${phrase('en', 'time')}`);
    });
    return () => {
      sub.remove();
      received.remove();
    };
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
  const { state, ready } = useStore();
  if (!ready) return <View style={{ flex: 1, backgroundColor: t.bg }} />;
  if (needsNotice(state.settings)) return <FirstRunNotice />;
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
        <Stack.Screen name="history" options={{ title: 'Schedule history' }} />
        <Stack.Screen name="about" options={{ title: 'About & safety' }} />
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
