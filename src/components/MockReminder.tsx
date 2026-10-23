// A picture of a TakeSure reminder, drawn in the app (not a real notification), so a new person knows what to
// expect at medicine time (spec 22). Uses the real wording from src/notifications.ts.
import React from 'react';
import { Text, View } from 'react-native';
import { EXAMPLE_REMINDER } from '../howto.ts';
import { useTheme } from '../ui.tsx';

export function MockReminder() {
  const t = useTheme();
  const r = EXAMPLE_REMINDER;
  return (
    <View
      accessible
      accessibilityLabel={`Example reminder: ${r.title}. ${r.body}. Buttons: ${r.actions.join(', ')}.`}
      style={{ backgroundColor: t.muted, borderRadius: 18, padding: 14, marginTop: 6 }}
    >
      <Text style={{ color: t.sub, fontSize: 14, fontWeight: '600' }}>TakeSure · now</Text>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', marginTop: 4 }}>{r.title}</Text>
      <Text style={{ color: t.text, fontSize: 16, marginTop: 2 }}>{r.body}</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {r.actions.map((a, i) => (
          <View
            key={a}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: i === 0 ? t.ink : t.card,
            }}
          >
            <Text style={{ color: i === 0 ? t.onInk : t.text, fontSize: 16, fontWeight: '700' }}>{a}</Text>
          </View>
        ))}
      </View>
      <Text style={{ color: t.sub, fontSize: 15, marginTop: 10 }}>This is only a picture. Your reminders look like this.</Text>
    </View>
  );
}
