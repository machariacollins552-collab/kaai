// Task logic. Pure functions plus a small store; no native modules, so it is testable in Node.

export const PRIORITIES = ['high', 'normal', 'low'];
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };
const TASKS_KEY = 'tasks_v1';
export const MAX_TASKS = 500;
export const MAX_TITLE = 120;

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (ts) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export function validateTitle(title) {
  const t = (title ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, message: 'Give the task a title.' };
  if (t.length > MAX_TITLE) return { ok: false, message: `Keep the title under ${MAX_TITLE} characters.` };
  return { ok: true, title: t };
}

export function newTask({ id, title, notes = '', dueAt = null, priority = 'normal' }, now = Date.now()) {
  return {
    id,
    title,
    notes: notes.trim(),
    dueAt: dueAt ?? null,
    priority: PRIORITIES.includes(priority) ? priority : 'normal',
    done: false,
    createdAt: now,
    completedAt: null,
    notificationId: null,
  };
}

/** Open tasks first (overdue, then by due time, then undated by priority); done tasks last, newest first. */
export function sortTasks(tasks, now = Date.now()) {
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  open.sort((a, b) => {
    const ad = a.dueAt, bd = b.dueAt;
    if (ad != null && bd != null) return ad - bd || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (ad != null) return -1;
    if (bd != null) return 1;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt - b.createdAt;
  });
  done.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  return [...open, ...done];
}

export function groupTasks(tasks, now = Date.now()) {
  const today0 = startOfDay(now);
  const groups = { overdue: [], today: [], upcoming: [], noDate: [], done: [] };
  for (const t of sortTasks(tasks, now)) {
    if (t.done) groups.done.push(t);
    else if (t.dueAt == null) groups.noDate.push(t);
    else if (t.dueAt < now) groups.overdue.push(t);
    else if (t.dueAt < today0 + DAY) groups.today.push(t);
    else groups.upcoming.push(t);
  }
  return groups;
}

function atLocal(base, dayOffset, hour, minute = 0) {
  const d = new Date(base);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + dayOffset, hour, minute).getTime();
}

/** Three quick reminder times, always in the future. */
export function quickTimes(now = Date.now()) {
  const evening = atLocal(now, 0, 18);
  return [
    { id: 'hour', label: 'In 1 hour', at: now + 60 * 60 * 1000 },
    { id: 'evening', label: 'This evening, 18:00', at: evening > now ? evening : atLocal(now, 1, 18) },
    { id: 'tomorrow', label: 'Tomorrow, 08:00', at: atLocal(now, 1, 8) },
  ];
}

/** Parse "YYYY-MM-DD HH:mm" in local time. */
export function parseWhen(text, now = Date.now()) {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})\s*$/.exec(text ?? '');
  if (!m) return { ok: false, message: 'Use this format: 2026-11-09 14:30' };
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  const valid =
    date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d &&
    date.getHours() === h && date.getMinutes() === mi;
  if (!valid) return { ok: false, message: 'That date or time does not exist.' };
  if (date.getTime() <= now) return { ok: false, message: 'That time has already passed.' };
  return { ok: true, at: date.getTime() };
}

const pad = (n) => String(n).padStart(2, '0');
export function formatWhen(ts, now = Date.now()) {
  if (ts == null) return '';
  const d = new Date(ts);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const diffDays = Math.round((startOfDay(ts) - startOfDay(now)) / DAY);
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays === -1) return `Yesterday ${time}`;
  const day = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} ${time}`;
}

/** Build the user message for "Plan my day". Only real tasks are listed. */
export function planPrompt(tasks, now = Date.now()) {
  const open = sortTasks(tasks.filter((t) => !t.done), now);
  const lines = open.map((t, i) => {
    const due = t.dueAt != null ? ` (due ${formatWhen(t.dueAt, now)})` : '';
    const note = t.notes ? ` Notes: ${t.notes.slice(0, 200)}` : '';
    return `${i + 1}. [${t.priority}] ${t.title}${due}.${note}`;
  });
  const nowText = new Date(now).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
  return `It is ${nowText}. Here are my open tasks:\n${lines.join('\n')}\n\nPlan my day: an ordered, realistic list with suggested time blocks, what to do first, and what to defer. Use only these tasks. Do not invent new ones.`;
}

export const PLAN_SYSTEM =
  'You are a practical planning assistant. Produce a short, realistic plan from the exact tasks given. Do not add tasks, claim to set reminders, or take any action. Keep it under 200 words.';

// ---------- store ----------

export function createTaskStore(storage) {
  async function readAll() {
    try {
      const raw = await storage.getItem(TASKS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  return {
    list: readAll,
    async get(id) {
      return (await readAll()).find((t) => t.id === id) ?? null;
    },
    async save(task) {
      const all = await readAll();
      const i = all.findIndex((t) => t.id === task.id);
      if (i >= 0) all[i] = task;
      else all.push(task);
      // Over the cap, drop the oldest completed tasks first, then oldest overall.
      while (all.length > MAX_TASKS) {
        const idx = all.findIndex((t) => t.done);
        all.splice(idx >= 0 ? idx : 0, 1);
      }
      await storage.setItem(TASKS_KEY, JSON.stringify(all));
    },
    async remove(id) {
      const all = (await readAll()).filter((t) => t.id !== id);
      await storage.setItem(TASKS_KEY, JSON.stringify(all));
    },
  };
}
