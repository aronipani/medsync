import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { MemberPicker } from '../../src/components.tsx';
import { describeTiming, doseTime, medLabel } from '../../src/schedule.ts';
import { genericLabel, lookupBrand } from '../../src/drugdb.ts';
import { reuseDoseIds, sameMedicine } from '../../src/consolidate.ts';
import { overlapMessage, overlapsFor } from '../../src/overlap.ts';
import { deleteReferences } from '../../src/profileFiles.ts';
import { uid, useStore } from '../../src/store.tsx';
import { DAY_LABELS, fmt12 } from '../../src/time.ts';
import type { Dose, Meal, MealRelation, Medication } from '../../src/types.ts';
import { Button, Card, Chip, DateField, Field, Label, More, NumberField, s, Steps, TimeField, useTheme } from '../../src/ui.tsx';
import { UNITS, UNIT_LABEL } from '../../src/units.ts';

const REL_LABEL: Record<MealRelation, string> = { before: 'Before', with: 'With', after: 'After' };
const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];
const RELS: MealRelation[] = ['before', 'with', 'after'];

const newDose = (meal: Meal = 'breakfast'): Dose => ({
  id: uid(),
  timing: { kind: 'meal', meal, relation: 'after' },
  qty: 1,
  days: [],
  since: new Date().toISOString(),
});

export default function EditMed() {
  const t = useTheme();
  const { id, memberId, prefill, rxItem } = useLocalSearchParams<{ id: string; memberId?: string; prefill?: string; rxItem?: string }>();
  const { state, saveMed, deleteMed, updatePendingItem, forgetLearned } = useStore();
  const pendingItem = rxItem ? state.pending?.items.find((i) => i.id === rxItem) : undefined;
  const existing = pendingItem ? undefined : state.meds.find((m) => m.id === id);
  const draft = useMemo<Partial<Medication>>(() => {
    try {
      return prefill ? (JSON.parse(prefill) as Partial<Medication>) : {};
    } catch {
      return {};
    }
  }, [prefill]);

  const [med, setMed] = useState<Medication>(
    () =>
      pendingItem?.med ??
      existing ?? {
        ...draft,
        id: uid(),
        memberId: memberId ?? state.members[0]?.id ?? '',
        name: draft.name ?? '',
        strength: draft.strength ?? '',
        aliases: draft.aliases ?? [],
        barcodes: draft.barcodes ?? [],
        learned: draft.learned ?? [],
        unit: draft.unit ?? 'tablet',
        doses: [newDose()],
        stock: 10,
        lowStockAt: 5,
        active: true,
        createdAt: new Date().toISOString(),
      },
  );
  const [aliases, setAliases] = useState(med.aliases.join(', '));
  const set = (patch: Partial<Medication>) => setMed((m) => ({ ...m, ...patch }));
  const known = lookupBrand(med.name);
  const knownAlias = known && med.strength.trim() ? genericLabel(known.ingredients, med.strength.replace(/\s*mg\b/i, '').trim()) : undefined;
  const setDose = (doseId: string, patch: Partial<Dose>) => set({ doses: med.doses.map((d) => (d.id === doseId ? { ...d, ...patch } : d)) });
  const member = state.members.find((m) => m.id === med.memberId);
  const live = existing ? state.meds.find((x) => x.id === existing.id) : undefined;
  // Came from Scan to add: name, strength and form are already read, so show them as a summary (step 2 of 2).
  const fromScan = !!prefill && !existing && !pendingItem;

  const perDay = useMemo(() => med.doses.reduce((a, d) => a + d.qty * (d.days.length ? d.days.length / 7 : 1), 0), [med.doses]);

  const save = () => {
    if (!med.name.trim()) return Alert.alert('Name needed', 'Enter the name printed on the strip, e.g. Dolo.');
    const now = new Date().toISOString();
    // A dose whose time/days changed only counts from now (so it isn't marked missed retroactively).
    const doses = med.doses.map((d) => {
      const old = existing?.doses.find((x) => x.id === d.id);
      const changed = !old || JSON.stringify([old.timing, old.days]) !== JSON.stringify([d.timing, d.days]) || existing?.memberId !== med.memberId;
      return changed && old ? { ...d, since: now } : d;
    });
    // The strip profile, taught strips and expiry are changed by other screens (Scan the strip once, the Scan tab)
    // while this one is open: keep their latest values.
    const live = state.meds.find((x) => x.id === med.id);
    const final = {
      ...med,
      ...(live ? { profile: live.profile, learned: live.learned, expiry: live.expiry } : {}),
      name: med.name.trim(),
      strength: med.strength.trim(),
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      doses,
    };
    if (pendingItem) {
      updatePendingItem(pendingItem.id, { med: final, checked: true, include: true });
      return router.back();
    }
    const dup = !existing && state.meds.find((x) => x.memberId === final.memberId && x.id !== final.id && sameMedicine(x, final));
    const others = state.meds.filter((x) => x.id !== final.id);
    if (dup) {
      const same = overlapsFor(final, [dup])[0];
      return Alert.alert(
        `${dup.name} ${dup.strength} is already in the schedule`,
        `${same ? overlapMessage(same) + '\n\n' : ''}Update that entry with these details instead of adding a second one? (The old version is saved in History.)`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add as separate', onPress: () => (saveMed(final), router.back()) },
          {
            text: 'Update existing',
            onPress: () => {
              saveMed({
                ...dup,
                name: final.name,
                strength: final.strength || dup.strength,
                unit: final.unit,
                doses: reuseDoseIds(dup.doses, final.doses, now),
                aliases: [...new Set([...dup.aliases, ...final.aliases])],
                barcodes: [...new Set([...dup.barcodes, ...final.barcodes])],
                notes: final.notes ?? dup.notes,
                endDate: final.endDate,
                profile: dup.profile ?? final.profile,
                learned: [...new Set([...(dup.learned ?? []), ...(final.learned ?? [])])],
                active: true,
              });
              router.back();
            },
          },
        ],
      );
    }
    // Same ingredient as another of this person's medicines (that wasn't already flagged before this edit)?
    const before = existing ? new Set(overlapsFor(existing, others).map((o) => o.b.id)) : new Set<string>();
    const fresh = overlapsFor(final, others).filter((o) => !before.has(o.b.id));
    if (fresh.length) {
      return Alert.alert('Same medicine twice?', fresh.map(overlapMessage).join('\n\n'), [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save anyway', style: 'destructive', onPress: () => (saveMed(final), router.back()) },
      ]);
    }
    saveMed(final);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: pendingItem ? 'Check medicine' : existing ? 'Edit medicine' : 'New medicine' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {pendingItem && (
          <Card style={{ backgroundColor: t.warnSoft }}>
            <Text style={{ color: t.warn, fontWeight: '700', fontSize: 17, marginBottom: 4 }}>On the prescription</Text>
            <Text style={{ color: t.text, fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{pendingItem.source}</Text>
            {pendingItem.warnings.map((w) => (
              <Text key={w} style={{ color: t.warn, fontSize: 16, marginTop: 6 }}>
                ⚠ {w}
              </Text>
            ))}
            <Text style={{ color: t.text, marginTop: 8, fontSize: 16 }}>Check each part against the prescription, then save.</Text>
          </Card>
        )}
        {state.members.length > 1 && !pendingItem && (
          <>
            <Label>For</Label>
            <MemberPicker value={med.memberId} onChange={(v) => v && set({ memberId: v })} />
          </>
        )}

        {fromScan && <Steps step={2} total={2} label="When to take it" />}
        {fromScan ? (
          <Card>
            <Text style={{ color: t.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.2 }}>{medLabel(med) || 'New medicine'}</Text>
            <Text style={{ color: t.sub, fontSize: 17, marginTop: 4 }}>
              {UNIT_LABEL[med.unit] ?? med.unit}
              {known ? ` · ${known.ingredients.join(' + ')}` : ''}
            </Text>
            <More title="Change name, strength or form">
        <Label>Name on the strip</Label>
        <Field value={med.name} onChangeText={(name) => set({ name })} placeholder="e.g. Dolo" autoCapitalize="words" />
        {known && (
          <Card style={{ marginTop: 10, backgroundColor: t.muted }}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 17 }}>
              {med.name.trim()} usually contains {known.ingredients.join(' + ')}
            </Text>
            <Text style={{ color: t.sub, marginTop: 2, fontSize: 16 }}>Check this against the strip.</Text>
            {known.strengths.length > 0 && (
              <>
                <Text style={{ color: t.sub, fontSize: 16, marginTop: 10, marginBottom: 8 }}>Usual strengths — tap one:</Text>
                <View style={s.wrap}>
                  {known.strengths.map((x) => (
                    <Chip key={x} label={/[a-z]/i.test(x) ? x : `${x} mg`} active={med.strength === x} onPress={() => set({ strength: x })} />
                  ))}
                </View>
              </>
            )}
            {knownAlias && !aliases.toLowerCase().includes(knownAlias.toLowerCase()) && (
              <Button
                title={`Also accept strips that say "${knownAlias}"`}
                kind="secondary"
                style={{ marginTop: 6 }}
                onPress={() => setAliases((a) => [a.trim(), knownAlias].filter(Boolean).join(', '))}
              />
            )}
          </Card>
        )}
        <Label>Strength</Label>
        <Field value={med.strength} onChangeText={(strength) => set({ strength })} placeholder="e.g. 650 (as printed)" />
        <Label>Form</Label>
        <View style={s.wrap}>
          {UNITS.map((u) => (
            <Chip key={u} label={UNIT_LABEL[u] ?? u} active={med.unit === u} onPress={() => set({ unit: u })} />
          ))}
        </View>

            </More>
          </Card>
        ) : (
          <>
        <Label>Name on the strip</Label>
        <Field value={med.name} onChangeText={(name) => set({ name })} placeholder="e.g. Dolo" autoCapitalize="words" />
        {known && (
          <Card style={{ marginTop: 10, backgroundColor: t.muted }}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 17 }}>
              {med.name.trim()} usually contains {known.ingredients.join(' + ')}
            </Text>
            <Text style={{ color: t.sub, marginTop: 2, fontSize: 16 }}>Check this against the strip.</Text>
            {known.strengths.length > 0 && (
              <>
                <Text style={{ color: t.sub, fontSize: 16, marginTop: 10, marginBottom: 8 }}>Usual strengths — tap one:</Text>
                <View style={s.wrap}>
                  {known.strengths.map((x) => (
                    <Chip key={x} label={/[a-z]/i.test(x) ? x : `${x} mg`} active={med.strength === x} onPress={() => set({ strength: x })} />
                  ))}
                </View>
              </>
            )}
            {knownAlias && !aliases.toLowerCase().includes(knownAlias.toLowerCase()) && (
              <Button
                title={`Also accept strips that say "${knownAlias}"`}
                kind="secondary"
                style={{ marginTop: 6 }}
                onPress={() => setAliases((a) => [a.trim(), knownAlias].filter(Boolean).join(', '))}
              />
            )}
          </Card>
        )}
        <Label>Strength</Label>
        <Field value={med.strength} onChangeText={(strength) => set({ strength })} placeholder="e.g. 650 (as printed)" />
        <Label>Form</Label>
        <View style={s.wrap}>
          {UNITS.map((u) => (
            <Chip key={u} label={UNIT_LABEL[u] ?? u} active={med.unit === u} onPress={() => set({ unit: u })} />
          ))}
        </View>

          </>
        )}

        <Label>When to take it</Label>
        {med.doses.map((d, i) => (
          <Card key={d.id} style={{ marginBottom: 10 }}>
            <View style={s.between}>
              {/* The whole dose in one plain line, so the choices below can be checked at a glance. */}
              <Text style={{ color: t.text, fontWeight: '700', fontSize: 20, flex: 1 }}>
                {member ? fmt12(doseTime(d, member, state.settings)) : ''}
                {d.timing.kind === 'meal' ? ` · ${describeTiming(d)}` : ''}
              </Text>
              {med.doses.length > 1 && (
                <Button
                  title="Remove"
                  kind="ghost"
                  onPress={() =>
                    Alert.alert('Remove this time?', 'The other times stay.', [
                      { text: 'Keep it', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => set({ doses: med.doses.filter((x) => x.id !== d.id) }) },
                    ])
                  }
                />
              )}
            </View>
            <View style={[s.wrap, { marginTop: 10 }]}>
              <Chip label="With a meal" active={d.timing.kind === 'meal'} onPress={() => setDose(d.id, { timing: { kind: 'meal', meal: 'breakfast', relation: 'after' } })} />
              <Chip label="Set time" active={d.timing.kind === 'custom'} onPress={() => setDose(d.id, { timing: { kind: 'custom', time: d.timing.kind === 'custom' ? d.timing.time : '22:00' } })} />
            </View>
            {d.timing.kind === 'meal' ? (
              <>
                <View style={s.wrap}>
                  {RELS.map((r) => (
                    <Chip key={r} label={REL_LABEL[r]} active={d.timing.kind === 'meal' && d.timing.relation === r} onPress={() => d.timing.kind === 'meal' && setDose(d.id, { timing: { ...d.timing, relation: r } })} />
                  ))}
                </View>
                <View style={s.wrap}>
                  {MEALS.map((m) => (
                    <Chip key={m} label={MEAL_LABEL[m]} active={d.timing.kind === 'meal' && d.timing.meal === m} onPress={() => d.timing.kind === 'meal' && setDose(d.id, { timing: { ...d.timing, meal: m } })} />
                  ))}
                </View>
              </>
            ) : (
              <TimeField value={d.timing.time} onChange={(time) => setDose(d.id, { timing: { kind: 'custom', time } })} />
            )}
            <Text style={{ color: t.sub, fontSize: 16, marginTop: 12, marginBottom: 6 }}>How many each time</Text>
            <NumberField value={d.qty} step={0.5} min={0.25} onChange={(qty) => setDose(d.id, { qty })} />
            <Text style={{ color: t.sub, fontSize: 16, marginTop: 12, marginBottom: 6 }}>Days</Text>
            <View style={s.wrap}>
              <Chip label="Every day" active={!d.days.length} onPress={() => setDose(d.id, { days: [] })} />
              {/* Weekday chips only once "Some days" is chosen: most medicines are every day. */}
              {!d.days.length && <Chip label="Some days only" onPress={() => setDose(d.id, { days: [new Date().getDay()] })} />}
              {d.days.length > 0 && DAY_LABELS.map((lbl, wd) => (
                <Chip
                  key={lbl}
                  label={lbl}
                  active={d.days.includes(wd)}
                  onPress={() => {
                    const days = d.days.includes(wd) ? d.days.filter((x) => x !== wd) : [...d.days, wd].sort();
                    setDose(d.id, { days });
                  }}
                />
              ))}
            </View>
          </Card>
        ))}
        <Button
          title="+ Add another time"
          kind="secondary"
          onPress={() => set({ doses: [...med.doses, newDose(MEALS[Math.min(med.doses.length, 2)])] })}
        />

        <Label>How many are left</Label>
        <NumberField value={med.stock} step={1} onChange={(stock) => set({ stock })} />
        {perDay > 0 && (
          <Text style={{ color: t.sub, fontSize: 16, marginTop: 6 }}>Lasts about {Math.floor(med.stock / perDay)} days</Text>
        )}

        <Label>Notes (shown when scanning)</Label>
        <Field value={med.notes ?? ''} onChangeText={(notes) => set({ notes })} placeholder="e.g. empty stomach, prescribed by Dr. Rao" multiline />

        <View style={[s.between, { marginTop: 18 }]}>
          <Text style={{ color: t.text, fontSize: 17, flex: 1 }}>Remind me about this medicine</Text>
          <Switch value={med.active} onValueChange={(active) => set({ active })} />
        </View>

        {existing && (
          <Card style={{ marginTop: 20 }}>
            {live?.profile ? (
              <>
                <Text style={{ color: t.ok, fontSize: 17, fontWeight: '800' }}>✓ Strip scanned</Text>
                <Text style={{ color: t.sub, fontSize: 15, marginTop: 4 }}>
                  On {new Date(live.profile.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}. The scanner knows how this strip looks.
                </Text>
                <Button title="Scan a new strip" kind="ghost" onPress={() => router.push({ pathname: '/enroll', params: { medId: existing.id } })} />
              </>
            ) : (
              <>
                <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>Scan this strip once</Text>
                <Text style={{ color: t.sub, fontSize: 15, marginTop: 4 }}>Makes worn and cut strips easier to recognise at dose time. Takes a minute.</Text>
                <Button title="Scan the strip" onPress={() => router.push({ pathname: '/enroll', params: { medId: existing.id } })} style={{ marginTop: 10 }} />
              </>
            )}
          </Card>
        )}

        {/* Rarely needed; sensible defaults, so folded away. */}
        <More>
        <Label>Other names on the strip</Label>
        <Field value={aliases} onChangeText={setAliases} placeholder="e.g. Paracetamol 650" />
        <Text style={{ color: t.sub, marginTop: 6, fontSize: 15 }}>The scanner also accepts a strip showing any of these. Separate with commas.</Text>

        <Label>Warn me when this many are left</Label>
        <NumberField value={med.lowStockAt} step={1} onChange={(lowStockAt) => set({ lowStockAt })} />

        <Label>Last day of the course</Label>
        <DateField value={med.endDate} onChange={(endDate) => set({ endDate })} emptyText="Not set — keeps going" />

        {med.barcodes.length > 0 && (
          <>
            <Label>Barcodes it knows</Label>
            {med.barcodes.map((b) => (
              <View key={b} style={[s.between, { paddingVertical: 6 }]}>
                <Text style={{ color: t.text, fontSize: 16, flex: 1 }} numberOfLines={1}>
                  {b}
                </Text>
                <Button
                  title="Forget"
                  kind="ghost"
                  onPress={() =>
                    Alert.alert('Forget this barcode?', 'Scanning it will no longer find this medicine.', [
                      { text: 'Keep it', style: 'cancel' },
                      { text: 'Forget', style: 'destructive', onPress: () => set({ barcodes: med.barcodes.filter((x) => x !== b) }) },
                    ])
                  }
                />
              </View>
            ))}
          </>
        )}

        {(med.learned?.length ?? 0) > 0 && (
          <>
            <Label>Strips it has learned</Label>
            <View style={s.between}>
              <Text style={{ color: t.text, fontSize: 16, flex: 1 }}>Knows {med.learned!.length} strip{med.learned!.length === 1 ? '' : 's'} you confirmed</Text>
              <Pressable
                accessibilityRole="button"
                style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                onPress={() =>
                  Alert.alert('Forget taught strips?', 'The app will only use the name, strength and barcode to recognise this medicine.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Forget',
                      style: 'destructive',
                      onPress: () => {
                        set({ learned: [] });
                        if (existing) forgetLearned(existing.id);
                      },
                    },
                  ])
                }
              >
                <Text style={{ color: t.bad, fontWeight: '700', fontSize: 16 }}>Forget</Text>
              </Pressable>
            </View>
          </>
        )}
        </More>

        <Button big title={pendingItem ? 'Matches the prescription — save' : existing ? 'Save changes' : 'Save medicine'} onPress={save} style={{ marginTop: 24 }} />
        {existing && (
          <Button
            title="Delete medicine"
            kind="ghost"
            style={{ marginTop: 10 }}
            onPress={() =>
              Alert.alert('Delete medicine?', 'Its history stays in the log.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => (deleteReferences(live?.profile?.refs), deleteMed(med.id), router.back()) },
              ])
            }
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
