// Report a problem: a patient-friendly way to tell the family helper / developer what went wrong.
// Tap what happened, optionally say more (typing or the keyboard's microphone), press Send — the app adds its version
// and phone details and opens an email. No account, no website.
import * as MailComposer from 'expo-mail-composer';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, Platform, ScrollView, Share, Switch, Text, View } from 'react-native';
import { buildLabel } from '../../src/buildInfo.ts';
import { freshOnFocus } from '../../src/components/freshOnFocus.tsx';
import { useStore } from '../../src/store.tsx';
import { TRAINING_EMAIL } from '../../src/training.ts';
import { Button, Card, Chip, Field, Label, s, useTheme } from '../../src/ui.tsx';

const PROBLEMS = [
  'The scan didn’t recognise my medicine',
  'A reminder didn’t come',
  'Something is hard to understand',
  'Something else',
];

export default freshOnFocus(Report);

function Report() {
  const t = useTheme();
  const { state } = useStore();
  const [problem, setProblem] = useState<string | undefined>();
  const [more, setMore] = useState('');
  const [details, setDetails] = useState(true);

  const phone = () => {
    const c = Platform.constants as { Model?: string; Manufacturer?: string } | undefined;
    const model = Platform.OS === 'android' ? [c?.Manufacturer, c?.Model].filter(Boolean).join(' ') : 'iPhone';
    return `${model} · ${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`;
  };

  const send = async () => {
    const lines = [
      problem ?? 'Problem not chosen',
      '',
      more.trim() || '(no more details)',
      ...(details
        ? [
            '',
            '— Sent from MedSync —',
            `App: ${buildLabel()}`,
            `Phone: ${phone()}`,
            `Medicines in the app: ${state.meds.length} · People: ${state.members.length}`,
          ]
        : []),
    ];
    const subject = `MedSync problem: ${problem ?? 'report'}`;
    const body = lines.join('\n');
    const done = () =>
      Alert.alert('Thank you', 'Your message is ready to send. We read every one.', [{ text: 'OK', onPress: () => router.back() }]);
    try {
      if (await MailComposer.isAvailableAsync()) {
        const r = await MailComposer.composeAsync({ recipients: [TRAINING_EMAIL], subject, body });
        if (r.status === 'sent' || r.status === 'saved') done();
        return;
      }
      const mailto = `mailto:${TRAINING_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      if (await Linking.canOpenURL(mailto)) {
        await Linking.openURL(mailto); // e.g. Gmail: the person presses Send there
        return;
      }
      // No email at all: share the text (WhatsApp, Messages…) to whoever helps them.
      await Share.share({ message: `${subject}\n\n${body}\n\n(Please send to ${TRAINING_EMAIL})` });
    } catch {
      Alert.alert('Could not open email', `Please write to ${TRAINING_EMAIL}.`);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: t.text, fontSize: 18, lineHeight: 25 }}>Tell us what went wrong. It goes by email — no account needed.</Text>

      <Label>What happened?</Label>
      <View style={s.wrap}>
        {PROBLEMS.map((p) => (
          <Chip key={p} label={p} active={problem === p} onPress={() => setProblem(p)} />
        ))}
      </View>

      <Label>Tell us more (optional)</Label>
      <Field
        value={more}
        onChangeText={setMore}
        multiline
        placeholder="For example: which medicine, and what the screen said"
        style={{ minHeight: 120, textAlignVertical: 'top' }}
      />
      <Text style={{ color: t.sub, fontSize: 16, marginTop: 8 }}>Tip: tap the microphone on the keyboard to speak instead of typing.</Text>

      <Card style={{ marginTop: 20 }}>
        <View style={s.between}>
          <Text style={{ color: t.text, fontSize: 17, flex: 1, paddingRight: 12 }}>Add app version and phone type (helps us fix it)</Text>
          <Switch value={details} onValueChange={setDetails} />
        </View>
        <Text style={{ color: t.sub, fontSize: 15, marginTop: 6 }}>No medicine names or photos are added.</Text>
      </Card>

      <Button big title="Send" onPress={send} disabled={!problem && !more.trim()} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}
