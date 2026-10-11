import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { describeTiming, doseTime, medLabel, qtyLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import { DAY_LABELS, fmt12 } from '../../src/time.ts';
import { Button, Card, s, useTheme } from '../../src/ui.tsx';

export default function Meds() {
  const t = useTheme();
  const { state } = useStore();

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
        const meds = state.meds.filter((m) => m.memberId === member.id);
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
            {!meds.length && <Text style={{ color: t.sub, fontStyle: 'italic' }}>No medicines yet.</Text>}
            {meds.map((med) => (
              <Pressable key={med.id} onPress={() => router.push(`/med/${med.id}`)}>
                <Card style={{ marginBottom: 8, opacity: med.active ? 1 : 0.5 }}>
                  <View style={s.between}>
                    <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', flex: 1 }}>{medLabel(med)}</Text>
                    {!med.active && <Text style={{ color: t.sub }}>Paused</Text>}
                    {med.endDate && <Text style={{ color: t.sub, fontSize: 12 }}>until {med.endDate}</Text>}
                  </View>
                  {med.doses.map((d) => (
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
    </ScrollView>
  );
}
