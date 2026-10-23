// The three scan colours with their symbol, words and what to do (spec 22). Shared by Help → How to use TakeSure
// and, later, the last step of the first setup. Each row can be heard aloud in the person's language.
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useCurrentMember } from '../currentMember.tsx';
import { COLOUR_KEY, spokenColour, type ColourKind } from '../howto.ts';
import { say, stopSpeaking } from '../speech.ts';
import { useStore } from '../store.tsx';
import { useTheme } from '../ui.tsx';

/** The person whose language the guide speaks: the one chosen on Today/Scan, else the first person. */
export function useGuideLanguage() {
  const { state } = useStore();
  const [id] = useCurrentMember();
  const m = state.members.find((x) => x.id === id) ?? state.members[0];
  return m?.language ?? 'en';
}

export function ColourKey() {
  const t = useTheme();
  const lang = useGuideLanguage();
  const fill: Record<ColourKind, string> = { go: t.okFill, check: t.warnFill, stop: t.badFill };
  React.useEffect(() => stopSpeaking, []);
  return (
    <View style={{ gap: 10, marginTop: 6 }}>
      {COLOUR_KEY.map((row) => (
        <View
          key={row.kind}
          style={{ backgroundColor: fill[row.kind], borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}
        >
          <View accessible accessibilityLabel={`${row.title}. ${row.meaning}`} style={{ flex: 1, flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontSize: 30, fontWeight: '800', width: 36, textAlign: 'center' }}>{row.symbol}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>{row.title}</Text>
              <Text style={{ color: '#FFFFFF', fontSize: 16, marginTop: 2 }}>{row.meaning}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Hear: ${row.title}`}
            hitSlop={6}
            onPress={() => {
              const s = spokenColour(lang, row.kind);
              say(s.lang, s.text);
            }}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              borderRadius: 26,
              borderWidth: 1.5,
              borderColor: '#FFFFFFAA',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons name="volume-high-outline" size={26} color="#FFFFFF" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
