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
import { PERIOD_DARK, PERIOD_LIGHT, periodOfDate, type Period, type PeriodColors } from './period.ts';

const light = {
  bg: '#F6F7F5',
  card: '#FFFFFF',
  text: '#16211F',
  sub: '#5B6B67',
  line: '#E2E7E5',
  brand: '#0F766E',
  brandSoft: '#D9F0EC',
  ok: '#15803D',
  okSoft: '#DCFCE7',
  bad: '#DC2626',
  badSoft: '#FEE2E2',
  warn: '#B45309',
  warnSoft: '#FEF3C7',
  muted: '#EEF1F0',
};
const dark: typeof light = {
  bg: '#0E1513',
  card: '#17201E',
  text: '#ECF2F0',
  sub: '#94A6A1',
  line: '#26332F',
  brand: '#2DD4BF',
  brandSoft: '#123A35',
  ok: '#4ADE80',
  okSoft: '#123D24',
  bad: '#F87171',
  badSoft: '#4A1A1A',
  warn: '#FBBF24',
  warnSoft: '#43320C',
  muted: '#1F2A27',
};
export type Theme = typeof light & { period: Period; isDark: boolean; periods: Record<Period, PeriodColors> };

const PeriodCtx = createContext<Period>('morning');

/** Provides the current time-of-day period; screens re-theme when it changes. */
export function PeriodProvider({ now, children }: { now: Date; children: React.ReactNode }) {
  return <PeriodCtx.Provider value={periodOfDate(now)}>{children}</PeriodCtx.Provider>;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const period = useContext(PeriodCtx);
  return useMemo(() => {
    // Night uses a navy background, so it always takes the light-on-dark text colours.
    const isDark = scheme === 'dark' || period === 'night';
    const periods = isDark ? PERIOD_DARK : PERIOD_LIGHT;
    const base = isDark ? dark : light;
    const p = (scheme === 'dark' ? PERIOD_DARK : PERIOD_LIGHT)[period];
    return { ...base, bg: p.bg, card: p.card, line: p.line, muted: p.muted, period, isDark, periods };
  }, [scheme, period]);
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: t.line }, style]}>{children}</View>;
}

type BtnKind = 'primary' | 'secondary' | 'danger' | 'ok' | 'ghost';
export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  style,
  big,
}: {
  title: string;
  onPress: () => void;
  kind?: BtnKind;
  disabled?: boolean;
  style?: ViewStyle;
  big?: boolean;
}) {
  const t = useTheme();
  const bg = { primary: t.brand, secondary: t.muted, danger: t.bad, ok: t.ok, ghost: 'transparent' }[kind];
  const fg = kind === 'secondary' || kind === 'ghost' ? t.text : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          paddingVertical: big ? 18 : 13,
          paddingHorizontal: 16,
          minHeight: big ? 62 : 50, // easy to hit for shaky hands (older users)
          borderRadius: 14,
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
  const c = color ?? t.brand;
  return (
    <Pressable
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
      <Text style={{ color: active ? '#FFFFFF' : t.text, fontWeight: '600', fontSize: 16 }}>{label}</Text>
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
    <Pressable onPress={() => onChange(Math.max(min, +(value + d).toFixed(2)))} style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.muted, alignItems: 'center', justifyContent: 'center' }}>
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
          <Pressable style={{ flex: 1, backgroundColor: '#0006' }} onPress={() => setOpen(false)} />
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
