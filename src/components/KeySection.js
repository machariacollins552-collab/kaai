import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import Button from './Button';
import { maskKey } from '../store';
import { colors, space, radius } from '../theme';

/**
 * One API key box: save, show/hide, remove and test.
 * testFn(key) must return { ok: boolean, text: string }.
 */
export default function KeySection({ title, hint, keyName, keyStore, onChanged, testFn }) {
  const [saved, setSaved] = useState('');
  const [draft, setDraft] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    let alive = true;
    setDraft('');
    setShow(false);
    setStatus(null);
    keyStore.get(keyName).then((k) => alive && setSaved(k));
    return () => { alive = false; };
  }, [keyName, keyStore]);

  async function save() {
    const k = draft.trim();
    if (!k) return;
    await keyStore.set(keyName, k);
    setSaved(k);
    setDraft('');
    setShow(false);
    setStatus({ ok: true, text: 'Key saved on this phone.' });
    onChanged?.();
  }

  async function remove() {
    await keyStore.remove(keyName);
    setSaved('');
    setStatus({ ok: true, text: 'Key removed.' });
    onChanged?.();
  }

  async function test() {
    setBusy(true);
    setStatus(null);
    setStatus(await testFn(draft.trim() || saved));
    setBusy(false);
  }

  return (
    <View style={styles.box}>
      <Text style={styles.label}>{title}</Text>
      <Text style={styles.hint}>{saved ? `Saved: ${maskKey(saved)}` : 'No key saved yet.'} {hint}</Text>
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        placeholder={saved ? 'Paste a new key to replace it' : 'Paste your key here'}
        placeholderTextColor={colors.muted}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={title}
      />
      <View style={styles.row}>
        <Button label={show ? 'Hide' : 'Show'} variant="secondary" onPress={() => setShow((s) => !s)} />
        <Button label="Save key" onPress={save} disabled={!draft.trim()} />
        <Button label="Remove key" variant="danger" onPress={remove} disabled={!saved} />
      </View>
      <Button label="Test key" variant="secondary" onPress={test} busy={busy} disabled={!draft.trim() && !saved} />
      {status && (
        <Text style={[styles.status, { color: status.ok ? colors.accent : colors.danger }]} accessibilityLiveRegion="polite">
          {status.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: space.md },
  label: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: space.md },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, minHeight: 48, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  status: { fontSize: 14, lineHeight: 20 },
});
