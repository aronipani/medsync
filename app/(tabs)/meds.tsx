import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Supplies } from '../../src/components/Supplies.tsx';
import { SamePersonCard } from '../../src/components/SamePerson.tsx';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { duplicateGroups } from '../../src/consolidate.ts';
import { findOverlaps, overlapMessage } from '../../src/overlap.ts';
import { describeTiming, doseTime, medLabel, qtyLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import { DAY_LABELS, fmt12 } from '../../src/time.ts';
import { Button, Card, s, SegmentTabs, useTheme } from '../../src/ui.tsx';

type View_ = 'list' | 'supplies';

/** Medicines: the list (per person) and Supplies (stock, refills, buy list), spec 21. */
export default function Meds() {
  const t = useTheme();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<View_>(params.view === 'supplies' ? 'supplies' : 'list');
  useEffect(() => {
    if (params.view === 'supplies' || params.view === 'list') setView(params.view);
  }, [params.view]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <SegmentTabs<View_>
          tabs={[
            { key: 'list', label: 'Medicines' },
            { key: 'supplies', label: 'Supplies' },
          ]}
          value={view}
          onChange={setView}
        />
      </View>
      {view === 'list' ? <MedicineList /> : <Supplies />}
    </View>
  );
}

function MedicineList() {
  const t = useTheme();
  const { state, mergeDuplicates, confirmOverlap } = useStore();

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <SamePersonCard />
      {state.pending && (
        <Pressable accessibilityRole="button" onPress={() => router.push('/rx-review')}>
          <Card style={{ backgroundColor: t.warnSoft, borderColor: t.warn, marginBottom: 16 }}>
            <Text style={{ color: t.warn, fontWeight: '700', fontSize: 17 }}>
              A prescription is waiting to be checked ›
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
            {/* Meal times live on the person's own screen; only the name and an edit button here. */}
            <View style={[s.between, { marginBottom: 8 }]}>
              <View style={[s.row, { flex: 1 }]}>
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: member.color, marginRight: 8 }} />
                <Text style={[s.h2, { color: t.text, fontSize: 20 }]}>{member.name}</Text>
              </View>
              <Pressable
                onPress={() => router.push(`/member/${member.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${member.name}, meal times and voice`}
                style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.muted, flexDirection: 'row', alignItems: 'center' }}
              >
                <Ionicons name="create-outline" size={20} color={t.text} />
                <Text style={{ color: t.text, fontWeight: '700', fontSize: 16, marginLeft: 6 }}>Edit</Text>
              </Pressable>
            </View>
            {overlaps.map((o) => (
              <Card key={`${o.a.id}|${o.b.id}`} style={{ backgroundColor: t.badSoft, borderColor: t.bad, marginBottom: 10 }}>
                <Text style={{ color: t.bad, fontWeight: '800', fontSize: 18 }}>⚠ Same medicine twice?</Text>
                <Text style={{ color: t.text, marginTop: 4, fontSize: 16, lineHeight: 23 }}>{overlapMessage(o)}</Text>
                <View style={[s.row, { gap: 8, marginTop: 8 }]}>
                  {mergeable(o.a.id, o.b.id) ? <Button title="Merge into one" kind="secondary" style={{ flex: 1 }} onPress={merge} /> : null}
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
            {!meds.length && <Text style={{ color: t.sub, fontSize: 16, marginBottom: 8 }}>No medicines yet.</Text>}
            {meds.map((med) => (
              <Pressable accessibilityRole="button" key={med.id} onPress={() => router.push(`/med/${med.id}`)}>
                <Card style={{ marginBottom: 8, backgroundColor: med.active ? t.card : t.muted }}>
                  <View style={s.between}>
                    <Text style={{ color: t.text, fontSize: 18, fontWeight: '700', flex: 1 }}>{medLabel(med)}</Text>
                    {!med.active && <Text style={{ color: t.sub, fontSize: 16, fontWeight: '700' }}>Stopped</Text>}
                  </View>
                  {med.endDate && (
                    <Text style={{ color: t.sub, fontSize: 16, marginTop: 2 }}>
                      Until {new Date(`${med.endDate}T12:00:00`).toLocaleDateString([], { day: 'numeric', month: 'long' })}
                    </Text>
                  )}
                  {[...med.doses].sort((a, b) => doseTime(a, member, state.settings).localeCompare(doseTime(b, member, state.settings))).map((d) => (
                    <Text key={d.id} style={{ color: t.sub, fontSize: 16, marginTop: 4 }}>
                      {fmt12(doseTime(d, member, state.settings))}
                      {d.timing.kind === 'meal' ? ` · ${describeTiming(d)}` : ''} · {qtyLabel(d.qty, med.unit)}
                      {d.days.length ? ` · ${d.days.map((x) => DAY_LABELS[x]).join(', ')}` : ''}
                    </Text>
                  ))}
                  {med.asNeeded ? (
                    <Text style={{ color: t.sub, fontSize: 16, marginTop: 4 }}>Only when needed · {qtyLabel(med.asNeeded.qty, med.unit)} each time</Text>
                  ) : (
                    !med.doses.length && <Text style={{ color: t.warn, fontSize: 16, marginTop: 4 }}>No dose times set</Text>
                  )}
                  {/* Stock lives here now (no separate tab): how many are left and how long they last. */}
                  {(() => {
                    const pd = med.doses.reduce((a, d) => a + d.qty * (d.days.length ? d.days.length / 7 : 1), 0);
                    const days = pd ? Math.floor(med.stock / pd) : undefined;
                    const low = med.stockKnown !== false && med.stock <= med.lowStockAt;
                    return (
                      <Text style={{ color: low ? t.warn : t.sub, fontSize: 16, fontWeight: low ? '700' : '400', marginTop: 6 }}>
                        {low ? '! ' : ''}
                        {med.stockKnown === false ? 'How many left? Not set yet' : `${med.stock} left${days !== undefined && med.active ? ` · lasts about ${days} day${days === 1 ? '' : 's'}` : ''}`}
                      </Text>
                    );
                  })()}
                </Card>
              </Pressable>
            ))}
            <Button title={state.members.length > 1 ? `+ Add a medicine for ${member.name}` : '+ Add a medicine'} kind="secondary" onPress={() => router.push({ pathname: '/add', params: { memberId: member.id } })} />
            {/* Sending a person's medicines lives in Settings → Family and on the person's page (one home, spec 21). */}
          </View>
        );
      })}
      {/* People are added in Settings → Family; each name above opens their page. */}
      <Button title="History of the list" kind="ghost" onPress={() => router.push('/history')} style={{ marginTop: 4 }} />
      <Text style={{ color: t.sub, fontSize: 15, textAlign: 'center', marginTop: 4 }}>
        Every change is kept and can be brought back. People are added in Settings → Family.
      </Text>
    </ScrollView>
  );
}
