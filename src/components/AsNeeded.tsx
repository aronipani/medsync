import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { medLabel, qtyLabel } from '../schedule.ts';
import { uid, useStore } from '../store.tsx';
import { dateKey, fmt12, pad } from '../time.ts';
import type { Medication, Occurrence } from '../types.ts';
import { Card, useTheme } from '../ui.tsx';
import { MemberDot } from '../components.tsx';

/** Doses taken only when needed are logged under a key of their own: date|medId|prn-… */
export const isAsNeededKey = (key: string) => key.split('|')[2]?.startsWith('prn-') ?? false;

/**
 * Medicines taken only when needed (an inhaler, a pain reliever): no reminders; each dose is recorded here,
 * with the times taken today. The app never says how many are allowed — that's the prescription's.
 */
export function AsNeededCard({ memberId, now }: { memberId?: string; now: Date }) {
  const t = useTheme();
  const { state, record, undo } = useStore();
  const today = dateKey(now);
  const meds = state.meds.filter((m) => m.active && m.asNeeded && (!memberId || m.memberId === memberId));
  if (!meds.length) return null;
  const takenToday = (m: Medication) =>
    state.logs.filter((l) => l.medId === m.id && l.date === today && l.status === 'taken' && isAsNeededKey(l.key)).sort((a, b) => a.at.localeCompare(b.at));

  const took = (m: Medication) => {
    const d = new Date();
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    const id = `prn-${uid()}`;
    const occ: Occurrence = {
      key: `${today}|${m.id}|${id}`,
      date: today,
      time,
      memberId: m.memberId,
      med: m,
      dose: { id, timing: { kind: 'custom', time }, qty: m.asNeeded!.qty, days: [], since: d.toISOString() },
      status: 'due',
    };
    record([occ], 'taken', 'manual');
  };

  const ask = (m: Medication) => {
    const done = takenToday(m);
    const last = done[done.length - 1];
    Alert.alert(medLabel(m), `${qtyLabel(m.asNeeded!.qty, m.unit)} each time.${done.length ? `\nTaken today at ${done.map((l) => fmt12(l.time)).join(', ')}.` : ''}`, [
      { text: 'Took a dose now', onPress: () => took(m) },
      ...(last ? [{ text: `Remove the ${fmt12(last.time)} one`, style: 'destructive' as const, onPress: () => undo(last.key) }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <>
      <Text style={{ color: t.sub, fontSize: 17, fontWeight: '600', marginTop: 24, marginBottom: 8, marginLeft: 4 }}>Only when needed</Text>
      <Card style={{ paddingVertical: 4 }}>
        {meds.map((m, i) => {
          const done = takenToday(m);
          return (
            <Pressable
              key={m.id}
              accessibilityRole="button"
              accessibilityLabel={`${medLabel(m)}, record a dose`}
              onPress={() => ask(m)}
              style={{ flexDirection: 'row', alignItems: 'center', minHeight: 66, paddingVertical: 8, borderBottomWidth: i === meds.length - 1 ? 0 : 1, borderBottomColor: t.line }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 19, fontWeight: '600' }}>{medLabel(m)}</Text>
                <Text style={{ color: t.sub, fontSize: 16, marginTop: 2 }}>
                  {done.length ? `Taken today at ${done.map((l) => fmt12(l.time)).join(', ')}` : 'Not taken today'}
                </Text>
                <MemberDot memberId={m.memberId} />
              </View>
              <Text style={{ color: t.brand, fontSize: 17, fontWeight: '700' }}>Took a dose</Text>
            </Pressable>
          );
        })}
      </Card>
    </>
  );
}
