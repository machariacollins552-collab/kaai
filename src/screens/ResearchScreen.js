import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Linking, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Button from '../components/Button';
import { research, MAX_QUESTION } from '../research';
import { colors, space, radius } from '../theme';

const SETTINGS_CODES = ['no_search_key', 'invalid_search_key', 'no_key', 'invalid_key', 'bad_model'];

export default function ResearchScreen({ ask, getSearchKey, hasSearchKey, onOpenSettings }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [linkError, setLinkError] = useState(null);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    const r = await research({ question, tavilyKey: await getSearchKey(), ask });
    setBusy(false);
    if (r.ok) setResult(r);
    else setError({ message: r.message, code: r.code });
  }

  async function copy() {
    const lines = result.sources.map((s) => `[${s.id}] ${s.title} - ${s.url}`);
    await Clipboard.setStringAsync(`${result.answer}\n\nSources:\n${lines.join('\n')}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function open(url) {
    setLinkError(null);
    try {
      await Linking.openURL(url);
    } catch {
      setLinkError('Could not open that link.');
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Research</Text>
      <Text style={styles.hint}>
        Searches the web, then your AI writes an answer from what it found. Every [number] in the answer points to a real source below. Sources can be wrong, so open the important ones.
      </Text>

      {!hasSearchKey && (
        <View style={styles.card}>
          <Text style={styles.text}>Research needs a web search key. Add a Tavily key in Settings first.</Text>
          <Button label="Open Settings" onPress={onOpenSettings} />
        </View>
      )}

      <TextInput
        style={[styles.input, styles.multi]}
        value={question}
        onChangeText={setQuestion}
        placeholder="What do you want to find out?"
        placeholderTextColor={colors.muted}
        multiline
        maxLength={MAX_QUESTION}
        accessibilityLabel="Research question"
      />
      <Button label="Research" onPress={run} busy={busy} disabled={!question.trim() || !hasSearchKey} />
      {busy && <Text style={styles.hint}>Searching the web and writing the answer. This can take up to a minute.</Text>}

      {error && (
        <View style={styles.error} accessibilityLiveRegion="polite">
          <Text style={styles.text}>{error.message}</Text>
          {SETTINGS_CODES.includes(error.code) && <Button label="Open Settings" onPress={onOpenSettings} />}
        </View>
      )}

      {result && (
        <>
          {result.warnings.map((w) => (
            <Text key={w} style={styles.warn}>{w}</Text>
          ))}
          <View style={styles.card}>
            <Text selectable style={styles.answer}>{result.answer}</Text>
            <Button label={copied ? 'Copied' : 'Copy answer and sources'} variant="secondary" onPress={copy} />
            <Text style={styles.hint}>
              Written by {result.provider} ({result.model}) from {result.sources.length} sources. Search credits used: {result.creditsUsed}.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Sources</Text>
          {linkError && <Text style={styles.warn}>{linkError}</Text>}
          {result.sources.map((s) => {
            const cited = result.cited.includes(s.id);
            return (
              <Pressable
                key={s.id}
                onPress={() => open(s.url)}
                accessibilityRole="link"
                accessibilityLabel={`Source ${s.id}: ${s.title}`}
                style={styles.source}
              >
                <Text style={styles.sourceTitle}>[{s.id}] {s.title}</Text>
                <Text style={styles.sourceUrl} numberOfLines={1}>{s.url}</Text>
                <Text style={styles.sourceMeta}>{cited ? 'Cited in the answer' : 'Found but not cited'}</Text>
              </Pressable>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  text: { color: colors.text, fontSize: 14, lineHeight: 20 },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48, fontSize: 16 },
  multi: { minHeight: 100, textAlignVertical: 'top' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.md },
  error: { padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface, gap: space.md },
  warn: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  answer: { color: colors.text, fontSize: 16, lineHeight: 24 },
  sectionTitle: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: space.sm },
  source: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, minHeight: 56, gap: 2 },
  sourceTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  sourceUrl: { color: colors.accent, fontSize: 12 },
  sourceMeta: { color: colors.muted, fontSize: 12 },
});
