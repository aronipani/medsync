import { router, Tabs, useLocalSearchParams } from 'expo-router';
import { freshOnFocus } from '../../../src/components/freshOnFocus.tsx';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { LANGS, MAIN_LANGS, MORE_LANGS, matchAnnouncement, type LangCode } from '../../../src/phrases.ts';
import { hasVoice, say, type SpeakStatus } from '../../../src/speech.ts';
import { MEMBER_COLORS, newMember, useStore } from '../../../src/store.tsx';
import type { Meal, Member } from '../../../src/types.ts';
import { Button, Chip, Field, Label, s, TimeField, useTheme } from '../../../src/ui.tsx';
import { Pressable } from 'react-native';
import { sharePerson } from '../../../src/personShare.ts';
import { clockIn, COMMON_ZONES, deviceZone, fmt12, otherZone, zoneLabel } from '../../../src/time.ts';

const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner'];

export default freshOnFocus(EditMember);

function EditMember() {
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
      <Tabs.Screen options={{ title: existing ? existing.name : 'Add family member' }} />
      <Label>Name</Label>
      <Field value={m.name} onChangeText={(name) => setM({ ...m, name })} placeholder="e.g. Ma, Baba, Aroni" />

      <Label>Colour</Label>
      <View style={s.wrap}>
        {MEMBER_COLORS.map((c) => (
          <Pressable
            key={c}
            accessibilityRole="button"
            accessibilityState={{ selected: m.color === c }}
            onPress={() => setM({ ...m, color: c })}
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c, marginRight: 10, marginBottom: 8, borderWidth: m.color === c ? 4 : 0, borderColor: t.text, alignItems: 'center', justifyContent: 'center' }}
          >
            {m.color === c ? <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>✓</Text> : null}
          </Pressable>
        ))}
      </View>

      <Label>Language for spoken messages</Label>
      <View style={s.wrap}>
        {MAIN_LANGS.map((code) => (
          <Chip key={code} label={LANGS[code].label} active={lang === code} onPress={() => setM({ ...m, language: code })} />
        ))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => setShowMore((v) => !v)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: t.brand, fontWeight: '700', fontSize: 16 }}>{showMore ? '▾' : '▸'} More languages (not yet checked)</Text>
      </Pressable>
      {showMore && (
        <>
          <Text style={{ color: t.warn, fontSize: 15, lineHeight: 21, marginBottom: 8 }}>
            These translations haven't been checked by a native speaker yet. Before relying on one, ask someone who speaks it to listen to the example below.
          </Text>
          <View style={s.wrap}>
            {MORE_LANGS.map((code) => (
              <Chip key={code} label={LANGS[code].label} active={lang === code} onPress={() => setM({ ...m, language: code })} />
            ))}
          </View>
        </>
      )}
      <Text style={{ color: t.sub, fontSize: 15 }}>
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

      <Label>Where they live</Label>
      <Text style={{ color: t.sub, marginBottom: 8, fontSize: 16, lineHeight: 22 }}>
        Someone in another time zone takes their medicines at their own clock time. Their reminders go off on their own phone, not this one.
      </Text>
      <View style={s.wrap}>
        <Chip label={`Same as this phone (${zoneLabel(deviceZone())})`} active={!otherZone(m.timeZone)} onPress={() => setM({ ...m, timeZone: undefined })} />
        {COMMON_ZONES.filter((z) => z.tz !== deviceZone()).map((z) => (
          <Chip key={z.tz} label={z.label} active={m.timeZone === z.tz} onPress={() => setM({ ...m, timeZone: z.tz })} />
        ))}
      </View>
      {otherZone(m.timeZone) && (
        <Text style={{ color: t.text, marginTop: 8, fontSize: 16 }}>
          It's {fmt12(clockIn(new Date(), m.timeZone))} there now ({fmt12(clockIn(new Date()))} here). Meal times below are their times.
        </Text>
      )}

      <Label>Usual meal times</Label>
      <Text style={{ color: t.sub, marginBottom: 8 }}>Doses set to "before / with / after" a meal follow these times.</Text>
      {MEALS.map((meal) => (
        <View key={meal} style={[s.between, { marginBottom: 10 }]}>
          <Text style={{ color: t.text, fontSize: 16, textTransform: 'capitalize' }}>{meal}</Text>
          <TimeField value={m.mealTimes[meal]} onChange={(v) => setM({ ...m, mealTimes: { ...m.mealTimes, [meal]: v } })} />
        </View>
      ))}

      <Button big title="Save" onPress={save} style={{ marginTop: 20 }} />
      {existing && (
        <>
          <Button
            kind="secondary"
            title={`Send ${existing.name}'s medicines to another phone`}
            style={{ marginTop: 10 }}
            onPress={() => sharePerson(state, existing.id).catch((e) => Alert.alert('Could not share', e instanceof Error ? e.message : String(e)))}
          />
          <Text style={{ color: t.sub, marginTop: 6, fontSize: 15, lineHeight: 21 }}>
            For a family member or caregiver: they open it in Settings → Family on another phone. Only {existing.name}'s medicines, times and recent
            doses are sent — it contains health information, so send it only to people you trust.
          </Text>
        </>
      )}
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
