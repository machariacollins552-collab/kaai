import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { sendChat } from './src/ai';
import { systemFor } from './src/prompts';
import {
  createKeyStore, createSettingsStore, createChatStore,
  newChat, titleFrom, contextWindow, DEFAULT_SETTINGS,
} from './src/store';
import { createMemoryStore, withMemory } from './src/memory';
import { createTaskStore, MAX_TITLE } from './src/tasks';
import { createReminders, createTaskService } from './src/reminders';

import ChatScreen from './src/screens/ChatScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import ResearchScreen from './src/screens/ResearchScreen';
import ReplyScreen from './src/screens/ReplyScreen';
import TasksScreen from './src/screens/TasksScreen';
import MemoryScreen from './src/screens/MemoryScreen';
import TabBar, { TABS } from './src/components/TabBar';
import { colors } from './src/theme';

// Show reminders even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const RETRYABLE = ['timeout', 'network', 'provider_error', 'rate_limited', 'empty_reply'];
const TAB_IDS = TABS.map(([id]) => id);
const EMPTY_MEMORY = { enabled: true, items: [] };

export default function App() {
  const keyStore = useMemo(() => createKeyStore(SecureStore), []);
  const settingsStore = useMemo(() => createSettingsStore(AsyncStorage), []);
  const chatStore = useMemo(() => createChatStore(AsyncStorage), []);
  const memoryStore = useMemo(() => createMemoryStore(AsyncStorage, makeId), []);
  const taskStore = useMemo(() => createTaskStore(AsyncStorage), []);
  const taskService = useMemo(
    () => createTaskService({ store: taskStore, reminders: createReminders(Notifications), makeId }),
    [taskStore]
  );

  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState('chat');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [hasKey, setHasKey] = useState({ groq: false, gemini: false, tavily: false });
  const [chat, setChat] = useState(() => newChat(makeId()));
  const [chats, setChats] = useState([]);
  const [memory, setMemory] = useState(EMPTY_MEMORY);
  const [tasks, setTasks] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const currentId = useRef(chat.id);
  const noticeTimer = useRef(null);

  const refreshKeys = useCallback(async () => {
    setHasKey({
      groq: await keyStore.has('groq'),
      gemini: await keyStore.has('gemini'),
      tavily: await keyStore.has('tavily'),
    });
  }, [keyStore]);
  const refreshChats = useCallback(async () => setChats(await chatStore.list()), [chatStore]);
  const refreshMemory = useCallback(async () => setMemory(await memoryStore.load()), [memoryStore]);
  const refreshTasks = useCallback(async () => setTasks(await taskStore.list()), [taskStore]);

  useEffect(() => {
    (async () => {
      setSettings(await settingsStore.load());
      await Promise.all([refreshKeys(), refreshChats(), refreshMemory(), refreshTasks()]);
      setReady(true);
    })();
    return () => clearTimeout(noticeTimer.current);
  }, [settingsStore, refreshKeys, refreshChats, refreshMemory, refreshTasks]);

  function flash(ok, text) {
    clearTimeout(noticeTimer.current);
    setNotice({ ok, text });
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  }

  function showChat(next) {
    currentId.current = next.id;
    setChat(next);
    setError(null);
  }

  function changeSettings(next) {
    setSettings(next);
    settingsStore.save(next);
  }

  // One entry point for every AI request, using the provider and key chosen in Settings.
  const ask = useCallback(
    async ({ system, messages }) =>
      sendChat({
        provider: settings.provider,
        apiKey: await keyStore.get(settings.provider),
        model: settings.models[settings.provider],
        system,
        messages,
      }),
    [settings, keyStore]
  );

  const memorySystem = useCallback((system) => withMemory(system, memory), [memory]);

  // ---------- chat ----------

  async function run(chatId) {
    const stored = await chatStore.get(chatId);
    if (!stored) return;
    setSending(true);
    setError(null);
    const result = await ask({
      system: memorySystem(systemFor(settings.preset)),
      messages: contextWindow(stored.messages),
    });
    setSending(false);

    if (!result.ok) {
      if (currentId.current === chatId) {
        setError({ code: result.code, message: result.message, canRetry: RETRYABLE.includes(result.code) });
      }
      return;
    }
    // Re-read so a reply that arrives after the user switched chats still lands in the right one.
    const fresh = (await chatStore.get(chatId)) ?? stored;
    const updated = {
      ...fresh,
      updatedAt: Date.now(),
      messages: [...fresh.messages, { role: 'assistant', content: result.text, ts: Date.now() }],
    };
    await chatStore.save(updated);
    if (currentId.current === chatId) setChat(updated);
    refreshChats();
  }

  async function onSend(text) {
    if (sending) return;
    const base = chat.messages.length === 0 ? { ...chat, title: titleFrom(text) } : chat;
    const withUser = {
      ...base,
      updatedAt: Date.now(),
      messages: [...base.messages, { role: 'user', content: text, ts: Date.now() }],
    };
    setChat(withUser);
    await chatStore.save(withUser);
    refreshChats();
    run(withUser.id);
  }

  function onRetry() {
    if (sending || chat.messages.at(-1)?.role !== 'user') return;
    run(chat.id);
  }

  async function openChat(id) {
    const c = await chatStore.get(id);
    if (c) showChat(c);
    setScreen('chat');
  }

  async function deleteChat(id) {
    await chatStore.remove(id);
    if (id === chat.id) showChat(newChat(makeId()));
    refreshChats();
  }

  async function deleteAll() {
    await chatStore.clear();
    showChat(newChat(makeId()));
    setChats([]);
  }

  // ---------- explicit actions the user taps (this is the approval step) ----------

  async function rememberFromChat(text) {
    const r = await memoryStore.add(text, 'chat');
    await refreshMemory();
    flash(r.ok, r.ok ? 'Saved to memory.' : r.message);
  }

  async function saveTaskFromChat(text) {
    const firstLine = text.split('\n').find((l) => l.trim()) ?? text;
    const title = firstLine.length > MAX_TITLE ? firstLine.slice(0, MAX_TITLE - 1).trimEnd() + '…' : firstLine;
    const r = await taskService.add({ title, notes: text.slice(0, 2000) });
    await refreshTasks();
    flash(r.ok, r.ok ? 'Saved as a task.' : r.message);
  }

  // ---------- tasks ----------

  async function addTask(input) {
    const r = await taskService.add(input);
    await refreshTasks();
    return r;
  }
  async function toggleTask(id) {
    await taskService.toggleDone(id);
    refreshTasks();
  }
  async function removeTask(id) {
    await taskService.remove(id);
    refreshTasks();
  }

  // ---------- memory ----------

  async function addMemory(text, source) {
    const r = await memoryStore.add(text, source);
    await refreshMemory();
    return r;
  }
  async function updateMemory(id, text) {
    const r = await memoryStore.update(id, text);
    await refreshMemory();
    return r;
  }
  async function removeMemory(id) {
    await memoryStore.remove(id);
    refreshMemory();
  }
  async function clearMemory() {
    await memoryStore.clear();
    refreshMemory();
  }
  async function toggleMemory(enabled) {
    await memoryStore.setEnabled(enabled);
    refreshMemory();
  }

  if (!ready) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const keyMissing = !hasKey[settings.provider];
  const openSettings = () => setScreen('settings');

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      <View style={styles.body}>
        {screen === 'chat' && (
          <ChatScreen
            chat={chat}
            settings={settings}
            sending={sending}
            error={error}
            notice={notice}
            keyMissing={keyMissing}
            onSend={onSend}
            onRetry={onRetry}
            onNew={() => showChat(newChat(makeId()))}
            onOpenHistory={async () => { await refreshChats(); setScreen('history'); }}
            onOpenSettings={openSettings}
            onChangePreset={(preset) => changeSettings({ ...settings, preset })}
            onDismissError={() => setError(null)}
            onRemember={rememberFromChat}
            onSaveTask={saveTaskFromChat}
          />
        )}
        {screen === 'research' && (
          <ResearchScreen
            ask={ask}
            getSearchKey={() => keyStore.get('tavily')}
            hasSearchKey={hasKey.tavily}
            onOpenSettings={openSettings}
          />
        )}
        {screen === 'reply' && <ReplyScreen ask={ask} memorySystem={memorySystem} onOpenSettings={openSettings} />}
        {screen === 'tasks' && (
          <TasksScreen
            tasks={tasks}
            onAdd={addTask}
            onToggle={toggleTask}
            onRemove={removeTask}
            ask={ask}
            onOpenSettings={openSettings}
          />
        )}
        {screen === 'memory' && (
          <MemoryScreen
            memory={memory}
            onToggle={toggleMemory}
            onAdd={addMemory}
            onUpdate={updateMemory}
            onRemove={removeMemory}
            onClear={clearMemory}
          />
        )}
        {screen === 'history' && (
          <HistoryScreen chats={chats} onOpen={openChat} onDelete={deleteChat} onDeleteAll={deleteAll} onBack={() => setScreen('chat')} />
        )}
        {screen === 'settings' && (
          <SettingsScreen
            settings={settings}
            keyStore={keyStore}
            onChangeSettings={changeSettings}
            onKeysChanged={refreshKeys}
            onBack={() => { setError(null); setScreen('chat'); }}
          />
        )}
      </View>
      {TAB_IDS.includes(screen) && <TabBar active={screen} onSelect={setScreen} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
});
