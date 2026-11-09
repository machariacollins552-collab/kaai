import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Button from '../components/Button';
import { CHANNELS, TONES, buildReplyRequest, cleanDraft, findPlaceholders, MAX_INCOMING, MAX_INTENT } from '../reply';
import { colors, space, radius } from '../theme';

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function ReplyScreen({ ask, memorySystem, onOpenSettings }) {
  const [incoming, setIncoming] = useState('');
  const [channel, setChannel] = useState('whatsapp');
  const [tone, setTone] = useState('friendly');
  const [intent, setIntent] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function paste() {
    const t = await Clipboard.getStringAsync();
    if (t) setIncoming(t.slice(0, MAX_INCOMING));
    else setError({ message: 'The clipboard is empty. Copy the message first, then tap Paste.' });
  }

  async function generate() {
    const req = buildReplyRequest({ incoming, channel, tone, intent });
    if (!req.ok) return setError({ message: req.message });
    setBusy(true);
    setError(null);
    const r = await ask({ system: memorySystem(req.system), messages: req.messages });
    setBusy(false);
    if (!r.ok) return setError({ message: r.message, code: r.code });
    setDraft(cleanDraft(r.text));
  }

  async function copy() {
    await Clipboard.setStringAsync(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const gaps = findPlaceholders(draft);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Reply</Text>
      <Text style={styles.hint}>
        Copy a message from WhatsApp, SMS or email, paste it here, and get a draft reply. Nothing is sent from this app: you copy the draft and send it yourself.
      </Text>

      <Text style={styles.label}>Message you received</Text>
      <TextInput
        style={[styles.input, styles.multi]}
        value={incoming}
        onChangeText={setIncoming}
        placeholder="Paste the message here"
        placeholderTextColor={colors.muted}
        multiline
        maxLength={MAX_INCOMING}
        accessibilityLabel="Message you received"
      />
      <View style={styles.row}>
        <Button label="Paste from clipboard" variant="secondary" onPress={paste} />
        <Button label="Clear" variant="secondary" onPress={() => { setIncoming(''); setDraft(''); setError(null); }} disabled={!incoming && !draft} />
      </View>

      <Text style={styles.label}>Where will you send it?</Text>
      <View style={styles.row}>
        {Object.entries(CHANNELS).map(([id, l]) => <Chip key={id} label={l} active={channel === id} onPress={() => setChannel(id)} />)}
      </View>

      <Text style={styles.label}>Tone</Text>
      <View style={styles.row}>
        {Object.entries(TONES).map(([id, l]) => <Chip key={id} label={l} active={tone === id} onPress={() => setTone(id)} />)}
      </View>

      <Text style={styles.label}>What do you want to say? (optional)</Text>
      <TextInput
        style={styles.input}
        value={intent}
        onChangeText={setIntent}
        placeholder="e.g. Say yes, but only after 2pm"
        placeholderTextColor={colors.muted}
        maxLength={MAX_INTENT}
        accessibilityLabel="What you want to say"
      />

      <Button label={draft ? 'Draft again' : 'Draft reply'} onPress={generate} busy={busy} disabled={!incoming.trim()} />

      {error && (
        <View style={styles.error} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{error.message}</Text>
          {['no_key', 'invalid_key', 'bad_model'].includes(error.code) && <Button label="Open Settings" onPress={onOpenSettings} />}
        </View>
      )}

      {draft !== '' && (
        <View style={styles.card}>
          <Text style={styles.label}>Draft (you can edit it)</Text>
          <TextInput
            style={[styles.input, styles.multi]}
            value={draft}
            onChangeText={setDraft}
            multiline
            accessibilityLabel="Draft reply"
          />
          {gaps.length > 0 && (
            <Text style={styles.warn}>Fill in before sending: {gaps.join(', ')}</Text>
          )}
          <Button label={copied ? 'Copied' : 'Copy reply'} onPress={copy} />
          <Text style={styles.hint}>Check the facts before you send. The draft only uses what you told it.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  label: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: space.sm },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48, fontSize: 16 },
  multi: { minHeight: 110, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, minHeight: 40, justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.accentText },
  error: { padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface, gap: space.md },
  errorText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.md },
  warn: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});
