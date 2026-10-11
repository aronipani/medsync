import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import React, { useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { MemberDot, MemberPicker, StatusBadge } from '../../src/components.tsx';
import { medLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import { dateKey, fmt12, fmtDay } from '../../src/time.ts';
import type { Medication } from '../../src/types.ts';
import { Button, Card, Chip, Empty, NumberField, s, useTheme } from '../../src/ui.tsx';

const perDay = (m: Medication) => m.doses.reduce((a, d) => a + d.qty * (d.days.length ? d.days.length / 7 : 1), 0);
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export default function Inventory() {
  const t = useTheme();
  const { state, now, adjustStock } = useStore();
  const [tab, setTab] = useState<'stock' | 'history'>('stock');
  const [memberId, setMemberId] = useState<string | undefined>();
  const [refill, setRefill] = useState<{ med: Medication; qty: number } | null>(null);
  const today = dateKey(now);
  const memberName = (id: string) => state.members.find((m) => m.id === id)?.name ?? '—';

  const meds = state.meds.filter((m) => !memberId || m.memberId === memberId);

  // History: dose logs + refills, newest first, grouped by day.
  const history = useMemo(() => {
    type Row = { id: string; at: string; day: string; kind: 'dose' | 'stock'; node: React.ReactNode };
    const rows: Row[] = [];
    for (const l of state.logs) {
      if (memberId && l.memberId !== memberId) continue;
      rows.push({ id: l.id, at: l.status === 'taken' ? l.at : `${l.date}T${l.time}`, day: l.date, kind: 'dose', node: null });
    }
    for (const e of state.stock) {
      if (e.reason !== 'refill' && e.reason !== 'adjust') continue;
      if (memberId && e.memberId !== memberId) continue;
      rows.push({ id: e.id, at: e.at, day: dateKey(new Date(e.at)), kind: 'stock', node: null });
    }
    rows.sort((a, b) => (a.day === b.day ? b.at.localeCompare(a.at) : b.day.localeCompare(a.day)));
    return rows.slice(0, 300);
  }, [state.logs, state.stock, memberId]);

  const exportCsv = async () => {
    const lines = [
      ['Type', 'Person', 'Medicine', 'Scheduled date', 'Scheduled time', 'Status', 'Recorded at', 'Quantity', 'Method'].map(csv).join(','),
      ...state.logs.map((l) => ['dose', memberName(l.memberId), l.medName, l.date, l.time, l.status, l.at, l.qty, l.method].map(csv).join(',')),
      ...state.stock
        .filter((e) => e.reason === 'refill' || e.reason === 'adjust')
        .map((e) => [e.reason, memberName(e.memberId), e.medName, '', '', '', e.at, e.delta, ''].map(csv).join(',')),
    ];
    try {
      const file = new File(Paths.cache, `medsync-history-${today}.csv`);
      file.write(lines.join('\n'));
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export medicine history' });
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={s.row}>
          <Chip label="Stock" active={tab === 'stock'} onPress={() => setTab('stock')} />
          <Chip label="History" active={tab === 'history'} onPress={() => setTab('history')} />
          <View style={{ flex: 1 }} />
          {tab === 'history' && (
            <Pressable onPress={exportCsv} hitSlop={10}>
              <Text style={{ color: t.brand, fontWeight: '700' }}>Export CSV</Text>
            </Pressable>
          )}
        </View>
        <MemberPicker value={memberId} onChange={setMemberId} allowAll={state.members.length > 1} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 40 }}>
        {tab === 'stock' &&
          (!meds.length ? (
            <Empty title="No medicines" body="Add medicines in the Schedule tab." />
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
                      <Text style={{ color: t.sub, fontSize: 12 }}>{m.unit}s left</Text>
                    </View>
                  </View>
                  <Text style={{ color: low ? t.warn : t.sub, marginTop: 6 }}>
                    {low ? 'Low stock — refill soon. ' : ''}
                    {days !== undefined && m.active ? `Lasts about ${days} day${days === 1 ? '' : 's'}.` : ''}
                  </Text>
                  <View style={[s.row, { gap: 8, marginTop: 10 }]}>
                    <Button title="Refill" onPress={() => setRefill({ med: m, qty: 10 })} style={{ flex: 1 }} />
                    <Button
                      title="Correct count"
                      kind="secondary"
                      style={{ flex: 1 }}
                      onPress={() => setRefill({ med: m, qty: -1 })}
                    />
                  </View>
                </Card>
              );
            })
          ))}

        {tab === 'history' &&
          (!history.length ? (
            <Empty title="No history yet" body="Taken, missed and skipped doses and refills appear here." />
          ) : (
            history.map((row, i) => {
              const showDay = i === 0 || history[i - 1].day !== row.day;
              const header = showDay ? (
                <Text style={{ color: t.sub, fontWeight: '700', marginTop: i ? 16 : 4, marginBottom: 6 }}>{fmtDay(row.day, today)}</Text>
              ) : null;
              if (row.kind === 'stock') {
                const e = state.stock.find((x) => x.id === row.id)!;
                return (
                  <View key={row.id}>
                    {header}
                    <Card style={{ marginBottom: 6, paddingVertical: 10 }}>
                      <View style={s.between}>
                        <Text style={{ color: t.text, fontWeight: '600', flex: 1 }}>
                          {e.reason === 'refill' ? 'Refilled' : 'Count corrected'} · {e.medName}
                        </Text>
                        <Text style={{ color: e.delta >= 0 ? t.ok : t.bad, fontWeight: '700' }}>
                          {e.delta >= 0 ? '+' : ''}
                          {e.delta}
                        </Text>
                      </View>
                      <Text style={{ color: t.sub, marginTop: 2 }}>{timeOf(e.at)} · {memberName(e.memberId)}</Text>
                    </Card>
                  </View>
                );
              }
              const l = state.logs.find((x) => x.id === row.id)!;
              return (
                <View key={row.id}>
                  {header}
                  <Card style={{ marginBottom: 6, paddingVertical: 10 }}>
                    <View style={s.between}>
                      <Text style={{ color: t.text, fontWeight: '600', flex: 1 }}>{l.medName}</Text>
                      <StatusBadge status={l.status} />
                    </View>
                    <Text style={{ color: t.sub, marginTop: 2 }}>
                      Due {fmt12(l.time)}
                      {l.status === 'taken' ? ` · taken ${timeOf(l.at)} · ${l.qty} via ${l.method === 'text' ? 'strip name' : l.method}` : ''}
                      {state.members.length > 1 ? ` · ${memberName(l.memberId)}` : ''}
                    </Text>
                  </Card>
                </View>
              );
            })
          ))}
      </ScrollView>

      <Modal visible={!!refill} transparent animationType="fade" onRequestClose={() => setRefill(null)}>
        <View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}>
          {refill && (
            <Card>
              <Text style={[s.h2, { color: t.text }]}>{refill.qty < 0 ? 'Correct count' : 'Refill'} · {medLabel(refill.med)}</Text>
              <Text style={{ color: t.sub, marginTop: 6, marginBottom: 12 }}>
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
