import React from 'react';
import { ScrollView, Text } from 'react-native';
import { doseScanOn } from '../../src/doseScan.ts';
import { AutoScanToggle, CheckStripsCard, DoseScanSetting, ScannerDetailsCard } from '../../src/settingsParts.tsx';
import { useStore } from '../../src/store.tsx';
import { Card, Label, useTheme } from '../../src/ui.tsx';

export default function ScanningPage() {
  const t = useTheme();
  const { state } = useStore();
  const on = doseScanOn(state.settings);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
      <Card>
        <DoseScanSetting />
        {on && <AutoScanToggle />}
      </Card>
      {on && (
        <>
          <Label>Before a first dose</Label>
          <CheckStripsCard />
        </>
      )}
      <Label>For helpers</Label>
      <ScannerDetailsCard />
      <Text style={{ color: t.sub, marginTop: 14, fontSize: 15, lineHeight: 21 }}>
        Adding a medicine by scanning (Medicines → Add) works whether scanning at dose time is on or off.
      </Text>
    </ScrollView>
  );
}
