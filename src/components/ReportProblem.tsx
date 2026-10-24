// Report a problem, shown inside Settings → Help: a patient-friendly way to tell the developer what went wrong.
// Tap what happened, optionally say more (typing or the keyboard's microphone), press Send — the app adds its version
// and phone details and opens an email. No account, no website.
import * as MailComposer from 'expo-mail-composer';
import React, { useState } from 'react';
import { Alert, Linking, Platform, Share, Switch, Text, View } from 'react-native';
import { buildLabel } from '../buildInfo.ts';
import { LockNote } from '../settingsParts.tsx';
import { useStore } from '../store.tsx';
import { TRAINING_EMAIL } from '../training.ts';
import { Button, Card, Chip, Field, Label, s, useTheme } from '../ui.tsx';

const PROBLEMS = [
  'The scan didn’t recognise my medicine',
  'A reminder didn’t come',
  'Something is hard to understand',
  'Something else',
];

export function ReportProblem() {
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
            '— Sent from TakeSure —',
            `App: ${buildLabel()}`,
            `Phone: ${phone()}`,
            `Medicines in the app: ${state.meds.length} · People: ${state.members.length}`,
          ]
        : []),
    ];
    const subject = `TakeSure problem: ${problem ?? 'report'}`;
    const body = lines.join('\n');
    const done = () => {
      setProblem(undefined);
      setMore('');
      Alert.alert('Thank you', 'Your message is ready to send. We read every one.');
    };
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
    <Card>
      <Text style={{ color: t.text, fontSize: 18, fontWeight: '700' }}>Report a problem</Text>
      <Text style={{ color: t.sub, fontSize: 15, lineHeight: 21, marginTop: 4 }}>Tell us what went wrong. It goes by email — no account needed.</Text>
      <LockNote text="Goes by email, with only what you type and choose to include." />

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

      <View style={[s.between, { marginTop: 16 }]}>
        <Text style={{ color: t.text, fontSize: 17, flex: 1, paddingRight: 12 }}>Add app version and phone type (helps us fix it)</Text>
        <Switch value={details} onValueChange={setDetails} accessibilityLabel="Add app version and phone type" />
      </View>
      <Text style={{ color: t.sub, fontSize: 15, marginTop: 6 }}>No medicine names or photos are added.</Text>

      <Button big title="Send" onPress={send} disabled={!problem && !more.trim()} style={{ marginTop: 20 }} />
    </Card>
  );
}
