// The full privacy policy or terms of use, shown in the app from the bundled text (works offline, never a 404),
// with a link to the same page on the public site.
import React, { useMemo } from 'react';
import { Linking, Text, View } from 'react-native';
import { PRIVACY_TEXT, TERMS_TEXT } from '../legalDocs.ts';
import { PRIVACY_URL, TERMS_URL } from '../legal.ts';
import { parseLegal, type Span } from '../legalParse.ts';
import { Button, useTheme } from '../ui.tsx';

export type LegalDocKind = 'privacy' | 'terms';

export function LegalDoc({ doc }: { doc: LegalDocKind }) {
  const t = useTheme();
  const blocks = useMemo(() => parseLegal(doc === 'privacy' ? PRIVACY_TEXT : TERMS_TEXT), [doc]);
  const runs = (sp: Span[]) => sp.map((x, i) => (x.bold ? <Text key={i} style={{ fontWeight: '700' }}>{x.text}</Text> : x.text));
  return (
    <View>
      {blocks.map((b, i) => {
        if (b.kind === 'title')
          return (
            <Text key={i} accessibilityRole="header" maxFontSizeMultiplier={1.4} style={{ color: t.text, fontSize: 26, fontWeight: '800', marginBottom: 6 }}>
              {runs(b.spans)}
            </Text>
          );
        if (b.kind === 'heading')
          return (
            <Text key={i} accessibilityRole="header" style={{ color: t.text, fontSize: 19, fontWeight: '700', marginTop: 20, marginBottom: 4 }}>
              {runs(b.spans)}
            </Text>
          );
        if (b.kind === 'note')
          return (
            <Text key={i} style={{ color: t.sub, fontSize: 15, marginBottom: 8 }}>
              {runs(b.spans)}
            </Text>
          );
        if (b.kind === 'bullet')
          return (
            <View key={i} style={{ flexDirection: 'row', marginTop: 6, paddingLeft: (b.indent ?? 0) * 18 }}>
              <Text style={{ color: t.text, fontSize: 17, lineHeight: 25, width: 18 }}>•</Text>
              <Text style={{ color: t.text, fontSize: 17, lineHeight: 25, flex: 1 }}>{runs(b.spans)}</Text>
            </View>
          );
        return (
          <Text key={i} style={{ color: t.text, fontSize: 17, lineHeight: 25, marginTop: 8 }}>
            {runs(b.spans)}
          </Text>
        );
      })}
      <Button
        title="Open on the web"
        kind="ghost"
        onPress={() => Linking.openURL(doc === 'privacy' ? PRIVACY_URL : TERMS_URL).catch(() => {})}
        style={{ marginTop: 20 }}
      />
    </View>
  );
}
