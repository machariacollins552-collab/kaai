import React, { useRef, useState, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Button from '../components/Button';
import { PRESETS, PRESET_IDS } from '../prompts';
import { colors, space, radius } from '../theme';

function Bubble({ message, onRemember, onSaveTask }) {
  const [copied, setCopied] = useState(false);
  const mine = message.role === 'user';
  async function copy() {
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text selectable style={styles.bubbleText}>{message.content}</Text>
        <View style={styles.actions}>
          {!mine && (
            <Pressable onPress={copy} accessibilityRole="button" accessibilityLabel="Copy reply" hitSlop={8} style={styles.copy}>
              <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          )}
          {!mine && (
            <Pressable onPress={() => onSaveTask(message.content)} accessibilityRole="button" accessibilityLabel="Save reply as a task" hitSlop={8} style={styles.copy}>
              <Text style={styles.copyText}>Save as task</Text>
            </Pressable>
          )}
          {mine && (
            <Pressable onPress={() => onRemember(message.content)} accessibilityRole="button" accessibilityLabel="Remember this message" hitSlop={8} style={styles.copy}>
              <Text style={styles.copyText}>Remember</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ChatScreen({
  chat, settings, sending, error, notice, keyMissing,
  onSend, onRetry, onNew, onOpenHistory, onOpenSettings, onChangePreset, onDismissError,
  onRemember, onSaveTask,
}) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (chat.messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }, [chat.messages.length, sending]);

  function submit() {
    const t = text.trim();
    if (!t || sending) return;
    setText('');
    onSend(t);
  }

  const canSend = text.trim().length > 0 && !sending;
  const needsSettings = error && ['no_key', 'invalid_key', 'bad_model'].includes(error.code);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>{chat.title}</Text>
        <View style={styles.headerButtons}>
          <Button label="History" variant="secondary" onPress={onOpenHistory} />
          <Button label="New" variant="secondary" onPress={onNew} />
          <Button label="Settings" variant="secondary" onPress={onOpenSettings} />
        </View>
      </View>

      <View style={styles.chips}>
        {PRESET_IDS.map((id) => {
          const active = settings.preset === id;
          return (
            <Pressable
              key={id}
              onPress={() => onChangePreset(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Mode: ${PRESETS[id].label}`}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{PRESETS[id].label}</Text>
            </Pressable>
          );
        })}
      </View>

      {chat.messages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>What can I help with?</Text>
          <Text style={styles.emptyBody}>
            Ask a question, or pick Email, Social post or Story to draft something. Replies come from your chosen AI provider.
          </Text>
          {keyMissing && (
            <View style={styles.emptyAction}>
              <Button label="Add your API key" onPress={onOpenSettings} />
            </View>
          )}
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={chat.messages}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => <Bubble message={item} onRemember={onRemember} onSaveTask={onSaveTask} />}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      )}

      {sending && (
        <View style={styles.thinking}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.thinkingText}>Thinking…</Text>
        </View>
      )}

      {notice && (
        <Text
          style={[styles.notice, { color: notice.ok ? colors.accent : colors.danger }]}
          accessibilityLiveRegion="polite"
        >
          {notice.text}
        </Text>
      )}

      {error && (
        <View style={styles.error} accessibilityLiveRegion="polite">
          <Text style={styles.errorText}>{error.message}</Text>
          <View style={styles.errorButtons}>
            {error.canRetry && <Button label="Retry" variant="secondary" onPress={onRetry} />}
            {needsSettings && <Button label="Open Settings" onPress={onOpenSettings} />}
            <Button label="Dismiss" variant="secondary" onPress={onDismissError} />
          </View>
        </View>
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={colors.muted}
          multiline
          maxLength={4000}
          accessibilityLabel="Message input"
        />
        <Button label="Send" onPress={submit} disabled={!canSend} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: space.lg, paddingTop: space.md, gap: space.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  headerButtons: { flexDirection: 'row', gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  chip: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, minHeight: 36, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.accentText },
  empty: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.md },
  emptyTitle: { color: colors.text, fontSize: 24, fontWeight: '700' },
  emptyBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  emptyAction: { alignSelf: 'flex-start', marginTop: space.md },
  list: { padding: space.lg, gap: space.md },
  row: { flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '88%', borderRadius: radius.md, padding: space.md },
  bubbleMine: { backgroundColor: colors.userBubble },
  bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleText: { color: colors.text, fontSize: 16, lineHeight: 23 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.lg, marginTop: space.sm },
  copy: { paddingVertical: space.xs, minHeight: 32, justifyContent: 'center' },
  notice: { paddingHorizontal: space.lg, paddingBottom: space.sm, fontSize: 14 },
  copyText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  thinkingText: { color: colors.muted, fontSize: 14 },
  error: { margin: space.lg, marginBottom: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger, backgroundColor: colors.surface, gap: space.md },
  errorText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  errorButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  input: { flex: 1, maxHeight: 140, minHeight: 44, color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: space.sm, fontSize: 16 },
});
