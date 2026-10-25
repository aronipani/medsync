import { router } from 'expo-router';
import React from 'react';
import { Alert, Text, View } from 'react-native';
import { LockNote } from '../settingsParts.tsx';
import { findPerson, type PersonFile } from '../personFile.ts';
import { pickPersonFile, sharePerson } from '../personShare.ts';
import { starterPerson, useStore } from '../store.tsx';
import { fmt12, clockIn, otherZone, zoneLabel } from '../time.ts';
import { Button, useTheme } from '../ui.tsx';

/** Opening a file another phone sent: adds or updates one person (spec 20). Used by Family and Add medicine. */
export function usePersonImport(): () => Promise<void> {
  const { state, importPerson } = useStore();

  const apply = (file: PersonFile, into?: string) => {
    const r = importPerson(file, into);
    const n = (k: string) => r.changes.filter((c) => c.kind === k).length;
    const parts = [
      r.newPerson ? `${file.member.name} added` : `${file.member.name} updated`,
      n('added') && `${n('added')} new medicine${n('added') > 1 ? 's' : ''}`,
      n('changed') && `${n('changed')} changed`,
      n('stopped') && `${n('stopped')} stopped`,
      r.logsAdded && `${r.logsAdded} dose record${r.logsAdded > 1 ? 's' : ''} added`,
    ].filter(Boolean);
    const zone = otherZone(file.member.timeZone) ? `\n\nThey live in ${zoneLabel(file.member.timeZone!)} (${fmt12(clockIn(new Date(), file.member.timeZone))} there now): their reminders stay on their own phone.` : '';
    Alert.alert('Done', `${parts.join(', ')}.${zone}\n\nWhat was here before is kept: Medicines → History of the list.`, [
      { text: 'Show them', onPress: () => router.push({ pathname: '/member/[id]', params: { id: r.memberId } }) },
      { text: 'OK' },
    ]);
  };

  const open = async () => {
    try {
      const res = await pickPersonFile();
      if (!res) return;
      if (!res.ok) return Alert.alert("Can't open this file", res.error);
      const f = res.file;
      const what = `${f.meds.filter((m) => m.active).length} medicines, sent ${new Date(f.exportedAt).toLocaleDateString()}.`;
      const { same, sameName } = findPerson(state, f);
      if (same)
        return Alert.alert(`Update ${same.name}?`, `${what}\n\nTheir medicines and times will be set as in this file. Doses recorded here are kept.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: `Update ${same.name}`, onPress: () => apply(f, same.id) },
        ]);
      if (sameName)
        return Alert.alert(`Is this the same ${f.member.name}?`, `${what}\n\nThere is already someone called ${sameName.name} on this phone.`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add as a new person', onPress: () => apply(f) },
          { text: `Yes, update ${sameName.name}`, onPress: () => apply(f, sameName.id) },
        ]);
      // Not found by name: it may be this phone's "Me" (the same person, sent from another phone under their name).
      // Only asked when it's plausible: "Me" has no medicines yet, or shares one with the file. Otherwise a caregiver
      // opening a parent's file could merge it into their own "Me" and pause their own medicines (review 24 Oct 2026).
      const me = starterPerson(state.members);
      const key = (n: string) => n.trim().toLowerCase().split(/\s+/)[0] ?? '';
      const mine = me ? state.meds.filter((m) => m.memberId === me.id && m.active) : [];
      const shares = mine.some((m) => f.meds.some((x) => key(x.name) === key(m.name)));
      if (me && (!mine.length || shares))
        return Alert.alert(`Is ${f.member.name} "${me.name}" on this phone?`, `${what}\n\nIf so, "${me.name}" is updated and renamed ${f.member.name}, instead of adding a second person.`, [
          { text: `No — add ${f.member.name}`, onPress: () => apply(f) },
          { text: `Yes — update "${me.name}"`, onPress: () => apply(f, me.id) },
          { text: 'Cancel', style: 'cancel' },
        ]);
      Alert.alert(`Add ${f.member.name}?`, what, [
        { text: 'Cancel', style: 'cancel' },
        { text: `Add ${f.member.name}`, onPress: () => apply(f) },
      ]);
    } catch (e) {
      Alert.alert("Can't open this file", e instanceof Error ? e.message : String(e));
    }
  };

  return open;
}

/** Share with family: send each person, or open a file someone sent. */
export function PersonImport() {
  const t = useTheme();
  const { state } = useStore();
  const open = usePersonImport();
  return (
    <>
      {/* Sending: one button per person, so it's found here and not only at the bottom of their screen. */}
      {state.members.map((m) => (
        <Button
          key={m.id}
          title={`Send ${m.name}'s medicines`}
          kind="secondary"
          onPress={() => sharePerson(state, m.id).catch((e) => Alert.alert('Could not share', e instanceof Error ? e.message : String(e)))}
          style={{ marginBottom: 8 }}
        />
      ))}
      <Text style={{ color: t.sub, fontSize: 15, lineHeight: 21 }}>
        Sends that person's medicines, times and recent doses (WhatsApp, email…), for a family member's or caregiver's phone.
      </Text>
      <LockNote />
      <View style={{ height: 14 }} />
      <Button title="Open a file someone sent" kind="secondary" onPress={open} />
      <Text style={{ color: t.sub, marginTop: 8, fontSize: 15, lineHeight: 21 }}>
        A family member's medicines sent from another phone (WhatsApp, email…). Only that person is added or updated.
      </Text>
    </>
  );
}
