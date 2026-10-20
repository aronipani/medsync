import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { DOSE_SCAN_DISCLOSURE, DOSE_SCAN_DISCLOSURE_VERSION } from '../doseScan.ts';
import { useStore } from '../store.tsx';
import { Button, Card, useTheme } from '../ui.tsx';

/** The disclosure, and turning the dose-time scan check on after reading it (spec 19). */
export function DoseScanDisclosure({ onDone }: { onDone?: () => void }) {
  const t = useTheme();
  const { state, saveSettings } = useStore();
  const [read, setRead] = useState(false);
  return (
    <Card style={{ marginTop: 12 }}>
      <Text style={{ color: t.text, fontSize: 20, fontWeight: '800' }}>Before you turn on scanning</Text>
      {DOSE_SCAN_DISCLOSURE.map((p) => (
        <Text key={p} style={{ color: t.text, fontSize: 17, lineHeight: 24, marginTop: 10 }}>
          {p}
        </Text>
      ))}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: read }}
        onPress={() => setRead((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, minHeight: 48 }}
      >
        <View
          style={{ width: 28, height: 28, borderRadius: 6, borderWidth: 2, borderColor: t.text, marginRight: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: read ? t.text : 'transparent' }}
        >
          {read && <Text style={{ color: t.bg, fontWeight: '900', fontSize: 18 }}>✓</Text>}
        </View>
        <Text style={{ color: t.text, fontSize: 17, flex: 1 }}>I have read this and understand it</Text>
      </Pressable>
      <Button
        big
        title="Turn on scanning"
        disabled={!read}
        onPress={() => {
          saveSettings({ ...state.settings, doseScan: { on: true, at: new Date().toISOString(), disclosure: DOSE_SCAN_DISCLOSURE_VERSION } });
          onDone?.();
        }}
        style={{ marginTop: 12 }}
      />
    </Card>
  );
}

/** Shown on the Scan tab and Check the strips when the dose-time scan check is off. */
export function DoseScanOff() {
  const t = useTheme();
  const [show, setShow] = useState(false);
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '800' }}>Scanning at dose time is off</Text>
      <Text style={{ color: t.text, fontSize: 17, lineHeight: 24, marginTop: 8 }}>
        TakeSure was set up in the US, where it gives reminders and keeps a record of what was taken. Mark doses as taken on the Today tab. Adding a medicine by scanning
        still works.
      </Text>
      {show ? <DoseScanDisclosure /> : <Button title="Turn on scanning" kind="secondary" onPress={() => setShow(true)} style={{ marginTop: 16 }} />}
    </View>
  );
}
