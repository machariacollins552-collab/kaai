import React, { useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Alert, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Button from '../components/Button';
import { groupTasks, quickTimes, parseWhen, formatWhen, planPrompt, PLAN_SYSTEM, PRIORITIES } from '../tasks';
import { colors, space, radius } from '../theme';

const SECTIONS = [
  ['overdue', 'Overdue'],
  ['today', 'Today'],
  ['upcoming', 'Upcoming'],
  ['noDate', 'No date'],
  ['done', 'Done'],
];

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

export default function TasksScreen({ tasks, onAdd, onToggle, onRemove, ask, onOpenSettings }) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('normal');
  const [whenId, setWhenId] = useState('none');
  const [custom, setCustom] = useState('');
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const now = Date.now();
  const quick = quickTimes(now);
  const groups = groupTasks(tasks, now);
  const openCount = tasks.filter((t) => !t.done).length;

  async function add() {
    let dueAt = null;
    if (whenId === 'custom') {
      const p = parseWhen(custom, now);
      if (!p.ok) return setMsg({ ok: false, text: p.message });
      dueAt = p.at;
    } else if (whenId !== 'none') {
      dueAt = quick.find((q) => q.id === whenId).at;
    }
    setAdding(true);
    const r = await onAdd({ title, priority, dueAt });
    setAdding(false);
    if (!r.ok) return setMsg({ ok: false, text: r.message });
    setTitle('');
    setWhenId('none');
    setCustom('');
    setMsg(
      r.warning
        ? { ok: false, text: `Task added. ${r.warning}` }
        : { ok: true, text: dueAt ? `Added. Reminder set for ${formatWhen(dueAt)}.` : 'Added.' }
    );
  }

  async function planDay() {
    setPlanBusy(true);
    setPlan(null);
    const r = await ask({ system: PLAN_SYSTEM, messages: [{ role: 'user', content: planPrompt(tasks) }] });
    setPlanBusy(false);
    setPlan(r.ok ? { ok: true, text: r.text } : { ok: false, text: r.message, code: r.code });
  }

  async function copyPlan() {
    await Clipboard.setStringAsync(plan.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function confirmRemove(t) {
    Alert.alert('Delete task?', `"${t.title}" will be removed, and its reminder cancelled.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onRemove(t.id) },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Tasks</Text>

      <View style={styles.card}>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="New task"
          placeholderTextColor={colors.muted}
          maxLength={120}
          accessibilityLabel="New task title"
        />
        <Text style={styles.small}>Priority</Text>
        <View style={styles.chips}>
          {PRIORITIES.map((p) => <Chip key={p} label={p} active={priority === p} onPress={() => setPriority(p)} />)}
        </View>
        <Text style={styles.small}>Remind me</Text>
        <View style={styles.chips}>
          <Chip label="No reminder" active={whenId === 'none'} onPress={() => setWhenId('none')} />
          {quick.map((q) => <Chip key={q.id} label={q.label} active={whenId === q.id} onPress={() => setWhenId(q.id)} />)}
          <Chip label="Custom" active={whenId === 'custom'} onPress={() => setWhenId('custom')} />
        </View>
        {whenId === 'custom' && (
          <TextInput
            style={styles.input}
            value={custom}
            onChangeText={setCustom}
            placeholder="2026-11-09 14:30"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            accessibilityLabel="Custom reminder date and time"
          />
        )}
        <Button label="Add task" onPress={add} busy={adding} disabled={!title.trim()} />
        {msg && <Text style={[styles.msg, { color: msg.ok ? colors.accent : colors.danger }]} accessibilityLiveRegion="polite">{msg.text}</Text>}
      </View>

      <Button label="Plan my day with AI" variant="secondary" onPress={planDay} busy={planBusy} disabled={openCount === 0} />
      {plan && (
        <View style={[styles.card, !plan.ok && { borderColor: colors.danger }]}>
          <Text selectable style={styles.planText}>{plan.text}</Text>
          <View style={styles.chips}>
            {plan.ok && <Button label={copied ? 'Copied' : 'Copy'} variant="secondary" onPress={copyPlan} />}
            {!plan.ok && ['no_key', 'invalid_key', 'bad_model'].includes(plan.code) && <Button label="Open Settings" onPress={onOpenSettings} />}
            <Button label="Dismiss" variant="secondary" onPress={() => setPlan(null)} />
          </View>
        </View>
      )}

      {tasks.length === 0 && <Text style={styles.empty}>No tasks yet. Add one above.</Text>}

      {SECTIONS.map(([key, label]) =>
        groups[key].length === 0 ? null : (
          <View key={key} style={styles.section}>
            <Text style={[styles.sectionTitle, key === 'overdue' && { color: colors.danger }]}>{label}</Text>
            {groups[key].map((t) => (
              <View key={t.id} style={styles.row}>
                <Pressable
                  onPress={() => onToggle(t.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: t.done }}
                  accessibilityLabel={`${t.title}, ${t.done ? 'done' : 'not done'}`}
                  style={[styles.check, t.done && styles.checkOn]}
                >
                  <Text style={styles.checkMark}>{t.done ? '✓' : ''}</Text>
                </Pressable>
                <View style={styles.rowMain}>
                  <Text style={[styles.rowTitle, t.done && styles.rowDone]}>{t.title}</Text>
                  <Text style={[styles.rowMeta, key === 'overdue' && { color: colors.danger }]}>
                    {t.dueAt != null ? formatWhen(t.dueAt, now) : 'No date'}
                    {t.priority !== 'normal' ? ` · ${t.priority}` : ''}
                    {t.notificationId ? ' · reminder set' : ''}
                  </Text>
                </View>
                <Button label="Delete" variant="danger" onPress={() => confirmRemove(t)} accessibilityLabel={`Delete task ${t.title}`} />
              </View>
            ))}
          </View>
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.md },
  input: { color: colors.text, backgroundColor: colors.bg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, minHeight: 48, fontSize: 16 },
  small: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { paddingHorizontal: space.md, minHeight: 40, justifyContent: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: colors.accentText },
  msg: { fontSize: 14, lineHeight: 20 },
  planText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  empty: { color: colors.muted, fontSize: 15 },
  section: { gap: space.sm, marginTop: space.sm },
  sectionTitle: { color: colors.muted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md },
  rowMain: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  rowDone: { color: colors.muted, textDecorationLine: 'line-through' },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  check: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: colors.accentText, fontSize: 20, fontWeight: '800' },
});
