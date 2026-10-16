import { Ionicons } from '@expo/vector-icons';
import { CollectCard } from '../../src/components/CollectCard.tsx';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { MemberDot, MemberPicker, StatusBadge } from '../../src/components.tsx';
import { describeTiming, medLabel, occurrencesForDate, qtyLabel } from '../../src/schedule.ts';
import { PERIOD_ICON, PERIOD_LABEL, periodOfTime } from '../../src/period.ts';
import { useStore } from '../../src/store.tsx';
import { addDays, atTime, dateKey, fmt12, fmtDay } from '../../src/time.ts';
import type { Occurrence } from '../../src/types.ts';
import { Button, Card, Empty, s, useTheme } from '../../src/ui.tsx';

export default function Today() {
  const t = useTheme();
  const { state, now, record, undo } = useStore();
  const [memberId, setMemberId] = useState<string | undefined>();
  const [offset, setOffset] = useState(0);
  const today = dateKey(now);
  const date = dateKey(addDays(now, offset));

  const occs = useMemo(() => occurrencesForDate(state, date, now, memberId), [state, date, now, memberId]);
  const groups = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of occs) m.set(o.time, [...(m.get(o.time) ?? []), o]);
    return [...m.entries()];
  }, [occs]);
  const dueCount = offset === 0 ? occs.filter((o) => o.status === 'due').length : 0;
  const taken = occs.filter((o) => o.status === 'taken').length;
  const low = state.meds.filter((m) => m.active && (!memberId || m.memberId === memberId) && m.stock <= m.lowStockAt);

  const act = (o: Occurrence) => {
    const label = `${medLabel(o.med)} · ${fmt12(o.time)}`;
    if (o.log) {
      const at = new Date(o.log.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      Alert.alert(label, o.log.status === 'taken' ? `Taken at ${at}.` : `Skipped at ${at}.`, [
        ...(o.log.status !== 'taken' ? [{ text: 'I took it after all', onPress: () => record([o], 'taken', 'manual') }] : []),
        {
          text: o.log.status === 'taken' ? 'I did not take it' : 'Not skipped',
          onPress: () =>
            Alert.alert('Change this back?', 'The dose will show as not taken yet.', [
              { text: 'Keep it', style: 'cancel' },
              { text: 'Change back', style: 'destructive', onPress: () => undo(o.key) },
            ]),
        },
        { text: 'Close', style: 'cancel' as const },
      ]);
      return;
    }
    if (atTime(o.date, o.time).getTime() - now.getTime() > 6 * 3600e3) {
      Alert.alert(label, 'This dose is more than 6 hours away.');
      return;
    }
    Alert.alert(label, 'Scanning the strip is the safest check.', [
      { text: 'Scan the strip', onPress: () => router.navigate('/scan') },
      { text: 'I took it already', onPress: () => record([o], 'taken', 'manual') },
      {
        text: 'Skip this dose…',
        onPress: () =>
          Alert.alert('Skip this dose?', `${label} will be marked as skipped.`, [
            { text: 'Don\'t skip', style: 'cancel' },
            { text: 'Skip it', style: 'destructive', onPress: () => record([o], 'skipped', 'manual') },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <View style={[s.between, { marginBottom: 8 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.h1, { color: t.text }]}>{fmtDay(date, today)}</Text>
            <Text style={{ color: t.sub, fontSize: 16 }}>
              {occs.length ? `${taken} of ${occs.length} taken` : atTime(date, '12:00').toDateString()}
            </Text>
          </View>
          <Pressable
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            style={{ minHeight: 48, minWidth: 48, paddingHorizontal: 10, borderRadius: 12, backgroundColor: t.muted, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="settings-outline" size={24} color={t.text} />
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 16, marginLeft: 6 }}>Settings</Text>
          </Pressable>
        </View>

        {offset !== 0 && <Button title="Back to today" onPress={() => setOffset(0)} style={{ marginBottom: 8 }} />}

        <MemberPicker value={memberId} onChange={setMemberId} allowAll={state.members.length > 1} />

        {dueCount > 0 && (
          <Button big title={`Scan ${dueCount} due medicine${dueCount > 1 ? 's' : ''}`} onPress={() => router.navigate('/scan')} style={{ marginVertical: 10 }} />
        )}

        {low.length > 0 && (
          <Pressable onPress={() => router.navigate('/inventory')}>
            <Card style={{ backgroundColor: t.warnSoft, borderColor: t.warnSoft, marginVertical: 8 }}>
              <Text style={{ color: t.warn, fontWeight: '700', fontSize: 16 }}>Running low: {low.map((m) => `${medLabel(m)} (${m.stock} left)`).join(', ')}</Text>
            </Card>
          </Pressable>
        )}

        {!state.meds.length ? (
          <>
            <Empty title="No medicines yet" body="Add each medicine and when it is taken. Reminders start by themselves." />
            <Button big title="Add a medicine" onPress={() => router.push('/add')} />
            <CollectCard />
          </>
        ) : !occs.length ? (
          <Empty title="No medicines this day" />
        ) : (
          groups.map(([time, list]) => (
            <View
              key={time}
              style={{ marginTop: 12, backgroundColor: t.periods[periodOfTime(time)].tint, borderRadius: 18, padding: 10, paddingBottom: 2 }}
            >
              <View style={[s.row, { marginBottom: 8, marginLeft: 4 }]}>
                <Ionicons name={PERIOD_ICON[periodOfTime(time)]} size={18} color={t.periods[periodOfTime(time)].accent} />
                <Text style={{ color: t.periods[periodOfTime(time)].accent, fontWeight: '700', fontSize: 16, marginLeft: 6 }}>
                  {PERIOD_LABEL[periodOfTime(time)]} · {fmt12(time)}
                </Text>
              </View>
              {list.map((o) => (
                <Pressable key={o.key} onPress={() => act(o)}>
                  <Card style={{ marginBottom: 8, paddingVertical: 12 }}>
                    <View style={s.between}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{medLabel(o.med)}</Text>
                        <Text style={{ color: t.sub, fontSize: 16, marginTop: 2 }}>
                          {qtyLabel(o.dose.qty, o.med.unit)} · {describeTiming(o.dose)}
                        </Text>
                        <MemberDot memberId={o.memberId} />
                      </View>
                      <StatusBadge status={o.status} />
                    </View>
                  </Card>
                </Pressable>
              ))}
            </View>
          ))
        )}

        {/* Other days: a family helper's job, so out of the way at the bottom, with words, not just arrows. */}
        {state.meds.length > 0 && (
          <View style={[s.between, { marginTop: 16 }]}>
            <Button title="‹ Day before" kind="ghost" onPress={() => setOffset((o) => o - 1)} />
            <Button title="Day after ›" kind="ghost" onPress={() => setOffset((o) => o + 1)} />
          </View>
        )}
      </ScrollView>
    </>
  );
}
