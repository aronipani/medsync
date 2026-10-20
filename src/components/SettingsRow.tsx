import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../ui.tsx';

/** One row of a grouped list: icon, title, a short line of what's inside, a chevron. */
export function SettingsRow({
  icon,
  title,
  line,
  warn,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  line?: string;
  warn?: boolean;
  onPress: () => void;
  last?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={line ? `${title}. ${line}` : title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        minHeight: 68,
        paddingVertical: 10,
        paddingHorizontal: 16,
        backgroundColor: pressed ? t.muted : 'transparent',
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: t.line,
      })}
    >
      <Ionicons name={icon} size={26} color={t.text} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 19, fontWeight: '600' }}>{title}</Text>
        {line ? <Text style={{ color: warn ? t.warn : t.sub, fontSize: 15, marginTop: 2, fontWeight: warn ? '700' : '400' }}>{line}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={t.sub} />
    </Pressable>
  );
}
