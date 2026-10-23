import { router } from 'expo-router';
import React from 'react';
import { ScrollView } from 'react-native';
import { PersonImport } from '../../src/components/PersonImport.tsx';
import { SettingsRow } from '../../src/components/SettingsRow.tsx';
import { SamePersonCard } from '../../src/components/SamePerson.tsx';
import { useStore } from '../../src/store.tsx';
import { fmt12, otherZone, zoneLabel } from '../../src/time.ts';
import { Button, Card, Label } from '../../src/ui.tsx';

/** Everyone on this phone, and sharing a person with another phone (spec 20, 21). */
export default function FamilyPage() {
  const { state } = useStore();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <SamePersonCard />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {state.members.map((m, i) => {
          const n = state.meds.filter((x) => x.memberId === m.id && x.active).length;
          return (
            <SettingsRow
              key={m.id}
              icon="person-circle-outline"
              title={m.name}
              line={[
                `${n} medicine${n === 1 ? '' : 's'}`,
                otherZone(m.timeZone) ? `lives in ${zoneLabel(m.timeZone)}` : `breakfast ${fmt12(m.mealTimes.breakfast)}`,
              ].join(' · ')}
              onPress={() => router.push({ pathname: '/member/[id]', params: { id: m.id } })}
              last={i === state.members.length - 1}
            />
          );
        })}
      </Card>
      <Button title="+ Add a person" kind="secondary" onPress={() => router.push('/member/new')} style={{ marginTop: 12 }} />

      <Label>Share with family</Label>
      <Card>
        <PersonImport />
      </Card>
    </ScrollView>
  );
}
