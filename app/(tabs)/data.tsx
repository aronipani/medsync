import { router } from 'expo-router';
import React from 'react';
import { ScrollView } from 'react-native';
import { TRAINING_AVAILABLE } from '../../src/edition.ts';
import { BackupCard, DoctorHistoryCard, Help, TrainingPhotosCard } from '../../src/settingsParts.tsx';
import { Button, Card, Label } from '../../src/ui.tsx';

export default function DataPage() {
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Label>Backup</Label>
      <BackupCard />
      <Label>For the doctor</Label>
      <DoctorHistoryCard />
      <Label>Changes to the list</Label>
      <Card>
        <Button title="Earlier versions of the list" kind="secondary" onPress={() => router.push('/history')} />
        <Help>Every change to the medicines is kept; an earlier list can be brought back or exported.</Help>
      </Card>
      {TRAINING_AVAILABLE && (
        <>
          <Label>Photos for improving the scanner</Label>
          <TrainingPhotosCard />
        </>
      )}
    </ScrollView>
  );
}
