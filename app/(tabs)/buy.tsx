// Buy list (spec 17, part B): what to buy, how to ask for it, which pharmacy to try, what they said.
// Nothing leaves the phone by itself: Call and WhatsApp open the phone's own apps, and the person presses Send.
import { useCurrentMember } from '../../src/currentMember.tsx';
import React, { useMemo, useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { MemberDot, MemberPicker } from '../../src/components.tsx';
import { answerText, buyItem, buyList, dialable, pharmacyMessage, pharmacyOrder, smsLink, whatsappLink, type BuyItem } from '../../src/buylist.ts';
import { openMapsSearch, pickFromContacts } from '../../src/pharmacyFind.ts';
import { medLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import { addDays, dateKey } from '../../src/time.ts';
import type { FoundAnswer, Pharmacy } from '../../src/types.ts';
import { uid } from '../../src/store.tsx';
import { Button, Card, Chip, Empty, Field, Label, More, NumberField, s, useTheme } from '../../src/ui.tsx';

const READY: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 2 days', days: 2 },
  { label: 'In 3 days', days: 3 },
  { label: 'In a week', days: 7 },
];

export default function Buy() {
  const t = useTheme();
  const { state, now, adjustStock, savePharmacies, recordAnswer } = useStore();
  const [memberId, setMemberId] = useCurrentMember(); // shared with every screen
  const [extra, setExtra] = useState<string[]>([]); // medicines added to the list by hand
  const [showList, setShowList] = useState(false);
  const [bought, setBought] = useState<{ item: BuyItem; qty: number } | null>(null);
  const [asked, setAsked] = useState<Pharmacy | null>(null);
  const [editing, setEditing] = useState<Pharmacy | null>(null);
  const pharmacies = state.pharmacies ?? [];

  const items = useMemo(() => {
    const due = buyList(state, now, memberId);
    const more = state.meds
      .filter((m) => m.active && extra.includes(m.id) && !due.some((i) => i.med.id === m.id) && (!memberId || m.memberId === memberId))
      .map((m) => buyItem(m, now));
    return [...due, ...more];
  }, [state, now, memberId, extra]);
  const others = state.meds.filter((m) => m.active && !items.some((i) => i.med.id === m.id) && (!memberId || m.memberId === memberId));
  const ordered = pharmacyOrder(pharmacies, items);
  const message = pharmacyMessage(items);
  const several = state.members.length > 1;

  const open = (url: string, what: string, p: Pharmacy) =>
    Linking.openURL(url)
      .then(() => setAsked(p))
      .catch(() => Alert.alert(`Couldn't open ${what}`, `Is ${what} on this phone? You can also show the list at the counter.`));

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <MemberPicker value={memberId} onChange={setMemberId} allowAll={several} />

        {!items.length ? (
          <Empty
            title="Nothing to buy this week"
            body="Medicines show here a week before they run out — two weeks for ones that were hard to find last time."
          />
        ) : (
          <>
            <Text style={{ color: t.text, fontSize: 26, fontWeight: '800', marginTop: 8 }}>To buy</Text>
            {items.map((i) => (
              <Card key={i.med.id} style={{ marginTop: 10 }}>
                <Text style={{ color: t.text, fontSize: 21, fontWeight: '800' }}>{i.ask}</Text>
                <Text style={{ color: t.text, fontSize: 18, marginTop: 2 }}>
                  {i.med.unit === 'ml' ? `${i.qty} ml` : `${i.qty} ${i.med.unit}${i.qty === 1 ? '' : 's'}`} · about a month
                </Text>
                <Text style={{ color: i.only ? t.warn : t.sub, fontSize: 16, marginTop: 6, fontWeight: i.only ? '700' : '400' }}>
                  {i.only
                    ? `${i.brands[0]} only — ask the doctor before another brand`
                    : `Usual: ${i.brands[0]}${i.brands.length > 1 ? ` · also fine: ${i.brands.slice(1).join(', ')}` : ''}`}
                </Text>
                {i.daysLeft !== undefined && (
                  <Text style={{ color: i.daysLeft <= 3 ? t.bad : t.sub, fontSize: 16, marginTop: 4, fontWeight: i.daysLeft <= 3 ? '700' : '400' }}>
                    {i.daysLeft === 0 ? 'Runs out today' : `Lasts about ${i.daysLeft} more day${i.daysLeft === 1 ? '' : 's'}`}
                    {i.hard ? ' · was hard to find last time' : ''}
                  </Text>
                )}
                {i.ordered ? (
                  <Text style={{ color: t.ok, fontSize: 16, fontWeight: '700', marginTop: 4 }}>{answerText(i.ordered, pharmacies)}</Text>
                ) : i.lastHad ? (
                  <Text style={{ color: t.sub, fontSize: 16, marginTop: 4 }}>{answerText(i.lastHad, pharmacies)}</Text>
                ) : null}
                {several && <MemberDot memberId={i.med.memberId} />}
                <Button title="Bought — add to stock" kind="secondary" onPress={() => setBought({ item: i, qty: i.qty })} style={{ marginTop: 10 }} />
              </Card>
            ))}

            <Button big title="Show to pharmacist" onPress={() => setShowList(true)} style={{ marginTop: 14 }} />

            <Text style={{ color: t.text, fontSize: 22, fontWeight: '800', marginTop: 24 }}>Ask a pharmacy</Text>
            {!pharmacies.length ? (
              <Card style={{ marginTop: 10 }}>
                <Text style={{ color: t.text, fontSize: 17 }}>Add the pharmacies you buy from. Then one tap calls them, or sends this list on WhatsApp.</Text>
                <Button title="Add a pharmacy" onPress={() => setEditing({ id: '', name: '', whatsapp: true })} style={{ marginTop: 10 }} />
                <Text style={{ color: t.sub, fontSize: 15, marginTop: 8 }}>Kept on this phone and in backups. Never sent anywhere.</Text>
              </Card>
            ) : (
              ordered.map((p, idx) => {
                const hadIt = items.some((i) => i.lastHad?.pharmacyId === p.id);
                return (
                  <Card key={p.id} style={{ marginTop: 10 }}>
                    <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>{p.name}</Text>
                    {idx === 0 && hadIt ? <Text style={{ color: t.ok, fontSize: 16, fontWeight: '700' }}>Had it last time</Text> : null}
                    {p.phone ? <Text style={{ color: t.sub, fontSize: 16 }}>{p.phone}</Text> : null}
                    {p.phone ? (
                      <View style={[s.row, { gap: 8, marginTop: 10 }]}>
                        <Button title="Call" onPress={() => open(`tel:${dialable(p.phone!)}`, 'the phone', p)} style={{ flex: 1 }} />
                        <Button
                          title={p.whatsapp ? 'WhatsApp' : 'Message'}
                          kind="secondary"
                          onPress={() =>
                            p.whatsapp ? open(whatsappLink(p.phone!, message), 'WhatsApp', p) : open(smsLink(p.phone!, message, Platform.OS === 'ios'), 'Messages', p)
                          }
                          style={{ flex: 1 }}
                        />
                      </View>
                    ) : (
                      <Text style={{ color: t.sub, fontSize: 16, marginTop: 6 }}>No phone number saved.</Text>
                    )}
                    <Pressable accessibilityRole="button" onPress={() => setAsked(p)} style={{ minHeight: 44, justifyContent: 'center', marginTop: 4 }}>
                      <Text style={{ color: t.brand, fontWeight: '700', fontSize: 16 }}>Went there or asked already? Note what they said</Text>
                    </Pressable>
                  </Card>
                );
              })
            )}
          </>
        )}

        {others.length > 0 && (
          <More title="Buy something else too">
            <Text style={{ color: t.sub, fontSize: 16 }}>Tap a medicine to add it to the list:</Text>
            <View style={s.wrap}>
              {others.map((m) => (
                <Chip key={m.id} label={medLabel(m)} onPress={() => setExtra((x) => [...x, m.id])} />
              ))}
            </View>
          </More>
        )}

        {/* With no pharmacies yet, "Ask a pharmacy" above already offers to add one: don't show the button twice. */}
        {(pharmacies.length > 0 || !items.length) && (
        <More title="My pharmacies">
          {pharmacies.map((p) => (
            <View key={p.id} style={[s.between, { minHeight: 48 }]}>
              <Text style={{ color: t.text, fontSize: 17, flex: 1 }}>
                {p.name}
                {p.phone ? ` · ${p.phone}` : ''}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setEditing(p)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ color: t.brand, fontWeight: '700', fontSize: 16 }}>Change</Text>
              </Pressable>
            </View>
          ))}
          <Button title="Add a pharmacy" kind="secondary" onPress={() => setEditing({ id: '', name: '', whatsapp: true })} />
          <Text style={{ color: t.sub, fontSize: 15 }}>Kept on this phone and in backups. Never sent anywhere.</Text>
        </More>
        )}
      </ScrollView>

      {/* The list for the counter: big, plain, nothing else. */}
      <Modal visible={showList} animationType="slide" onRequestClose={() => setShowList(false)}>
        <ScrollView style={{ backgroundColor: '#FFFFFF' }} contentContainerStyle={{ padding: 24, paddingTop: 64 }}>
          {items.map((i) => (
            <View key={i.med.id} style={{ marginBottom: 28 }}>
              <Text maxFontSizeMultiplier={1.4} style={{ color: '#000', fontSize: 30, fontWeight: '800' }}>{i.ask}</Text>
              <Text style={{ color: '#000', fontSize: 26 }}>× {i.med.unit === 'ml' ? `${i.qty} ml` : i.qty}</Text>
              <Text style={{ color: '#333', fontSize: 22, marginTop: 4 }}>
                {i.only ? `${i.brands[0]} ONLY` : i.brands.join(' / ')}
              </Text>
            </View>
          ))}
          <Button big title="Close" kind="secondary" onPress={() => setShowList(false)} />
        </ScrollView>
      </Modal>

      <Modal visible={!!bought} transparent animationType="fade" onRequestClose={() => setBought(null)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}>
          {bought && (
            <Card>
              <Text style={[s.h2, { color: t.text }]}>Bought · {medLabel(bought.item.med)}</Text>
              <Text style={{ color: t.sub, fontSize: 16, marginTop: 6, marginBottom: 12 }}>How many {bought.item.med.unit}s did you buy?</Text>
              <NumberField value={bought.qty} onChange={(qty) => setBought({ ...bought, qty })} />
              <Text style={{ color: t.sub, fontSize: 15, marginTop: 10 }}>A different brand? Scan it once at the next dose — the app will ask if it is the same medicine.</Text>
              <View style={[s.row, { gap: 10, marginTop: 16 }]}>
                <Button
                  title="Add to stock"
                  onPress={() => {
                    if (bought.qty > 0) adjustStock(bought.item.med.id, bought.qty, 'refill');
                    setExtra((x) => x.filter((id) => id !== bought.item.med.id));
                    setBought(null);
                  }}
                  style={{ flex: 1 }}
                />
                <Button title="Cancel" kind="secondary" onPress={() => setBought(null)} style={{ flex: 1 }} />
              </View>
            </Card>
          )}
        </View>
      </Modal>

      {asked && <AnswerSheet pharmacy={asked} items={items} onClose={() => setAsked(null)} onSave={(a) => {
        for (const [medId, v] of Object.entries(a)) recordAnswer([medId], asked.id, v.answer, v.readyOn);
        setAsked(null);
      }} today={now} />}

      {editing && (
        <PharmacyForm
          value={editing}
          onCancel={() => setEditing(null)}
          onRemove={
            editing.id
              ? () =>
                  Alert.alert(`Remove ${editing.name}?`, 'What they said before stays with the medicines.', [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => (savePharmacies(pharmacies.filter((p) => p.id !== editing.id)), setEditing(null)) },
                  ])
              : undefined
          }
          onSave={(p) => {
            savePharmacies(p.id ? pharmacies.map((x) => (x.id === p.id ? p : x)) : [...pharmacies, { ...p, id: uid() }]);
            setEditing(null);
          }}
        />
      )}
    </View>
  );
}

type Answers = Record<string, { answer: FoundAnswer; readyOn?: string }>;

/** "What did Apollo say?" — one row of big buttons per medicine. */
function AnswerSheet({ pharmacy, items, today, onSave, onClose }: { pharmacy: Pharmacy; items: BuyItem[]; today: Date; onSave: (a: Answers) => void; onClose: () => void }) {
  const t = useTheme();
  const [a, setA] = useState<Answers>({});
  const set = (medId: string, answer: FoundAnswer, readyOn?: string) => setA((x) => ({ ...x, [medId]: { answer, readyOn } }));
  const allHave = () => setA(Object.fromEntries(items.map((i) => [i.med.id, { answer: 'has' as const }])));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '88%' }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
            <Text style={{ color: t.text, fontSize: 24, fontWeight: '800' }}>What did {pharmacy.name} say?</Text>
            {items.length > 1 && (
              <Pressable accessibilityRole="button" onPress={allHave} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ color: t.brand, fontWeight: '700', fontSize: 16 }}>They have all of them</Text>
              </Pressable>
            )}
            {items.map((i) => {
              const cur = a[i.med.id];
              return (
                <View key={i.med.id} style={{ marginTop: 14 }}>
                  <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>{i.ask}</Text>
                  <View style={[s.wrap, { marginTop: 6 }]}>
                    <Chip label="Has it" active={cur?.answer === 'has'} color={t.okFill} onPress={() => set(i.med.id, 'has')} />
                    <Chip label="Doesn't have it" active={cur?.answer === 'no'} color={t.badFill} onPress={() => set(i.med.id, 'no')} />
                    <Chip label="Will order" active={cur?.answer === 'order'} onPress={() => set(i.med.id, 'order', dateKey(addDays(today, 1)))} />
                  </View>
                  {cur?.answer === 'order' && (
                    <>
                      <Label>Ready when?</Label>
                      <View style={s.wrap}>
                        {READY.map((r) => {
                          const d = dateKey(addDays(today, r.days));
                          return <Chip key={r.label} label={r.label} active={cur.readyOn === d} onPress={() => set(i.med.id, 'order', d)} />;
                        })}
                      </View>
                    </>
                  )}
                </View>
              );
            })}
            <Button big title="Save" disabled={!Object.keys(a).length} onPress={() => onSave(a)} style={{ marginTop: 20 }} />
            <Button title="Not now" kind="ghost" onPress={onClose} style={{ marginTop: 8 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PharmacyForm({ value, onSave, onCancel, onRemove }: { value: Pharmacy; onSave: (p: Pharmacy) => void; onCancel: () => void; onRemove?: () => void }) {
  const t = useTheme();
  const [p, setP] = useState(value);
  const fromContacts = async () => {
    try {
      const c = await pickFromContacts();
      if (c === 'denied') {
        return Alert.alert('Contacts not allowed', 'Type the name and number instead, or allow Contacts for TakeSure in your phone’s Settings.');
      }
      if (!c) return;
      const fill = (phone?: string) => setP((x) => ({ ...x, name: c.name || x.name, phone: phone ?? x.phone }));
      if (c.phones.length > 1) {
        return Alert.alert(c.name || 'Which number?', 'Which number does the pharmacy answer?', [
          ...c.phones.slice(0, 3).map((n) => ({ text: n, onPress: () => fill(n) })),
          { text: 'Cancel', style: 'cancel' as const },
        ]);
      }
      fill(c.phones[0]);
    } catch {
      Alert.alert('Couldn’t open contacts', 'Type the name and number instead.');
    }
  };
  const fromMaps = () =>
    Alert.alert(
      'Find a pharmacy on Google Maps',
      'Maps opens with pharmacies near you. Find the one you want, copy or note its phone number, then come back here and type it in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Maps', onPress: () => openMapsSearch().catch(() => Alert.alert('Couldn’t open Google Maps')) },
      ],
    );
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 20 }}>
        <Card>
          <Text style={[s.h2, { color: t.text }]}>{value.id ? 'Change pharmacy' : 'Add a pharmacy'}</Text>
          {!value.id && (
            <View style={{ gap: 8, marginTop: 12 }}>
              <Button title="Pick from my contacts" onPress={fromContacts} />
              <Button title="Find nearby on Google Maps" kind="secondary" onPress={fromMaps} />
              <Text style={{ color: t.sub, fontSize: 15 }}>Or type it below.</Text>
            </View>
          )}
          <Label>Name</Label>
          <Field value={p.name} onChangeText={(name) => setP({ ...p, name })} placeholder="e.g. Apollo, Gariahat" />
          <Label>Phone number</Label>
          <Field value={p.phone ?? ''} onChangeText={(phone) => setP({ ...p, phone })} placeholder="e.g. 98300 12345" keyboardType="phone-pad" />
          <Label>Takes orders on WhatsApp?</Label>
          <View style={s.wrap}>
            <Chip label="Yes" active={!!p.whatsapp} onPress={() => setP({ ...p, whatsapp: true })} />
            <Chip label="No, SMS" active={!p.whatsapp} onPress={() => setP({ ...p, whatsapp: false })} />
          </View>
          <View style={[s.row, { gap: 10, marginTop: 16 }]}>
            <Button
              title="Save"
              disabled={!p.name.trim()}
              onPress={() => onSave({ ...p, name: p.name.trim(), phone: p.phone?.trim() || undefined })}
              style={{ flex: 1 }}
            />
            <Button title="Cancel" kind="secondary" onPress={onCancel} style={{ flex: 1 }} />
          </View>
          {onRemove && (
            <Pressable accessibilityRole="button" onPress={onRemove} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
              <Text style={{ color: t.bad, fontWeight: '700', fontSize: 16 }}>Remove this pharmacy</Text>
            </Pressable>
          )}
        </Card>
      </View>
    </Modal>
  );
}
