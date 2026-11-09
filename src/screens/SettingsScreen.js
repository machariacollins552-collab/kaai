import React from 'react';
import { View, Text, TextInput, ScrollView, Pressable, StyleSheet } from 'react-native';
import Button from '../components/Button';
import KeySection from '../components/KeySection';
import { PROVIDERS, testConnection } from '../ai';
import { testSearchKey } from '../research';
import { colors, space, radius } from '../theme';

export default function SettingsScreen({ settings, keyStore, onChangeSettings, onKeysChanged, onBack }) {
  const provider = settings.provider;
  const info = PROVIDERS[provider];

  async function testLlm(key) {
    const r = await testConnection({ provider, apiKey: key, model: settings.models[provider] });
    return r.ok
      ? { ok: true, text: `Working. ${info.label} answered using ${r.model}.` }
      : { ok: false, text: r.message + (r.detail ? ` (${r.detail})` : '') };
  }

  async function testSearch(key) {
    const r = await testSearchKey({ apiKey: key });
    return r.ok ? { ok: true, text: 'Working. The search service accepted this key.' } : { ok: false, text: r.message };
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Settings</Text>
      <Button label="Back to chat" variant="secondary" onPress={onBack} />

      <Text style={styles.label}>AI provider</Text>
      <View style={styles.segment}>
        {Object.entries(PROVIDERS).map(([id, p]) => {
          const active = id === provider;
          return (
            <Pressable
              key={id}
              onPress={() => onChangeSettings({ ...settings, provider: id })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.segmentItem, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, active && { color: colors.accentText }]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <KeySection
        title={`${info.label} API key`}
        hint={`${info.keyHint}.`}
        keyName={provider}
        keyStore={keyStore}
        onChanged={onKeysChanged}
        testFn={testLlm}
      />

      <Text style={styles.label}>Model (optional)</Text>
      <TextInput
        style={styles.input}
        value={settings.models[provider]}
        onChangeText={(v) => onChangeSettings({ ...settings, models: { ...settings.models, [provider]: v } })}
        placeholder={`Default: ${info.defaultModel}`}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={`${info.label} model name`}
      />
      <Text style={styles.hint}>
        Leave blank to use the default. If the provider says the model is unknown, type a current model name from its documentation.
      </Text>

      <View style={styles.divider} />

      <KeySection
        title="Web search key (Tavily), for Research"
        hint="Used only by the Research tab. Per Tavily's pricing page the free plan has 1,000 credits a month and needs no card; each research uses 1 to 3 credits."
        keyName="tavily"
        keyStore={keyStore}
        onChanged={onKeysChanged}
        testFn={testSearch}
      />

      <View style={styles.privacy}>
        <Text style={styles.privacyTitle}>Privacy</Text>
        <Text style={styles.hint}>
          Keys are kept in this phone's secure storage and are only sent to the service they belong to. Chats, tasks and memories are saved on this phone only. Your messages and any saved memories are sent to your chosen AI provider to get replies. Research questions are also sent to Tavily to search the web; memories are never sent to Tavily.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  label: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: space.md },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  input: { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, minHeight: 48, fontSize: 16 },
  segment: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 4, gap: 4 },
  segmentItem: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.accent },
  segmentText: { color: colors.text, fontWeight: '600', fontSize: 15 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: space.md },
  privacy: { marginTop: space.xl, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, gap: space.sm },
  privacyTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
});
