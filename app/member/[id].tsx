import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { MEMBER_COLORS, newMember, useStore } from '../../src/store.tsx';
import type { Meal, Member } from '../../src/types.ts';
import { Button, Field, Label, s, TimeField, useTheme } from '../../src/ui.tsx';
import { Pressable } from 'react-native';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];

export default function EditMember() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, saveMember, deleteMember } = useStore();
  const existing = state.members.find((m) => m.id === id);
  const [m, setM] = useState<Member>(() => existing ?? { ...newMember('', state.members.length) });
  const medCount = state.meds.filter((x) => x.memberId === m.id).length;

  const save = () => {
    if (!m.name.trim()) return Alert.alert('Name needed');
    saveMember({ ...m, name: m.name.trim() });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? existing.name : 'Add family member' }} />
      <Label>Name</Label>
      <Field value={m.name} onChangeText={(name) => setM({ ...m, name })} placeholder="e.g. Ma, Baba, Aroni" />

      <Label>Colour</Label>
      <View style={s.row}>
        {MEMBER_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setM({ ...m, color: c })}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, marginRight: 10, borderWidth: m.color === c ? 3 : 0, borderColor: t.text }}
          />
        ))}
      </View>

      <Label>Usual meal times</Label>
      <Text style={{ color: t.sub, marginBottom: 8 }}>Doses set to "before / with / after" a meal follow these times.</Text>
      {MEALS.map((meal) => (
        <View key={meal} style={[s.between, { marginBottom: 10 }]}>
          <Text style={{ color: t.text, fontSize: 16, textTransform: 'capitalize' }}>{meal}</Text>
          <TimeField value={m.mealTimes[meal]} onChange={(v) => setM({ ...m, mealTimes: { ...m.mealTimes, [meal]: v } })} />
        </View>
      ))}

      <Button big title="Save" onPress={save} style={{ marginTop: 20 }} />
      {existing && state.members.length > 1 && (
        <Button
          kind="ghost"
          title="Remove family member"
          style={{ marginTop: 10 }}
          onPress={() =>
            Alert.alert(`Remove ${existing.name}?`, `This also removes their ${medCount} medicine(s) and reminders. Past logs are kept.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => (deleteMember(existing.id), router.back()) },
            ])
          }
        />
      )}
    </ScrollView>
  );
}
