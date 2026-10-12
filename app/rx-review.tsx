import { router, Stack } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { planPrescription } from '../src/consolidate.ts';
import { describeMedTimes } from '../src/describe.ts';
import { describeTiming, medLabel, qtyLabel } from '../src/schedule.ts';
import { useStore } from '../src/store.tsx';
import { DAY_LABELS } from '../src/time.ts';
import type { PendingRxItem } from '../src/types.ts';
import { Button, Card, Empty, s, useTheme } from '../src/ui.tsx';

export default function PrescriptionReview() {
  const t = useTheme();
  const { state, updatePendingItem, approvePending, setPending } = useStore();
  const [zoom, setZoom] = useState<string>();
  const p = state.pending;

  // How this prescription compares with what's already in the schedule.
  const plan = useMemo(() => {
    if (!p) return undefined;
    const mem = state.members.find((m) => m.id === p.memberId);
    const describe = (m: import('../src/types.ts').Medication) => (mem ? describeMedTimes(m, mem, state.settings) : '');
    return planPrescription(
      state.meds.filter((m) => m.memberId === p.memberId),
      p.items.filter((i) => i.include).map((i) => ({ id: i.id, med: i.med })),
      describe,
    );
  }, [p, state.meds, state.members, state.settings]);

  if (!p) {
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ title: 'Check prescription' }} />
        <Empty title="Nothing to check" body="Read a prescription from Add medicine to draft a schedule." />
      </View>
    );
  }

  const member = state.members.find((m) => m.id === p.memberId);
  const included = p.items.filter((i) => i.include);
  const unchecked = included.filter((i) => !i.checked);

  const stopIds = p.stopIds ?? [];
  const toggleStop = (id: string) => setPending({ ...p, stopIds: stopIds.includes(id) ? stopIds.filter((x) => x !== id) : [...stopIds, id] });

  const approve = () => {
    const r = approvePending();
    const parts = [
      r.added && `${r.added} added`,
      r.changed && `${r.changed} updated`,
      r.stopped && `${r.stopped} stopped`,
    ].filter(Boolean);
    Alert.alert(
      'Schedule updated',
      `${parts.length ? parts.join(', ') : 'No changes needed'} for ${member?.name ?? 'this person'}. The previous schedule was saved in History.`,
    );
    router.replace('/meds');
  };

  const discard = () =>
    Alert.alert('Discard this prescription?', 'Nothing from it will be added.', [
      { text: 'Keep', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => (setPending(undefined), router.back()) },
    ]);

  const summary = (i: PendingRxItem) => {
    const m = i.med;
    if (!m.doses.length) return i.asNeeded ? 'Only when needed — no reminders' : 'No times set';
    return m.doses
      .map((d) => `${qtyLabel(d.qty, m.unit)} ${describeTiming(d).toLowerCase()}${d.days.length ? ` (${d.days.map((x) => DAY_LABELS[x]).join(', ')})` : ''}`)
      .join(' · ');
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Check prescription' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Card style={{ backgroundColor: t.warnSoft, borderColor: t.warnSoft }}>
          <Text style={{ color: t.warn, fontWeight: '700', fontSize: 16 }}>A person must check this before it's used</Text>
          <Text style={{ color: t.text, marginTop: 6, lineHeight: 20 }}>
            The app read {p.items.length} medicine{p.items.length === 1 ? '' : 's'} for {member?.name}. Compare each one with the prescription — name,
            strength, how often, before/after food and how many days. Tap a medicine to correct it.
          </Text>
        </Card>

        <ScrollView horizontal style={{ marginTop: 12 }} showsHorizontalScrollIndicator={false}>
          {p.imageUris.map((u) => (
            <Pressable key={u} onPress={() => setZoom(u)}>
              <Image source={{ uri: u }} style={{ width: 110, height: 150, borderRadius: 10, marginRight: 8, backgroundColor: t.muted }} />
            </Pressable>
          ))}
          <Text style={{ color: t.sub, alignSelf: 'center', width: 120 }}>Tap the photo to compare</Text>
        </ScrollView>

        {p.items.map((i) => (
          <Card key={i.id} style={{ marginTop: 12, opacity: i.include ? 1 : 0.5, borderColor: i.checked ? t.ok : i.warnings.length ? t.warn : t.line, borderWidth: i.checked ? 2 : 1 }}>
            <View style={s.between}>
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', flex: 1 }}>{medLabel(i.med) || 'Unnamed medicine'}</Text>
              <Text style={{ color: i.checked ? t.ok : t.warn, fontWeight: '700' }}>{i.checked ? '✓ Checked' : 'Not checked'}</Text>
            </View>
            {(() => {
              const pi = plan?.items.find((x) => x.itemId === i.id);
              if (!pi || !i.include) return null;
              const badge =
                pi.action === 'new'
                  ? { text: 'NEW — will be added', bg: t.brandSoft, fg: t.brand }
                  : pi.action === 'same'
                    ? { text: `ALREADY IN SCHEDULE — no change`, bg: t.muted, fg: t.sub }
                    : { text: `UPDATES ${pi.targetLabel}`, bg: t.warnSoft, fg: t.warn };
              return (
                <View style={{ marginTop: 6 }}>
                  <Text style={{ alignSelf: 'flex-start', backgroundColor: badge.bg, color: badge.fg, fontWeight: '800', fontSize: 12, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' }}>
                    {badge.text}
                  </Text>
                  {pi.diffs.map((d) => (
                    <Text key={d} style={{ color: t.text, marginTop: 4 }}>
                      • {d}
                    </Text>
                  ))}
                </View>
              );
            })()}
            <Text style={{ color: t.sub, marginTop: 4 }}>{summary(i)}</Text>
            {i.med.endDate && <Text style={{ color: t.sub, marginTop: 2 }}>Until {i.med.endDate}</Text>}

            <Text style={{ color: t.sub, marginTop: 10, fontSize: 12, fontWeight: '700' }}>READ FROM PRESCRIPTION</Text>
            <Text style={{ color: t.text, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 13 }}>{i.source}</Text>

            {i.med.notes ? (
              <Text style={{ color: t.text, marginTop: 8 }}>
                <Text style={{ fontWeight: '700' }}>Instructions: </Text>
                {i.med.notes}
              </Text>
            ) : null}

            {i.warnings.map((w) => (
              <Text key={w} style={{ color: t.warn, marginTop: 6 }}>
                ⚠ {w}
              </Text>
            ))}

            <View style={[s.row, { gap: 8, marginTop: 12 }]}>
              <Button
                title="Edit"
                kind="secondary"
                style={{ flex: 1 }}
                onPress={() => router.push({ pathname: '/med/[id]', params: { id: i.med.id, rxItem: i.id } })}
              />
              <Button
                title={i.checked ? 'Undo check' : 'Matches ✓'}
                kind={i.checked ? 'secondary' : 'ok'}
                style={{ flex: 1 }}
                disabled={!i.include || (!i.checked && !i.med.name.trim())}
                onPress={() => updatePendingItem(i.id, { checked: !i.checked })}
              />
            </View>
            <View style={[s.between, { marginTop: 10 }]}>
              <Text style={{ color: t.text }}>Add to schedule</Text>
              <Switch value={i.include} onValueChange={(include) => updatePendingItem(i.id, { include })} />
            </View>
          </Card>
        ))}

        {plan && plan.missing.length > 0 && (
          <Card style={{ marginTop: 16, borderColor: t.warn }}>
            <Text style={{ color: t.text, fontSize: 16, fontWeight: '700' }}>Already in {member?.name}'s schedule but not on this prescription</Text>
            <Text style={{ color: t.sub, marginTop: 4, lineHeight: 19 }}>
              If the doctor stopped one, switch it to Stop. If this page is only part of the prescription, keep them.
            </Text>
            {plan.missing.map((m) => (
              <View key={m.id} style={[s.between, { marginTop: 10 }]}>
                <Text style={{ color: t.text, flex: 1, fontWeight: '600' }}>{medLabel(m)}</Text>
                <Text style={{ color: stopIds.includes(m.id) ? t.bad : t.ok, fontWeight: '700', marginRight: 8 }}>{stopIds.includes(m.id) ? 'Stop' : 'Keep'}</Text>
                <Switch value={!stopIds.includes(m.id)} onValueChange={() => toggleStop(m.id)} />
              </View>
            ))}
          </Card>
        )}

        <Text style={{ color: t.sub, marginTop: 14, lineHeight: 20 }}>
          Medicine missing from the list? Add it afterwards from Schedule → Add medicine. Set stock counts later in Inventory.
        </Text>
        <Button title="Discard prescription" kind="ghost" onPress={discard} style={{ marginTop: 8 }} />
      </ScrollView>

      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, paddingBottom: 28, backgroundColor: t.card, borderTopWidth: 1, borderTopColor: t.line }}>
        <Text style={{ color: unchecked.length ? t.warn : t.ok, textAlign: 'center', marginBottom: 8, fontWeight: '600' }}>
          {!included.length
            ? 'No medicines selected'
            : unchecked.length
              ? `${unchecked.length} of ${included.length} still to check`
              : `All ${included.length} checked`}
        </Text>
        <Button big title="Update schedule" onPress={approve} disabled={(!included.length && !stopIds.length) || unchecked.length > 0} />
        <Text style={{ color: t.sub, textAlign: 'center', marginTop: 6, fontSize: 12 }}>The current schedule is saved in History first.</Text>
      </View>

      <Modal visible={!!zoom} transparent animationType="fade" onRequestClose={() => setZoom(undefined)}>
        <Pressable style={{ flex: 1, backgroundColor: '#000' }} onPress={() => setZoom(undefined)}>
          <ScrollView maximumZoomScale={4} minimumZoomScale={1} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
            {zoom && <Image source={{ uri: zoom }} style={{ width: '100%', aspectRatio: 0.7 }} resizeMode="contain" />}
          </ScrollView>
          <Text style={{ color: '#fff', textAlign: 'center', padding: 20 }}>Tap to close</Text>
        </Pressable>
      </Modal>
    </View>
  );
}
