// Settings → Help → How to use TakeSure (spec 22): a few short cards, each opens on tap. Works offline, no video.
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ColourKey, useGuideLanguage } from '../../src/components/ColourKey.tsx';
import { MockReminder } from '../../src/components/MockReminder.tsx';
import { GUIDE, hasSpokenColours } from '../../src/howto.ts';
import { LANGS } from '../../src/phrases.ts';
import { Button, Card, useTheme } from '../../src/ui.tsx';

export default function HowToPage() {
  const t = useTheme();
  const lang = useGuideLanguage();
  // The colours are what matters most at medicine time, so that card starts open.
  const [open, setOpen] = useState<string | undefined>('colours');
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60, gap: 12 }}>
      <Text style={{ color: t.text, fontSize: 18, lineHeight: 25 }}>
        TakeSure reminds you at each medicine time and checks the strip you hold up to the camera. Tap a card to read
        more.
      </Text>
      {GUIDE.map((c) => {
        const isOpen = open === c.id;
        return (
          <Card key={c.id} style={{ paddingVertical: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              onPress={() => setOpen(isOpen ? undefined : c.id)}
              style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <Text style={{ color: t.text, fontSize: 19, fontWeight: '700', flex: 1 }}>{c.title}</Text>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={22} color={t.sub} />
            </Pressable>
            {isOpen && (
              <View style={{ paddingBottom: 12, gap: 8 }}>
                {c.reminder && <MockReminder />}
                {c.lines.map((l) => (
                  <Text key={l} style={{ color: t.text, fontSize: 17, lineHeight: 24 }}>
                    {l}
                  </Text>
                ))}
                {c.colours && (
                  <>
                    <ColourKey />
                    {lang !== 'en' && !hasSpokenColours(lang) && (
                      <Text style={{ color: t.sub, fontSize: 15 }}>
                        Spoken in English for now ({LANGS[lang]?.english ?? 'this language'} is coming).
                      </Text>
                    )}
                  </>
                )}
                {c.link && (
                  <Button title={c.link.title} kind="secondary" onPress={() => router.push(c.link!.to as never)} style={{ marginTop: 4 }} />
                )}
              </View>
            )}
          </Card>
        );
      })}
    </ScrollView>
  );
}
