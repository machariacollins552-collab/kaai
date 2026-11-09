import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Switch, Alert, StyleSheet } from 'react-native';
import Button from '../components/Button';
import { MAX_ITEM_CHARS } from '../memory';
import { colors, space, radius } from '../theme';

export default function MemoryScreen({ memory, onToggle, onAdd, onUpdate, onRemove, onClear }) {
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');

  async function add() {
    const r = await onAdd(draft, 'manual');
    if (r.ok) { setDraft(''); setMsg({ ok: true, text: 'Saved.' }); } else setMsg({ ok: false, text: r.message });
  }

  async function saveEdit() {
    const r = await onUpdate(editId, editText);
    if (r.ok) { setEditId(null); setMsg(null); } else setMsg({ ok: false, text: r.message });
  }

  function confirmClear() {
    Alert.alert('Delete all memories?', 'Everything the assistant remembers about you will be removed from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: onClear },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Memory</Text>
      <Text style={styles.hint}>
        The assistant only remembers what you save here, or what you save by tapping Remember under one of your own messages in Chat. While memory is on, saved items are sent to your AI provider with Chat and Reply requests. Passwords and API keys are never saved.
      </Text>

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Use memory in replies</Text>
        <Switch
          value={memory.enabled}
          onValueChange={onToggle}
          trackColor={{ true: colors.accent, false: colors.border }}
          accessibilityLabel="Use memory in replies"
        />
      </View>

      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="e.g. I run a pork butchery in Nairobi"
          placeholderTextColor={colors.muted}
          maxLength={MAX_ITEM_CHARS}
          multiline
          accessibilityLabel="New memory"
        />
        <Button label="Save to memory" onPress={add} disabled={!draft.trim()} />
        {msg && <Text style={[styles.msg, { color: msg.ok ? colors.accent : colors.danger }]} accessibilityLiveRegion="polite">{msg.text}</Text>}
      </View>

      {memory.items.length === 0 ? (
        <Text style={styles.hint}>Nothing saved yet.</Text>
      ) : (
        <>
          {[...memory.items].sort((a, b) => b.createdAt - a.createdAt).map((item) => (
            <View key={item.id} style={styles.item}>
              {editId === item.id ? (
                <>
                  <TextInput
                    style={styles.input}
                    value={editText}
                    onChangeText={setEditText}
                    maxLength={MAX_ITEM_CHARS}
                    multiline
                    autoFocus
                    accessibilityLabel="Edit memory"
                  />
                  <View style={styles.row}>
                    <Button label="Save" onPress={saveEdit} disabled={!editText.trim()} />
                    <Button label="Cancel" variant="secondary" onPress={() => { setEditId(null); setMsg(null); }} />
                  </View>
                </>
              ) : (
                <>
                  <Text selectable style={styles.itemText}>{item.text}</Text>
                  <View style={styles.row}>
                    <Button label="Edit" variant="secondary" onPress={() => { setEditId(item.id); setEditText(item.text); setMsg(null); }} accessibilityLabel={`Edit memory ${item.text}`} />
                    <Button label="Delete" variant="danger" onPress={() => onRemove(item.id)} accessibilityLabel={`Delete memory ${item.text}`} />
                  </View>
                </>
              )}
            </View>
          ))}
          <Button label="Delete all memories" variant="danger" onPress={confirmClear} />
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
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  switchLabel: { color: colors.text, fontSize: 16, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.md },
  input: { color: colors.text, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48, fontSize: 16 },
  msg: { fontSize: 14, lineHeight: 20 },
  item: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.md },
  itemText: { color: colors.text, fontSize: 16, lineHeight: 23 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
