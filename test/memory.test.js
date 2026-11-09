import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMemoryStore, checkMemoryText, buildMemoryBlock, withMemory,
  MAX_ITEMS, MAX_ITEM_CHARS, PROMPT_BUDGET,
} from '../src/memory.js';

const memStorage = () => {
  const m = new Map();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), _m: m };
};
const mkStore = () => {
  let i = 0, t = 1000;
  return createMemoryStore(memStorage(), () => `m${++i}`, () => ++t);
};

test('starts empty and enabled; nothing exists until the user adds it', async () => {
  const s = mkStore();
  assert.deepEqual(await s.load(), { enabled: true, items: [] });
});

test('add stores a trimmed item with its source and rejects empty input', async () => {
  const s = mkStore();
  const r = await s.add('  I run a pork   butchery in Nairobi ', 'chat');
  assert.equal(r.ok, true);
  assert.equal(r.item.text, 'I run a pork butchery in Nairobi');
  assert.equal(r.item.source, 'chat');
  assert.equal((await s.add('   ')).ok, false);
  assert.equal((await s.load()).items.length, 1);
});

test('too-long text and duplicates (any case) are rejected with a clear message', async () => {
  const s = mkStore();
  assert.match((await s.add('x'.repeat(MAX_ITEM_CHARS + 1))).message, /under/);
  await s.add('Prefer short replies');
  assert.match((await s.add('prefer SHORT replies')).message, /already/);
});

test('secrets are refused: API keys and passwords are never stored', async () => {
  const s = mkStore();
  for (const bad of ['my key is gsk_abcdefgh12345678', 'AIzaSyA1234567890abcdef', 'sk-abcdefghijklmnop', 'tvly-abc123xyz', 'password: hunter2']) {
    const r = await s.add(bad);
    assert.equal(r.ok, false, bad);
    assert.match(r.message, /password or API key/);
  }
  assert.deepEqual((await s.load()).items, []);
});

test('memory is capped at MAX_ITEMS', async () => {
  const s = mkStore();
  for (let i = 0; i < MAX_ITEMS; i++) assert.equal((await s.add(`fact number ${i}`)).ok, true);
  const r = await s.add('one more');
  assert.equal(r.ok, false);
  assert.match(r.message, /full/);
});

test('edit changes the text, validates it, and allows keeping the same text', async () => {
  const s = mkStore();
  const { item } = await s.add('Likes tea');
  assert.equal((await s.update(item.id, 'Likes chai')).item.text, 'Likes chai');
  assert.equal((await s.update(item.id, 'Likes chai')).ok, true); // same text as itself is fine
  assert.equal((await s.update(item.id, '')).ok, false);
  assert.equal((await s.update('nope', 'x')).ok, false);
  await s.add('Other fact');
  assert.match((await s.update(item.id, 'other fact')).message, /already/);
});

test('delete one, delete all', async () => {
  const s = mkStore();
  const a = (await s.add('A')).item;
  await s.add('B');
  await s.remove(a.id);
  assert.deepEqual((await s.load()).items.map((i) => i.text), ['B']);
  await s.clear();
  assert.deepEqual((await s.load()).items, []);
});

test('master switch persists and keeps the saved items', async () => {
  const s = mkStore();
  await s.add('Keep me');
  await s.setEnabled(false);
  const m = await s.load();
  assert.equal(m.enabled, false);
  assert.equal(m.items.length, 1);
});

test('corrupt storage loads as empty instead of crashing', async () => {
  const st = memStorage();
  st._m.set('memory_v1', '{{{');
  const s = createMemoryStore(st, () => 'x');
  assert.deepEqual(await s.load(), { enabled: true, items: [] });
});

test('prompt block: empty when off or empty; newest first; respects budget', () => {
  assert.equal(buildMemoryBlock({ enabled: false, items: [{ id: '1', text: 'a', createdAt: 1 }] }), '');
  assert.equal(buildMemoryBlock({ enabled: true, items: [] }), '');
  const block = buildMemoryBlock({ enabled: true, items: [{ id: '1', text: 'old', createdAt: 1 }, { id: '2', text: 'new', createdAt: 2 }] });
  assert.ok(block.indexOf('- new') < block.indexOf('- old'));
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `${i}`, text: 'y'.repeat(100), createdAt: i }));
  const capped = buildMemoryBlock({ enabled: true, items: many });
  assert.ok(capped.split('\n').length - 1 <= PROMPT_BUDGET / 100);
});

test('withMemory leaves the system prompt untouched when memory is off', () => {
  assert.equal(withMemory('SYS', { enabled: false, items: [{ id: '1', text: 'x', createdAt: 1 }] }), 'SYS');
  const on = withMemory('SYS', { enabled: true, items: [{ id: '1', text: 'x', createdAt: 1 }] });
  assert.ok(on.startsWith('SYS') && on.includes('- x'));
});

test('checkMemoryText ignores its own id when checking for duplicates', () => {
  assert.equal(checkMemoryText('same', [{ id: 'a', text: 'same' }], 'a').ok, true);
  assert.equal(checkMemoryText('same', [{ id: 'a', text: 'same' }], 'b').ok, false);
});
