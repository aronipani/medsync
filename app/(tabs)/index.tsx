import { Ionicons } from '@expo/vector-icons';
import { CollectCard } from '../../src/components/CollectCard.tsx';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MemberDot, MemberPicker } from '../../src/components.tsx';
import { describeTiming, medLabel, occurrencesForDate, qtyLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import { addDays, atTime, dateKey, fmt12, fmtDay } from '../../src/time.ts';
import type { Occurrence } from '../../src/types.ts';
import { Button, Card, Empty, s, useTheme } from '../../src/ui.tsx';

export default function Today() {
  const t = useTheme();
  const { state, now, record, undo } = useStore();
  const insets = useSafeAreaInsets();
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

  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // "Now" = every time that has a dose due, with everything at those times (done ones stay, ticked).
  const nowTimes = offset === 0 ? groups.filter(([, l]) => l.some((o) => o.status === 'due')).map(([time]) => time) : [];
  const nowList = occs.filter((o) => nowTimes.includes(o.time));
  const nowDone = nowList.filter((o) => o.status === 'taken' || o.status === 'skipped').length;
  const later = groups.filter(([time, l]) => !nowTimes.includes(time) && l.some((o) => o.status === 'upcoming'));
  const done = occs.filter((o) => !nowTimes.includes(o.time) && o.status !== 'upcoming' && !later.some(([time]) => time === o.time));

  /** A round tick box: green ✓ when taken, outline when still to take. Shape and word, not colour alone. */
  const Mark = ({ o }: { o: Occurrence }) =>
    o.status === 'taken' ? (
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.okFill, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="checkmark" size={22} color="#FFFFFF" />
      </View>
    ) : o.status === 'missed' ? (
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.badFill, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900' }}>!</Text>
      </View>
    ) : o.status === 'skipped' ? (
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.sub, fontSize: 20, fontWeight: '900' }}>–</Text>
      </View>
    ) : (
      <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2.5, borderColor: t.text }} />
    );

  const statusLine = (o: Occurrence) =>
    o.status === 'taken' && o.log
      ? `Taken ${timeOf(o.log.at)}`
      : o.status === 'skipped'
        ? 'Skipped'
        : o.status === 'missed'
          ? `Missed · ${qtyLabel(o.dose.qty, o.med.unit)} at ${fmt12(o.time)}`
          : `${qtyLabel(o.dose.qty, o.med.unit)} · ${describeTiming(o.dose)}`;

  /** One medicine as a row: still-to-take ones bold and dark, finished ones quiet. */
  const Row = ({ o, last }: { o: Occurrence; last: boolean }) => {
    const open = o.status === 'due' || o.status === 'upcoming';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${medLabel(o.med)}, ${statusLine(o)}`}
        onPress={() => act(o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 66, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line }}
      >
        <Mark o={o} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: open ? t.text : t.sub, fontSize: open ? 21 : 19, fontWeight: open ? '700' : '600' }}>{medLabel(o.med)}</Text>
          <Text style={{ color: o.status === 'missed' ? t.bad : open ? t.text : t.sub, opacity: open ? 0.8 : 1, fontSize: 16, marginTop: 2 }}>{statusLine(o)}</Text>
          <MemberDot memberId={o.memberId} />
        </View>
      </Pressable>
    );
  };

  const Section = ({ title }: { title: string }) => (
    <Text style={{ color: t.sub, fontSize: 17, fontWeight: '600', marginTop: 24, marginBottom: 8, marginLeft: 4 }}>{title}</Text>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}>
      <View style={{ marginTop: 8, marginBottom: 12 }}>
        <Text style={{ color: t.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.3 }}>{fmtDay(date, today)}</Text>
        <Text style={{ color: t.sub, fontSize: 18, marginTop: 2 }}>
          {atTime(date, '12:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
          {occs.length ? ` · ${taken} of ${occs.length} taken` : ''}
        </Text>
      </View>

      {offset !== 0 && <Button title="Back to today" onPress={() => setOffset(0)} style={{ marginBottom: 8 }} />}

      <MemberPicker value={memberId} onChange={setMemberId} allowAll={state.members.length > 1} />

      {low.length > 0 && (
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/inventory')}>
          <Card style={{ backgroundColor: t.warnSoft, marginTop: 8 }}>
            <Text style={{ color: t.warn, fontWeight: '700', fontSize: 17 }}>Running low: {low.map((m) => `${medLabel(m)} (${m.stock} left)`).join(', ')}</Text>
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
        <>
          {/* Now: all medicines due at this time together, ticked off one by one, with one button. */}
          {nowList.length > 0 && (
            <Card style={{ marginTop: 12, paddingTop: 16 }}>
              <View style={[s.between, { marginBottom: 4 }]}>
                <View style={s.row}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.now, marginRight: 8 }} />
                  <Text style={{ color: t.now, fontSize: 17, fontWeight: '700' }}>Now · {nowTimes.map(fmt12).join(', ')}</Text>
                </View>
                {nowList.length > 1 && (
                  <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>
                    {nowDone} of {nowList.length} done
                  </Text>
                )}
              </View>
              {nowList.map((o, i) => (
                <Row key={o.key} o={o} last={i === nowList.length - 1} />
              ))}
              <Button
                big
                title={dueCount === 1 ? (nowList.length > 1 ? 'Scan the last strip' : 'Scan the strip') : nowDone ? 'Scan the next strip' : 'Scan the strips'}
                onPress={() => router.navigate('/scan')}
                style={{ marginTop: 12 }}
              />
            </Card>
          )}

          {offset !== 0 ? (
            <>
              {groups.map(([time, list]) => (
                <View key={time}>
                  <Section title={fmt12(time)} />
                  <Card style={{ paddingVertical: 4 }}>
                    {list.map((o, i) => (
                      <Row key={o.key} o={o} last={i === list.length - 1} />
                    ))}
                  </Card>
                </View>
              ))}
            </>
          ) : (
            <>
              {later.length > 0 && (
                <>
                  <Section title="Later today" />
                  <Card style={{ paddingVertical: 4 }}>
                    {later.map(([time, list], gi) => (
                      <Pressable
                        key={time}
                        accessibilityRole="button"
                        onPress={() => act(list[0])}
                        style={{ flexDirection: 'row', gap: 16, paddingVertical: 14, borderBottomWidth: gi === later.length - 1 ? 0 : 1, borderBottomColor: t.line }}
                      >
                        <Text style={{ color: t.text, fontSize: 18, fontWeight: '600', width: 84 }}>{fmt12(time)}</Text>
                        <View style={{ flex: 1, gap: 6 }}>
                          {list.map((o) => (
                            <Text key={o.key} style={{ color: t.text, fontSize: 19, fontWeight: '600' }}>
                              {medLabel(o.med)}
                            </Text>
                          ))}
                        </View>
                        {list.length > 1 && <Text style={{ color: t.sub, fontSize: 16 }}>{list.length}</Text>}
                      </Pressable>
                    ))}
                  </Card>
                </>
              )}
              {done.length > 0 && (
                <>
                  <Section title="Done" />
                  <Card style={{ paddingVertical: 4 }}>
                    {done.map((o, i) => (
                      <Row key={o.key} o={o} last={i === done.length - 1} />
                    ))}
                  </Card>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* Other days: a family helper's job, so out of the way at the bottom, with words, not just arrows. */}
      {state.meds.length > 0 && (
        <View style={[s.between, { marginTop: 24, gap: 10 }]}>
          <Button title="‹ Day before" kind="ghost" onPress={() => setOffset((o) => o - 1)} style={{ flex: 1 }} />
          <Button title="Day after ›" kind="ghost" onPress={() => setOffset((o) => o + 1)} style={{ flex: 1 }} />
        </View>
      )}
    </ScrollView>
  );
}
