import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { MemberPicker } from '../../src/components.tsx';
import { doseTime } from '../../src/schedule.ts';
import { uid, useStore } from '../../src/store.tsx';
import { DAY_LABELS, fmt12 } from '../../src/time.ts';
import type { Dose, Meal, MealRelation, Medication } from '../../src/types.ts';
import { Button, Card, Chip, Field, Label, NumberField, s, TimeField, useTheme } from '../../src/ui.tsx';

const UNITS = ['tablet', 'capsule', 'ml', 'drops', 'puff', 'sachet', 'injection'];
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
  const { state, saveMed, deleteMed, updatePendingItem } = useStore();
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
  const setDose = (doseId: string, patch: Partial<Dose>) => set({ doses: med.doses.map((d) => (d.id === doseId ? { ...d, ...patch } : d)) });
  const member = state.members.find((m) => m.id === med.memberId);

  const perDay = useMemo(() => med.doses.reduce((a, d) => a + d.qty * (d.days.length ? d.days.length / 7 : 1), 0), [med.doses]);

  const save = () => {
    if (!med.name.trim()) return Alert.alert('Name needed', 'Enter the name printed on the strip, e.g. Dolo.');
    if (med.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(med.endDate)) return Alert.alert('End date', 'Use the format YYYY-MM-DD, or leave it empty.');
    const now = new Date().toISOString();
    // A dose whose time/days changed only counts from now (so it isn't marked missed retroactively).
    const doses = med.doses.map((d) => {
      const old = existing?.doses.find((x) => x.id === d.id);
      const changed = !old || JSON.stringify([old.timing, old.days]) !== JSON.stringify([d.timing, d.days]) || existing?.memberId !== med.memberId;
      return changed && old ? { ...d, since: now } : d;
    });
    const final = {
      ...med,
      name: med.name.trim(),
      strength: med.strength.trim(),
      aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
      doses,
    };
    if (pendingItem) updatePendingItem(pendingItem.id, { med: final, checked: true, include: true });
    else saveMed(final);
    router.back();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: pendingItem ? 'Check medicine' : existing ? 'Edit medicine' : 'New medicine' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        {pendingItem && (
          <Card style={{ backgroundColor: t.warnSoft, borderColor: t.warnSoft }}>
            <Text style={{ color: t.warn, fontWeight: '700', marginBottom: 4 }}>On the prescription</Text>
            <Text style={{ color: t.text, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{pendingItem.source}</Text>
            {pendingItem.warnings.map((w) => (
              <Text key={w} style={{ color: t.warn, marginTop: 6 }}>
                ⚠ {w}
              </Text>
            ))}
            <Text style={{ color: t.sub, marginTop: 8, fontSize: 13 }}>Compare every field with the prescription, fix anything wrong, then save.</Text>
          </Card>
        )}
        {state.members.length > 1 && !pendingItem && (
          <>
            <Label>For</Label>
            <MemberPicker value={med.memberId} onChange={(v) => v && set({ memberId: v })} />
          </>
        )}

        <Label>Name on strip</Label>
        <Field value={med.name} onChangeText={(name) => set({ name })} placeholder="e.g. Dolo" autoCapitalize="words" />
        <Label>Strength</Label>
        <Field value={med.strength} onChangeText={(strength) => set({ strength })} placeholder="e.g. 650 (as printed)" />
        <Label>Other names on the strip (optional)</Label>
        <Field value={aliases} onChangeText={setAliases} placeholder="e.g. Paracetamol 650" />
        <Text style={{ color: t.sub, marginTop: 6, fontSize: 13 }}>
          The scanner accepts the strip if it reads the name and strength, or any of these names. Separate with commas.
        </Text>

        <Label>Form</Label>
        <View style={s.wrap}>
          {UNITS.map((u) => (
            <Chip key={u} label={u} active={med.unit === u} onPress={() => set({ unit: u })} />
          ))}
        </View>

        <Label>When to take</Label>
        {med.doses.map((d, i) => (
          <Card key={d.id} style={{ marginBottom: 10 }}>
            <View style={s.between}>
              <Text style={{ color: t.text, fontWeight: '700' }}>
                Dose {i + 1}
                {member ? ` · ${fmt12(doseTime(d, member, state.settings))}` : ''}
              </Text>
              <Pressable onPress={() => set({ doses: med.doses.filter((x) => x.id !== d.id) })} hitSlop={10}>
                <Text style={{ color: t.bad, fontWeight: '600' }}>Remove</Text>
              </Pressable>
            </View>
            <View style={[s.wrap, { marginTop: 10 }]}>
              <Chip label="With a meal" active={d.timing.kind === 'meal'} onPress={() => setDose(d.id, { timing: { kind: 'meal', meal: 'breakfast', relation: 'after' } })} />
              <Chip label="Set time" active={d.timing.kind === 'custom'} onPress={() => setDose(d.id, { timing: { kind: 'custom', time: d.timing.kind === 'custom' ? d.timing.time : '22:00' } })} />
            </View>
            {d.timing.kind === 'meal' ? (
              <>
                <View style={s.wrap}>
                  {RELS.map((r) => (
                    <Chip key={r} label={r} active={d.timing.kind === 'meal' && d.timing.relation === r} onPress={() => d.timing.kind === 'meal' && setDose(d.id, { timing: { ...d.timing, relation: r } })} />
                  ))}
                </View>
                <View style={s.wrap}>
                  {MEALS.map((m) => (
                    <Chip key={m} label={m} active={d.timing.kind === 'meal' && d.timing.meal === m} onPress={() => d.timing.kind === 'meal' && setDose(d.id, { timing: { ...d.timing, meal: m } })} />
                  ))}
                </View>
              </>
            ) : (
              <TimeField value={d.timing.time} onChange={(time) => setDose(d.id, { timing: { kind: 'custom', time } })} />
            )}
            <Text style={{ color: t.sub, marginTop: 12, marginBottom: 6 }}>Quantity ({med.unit})</Text>
            <NumberField value={d.qty} step={0.5} min={0.25} onChange={(qty) => setDose(d.id, { qty })} />
            <Text style={{ color: t.sub, marginTop: 12, marginBottom: 6 }}>Days</Text>
            <View style={s.wrap}>
              <Chip label="Every day" active={!d.days.length} onPress={() => setDose(d.id, { days: [] })} />
              {DAY_LABELS.map((lbl, wd) => (
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

        <Label>Stock on hand ({med.unit}s)</Label>
        <NumberField value={med.stock} step={1} onChange={(stock) => set({ stock })} />
        <Label>Warn when stock reaches</Label>
        <NumberField value={med.lowStockAt} step={1} onChange={(lowStockAt) => set({ lowStockAt })} />
        {perDay > 0 && (
          <Text style={{ color: t.sub, marginTop: 6 }}>
            Uses about {+perDay.toFixed(2)} per day · lasts ~{Math.floor(med.stock / perDay)} days
          </Text>
        )}

        <Label>Course ends (optional)</Label>
        <Field value={med.endDate ?? ''} onChangeText={(v) => set({ endDate: v.trim() || undefined })} placeholder="YYYY-MM-DD — leave empty if ongoing" />

        <Label>Notes</Label>
        <Field value={med.notes ?? ''} onChangeText={(notes) => set({ notes })} placeholder="e.g. empty stomach, prescribed by Dr. Rao" multiline />

        {med.barcodes.length > 0 && (
          <>
            <Label>Linked barcodes</Label>
            {med.barcodes.map((b) => (
              <View key={b} style={[s.between, { paddingVertical: 6 }]}>
                <Text style={{ color: t.text, flex: 1 }} numberOfLines={1}>
                  {b}
                </Text>
                <Pressable onPress={() => set({ barcodes: med.barcodes.filter((x) => x !== b) })}>
                  <Text style={{ color: t.bad, fontWeight: '600' }}>Unlink</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        <View style={[s.between, { marginTop: 18 }]}>
          <Text style={{ color: t.text, fontSize: 16 }}>Active (reminders on)</Text>
          <Switch value={med.active} onValueChange={(active) => set({ active })} />
        </View>

        <Button big title={pendingItem ? 'Confirm — this matches the prescription' : 'Save'} onPress={save} style={{ marginTop: 24 }} />
        {existing && (
          <Button
            title="Delete medicine"
            kind="ghost"
            style={{ marginTop: 10 }}
            onPress={() =>
              Alert.alert('Delete medicine?', 'Its history stays in the log.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => (deleteMed(med.id), router.back()) },
              ])
            }
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
