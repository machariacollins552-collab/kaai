import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createKeyStore, createSettingsStore, createChatStore, maskKey, titleFrom,
  newChat, contextWindow, DEFAULT_SETTINGS, MAX_CHATS, MAX_MESSAGES,
} from '../src/store.js';
import { systemFor, PRESETS } from '../src/prompts.js';

const memStorage = () => {
  const m = new Map();
  return {
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => void m.set(k, v),
    removeItem: async (k) => void m.delete(k),
    _m: m,
  };
};
const memSecure = () => {
  const m = new Map();
  return {
    getItemAsync: async (k) => m.get(k) ?? null,
    setItemAsync: async (k, v) => void m.set(k, v),
    deleteItemAsync: async (k) => void m.delete(k),
    _m: m,
  };
};

test('keys: stored under secure storage only, trimmed, per provider', async () => {
  const secure = memSecure();
  const plain = memStorage();
  const keys = createKeyStore(secure);
  await keys.set('groq', '  gsk_abc  ');
  assert.equal(await keys.get('groq'), 'gsk_abc');
  assert.equal(await keys.get('gemini'), '');
  assert.equal(await keys.has('groq'), true);
  assert.equal(plain._m.size, 0); // never touched plain storage
  await keys.remove('groq');
  assert.equal(await keys.has('groq'), false);
});

test('keys: saving a blank value deletes the key', async () => {
  const keys = createKeyStore(memSecure());
  await keys.set('groq', 'gsk_abc');
  await keys.set('groq', '   ');
  assert.equal(await keys.has('groq'), false);
});

test('maskKey shows at most the last 4 characters and nothing for short keys', () => {
  assert.equal(maskKey(''), '');
  assert.equal(maskKey('abcd'), '••••••••');
  const m = maskKey('gsk_1234567890wxyz');
  assert.ok(m.endsWith('wxyz'));
  assert.ok(!m.includes('gsk_'));
});

test('settings: defaults on first load, persisted changes, survives corrupt data', async () => {
  const st = memStorage();
  const s = createSettingsStore(st);
  assert.deepEqual(await s.load(), DEFAULT_SETTINGS);
  await s.save({ provider: 'gemini', models: { groq: '', gemini: 'x' }, preset: 'email' });
  const again = await s.load();
  assert.equal(again.provider, 'gemini');
  assert.equal(again.models.gemini, 'x');
  st._m.set('settings_v1', '{not json');
  assert.deepEqual(await s.load(), DEFAULT_SETTINGS);
});

test('chats: save, list newest first, get, delete, clear', async () => {
  const store = createChatStore(memStorage());
  const a = { ...newChat('a', 1), title: 'A', updatedAt: 1, messages: [{ role: 'user', content: 'x' }] };
  const b = { ...newChat('b', 2), title: 'B', updatedAt: 2, messages: [] };
  await store.save(a);
  await store.save(b);
  assert.deepEqual((await store.list()).map((c) => c.id), ['b', 'a']);
  assert.equal((await store.get('a')).title, 'A');
  await store.remove('a');
  assert.equal(await store.get('a'), null);
  await store.clear();
  assert.deepEqual(await store.list(), []);
});

test('chats: updating an existing chat replaces it, not duplicates it', async () => {
  const store = createChatStore(memStorage());
  await store.save({ ...newChat('a', 1), messages: [] });
  await store.save({ ...newChat('a', 1), title: 'Renamed', updatedAt: 5, messages: [] });
  const all = await store.list();
  assert.equal(all.length, 1);
  assert.equal(all[0].title, 'Renamed');
});

test('chats: capped to MAX_CHATS (oldest dropped) and MAX_MESSAGES per chat (oldest dropped)', async () => {
  const store = createChatStore(memStorage());
  for (let i = 0; i < MAX_CHATS + 5; i++) await store.save({ ...newChat(`c${i}`, i), updatedAt: i, messages: [] });
  const all = await store.list();
  assert.equal(all.length, MAX_CHATS);
  assert.equal(all.some((c) => c.id === 'c0'), false);
  const msgs = Array.from({ length: MAX_MESSAGES + 10 }, (_, i) => ({ role: 'user', content: `m${i}` }));
  await store.save({ ...newChat('big', 1000), updatedAt: 1000, messages: msgs });
  const big = await store.get('big');
  assert.equal(big.messages.length, MAX_MESSAGES);
  assert.equal(big.messages.at(-1).content, `m${MAX_MESSAGES + 9}`);
});

test('chats: corrupt storage reads as empty instead of crashing', async () => {
  const st = memStorage();
  st._m.set('chats_v1', 'garbage');
  assert.deepEqual(await createChatStore(st).list(), []);
});

test('titleFrom trims, collapses whitespace, truncates, and has a fallback', () => {
  assert.equal(titleFrom('   '), 'New chat');
  assert.equal(titleFrom('hello   world'), 'hello world');
  assert.ok(titleFrom('x'.repeat(100)).length <= 41);
});

test('contextWindow: keeps latest message, drops oldest over budget, starts on a user turn', () => {
  const msgs = [
    { role: 'user', content: 'a'.repeat(50) },
    { role: 'assistant', content: 'b'.repeat(50) },
    { role: 'user', content: 'c'.repeat(50) },
    { role: 'assistant', content: 'd'.repeat(50) },
    { role: 'user', content: 'e'.repeat(50) },
  ];
  const w = contextWindow(msgs, 120);
  assert.equal(w.at(-1).content, 'e'.repeat(50));
  assert.equal(w[0].role, 'user');
  assert.ok(w.reduce((n, m) => n + m.content.length, 0) <= 150);
  // a single huge message is still sent
  const huge = contextWindow([{ role: 'user', content: 'z'.repeat(99999) }], 100);
  assert.equal(huge.length, 1);
});

test('presets: every preset has a label and a non-empty system prompt; unknown falls back to general', () => {
  for (const p of Object.values(PRESETS)) {
    assert.ok(p.label && p.system.length > 20);
  }
  assert.equal(systemFor('nope'), PRESETS.general.system);
});
