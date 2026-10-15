import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { LANGS, MAIN_LANGS, MORE_LANGS, matchAnnouncement, type LangCode } from '../../src/phrases.ts';
import { hasVoice, say, type SpeakStatus } from '../../src/speech.ts';
import { MEMBER_COLORS, newMember, useStore } from '../../src/store.tsx';
import type { Meal, Member } from '../../src/types.ts';
import { Button, Chip, Field, Label, s, TimeField, useTheme } from '../../src/ui.tsx';
import { Pressable } from 'react-native';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];

export default function EditMember() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, saveMember, deleteMember } = useStore();
  const existing = state.members.find((m) => m.id === id);
  const [m, setM] = useState<Member>(() => existing ?? { ...newMember('', state.members.length) });
  const medCount = state.meds.filter((x) => x.memberId === m.id).length;
  const lang: LangCode = m.language ?? 'en';
  const [voiceOk, setVoiceOk] = useState(true);
  const [showMore, setShowMore] = useState(MORE_LANGS.includes(lang));
  const [speak, setSpeak] = useState<SpeakStatus | undefined>();
  useEffect(() => {
    hasVoice(lang).then(setVoiceOk).catch(() => setVoiceOk(true));
  }, [lang]);

  const save = () => {
    if (!m.name.trim()) return Alert.alert('Name needed');
    saveMember({ ...m, name: m.name.trim() });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? existing.name : 'Add family member' }} />
      <Label>Name</Label>
      <Field value={m.name} onChangeText={(name) => setM({ ...m, name })} placeholder="e.g. Ma, Baba, Aroni" />

      <Label>Colour</Label>
      <View style={s.row}>
        {MEMBER_COLORS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setM({ ...m, color: c })}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, marginRight: 10, borderWidth: m.color === c ? 3 : 0, borderColor: t.text }}
          />
        ))}
      </View>

      <Label>Language for spoken messages</Label>
      <View style={s.wrap}>
        {MAIN_LANGS.map((code) => (
          <Chip key={code} label={LANGS[code].label} active={lang === code} onPress={() => setM({ ...m, language: code })} />
        ))}
      </View>
      <Pressable onPress={() => setShowMore((v) => !v)} style={{ paddingVertical: 6 }}>
        <Text style={{ color: t.brand, fontWeight: '700' }}>{showMore ? '▾' : '▸'} More languages (not yet checked)</Text>
      </Pressable>
      {showMore && (
        <>
          <Text style={{ color: t.warn, fontSize: 13, lineHeight: 18, marginBottom: 8 }}>
            These translations haven't been checked by a native speaker yet. Before relying on one, ask someone who speaks it to listen to the example below.
          </Text>
          <View style={s.wrap}>
            {MORE_LANGS.map((code) => (
              <Chip key={code} label={LANGS[code].label} active={lang === code} onPress={() => setM({ ...m, language: code })} />
            ))}
          </View>
        </>
      )}
      <Text style={{ color: t.sub, fontSize: 13 }}>
        {LANGS[lang].english}
        {MORE_LANGS.includes(lang) ? ' — not yet checked' : ''}
      </Text>
      {!voiceOk && (
        <Text style={{ color: t.warn, marginTop: 6, lineHeight: 19 }}>
          This phone has no {LANGS[lang].english} voice yet — it will speak English until one is added. Android: Settings → Text-to-speech → install voice data. iPhone:
          Settings → Accessibility → Spoken Content → Voices.
        </Text>
      )}
      <View style={[s.between, { marginTop: 12 }]}>
        <Text style={{ color: t.text, fontSize: 16 }}>Speak scan results aloud</Text>
        <Switch value={m.voice !== false} onValueChange={(voice) => setM({ ...m, voice })} />
      </View>
      <Button
        title={speak === 'speaking' ? '🔊 Speaking…' : '🔊 Hear an example'}
        kind="secondary"
        style={{ marginTop: 8 }}
        onPress={() => {
          setSpeak('speaking');
          say(lang, matchAnnouncement(lang, [{ name: 'Clopilet 75', qty: 0.5, unit: 'tablet' }]), (st) => setSpeak(st), matchAnnouncement('en', [{ name: 'Clopilet 75', qty: 0.5, unit: 'tablet' }]));
        }}
      />
      {speak === 'speaking' && <Text style={{ color: t.sub, marginTop: 6 }}>If you hear nothing, turn the volume up.</Text>}
      {(speak === 'noVoice' || speak === 'fallback') && (
        <Text style={{ color: t.warn, marginTop: 6, lineHeight: 19 }}>
          This phone has no {LANGS[lang].english} voice installed{speak === 'fallback' ? ', so announcements are said in English for now' : ", so it can't speak this language yet"}. iPhone: Settings → Accessibility → Spoken Content → Voices →{' '}
          {LANGS[lang].english} → download a voice. Android: Settings → Text-to-speech → Google → Install voice data → {LANGS[lang].english}. Then try again.
        </Text>
      )}
      {speak === 'error' && <Text style={{ color: t.bad, marginTop: 6 }}>Couldn't speak. Check the volume and try again.</Text>}

      <Label>Usual meal times</Label>
      <Text style={{ color: t.sub, marginBottom: 8 }}>Doses set to "before / with / after" a meal follow these times.</Text>
      {MEALS.map((meal) => (
        <View key={meal} style={[s.between, { marginBottom: 10 }]}>
          <Text style={{ color: t.text, fontSize: 16, textTransform: 'capitalize' }}>{meal}</Text>
          <TimeField value={m.mealTimes[meal]} onChange={(v) => setM({ ...m, mealTimes: { ...m.mealTimes, [meal]: v } })} />
        </View>
      ))}

      <Button big title="Save" onPress={save} style={{ marginTop: 20 }} />
      {existing && state.members.length > 1 && (
        <Button
          kind="ghost"
          title="Remove family member"
          style={{ marginTop: 10 }}
          onPress={() =>
            Alert.alert(`Remove ${existing.name}?`, `This also removes their ${medCount} medicine(s) and reminders. Past logs are kept.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => (deleteMember(existing.id), router.back()) },
            ])
          }
        />
      )}
    </ScrollView>
  );
}
