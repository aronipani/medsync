import { useCurrentMember } from '../../src/currentMember.tsx';
import { Ionicons } from '@expo/vector-icons';
import { CollectCard } from '../../src/components/CollectCard.tsx';
import { AsNeededCard } from '../../src/components/AsNeeded.tsx';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { doseScanOn } from '../../src/doseScan.ts';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { reminderPermission, setupNotifications } from '../../src/notifications.ts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MemberDot, MemberPicker } from '../../src/components.tsx';
import { buyList } from '../../src/buylist.ts';
import { backupOverdue } from '../../src/backup.ts';
import { describeTiming, medLabel, occurrencesForDate, qtyLabel } from '../../src/schedule.ts';
import { STARTER_NAME, starterPerson, useStore } from '../../src/store.tsx';
import { addDays, atTime, dateKey, fmt12, fmtDay } from '../../src/time.ts';
import type { Occurrence } from '../../src/types.ts';
import { Button, Card, Empty, s, useTheme } from '../../src/ui.tsx';

export default function Today() {
  const t = useTheme();
  const { state, now, record, undo } = useStore();
  const [showEarlier, setShowEarlier] = useState(false);
  const insets = useSafeAreaInsets();
  const [memberId, setMemberId] = useCurrentMember(); // shared with every screen
  const [offset, setOffset] = useState(0);
  const today = dateKey(now);
  const date = dateKey(addDays(now, offset));
  // Changing day starts at the top of the new day (it used to stay scrolled down, so it looked as if nothing changed).
  const scroller = useRef<ScrollView>(null);
  useEffect(() => scroller.current?.scrollTo({ y: 0, animated: false }), [offset]);
  // Tapping the Today tab always brings back today.
  const navigation = useNavigation();
  useEffect(
    () =>
      (navigation as unknown as { addListener: (e: 'tabPress', cb: () => void) => () => void }).addListener('tabPress', () => {
        setOffset(0);
        scroller.current?.scrollTo({ y: 0, animated: true });
      }),
    [navigation],
  );
  const dayTitle = fmtDay(date, today);
  const relative = ['Today', 'Yesterday', 'Tomorrow'].includes(dayTitle);

  const scanOn = doseScanOn(state.settings);
  const whose = (o: Occurrence) => (!memberId && state.members.length > 1 ? state.members.find((m) => m.id === o.memberId)?.name : undefined);
  const occs = useMemo(() => occurrencesForDate(state, date, now, memberId), [state, date, now, memberId]);
  // Scan for the person being looked at, not whoever is first in the family.
  const openScan = (forMember?: string) =>
    forMember ? router.navigate({ pathname: '/scan', params: { memberId: forMember, at: String(Date.now()) } }) : router.navigate('/scan');
  const groups = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    for (const o of occs) m.set(o.time, [...(m.get(o.time) ?? []), o]);
    return [...m.entries()];
  }, [occs]);
  const dueCount = offset === 0 ? occs.filter((o) => o.status === 'due').length : 0;
  const taken = occs.filter((o) => o.status === 'taken').length;
  // Running low, or due to buy within the week (two for hard-to-find medicines): spec 17.
  const low = useMemo(() => buyList(state, now, memberId).map((i) => i.med), [state, now, memberId]);
  // Reminders switched off (refused at the prompt, or later in the phone's Settings) come first: nothing else here
  // matters if the phone never rings (review 24 Oct 2026).
  const [remindersOff, setRemindersOff] = useState<false | 'undetermined' | 'denied'>(false);
  useFocusEffect(
    useCallback(() => {
      if (!state.meds.length) return;
      reminderPermission()
        .then((p) => setRemindersOff(p === 'granted' ? false : p))
        .catch(() => {});
    }, [state.meds.length]),
  );
  const turnOnReminders = () =>
    remindersOff === 'denied'
      ? Alert.alert('Reminders are off', 'Turn on notifications for TakeSure in the phone’s Settings, so it can ring when a medicine is due.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ])
      : setupNotifications().then((ok) => setRemindersOff(ok ? false : 'denied'));
  const attention: { text: string; go?: string; onPress?: () => void } | undefined = remindersOff
    ? { text: 'Reminders are off — turn on', onPress: turnOnReminders }
    : low.length
      ? { text: low.length === 1 ? `Time to buy ${medLabel(low[0])}` : `Time to buy ${low.length} medicines`, go: '/buy' }
      : state.meds.length && backupOverdue(state)
        ? { text: 'No backup for 30+ days — save one', go: '/data' }
        : undefined;

  const act = (o: Occurrence) => {
    const label = `${medLabel(o.med)} · ${fmt12(o.time)}`;
    if (o.log) {
      const at = new Date(o.log.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      Alert.alert(label, o.log.status === 'taken' ? `Taken at ${at}.` : `Skipped at ${at}.`, [
        ...(o.log.status !== 'taken' ? [{ text: 'I took it after all', onPress: () => record([o], 'taken', 'manual') }] : []),
        {
          text: o.log.status === 'taken' ? 'I did not take it' : 'Not skipped',
          onPress: () =>
            Alert.alert('Change this back?', 'The dose will show as not taken yet.', [
              { text: 'Keep it', style: 'cancel' },
              { text: 'Change back', style: 'destructive', onPress: () => undo(o.key) },
            ]),
        },
        { text: 'Close', style: 'cancel' as const },
      ]);
      return;
    }
    if (o.date < today) {
      // A past day: scanning makes no sense now — just record what happened.
      Alert.alert(label, 'What happened with this dose?', [
        { text: 'I took it', onPress: () => record([o], 'taken', 'manual') },
        { text: 'It was skipped', onPress: () => record([o], 'skipped', 'manual') },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    if ((o.at ?? atTime(o.date, o.time).getTime()) - now.getTime() > 6 * 3600e3) {
      Alert.alert(label, 'This dose is more than 6 hours away.');
      return;
    }
    Alert.alert(label, scanOn ? 'Scanning the strip is the safest check.' : 'Did you take it?', [
      ...(scanOn ? [{ text: 'Scan the strip', onPress: () => openScan(o.memberId) }] : []),
      { text: scanOn ? 'I took it already' : 'I took it', onPress: () => record([o], 'taken', 'manual') },
      {
        text: 'Skip this dose…',
        onPress: () =>
          Alert.alert('Skip this dose?', `${label} will be marked as skipped.`, [
            { text: 'Don\'t skip', style: 'cancel' },
            { text: 'Skip it', style: 'destructive', onPress: () => record([o], 'skipped', 'manual') },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  // "Now" = every time that has a dose due, with everything at those times (done ones stay, ticked).
  const nowTimes = offset === 0 ? groups.filter(([, l]) => l.some((o) => o.status === 'due')).map(([time]) => time) : [];
  const nowList = occs.filter((o) => nowTimes.includes(o.time));
  const nowDone = nowList.filter((o) => o.status === 'taken' || o.status === 'skipped').length;
  const later = groups.filter(([time, l]) => !nowTimes.includes(time) && l.some((o) => o.status === 'upcoming'));
  const done = occs.filter((o) => !nowTimes.includes(o.time) && o.status !== 'upcoming' && !later.some(([time]) => time === o.time));

  /** A round tick box: green ✓ when taken, outline when still to take. Shape and word, not colour alone. */
  const Mark = ({ o }: { o: Occurrence }) =>
    o.status === 'taken' ? (
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.okFill, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="checkmark" size={22} color="#FFFFFF" />
      </View>
    ) : o.status === 'missed' ? (
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.badFill, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '900' }}>!</Text>
      </View>
    ) : o.status === 'skipped' ? (
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.sub, fontSize: 20, fontWeight: '900' }}>–</Text>
      </View>
    ) : (
      <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 2.5, borderColor: t.text }} />
    );

  const statusLine = (o: Occurrence) =>
    o.status === 'taken' && o.log
      ? `Taken ${timeOf(o.log.at)}`
      : o.status === 'skipped'
        ? 'Skipped'
        : o.status === 'missed'
          ? 'Missed'
          : o.dose.timing.kind === 'meal'
            ? `${qtyLabel(o.dose.qty, o.med.unit)} · ${describeTiming(o.dose)}`
            : qtyLabel(o.dose.qty, o.med.unit);

  /** One medicine as a row: still-to-take ones bold and dark, finished ones quiet. */
  const Row = ({ o, last, time }: { o: Occurrence; last: boolean; time?: boolean }) => {
    const open = o.status === 'due' || o.status === 'upcoming';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${medLabel(o.med)}, ${statusLine(o)}`}
        onPress={() => act(o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 66, paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.line }}
      >
        <Mark o={o} />
        {/* Scheduled time on the left in lists of the day, so every row reads the same way. */}
        {time && <Text style={{ color: t.sub, fontSize: 17, fontWeight: '600', width: 76 }}>{fmt12(o.time)}</Text>}
        <View style={{ flex: 1 }}>
          <Text style={{ color: open ? t.text : t.sub, fontSize: open ? 21 : 19, fontWeight: open ? '700' : '600' }}>{medLabel(o.med)}</Text>
          <Text style={{ color: open ? t.text : t.sub, opacity: open ? 0.8 : 1, fontSize: 16, marginTop: 2 }}>{statusLine(o)}</Text>
          {/* Someone in another time zone: their clock time, and this phone's. */}
          {o.localTime && (
            <Text style={{ color: t.sub, fontSize: 15, marginTop: 2 }}>
              {fmt12(o.time)} their time · {fmt12(o.localTime)} here
            </Text>
          )}
          <MemberDot memberId={o.memberId} />
        </View>
      </Pressable>
    );
  };

  const Section = ({ title }: { title: string }) => (
    <Text style={{ color: t.sub, fontSize: 17, fontWeight: '600', marginTop: 24, marginBottom: 8, marginLeft: 4 }}>{title}</Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
    <ScrollView ref={scroller} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 16, paddingBottom: 40 }}>
      {/* The day, with the day before and after either side: always in view at the top. */}
      <View style={{ marginTop: 8, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {state.meds.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Day before" hitSlop={8} onPress={() => setOffset((o) => o - 1)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginLeft: -12 }}>
            <Ionicons name="chevron-back" size={30} color={t.text} />
          </Pressable>
        )}
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={1.4} accessibilityRole="header" style={{ color: t.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.3 }}>
            {dayTitle}
          </Text>
          <Text style={{ color: t.sub, fontSize: 18, marginTop: 2 }}>
            {/* The full date only when the title doesn't already say it ("Sun, Oct 25" was followed by "Sunday, October 25"). */}
            {[relative ? atTime(date, '12:00').toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : '', occs.length && !(offset === 0 && nowList.length) ? `${taken} of ${occs.length} taken` : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {state.meds.length > 0 && (
          <Pressable accessibilityRole="button" accessibilityLabel="Day after" hitSlop={8} onPress={() => setOffset((o) => o + 1)} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', marginRight: -12 }}>
            <Ionicons name="chevron-forward" size={30} color={t.text} />
          </Pressable>
        )}
      </View>

      {offset !== 0 && <Button title="‹ Back to today" kind="secondary" onPress={() => setOffset(0)} style={{ marginBottom: 8 }} />}

      <MemberPicker value={memberId} onChange={setMemberId} allowAll={state.members.length > 1} />

      {offset === 0 && attention && (
        // One "needs attention" line, one thing at a time (spec 21): running low first, then an old backup.
        <Pressable
          accessibilityRole="button"
          onPress={() => (attention.onPress ? attention.onPress() : router.navigate(attention.go as never))}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 16, borderRadius: 16, backgroundColor: t.warnSoft, marginTop: 8 }}
        >
          <Text style={{ color: t.warn, fontSize: 18, fontWeight: '900' }}>!</Text>
          <Text style={{ color: t.warn, fontSize: 17, fontWeight: '700', flex: 1 }} numberOfLines={1}>
            {attention.text}
          </Text>
          <Ionicons name="chevron-forward" size={20} color={t.warn} />
        </Pressable>
      )}

      {!state.meds.length ? (
        <>
          {/* First use: say what to do, then one button. */}
          <Empty
            title="Let’s add the medicines"
            body={
              state.members.length > 1
                ? `For ${state.members.map((m) => m.name).join(', ')}. Add each person's medicines, then hand the phone over. Reminders start by themselves.`
                : 'Setting this up for someone? Add each of their medicines here, then hand the phone over. Reminders start by themselves.'
            }
          />
          <Button big title="Add a medicine" onPress={() => router.push('/add')} />
          {/* "Me" is a placeholder: give it the real name first, so the person isn't added a second time later. */}
          {starterPerson(state.members) && (
            <Button
              title={`Put your name instead of "${STARTER_NAME}"`}
              kind="secondary"
              onPress={() => router.push({ pathname: '/member/[id]', params: { id: starterPerson(state.members)!.id } })}
              style={{ marginTop: 10 }}
            />
          )}
          {/* Family first if it's for more than one person. */}
          <Button
            title={state.members.length > 1 ? '+ Add another person' : '+ Add a person'}
            kind="secondary"
            onPress={() => router.push('/member/new')}
            style={{ marginTop: 10 }}
          />
          <CollectCard />
        </>
      ) : !occs.length ? (
        <>
          <Empty title={offset === 0 && state.meds.some((m) => m.active && m.asNeeded) ? 'Nothing at set times today' : 'No medicines this day'} />
          {offset === 0 && <AsNeededCard memberId={memberId} now={now} />}
        </>
      ) : (
        <>
          {/* Now: all medicines due at this time together, ticked off one by one, with one button. */}
          {nowList.length > 0 && (
            <Card style={{ marginTop: 12, paddingTop: 16 }}>
              {/* "Now" and the count on one line; the times underneath (several times can be due at once). */}
              <View style={[s.between, { marginBottom: 2 }]}>
                <View style={s.row}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.now, marginRight: 8 }} />
                  <Text style={{ color: t.now, fontSize: 18, fontWeight: '700' }}>Now</Text>
                </View>
                {nowList.length > 1 && (
                  <Text style={{ color: t.text, fontSize: 17, fontWeight: '600' }}>
                    {nowDone} of {nowList.length} done
                  </Text>
                )}
              </View>
              <Text style={{ color: t.sub, fontSize: 16, marginBottom: 4 }}>{nowTimes.map(fmt12).join(' · ')}</Text>
              {nowList.map((o, i) => (
                <Row key={o.key} o={o} last={i === nowList.length - 1} />
              ))}
              {scanOn ? (
                <Button
                  big
                  title={dueCount === 1 ? (nowList.length > 1 ? 'Scan the last strip' : 'Scan the strip') : nowDone ? 'Scan the next strip' : 'Scan the strips'}
                  onPress={() => openScan(memberId ?? (new Set(nowList.map((o) => o.memberId)).size === 1 ? nowList[0].memberId : undefined))}
                  style={{ marginTop: 12 }}
                />
              ) : dueCount > 0 ? (
                // Dose-time scanning off (US, spec 19): record them as taken, after a check.
                <Button
                  big
                  title={dueCount === 1 ? 'I took it' : `I took all ${dueCount}`}
                  onPress={() => {
                    const open = nowList.filter((o) => o.status === 'due');
                    Alert.alert('Mark as taken?', open.map((o) => `${whose(o) ? `${whose(o)}: ` : ''}${medLabel(o.med)} · ${qtyLabel(o.dose.qty, o.med.unit)}`).join('\n'), [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Yes, taken', onPress: () => record(open, 'taken', 'manual') },
                    ]);
                  }}
                  style={{ marginTop: 12 }}
                />
              ) : null}
            </Card>
          )}

          {offset === 0 && <AsNeededCard memberId={memberId} now={now} />}

          {offset !== 0 ? (
            // Another day: one list, time on the left — the same shape as "Earlier today".
            <Card style={{ paddingVertical: 4, marginTop: 12 }}>
              {occs.map((o, i) => (
                <Row key={o.key} o={o} last={i === occs.length - 1} time />
              ))}
            </Card>
          ) : (
            <>
              {later.length > 0 && (
                <>
                  <Section title="Later today" />
                  <Card style={{ paddingVertical: 4 }}>
                    {later.map(([time, list], gi) => (
                      <View
                        key={time}
                        style={{ flexDirection: 'row', gap: 16, paddingVertical: 8, borderBottomWidth: gi === later.length - 1 ? 0 : 1, borderBottomColor: t.line }}
                      >
                        <Text style={{ color: t.text, fontSize: 18, fontWeight: '600', width: 84, paddingTop: 10 }}>{fmt12(time)}</Text>
                        <View style={{ flex: 1 }}>
                          {/* Each medicine is its own tap (it used to act on the first one at that time only). */}
                          {list.map((o) => (
                            <Pressable key={o.key} accessibilityRole="button" accessibilityLabel={`${medLabel(o.med)}${whose(o) ? `, ${whose(o)}` : ''}, ${fmt12(time)}`} onPress={() => act(o)} style={{ minHeight: 44, justifyContent: 'center', paddingVertical: 4 }}>
                              <Text style={{ color: t.text, fontSize: 19, fontWeight: '600' }}>
                                {medLabel(o.med)}
                                {/* Everyone: say whose it is, so two people's same medicine doesn't look like a repeat. */}
                                {whose(o) ? <Text style={{ color: t.sub, fontSize: 16, fontWeight: '400' }}>{`  ${whose(o)}`}</Text> : null}
                              </Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ))}
                  </Card>
                </>
              )}
              {done.length > 0 && (
                <>
                  {/* Folded to one calm line; the rows open on tap. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ expanded: showEarlier }}
                    onPress={() => setShowEarlier((v) => !v)}
                    style={{ marginTop: 24 }}
                  >
                    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.text, fontSize: 18, fontWeight: '600' }}>Earlier today</Text>
                        <Text style={{ color: t.sub, fontSize: 16, marginTop: 2 }}>
                          {[
                            `${done.filter((o) => o.status === 'taken').length} taken`,
                            done.some((o) => o.status === 'missed') ? `${done.filter((o) => o.status === 'missed').length} missed` : '',
                            done.some((o) => o.status === 'skipped') ? `${done.filter((o) => o.status === 'skipped').length} skipped` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <Ionicons name={showEarlier ? 'chevron-up' : 'chevron-down'} size={22} color={t.sub} />
                    </Card>
                  </Pressable>
                  {showEarlier && (
                    <Card style={{ paddingVertical: 4, marginTop: 8 }}>
                      {done.map((o, i) => (
                        <Row key={o.key} o={o} last={i === done.length - 1} time />
                      ))}
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}


    </ScrollView>
    {/* Content scrolls under a solid band, so it never runs into the clock and battery. */}
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: t.bg }} />
    </View>
  );
}
