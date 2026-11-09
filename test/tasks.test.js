import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newTask, sortTasks, groupTasks, quickTimes, parseWhen, formatWhen,
  validateTitle, planPrompt, createTaskStore, MAX_TASKS,
} from '../src/tasks.js';
import { createReminders, createTaskService } from '../src/reminders.js';

const local = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const NOW = local(2026, 11, 8, 10, 0); // Sun 8 Nov 2026 10:00 local
const mk = (id, extra = {}) => ({ ...newTask({ id, title: id }, NOW - 1000), ...extra });

const memStorage = () => {
  const m = new Map();
  return { getItem: async (k) => m.get(k) ?? null, setItem: async (k, v) => void m.set(k, v), removeItem: async (k) => void m.delete(k), _m: m };
};

// Fake expo-notifications recording calls.
function fakeNotifications({ granted = true, schedFails = false } = {}) {
  const calls = { scheduled: [], cancelled: [], requested: 0 };
  let n = 0;
  let perm = granted;
  return {
    calls,
    AndroidImportance: { HIGH: 4 },
    SchedulableTriggerInputTypes: { DATE: 'date' },
    setNotificationChannelAsync: async () => {},
    getPermissionsAsync: async () => ({ granted: perm }),
    requestPermissionsAsync: async () => { calls.requested++; return { granted: perm }; },
    scheduleNotificationAsync: async (req) => {
      if (schedFails) throw new Error('boom');
      calls.scheduled.push(req);
      return `n${++n}`;
    },
    cancelScheduledNotificationAsync: async (id) => { calls.cancelled.push(id); },
  };
}
const service = (opts) => {
  const store = createTaskStore(memStorage());
  const notif = fakeNotifications(opts);
  let i = 0;
  const svc = createTaskService({ store, reminders: createReminders(notif), now: () => NOW, makeId: () => `t${++i}` });
  return { svc, store, notif };
};

// ---------- pure logic ----------

test('validateTitle trims, collapses spaces, rejects empty and too long', () => {
  assert.deepEqual(validateTitle('  buy   milk '), { ok: true, title: 'buy milk' });
  assert.equal(validateTitle('   ').ok, false);
  assert.equal(validateTitle('x'.repeat(121)).ok, false);
});

test('sortTasks: overdue first, then by due time, then undated by priority, done last', () => {
  const tasks = [
    mk('undated-low', { priority: 'low' }),
    mk('later', { dueAt: NOW + 5 * 3600e3 }),
    mk('overdue', { dueAt: NOW - 3600e3 }),
    mk('undated-high', { priority: 'high' }),
    mk('done-old', { done: true, completedAt: 1 }),
    mk('done-new', { done: true, completedAt: 99 }),
    mk('soon', { dueAt: NOW + 3600e3 }),
  ];
  assert.deepEqual(sortTasks(tasks, NOW).map((t) => t.id), [
    'overdue', 'soon', 'later', 'undated-high', 'undated-low', 'done-new', 'done-old',
  ]);
});

test('groupTasks splits overdue, today, upcoming, no date, done', () => {
  const g = groupTasks([
    mk('a', { dueAt: NOW - 1000 }),
    mk('b', { dueAt: local(2026, 11, 8, 20) }),
    mk('c', { dueAt: local(2026, 11, 9, 8) }),
    mk('d'),
    mk('e', { done: true, completedAt: 5 }),
  ], NOW);
  assert.deepEqual(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((t) => t.id)])), {
    overdue: ['a'], today: ['b'], upcoming: ['c'], noDate: ['d'], done: ['e'],
  });
});

test('quickTimes are all in the future; evening rolls to tomorrow when 18:00 has passed', () => {
  const morning = quickTimes(local(2026, 11, 8, 10, 0));
  assert.ok(morning.every((q) => q.at > local(2026, 11, 8, 10, 0)));
  assert.equal(morning.find((q) => q.id === 'evening').at, local(2026, 11, 8, 18));
  assert.equal(morning.find((q) => q.id === 'tomorrow').at, local(2026, 11, 9, 8));
  const night = local(2026, 11, 8, 22, 30);
  assert.equal(quickTimes(night).find((q) => q.id === 'evening').at, local(2026, 11, 9, 18));
});

test('parseWhen accepts valid local times and rejects bad, impossible and past ones', () => {
  assert.deepEqual(parseWhen('2026-11-09 14:30', NOW), { ok: true, at: local(2026, 11, 9, 14, 30) });
  assert.deepEqual(parseWhen('2026-11-09T07:05', NOW), { ok: true, at: local(2026, 11, 9, 7, 5) });
  assert.equal(parseWhen('tomorrow', NOW).ok, false);
  assert.equal(parseWhen('2026-02-31 10:00', NOW).ok, false);
  assert.equal(parseWhen('2026-11-09 25:00', NOW).ok, false);
  assert.match(parseWhen('2026-11-01 10:00', NOW).message, /passed/);
});

test('formatWhen labels today, tomorrow and yesterday', () => {
  assert.equal(formatWhen(local(2026, 11, 8, 14, 5), NOW), 'Today 14:05');
  assert.equal(formatWhen(local(2026, 11, 9, 8, 0), NOW), 'Tomorrow 08:00');
  assert.equal(formatWhen(local(2026, 11, 7, 9, 0), NOW), 'Yesterday 09:00');
  assert.equal(formatWhen(null, NOW), '');
});

test('planPrompt lists only open tasks and forbids inventing new ones', () => {
  const p = planPrompt([mk('Call supplier', { priority: 'high', dueAt: NOW + 3600e3 }), mk('Finished', { done: true })], NOW);
  assert.ok(p.includes('Call supplier'));
  assert.ok(!p.includes('Finished'));
  assert.match(p, /Do not invent/);
});

// ---------- store ----------

test('task store: save, update in place, remove, corrupt data reads as empty, cap drops done tasks first', async () => {
  const st = memStorage();
  const store = createTaskStore(st);
  await store.save(mk('a'));
  await store.save({ ...mk('a'), title: 'renamed' });
  assert.equal((await store.list()).length, 1);
  assert.equal((await store.get('a')).title, 'renamed');
  await store.remove('a');
  assert.deepEqual(await store.list(), []);
  st._m.set('tasks_v1', 'garbage');
  assert.deepEqual(await store.list(), []);

  const big = createTaskStore(memStorage());
  await big.save(mk('done-one', { done: true, completedAt: 1 }));
  for (let i = 0; i < MAX_TASKS; i++) await big.save(mk(`t${i}`));
  const ids = (await big.list()).map((t) => t.id);
  assert.equal(ids.length, MAX_TASKS);
  assert.ok(!ids.includes('done-one'));
});

// ---------- service + reminders ----------

test('add with a future due time: permission asked, notification scheduled, id stored on the task', async () => {
  const { svc, store, notif } = service({ granted: true });
  const r = await svc.add({ title: 'Call Mum', dueAt: NOW + 3600e3 });
  assert.equal(r.ok, true);
  assert.equal(r.warning, null);
  assert.equal(notif.calls.scheduled.length, 1);
  assert.equal(notif.calls.scheduled[0].content.body, 'Call Mum');
  assert.equal(notif.calls.scheduled[0].trigger.date.getTime(), NOW + 3600e3);
  assert.equal((await store.get(r.task.id)).notificationId, 'n1');
});

test('add without a due time or with a past due time schedules nothing', async () => {
  const { svc, notif } = service();
  await svc.add({ title: 'No date' });
  await svc.add({ title: 'Past', dueAt: NOW - 1000 });
  assert.equal(notif.calls.scheduled.length, 0);
  assert.equal(notif.calls.requested, 0);
});

test('add with empty title is rejected and nothing is saved', async () => {
  const { svc, store } = service();
  const r = await svc.add({ title: '   ' });
  assert.equal(r.ok, false);
  assert.deepEqual(await store.list(), []);
});

test('notification permission denied: task still saved, warning shown, nothing scheduled', async () => {
  const { svc, store, notif } = service({ granted: false });
  const r = await svc.add({ title: 'Pay rent', dueAt: NOW + 3600e3 });
  assert.equal(r.ok, true);
  assert.match(r.warning, /turned off/);
  assert.equal(notif.calls.scheduled.length, 0);
  assert.equal((await store.get(r.task.id)).notificationId, null);
});

test('scheduling failure: task saved with a warning, no crash', async () => {
  const { svc } = service({ schedFails: true });
  const r = await svc.add({ title: 'X', dueAt: NOW + 3600e3 });
  assert.equal(r.ok, true);
  assert.match(r.warning, /could not be scheduled/);
});

test('completing a task cancels its reminder; un-completing reschedules it', async () => {
  const { svc, notif } = service();
  const { task } = await svc.add({ title: 'Task', dueAt: NOW + 3600e3 });
  const done = await svc.toggleDone(task.id);
  assert.equal(done.task.done, true);
  assert.deepEqual(notif.calls.cancelled, ['n1']);
  assert.equal(done.task.notificationId, null);
  const undone = await svc.toggleDone(task.id);
  assert.equal(undone.task.done, false);
  assert.equal(notif.calls.scheduled.length, 2);
  assert.equal(undone.task.notificationId, 'n2');
});

test('editing the due time cancels the old reminder and schedules the new one', async () => {
  const { svc, notif } = service();
  const { task } = await svc.add({ title: 'T', dueAt: NOW + 3600e3 });
  const r = await svc.update(task.id, { dueAt: NOW + 7200e3 });
  assert.deepEqual(notif.calls.cancelled, ['n1']);
  assert.equal(notif.calls.scheduled.at(-1).trigger.date.getTime(), NOW + 7200e3);
  assert.equal(r.task.notificationId, 'n2');
  const cleared = await svc.update(task.id, { dueAt: null });
  assert.equal(cleared.task.notificationId, null);
});

test('deleting a task cancels its reminder and removes it', async () => {
  const { svc, store, notif } = service();
  const { task } = await svc.add({ title: 'T', dueAt: NOW + 3600e3 });
  await svc.remove(task.id);
  assert.deepEqual(notif.calls.cancelled, ['n1']);
  assert.equal(await store.get(task.id), null);
});

test('unknown task id returns a clear error instead of throwing', async () => {
  const { svc } = service();
  assert.equal((await svc.toggleDone('nope')).ok, false);
  assert.equal((await svc.update('nope', { title: 'x' })).ok, false);
});
