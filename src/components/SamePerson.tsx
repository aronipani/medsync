import React from 'react';
import { Alert, Text } from 'react-native';
import { samePersonTwice } from '../consolidate.ts';
import { useStore } from '../store.tsx';
import { Button, Card, useTheme } from '../ui.tsx';

/** "Me and Aroni have the same medicines — one person?" with a way to combine them (keeps every record). */
export function SamePersonCard() {
  const t = useTheme();
  const { state, mergeMembers } = useStore();
  const pairs = samePersonTwice(state.members, state.meds);
  if (!pairs.length) return null;
  const name = (id: string) => state.members.find((m) => m.id === id)?.name ?? '';
  return (
    <>
      {pairs.map(({ a, b, shared }) => (
        <Card key={`${a}|${b}`} style={{ backgroundColor: t.warnSoft, borderColor: t.warn, marginBottom: 14 }}>
          <Text style={{ color: t.warn, fontWeight: '800', fontSize: 17 }}>
            {name(a)} and {name(b)} have the same medicines
          </Text>
          <Text style={{ color: t.text, marginTop: 4, fontSize: 16, lineHeight: 22 }}>
            {shared.slice(0, 4).join(', ')}
            {shared.length > 4 ? ` and ${shared.length - 4} more` : ''}. If they are one person, combine them: every medicine and dose record is kept, and
            each medicine is listed once.
          </Text>
          <Button
            title="They are one person…"
            kind="secondary"
            style={{ marginTop: 10 }}
            onPress={() =>
              Alert.alert('Which name to keep?', 'The other name is removed; its medicines and records move across. You can undo it from History of the list.', [
                { text: 'Cancel', style: 'cancel' },
                { text: `Keep ${name(a)}`, onPress: () => mergeMembers(b, a) },
                { text: `Keep ${name(b)}`, onPress: () => mergeMembers(a, b) },
              ])
            }
          />
          <Text style={{ color: t.sub, marginTop: 8, fontSize: 14 }}>Two different people who take the same medicines? Leave them as they are.</Text>
        </Card>
      ))}
    </>
  );
}
