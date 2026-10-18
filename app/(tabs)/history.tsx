import { useCurrentMember } from '../../src/currentMember.tsx';
import { File, Paths } from 'expo-file-system';
import { Tabs } from 'expo-router';
import { freshOnFocus } from '../../src/components/freshOnFocus.tsx';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { MemberPicker } from '../../src/components.tsx';
import { describeMedTimes } from '../../src/describe.ts';
import { medLabel } from '../../src/schedule.ts';
import { useStore } from '../../src/store.tsx';
import type { ScheduleVersion } from '../../src/types.ts';
import { Button, Card, Empty, s, useTheme } from '../../src/ui.tsx';

const KIND_LABEL: Record<string, string> = {
  added: 'Added',
  changed: 'Updated',
  stopped: 'Stopped',
  merged: 'Merged',
  removed: 'Deleted',
  restored: 'Restored',
  edited: 'Edited',
};

const csv = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

export default freshOnFocus(History);

function History() {
  const t = useTheme();
  const { state, restoreVersion } = useStore();
  const [memberId, setMemberId] = useCurrentMember(); // shared with every screen
  const [open, setOpen] = useState<ScheduleVersion>();
  const name = (id: string) => state.members.find((m) => m.id === id)?.name ?? '—';
  const versions = [...(state.history ?? [])].filter((v) => !memberId || v.memberId === memberId).reverse();
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

  const exportLog = async () => {
    const rows = [
      ['When', 'Person', 'Reason', 'Change', 'Medicine', 'Details'].map(csv).join(','),
      ...(state.history ?? []).flatMap((v) =>
        v.changes.map((c) => [v.at, name(v.memberId), v.reason, KIND_LABEL[c.kind] ?? c.kind, c.medName, c.detail ?? ''].map(csv).join(',')),
      ),
    ];
    try {
      const file = new File(Paths.cache, `medsync-schedule-changes.csv`);
      file.write(rows.join('\n'));
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Export schedule changes' });
    } catch (e) {
      Alert.alert('Export failed', String(e));
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs.Screen options={{ title: 'Earlier versions of the list' }} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text style={{ color: t.sub, lineHeight: 20, marginBottom: 8 }}>
          Every change to a schedule — a new prescription, an edit, a merge — saves the schedule as it was just before. Tap one to see that version or go back to it.
        </Text>
        <MemberPicker value={memberId} onChange={setMemberId} allowAll={state.members.length > 1} />
        {!versions.length && <Empty title="No changes yet" body="Changes to the schedule will be listed here." />}
        {versions.map((v) => (
          <Pressable accessibilityRole="button" key={v.id} onPress={() => setOpen(v)}>
            <Card style={{ marginTop: 10 }}>
              <View style={s.between}>
                <Text style={{ color: t.text, fontWeight: '700', flex: 1 }}>{v.reason}</Text>
                <Text style={{ color: t.sub, fontSize: 14 }}>{when(v.at)}</Text>
              </View>
              {state.members.length > 1 && <Text style={{ color: t.sub, marginTop: 2 }}>{name(v.memberId)}</Text>}
              {v.changes.slice(0, 6).map((c, i) => (
                <Text key={i} style={{ color: t.text, marginTop: 4 }}>
                  <Text style={{ fontWeight: '700' }}>{KIND_LABEL[c.kind] ?? c.kind}</Text> {c.medName !== '—' ? c.medName : ''}
                  {c.detail ? <Text style={{ color: t.sub }}> — {c.detail}</Text> : null}
                </Text>
              ))}
              {v.changes.length > 6 && <Text style={{ color: t.sub, marginTop: 4 }}>+{v.changes.length - 6} more</Text>}
            </Card>
          </Pressable>
        ))}
        {!!state.history?.length && <Button title="Export change log (CSV)" kind="secondary" onPress={exportLog} style={{ marginTop: 16 }} />}
      </ScrollView>

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(undefined)}>
        {open && (
          <View style={{ flex: 1, backgroundColor: t.bg }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 24, paddingBottom: 40 }}>
              <Text style={[s.h2, { color: t.text }]}>Before: {open.reason}</Text>
              <Text style={{ color: t.sub, marginTop: 2 }}>
                {name(open.memberId)} · saved {when(open.at)}
              </Text>
              <Text style={{ color: t.sub, marginTop: 14, fontSize: 16, fontWeight: '700' }}>The list at that time</Text>
              {!open.before.length && <Text style={{ color: t.sub, marginTop: 6 }}>No medicines.</Text>}
              {open.before.map((m) => {
                const member = state.members.find((x) => x.id === m.memberId);
                return (
                  <Card key={m.id} style={{ marginTop: 8, opacity: m.active ? 1 : 0.55 }}>
                    <Text style={{ color: t.text, fontWeight: '700' }}>
                      {medLabel(m)}
                      {!m.active ? '  (stopped)' : ''}
                    </Text>
                    <Text style={{ color: t.sub, marginTop: 2 }}>{member ? describeMedTimes(m, member, state.settings) || 'No times' : ''}</Text>
                  </Card>
                );
              })}
              {open.source ? (
                <>
                  <Text style={{ color: t.sub, marginTop: 14, fontSize: 16, fontWeight: '700' }}>Prescription that made the change</Text>
                  <Text style={{ color: t.text, marginTop: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 }}>{open.source}</Text>
                </>
              ) : null}
              <Button
                big
                title="Go back to this version"
                style={{ marginTop: 20 }}
                onPress={() =>
                  Alert.alert('Restore this version?', `${name(open.memberId)}'s schedule will go back to how it was before "${open.reason}". The current one is saved in History first.`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Restore',
                      onPress: () => {
                        restoreVersion(open.id);
                        setOpen(undefined);
                      },
                    },
                  ])
                }
              />
              <Button title="Close" kind="ghost" onPress={() => setOpen(undefined)} />
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}
