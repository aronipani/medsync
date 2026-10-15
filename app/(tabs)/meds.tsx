import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { duplicateGroups } from '../../src/consolidate.ts';
import { findOverlaps, overlapMessage } from '../../src/overlap.ts';
import { describeTiming, doseTime, medLabel, qtyLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import { DAY_LABELS, fmt12 } from '../../src/time.ts';
import { Button, Card, s, useTheme } from '../../src/ui.tsx';

export default function Meds() {
  const t = useTheme();
  const { state, mergeDuplicates, confirmOverlap } = useStore();

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      {state.pending && (
        <Pressable onPress={() => router.push('/rx-review')}>
          <Card style={{ backgroundColor: t.warnSoft, borderColor: t.warn, marginBottom: 16 }}>
            <Text style={{ color: t.warn, fontWeight: '700' }}>
              Prescription waiting to be checked ({state.pending.items.filter((i) => i.checked).length}/{state.pending.items.length}) ›
            </Text>
          </Card>
        </Pressable>
      )}
      {state.members.map((member) => {
        // Sorted by first dose of the day; stopped medicines last.
        const first = (m: (typeof state.meds)[number]) =>
          m.doses.map((d) => doseTime(d, member, state.settings)).sort()[0] ?? '99:99';
        const meds = state.meds
          .filter((m) => m.memberId === member.id)
          .sort((a, b) => Number(!a.active) - Number(!b.active) || first(a).localeCompare(first(b)) || a.name.localeCompare(b.name));
        const overlaps = findOverlaps(meds);
        const inOverlap = (g: typeof meds) => overlaps.some((o) => g.includes(o.a) && g.includes(o.b));
        const groups = duplicateGroups(meds);
        const dups = groups.filter((g) => !inOverlap(g)); // repeats of medicines whose contents aren't known
        const mergeable = (a: string, b: string) => groups.some((g) => g.some((m) => m.id === a) && g.some((m) => m.id === b));
        const merge = () =>
          Alert.alert('Merge duplicates?', 'Times are combined (each time once), stock is added up and dose history is kept. The current schedule is saved in History first.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Merge', onPress: () => mergeDuplicates(member.id) },
          ]);
        return (
          <View key={member.id} style={{ marginBottom: 22 }}>
            <View style={[s.between, { marginBottom: 8 }]}>
              <Pressable onPress={() => router.push(`/member/${member.id}`)} style={s.row}>
                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: member.color, marginRight: 8 }} />
                <Text style={[s.h2, { color: t.text }]}>{member.name}</Text>
                <Ionicons name="create-outline" size={18} color={t.sub} style={{ marginLeft: 6 }} />
              </Pressable>
              <Pressable onPress={() => router.push({ pathname: '/add', params: { memberId: member.id } })} hitSlop={10}>
                <Text style={{ color: t.brand, fontWeight: '700', fontSize: 15 }}>+ Add medicine</Text>
              </Pressable>
            </View>
            <Text style={{ color: t.sub, marginBottom: 8 }}>
              Meals: breakfast {fmt12(member.mealTimes.breakfast)} · lunch {fmt12(member.mealTimes.lunch)} · dinner {fmt12(member.mealTimes.dinner)}
            </Text>
            {overlaps.map((o) => (
              <Card key={`${o.a.id}|${o.b.id}`} style={{ backgroundColor: t.badSoft, borderColor: t.bad, marginBottom: 10 }}>
                <Text style={{ color: t.bad, fontWeight: '800' }}>⚠ Same medicine twice?</Text>
                <Text style={{ color: t.text, marginTop: 4, lineHeight: 20 }}>{overlapMessage(o)}</Text>
                <View style={[s.row, { gap: 8, marginTop: 8 }]}>
                  {o.kind === 'same' && o.sameStrength && mergeable(o.a.id, o.b.id) ? <Button title="Merge into one" kind="secondary" style={{ flex: 1 }} onPress={merge} /> : null}
                  <Button
                    title="Doctor confirmed both"
                    kind="ghost"
                    style={{ flex: 1 }}
                    onPress={() =>
                      Alert.alert('Doctor confirmed both?', `Only choose this if the doctor said to take both ${medLabel(o.a)} and ${medLabel(o.b)}.`, [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Yes, both', onPress: () => confirmOverlap(o.a.id, o.b.id) },
                      ])
                    }
                  />
                </View>
              </Card>
            ))}
            {dups.length > 0 && (
              <Card style={{ backgroundColor: t.warnSoft, borderColor: t.warn, marginBottom: 10 }}>
                <Text style={{ color: t.warn, fontWeight: '700' }}>
                  Listed more than once: {dups.map((g) => `${medLabel(g[0])} (×${g.length})`).join(', ')}
                </Text>
                <Button title="Merge into one" kind="secondary" style={{ marginTop: 8 }} onPress={merge} />
              </Card>
            )}
            {!meds.length && <Text style={{ color: t.sub, fontStyle: 'italic' }}>No medicines yet.</Text>}
            {meds.map((med) => (
              <Pressable key={med.id} onPress={() => router.push(`/med/${med.id}`)}>
                <Card style={{ marginBottom: 8, opacity: med.active ? 1 : 0.5 }}>
                  <View style={s.between}>
                    <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', flex: 1 }}>{medLabel(med)}</Text>
                    {!med.active && <Text style={{ color: t.sub }}>Paused</Text>}
                    {med.endDate && <Text style={{ color: t.sub, fontSize: 12 }}>until {med.endDate}</Text>}
                  </View>
                  {[...med.doses].sort((a, b) => doseTime(a, member, state.settings).localeCompare(doseTime(b, member, state.settings))).map((d) => (
                    <Text key={d.id} style={{ color: t.sub, marginTop: 4 }}>
                      {fmt12(doseTime(d, member, state.settings))} · {describeTiming(d)} · {qtyLabel(d.qty, med.unit)}
                      {d.days.length ? ` · ${d.days.map((x) => DAY_LABELS[x]).join(', ')}` : ''}
                    </Text>
                  ))}
                  {!med.doses.length && <Text style={{ color: t.warn, marginTop: 4 }}>No dose times set</Text>}
                </Card>
              </Pressable>
            ))}
          </View>
        );
      })}
      <Button title="+ Add family member" kind="secondary" onPress={() => router.push('/member/new')} />
      <Button title={`Schedule history (${state.history?.length ?? 0})`} kind="ghost" onPress={() => router.push('/history')} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}
