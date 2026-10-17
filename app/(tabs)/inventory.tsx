import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { MemberDot, MemberPicker } from '../../src/components.tsx';
import { expiryStatus, formatExpiry } from '../../src/expiry.ts';
import { medLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import type { Medication } from '../../src/types.ts';
import { Button, Card, Chip, Empty, NumberField, s, useTheme } from '../../src/ui.tsx';

const perDay = (m: Medication) => m.doses.reduce((a, d) => a + d.qty * (d.days.length ? d.days.length / 7 : 1), 0);

export default function Inventory() {
  const t = useTheme();
  const { state, now, adjustStock, setExpiry } = useStore();
  const [memberId, setMemberId] = useState<string | undefined>();
  const [refill, setRefill] = useState<{ med: Medication; qty: number } | null>(null);

  // Refill box starts at the amount added last time for this medicine (a strip or box is usually the same size).
  const lastRefill = (medId: string) => {
    const e = [...state.stock].reverse().find((x) => x.medId === medId && x.reason === 'refill' && x.delta > 0);
    return e?.delta ?? 10;
  };
  // The ones running out soonest first.
  const daysLeft = (m: Medication) => (perDay(m) ? m.stock / perDay(m) : Infinity);
  const meds = state.meds.filter((m) => !memberId || m.memberId === memberId).sort((a, b) => daysLeft(a) - daysLeft(b));


  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <MemberPicker value={memberId} onChange={setMemberId} allowAll={state.members.length > 1} />
        <Button title="Buy list and pharmacies" kind="secondary" onPress={() => router.navigate('/buy')} style={{ marginTop: 8 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}>
        {(!meds.length ? (
            <Empty title="No medicines" body="Add medicines first." />
          ) : (
            meds.map((m) => {
              const pd = perDay(m);
              const days = pd ? Math.floor(m.stock / pd) : undefined;
              const low = m.stock <= m.lowStockAt;
              return (
                <Card key={m.id} style={{ marginBottom: 10, borderColor: low ? t.warn : t.line }}>
                  <View style={s.between}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{medLabel(m)}</Text>
                      <MemberDot memberId={m.memberId} />
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: low ? t.warn : t.text, fontSize: 22, fontWeight: '800' }}>{m.stock}</Text>
                      <Text style={{ color: t.sub, fontSize: 14 }}>{m.unit}s left</Text>
                    </View>
                  </View>
                  <Text style={{ color: low ? t.warn : t.sub, fontSize: 16, marginTop: 6 }}>
                    {low ? 'Low stock — refill soon. ' : ''}
                    {days !== undefined && m.active ? `Lasts about ${days} day${days === 1 ? '' : 's'}.` : ''}
                  </Text>
                  {m.expiry ? (
                    <View style={[s.row, { marginTop: 4 }]}>
                      {(() => {
                        const st = expiryStatus(m.expiry);
                        const text = st === 'expired' ? `Strip expired ${formatExpiry(m.expiry)} — replace it` : st === 'soon' ? `Expires soon — end of ${formatExpiry(m.expiry)}` : `Strip expires ${formatExpiry(m.expiry)}`;
                        return <Text style={{ color: st === 'expired' ? t.bad : st === 'soon' ? t.warn : t.sub, fontSize: 16, fontWeight: st === 'ok' ? '400' : '700', flex: 1 }}>{text}</Text>;
                      })()}
                      <Pressable
                        accessibilityRole="button"
                        style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}
                        onPress={() =>
                          Alert.alert('New strip?', 'Forget this expiry date? The next scan reads the new one.', [
                            { text: 'Keep it', style: 'cancel' },
                            { text: 'Forget date', onPress: () => setExpiry(m.id, undefined) },
                          ])
                        }
                      >
                        <Text style={{ color: t.brand, fontWeight: '700', fontSize: 16 }}>New strip</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <View style={[s.row, { gap: 8, marginTop: 10 }]}>
                    <Button title="Refill" onPress={() => setRefill({ med: m, qty: lastRefill(m.id) })} style={{ flex: 1 }} />
                    <Button
                      title="Fix the count"
                      kind="secondary"
                      style={{ flex: 1 }}
                      onPress={() => setRefill({ med: m, qty: -1 })}
                    />
                  </View>
                </Card>
              );
            })
          ))}

      </ScrollView>

      <Modal visible={!!refill} transparent animationType="fade" onRequestClose={() => setRefill(null)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}>
          {refill && (
            <Card>
              <Text style={[s.h2, { color: t.text }]}>{refill.qty < 0 ? 'Fix the count' : 'Refill'} · {medLabel(refill.med)}</Text>
              <Text style={{ color: t.sub, fontSize: 16, marginTop: 6, marginBottom: 12 }}>
                {refill.qty < 0 ? `How many ${refill.med.unit}s are actually left?` : `How many ${refill.med.unit}s did you add?`}
              </Text>
              <RefillInput
                initial={refill.qty < 0 ? refill.med.stock : refill.qty}
                onDone={(n) => {
                  if (refill.qty < 0) adjustStock(refill.med.id, n - refill.med.stock, 'adjust');
                  else if (n > 0) adjustStock(refill.med.id, n, 'refill');
                  setRefill(null);
                }}
                onCancel={() => setRefill(null)}
              />
            </Card>
          )}
        </View>
      </Modal>
    </View>
  );
}

function RefillInput({ initial, onDone, onCancel }: { initial: number; onDone: (n: number) => void; onCancel: () => void }) {
  const [n, setN] = useState(initial);
  return (
    <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
        {[10, 15, 30].map((q) => (
          <Chip key={q} label={`${q}`} active={n === q} onPress={() => setN(q)} />
        ))}
      </View>
      <NumberField value={n} onChange={setN} />
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Button title="Save" onPress={() => onDone(n)} style={{ flex: 1 }} />
        <Button title="Cancel" kind="secondary" onPress={onCancel} style={{ flex: 1 }} />
      </View>
    </>
  );
}
