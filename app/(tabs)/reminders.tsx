import React from 'react';
import { ScrollView } from 'react-native';
import { FineTune, TestReminderCard } from '../../src/settingsParts.tsx';
import { Label, More } from '../../src/ui.tsx';

export default function RemindersPage() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <TestReminderCard />
      <Label>Fine-tune</Label>
      <More title="Dose times and reminder timing">
        <FineTune />
      </More>
    </ScrollView>
  );
}
