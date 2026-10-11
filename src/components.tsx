import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useStore } from './store.tsx';
import type { OccurrenceStatus } from './types.ts';
import { Chip, useTheme } from './ui.tsx';

export function MemberPicker({ value, onChange, allowAll }: { value: string | undefined; onChange: (id: string | undefined) => void; allowAll?: boolean }) {
  const { state } = useStore();
  if (state.members.length < 2 && !allowAll) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 4 }}>
      {allowAll && <Chip label="Everyone" active={!value} onPress={() => onChange(undefined)} />}
      {state.members.map((m) => (
        <Chip key={m.id} label={m.name} color={m.color} active={value === m.id} onPress={() => onChange(m.id)} />
      ))}
    </ScrollView>
  );
}

export function StatusBadge({ status }: { status: OccurrenceStatus }) {
  const t = useTheme();
  const map: Record<OccurrenceStatus, [string, string, string]> = {
    taken: ['Taken', t.okSoft, t.ok],
    missed: ['Missed', t.badSoft, t.bad],
    skipped: ['Skipped', t.muted, t.sub],
    due: ['Due now', t.warnSoft, t.warn],
    upcoming: ['Upcoming', t.muted, t.sub],
  };
  const [label, bg, fg] = map[status];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: fg, fontWeight: '700', fontSize: 12 }}>{label}</Text>
    </View>
  );
}

export function MemberDot({ memberId }: { memberId: string }) {
  const { state } = useStore();
  const m = state.members.find((x) => x.id === memberId);
  if (!m || state.members.length < 2) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color, marginRight: 6 }} />
      <Text style={{ color: m.color, fontWeight: '600', fontSize: 13 }}>{m.name}</Text>
    </View>
  );
}
