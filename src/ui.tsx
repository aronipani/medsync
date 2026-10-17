import DateTimePicker from '@react-native-community/datetimepicker';
import React, { createContext, useContext, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  useColorScheme,
  View,
  ViewStyle,
} from 'react-native';
import { fmt12 } from './time.ts';
import { periodOfDate, type Period } from './period.ts';

// "Less, but better": black and white do the work; colour only ever means something.
// Ink is the one main action. Signal (orange) means "due now". Go / check / stop are the scan results.
const light = {
  bg: '#F6F6F3', // paper
  card: '#FFFFFF',
  text: '#111111', // ink
  sub: '#5C5C57', // quiet ink, 6.4:1 on paper
  line: '#E4E4DE',
  muted: '#EEEEE9',
  brand: '#111111', // links, active tab, outlines: ink, no brand hue
  brandSoft: '#EEEEE9',
  ink: '#111111', // main button
  onInk: '#FFFFFF',
  now: '#B84A0E', // signal: due now
  ok: '#1E7A46',
  okSoft: '#E3F1E8',
  bad: '#B3261E',
  badSoft: '#F8E3E1',
  warn: '#8F5A00',
  warnSoft: '#F6ECD9',
  // Deep fills with white text on them (scan results, coloured buttons) — the same in every mode.
  okFill: '#1E7A46',
  warnFill: '#8F5A00',
  badFill: '#B3261E',
};
const dark: typeof light = {
  bg: '#121212',
  card: '#1E1E1E',
  text: '#F2F2EE',
  sub: '#A8A8A1',
  line: '#2C2C2A',
  muted: '#2A2A28',
  brand: '#F2F2EE',
  brandSoft: '#2A2A28',
  ink: '#F2F2EE', // the main button turns light, so it stays the brightest thing on screen
  onInk: '#111111',
  now: '#F59A62',
  ok: '#62C48C',
  okSoft: '#16301F',
  bad: '#F2867E',
  badSoft: '#3A1A18',
  warn: '#F2B84B',
  warnSoft: '#36290F',
  okFill: '#1E7A46',
  warnFill: '#8F5A00',
  badFill: '#B3261E',
};
export type Theme = typeof light & { period: Period; isDark: boolean };

const PeriodCtx = createContext<Period>('morning');

/** Provides the current time-of-day period; the app goes calm and dark at night. */
export function PeriodProvider({ now, children }: { now: Date; children: React.ReactNode }) {
  return <PeriodCtx.Provider value={periodOfDate(now)}>{children}</PeriodCtx.Provider>;
}

/** One steady look all day (no time-of-day tints); dark when the phone is dark, and at night. */
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const period = useContext(PeriodCtx);
  return useMemo(() => {
    const isDark = scheme === 'dark' || period === 'night';
    return { ...(isDark ? dark : light), period, isDark };
  }, [scheme, period]);
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: 20, padding: 18 }, style]}>{children}</View>;
}

/** light = white button for the main action on a coloured card (scan results). */
type BtnKind = 'primary' | 'secondary' | 'danger' | 'ok' | 'ghost' | 'light';
export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  style,
  big,
  onColor,
}: {
  /** On a coloured card: ghost buttons get white text and outline. */
  onColor?: boolean;
  title: string;
  onPress: () => void;
  kind?: BtnKind;
  disabled?: boolean;
  style?: ViewStyle;
  big?: boolean;
}) {
  const t = useTheme();
  const bg = { primary: t.ink, secondary: t.muted, danger: t.badFill, ok: t.okFill, ghost: 'transparent', light: '#FFFFFF' }[kind];
  // Ghost buttons: ink text and a thin outline so they still look tappable.
  const fg = kind === 'primary' ? t.onInk : kind === 'secondary' ? t.text : kind === 'light' ? '#111111' : kind === 'ghost' ? (onColor ? '#FFFFFF' : t.text) : '#FFFFFF';
  const border = kind === 'ghost' ? (onColor ? '#FFFFFFAA' : t.line) : 'transparent';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderWidth: kind === 'ghost' ? 1.5 : 0,
          borderColor: border,
          paddingVertical: big ? 18 : 13,
          paddingHorizontal: 16,
          minHeight: big ? 62 : 50, // easy to hit for shaky hands (older users)
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontWeight: '700', fontSize: big ? 20 : 17, textAlign: 'center' }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, color, onPress }: { label: string; active?: boolean; color?: string; onPress?: () => void }) {
  const t = useTheme();
  const c = color ?? t.ink;
  return (
    <Pressable accessibilityRole="button"
      onPress={onPress}
      style={{
        paddingVertical: 10,
        paddingHorizontal: 16,
        minHeight: 44,
        justifyContent: 'center',
        borderRadius: 999,
        backgroundColor: active ? c : t.muted,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: active ? (color ? '#FFFFFF' : t.onInk) : t.text, fontWeight: '600', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

/** Big tab switcher for a screen's sections (e.g. Settings): few, clearly named, easy to hit. */
export function SegmentTabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: t.muted, borderRadius: 14, padding: 4, gap: 4 }}>
      {tabs.map((x) => {
        const on = x.key === value;
        return (
          <Pressable
            key={x.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(x.key)}
            style={{ flex: 1, minHeight: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.card : 'transparent', paddingHorizontal: 4 }}
          >
            <Text style={{ color: on ? t.text : t.sub, fontWeight: on ? '800' : '600', fontSize: 16, textAlign: 'center' }}>{x.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "More options" fold: keeps rarely used choices out of sight until asked for (less to read at once). */
export function More({ title = 'More options', color, children }: { title?: string; color?: string; children: React.ReactNode }) {
  const t = useTheme();
  const [open, setOpen] = React.useState(false);
  return (
    <View style={{ marginTop: 10 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: color ?? t.brand, fontWeight: '700', fontSize: 16 }}>{open ? `▾ ${title}` : `▸ ${title}`}</Text>
      </Pressable>
      {open ? <View style={{ gap: 8 }}>{children}</View> : null}
    </View>
  );
}

/** "Step 1 of 2 — What it is": tells the person where they are in a short task and how much is left. */
export function Steps({ step, total, label }: { step: number; total: number; label: string }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={`Step ${step} of ${total}: ${label}`} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
        {Array.from({ length: total }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < step ? t.ink : t.line }} />
        ))}
      </View>
      <Text style={{ color: t.sub, fontSize: 16, fontWeight: '600' }}>
        Step {step} of {total} · <Text style={{ color: t.text }}>{label}</Text>
      </Text>
    </View>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  // Sentence case and readable size: small all-caps labels are hard to read for older eyes.
  return <Text style={{ color: t.sub, fontSize: 16, fontWeight: '700', marginBottom: 8, marginTop: 20 }}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.sub}
      {...props}
      style={[
        { backgroundColor: t.card, color: t.text, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 14, fontSize: 18, minHeight: 52 },
        props.style,
      ]}
    />
  );
}

export function NumberField({ value, onChange, step = 1, min = 0 }: { value: number; onChange: (n: number) => void; step?: number; min?: number }) {
  const t = useTheme();
  const btn = (d: number, s: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={d < 0 ? 'Less' : 'More'} onPress={() => onChange(Math.max(min, +(value + d).toFixed(2)))} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.text, fontSize: 22, fontWeight: '700' }}>{s}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {btn(-step, '−')}
      <Field
        keyboardType="decimal-pad"
        value={String(value)}
        onChangeText={(s) => {
          const n = parseFloat(s.replace(',', '.'));
          onChange(isNaN(n) ? 0 : Math.max(min, n));
        }}
        style={{ width: 80, textAlign: 'center' }}
      />
      {btn(step, '+')}
    </View>
  );
}

/** Time picker that shows the native wheel/clock. Value is "HH:MM". */
export function TimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [h, m] = value.split(':').map(Number);
  const date = new Date(2000, 0, 1, h, m);
  const apply = (d?: Date) => d && onChange(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, minWidth: 120, minHeight: 50, justifyContent: 'center' }}>
        <Text style={{ color: t.text, fontSize: 18, fontWeight: '600' }}>{fmt12(value)}</Text>
      </Pressable>
      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={date}
          mode="time"
          onChange={(e, d) => {
            setOpen(false);
            if (e.type === 'set') apply(d);
          }}
        />
      )}
      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={() => setOpen(false)} />
          <View style={{ backgroundColor: t.card, paddingBottom: 30 }}>
            <DateTimePicker value={date} mode="time" display="spinner" onChange={(_, d) => apply(d)} />
            <Button title="Done" onPress={() => setOpen(false)} style={{ marginHorizontal: 16 }} />
          </View>
        </Modal>
      )}
    </>
  );
}

/** Optional date picker (native calendar). Value is "YYYY-MM-DD" or undefined; no typing of date formats. */
export function DateField({ value, onChange, emptyText = 'Not set' }: { value?: string; onChange: (v: string | undefined) => void; emptyText?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  const apply = (d?: Date) =>
    d && onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  const shown = value ? date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' }) : emptyText;
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={{ flex: 1, backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 14, minHeight: 52, justifyContent: 'center' }}
        >
          <Text style={{ color: value ? t.text : t.sub, fontSize: 17, fontWeight: '600' }}>{shown}</Text>
        </Pressable>
        {value ? <Button title="Clear" kind="ghost" onPress={() => onChange(undefined)} /> : null}
      </View>
      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={date}
          mode="date"
          onChange={(e, d) => {
            setOpen(false);
            if (e.type === 'set') apply(d);
          }}
        />
      )}
      {Platform.OS === 'ios' && (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" style={{ flex: 1, backgroundColor: '#0006' }} onPress={() => setOpen(false)} />
          <View style={{ backgroundColor: t.card, paddingBottom: 30 }}>
            <DateTimePicker value={date} mode="date" display="inline" onChange={(_, d) => apply(d)} />
            <Button title="Done" onPress={() => setOpen(false)} style={{ marginHorizontal: 16 }} />
          </View>
        </Modal>
      )}
    </>
  );
}

export function Empty({ title, body }: { title: string; body?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32 }}>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ color: t.sub, marginTop: 6, textAlign: 'center', fontSize: 16, lineHeight: 22 }}>{body}</Text> : null}
    </View>
  );
}

export const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  h1: { fontSize: 24, fontWeight: '800' },
  h2: { fontSize: 18, fontWeight: '700' },
});
