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
          paddingVertical: big ? 16 : 11,
          paddingHorizontal: 16,
          borderRadius: 12,
          alignItems: 'center',
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: fg, fontWeight: '700', fontSize: big ? 18 : 15 }}>{title}</Text>
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
        paddingVertical: 7,
        paddingHorizontal: 13,
        borderRadius: 999,
        backgroundColor: active ? c : t.muted,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: active ? '#FFFFFF' : t.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ color: t.sub, fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.sub}
      {...props}
      style={[
        { backgroundColor: t.card, color: t.text, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, fontSize: 16 },
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
      <Pressable onPress={() => setOpen(true)} style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12, minWidth: 110 }}>
        <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{fmt12(value)}</Text>
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

export function Empty({ title, body }: { title: string; body?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32 }}>
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      {body ? <Text style={{ color: t.sub, marginTop: 6, textAlign: 'center', lineHeight: 20 }}>{body}</Text> : null}
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
