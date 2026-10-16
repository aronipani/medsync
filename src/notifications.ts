import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { occurrencesForDate, reminderSlots } from './schedule.ts';
import { testReminders } from './testScan.ts';
import { loadTestRecords } from './testScanStore.ts';
import { addDays, atTime, dateKey, fmt12 } from './time.ts';
import type { AppState } from './types.ts';

const CHANNEL = 'medicine-reminders';
const CATEGORY = 'dose';
export const ACTION_SNOOZE = 'snooze';
export const ACTION_SCAN = 'scan';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function setupNotifications(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Medicine reminders',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 250, 400, 250, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: ACTION_SCAN, buttonTitle: 'Scan now', options: { opensAppToForeground: true } },
    { identifier: ACTION_SNOOZE, buttonTitle: 'Remind me later', options: { opensAppToForeground: false } },
  ]);
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const asked = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  return asked.granted;
}

const content = (title: string, lines: string[]): Notifications.NotificationContentInput => ({
  title,
  body: lines.join('\n'),
  sound: 'default',
  categoryIdentifier: CATEGORY,
  priority: Notifications.AndroidNotificationPriority.MAX,
  data: { lines },
});

let running: Promise<void> = Promise.resolve();

/**
 * Rebuilds every scheduled reminder from the current schedule:
 *  - one repeating reminder per dose time (grouped across medicines and family members)
 *  - a one-off "test-scan first" reminder before doses whose medicines haven't passed a test scan (spec 11)
 *  - a one-off "still not taken" follow-up for today's and tomorrow's open slots
 * Call again after a test scan is saved, so a passed test removes its reminder.
 */
export function rescheduleAll(state: AppState): Promise<void> {
  running = running.then(() => doReschedule(state)).catch(() => {});
  return running;
}

async function doReschedule(state: AppState) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  const channelId = Platform.OS === 'android' ? CHANNEL : undefined;
  let count = 0;
  for (const slot of reminderSlots(state)) {
    const [hour, minute] = slot.time.split(':').map(Number);
    const title = `💊 Medicine time · ${fmt12(slot.time)}`;
    const trigger: Notifications.NotificationTriggerInput =
      slot.weekday === undefined
        ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId }
        : { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: slot.weekday + 1, hour, minute, channelId };
    await Notifications.scheduleNotificationAsync({ content: content(title, slot.lines), trigger });
    count++;
  }

  const now0 = new Date();
  const lead = state.settings.testReminderMin ?? 60;
  for (const r of testReminders(state, await loadTestRecords(), now0, lead, 48)) {
    if (count >= 50) break; // leave room for "not taken yet" follow-ups (iOS keeps at most 64 pending)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Check the strips for ${fmt12(r.time)}`,
        body: r.lines.join('\n'),
        sound: 'default',
        data: { lines: r.lines, screen: 'test-scan' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.when, channelId },
    });
    count++;
  }

  const { followUpMin } = state.settings;
  if (!followUpMin) return;
  const now = new Date();
  for (const day of [now, addDays(now, 1)]) {
    const date = dateKey(day);
    const open = occurrencesForDate(state, date, now).filter((o) => o.status === 'due' || o.status === 'upcoming');
    const byTime = new Map<string, string[]>();
    for (const o of open) {
      const who = state.members.length > 1 ? `${state.members.find((m) => m.id === o.memberId)?.name}: ` : '';
      byTime.set(o.time, [...(byTime.get(o.time) ?? []), `${who}${o.med.name} ${o.med.strength}`.trim()]);
    }
    for (const [time, lines] of byTime) {
      const when = new Date(atTime(date, time).getTime() + followUpMin * 60000);
      if (when <= now || count >= 60) continue; // iOS keeps at most 64 pending
      await Notifications.scheduleNotificationAsync({
        content: content(`⏰ Not taken yet · ${fmt12(time)} dose`, lines),
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId },
      });
      count++;
    }
  }
}

export async function snooze(request: Notifications.NotificationRequest, minutes: number) {
  const c = request.content;
  await Notifications.scheduleNotificationAsync({
    content: content(`Reminder again: ${(c.title ?? 'Medicine time').replace(/^\S*💊\s*/u, '')}`, (c.data?.lines as string[]) ?? [c.body ?? '']),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: minutes * 60,
      channelId: Platform.OS === 'android' ? CHANNEL : undefined,
    },
  });
}
