// Memory with consent. Nothing is saved automatically: an item only exists because the user
// tapped "Remember" on one of their own messages or typed it in the Memory screen.

const MEMORY_KEY = 'memory_v1';
export const MAX_ITEMS = 50;
export const MAX_ITEM_CHARS = 300;
export const PROMPT_BUDGET = 2000;

// Things that look like credentials are never stored.
const SECRET_PATTERNS = [/gsk_[A-Za-z0-9]{8,}/, /AIza[A-Za-z0-9_-]{10,}/, /\bsk-[A-Za-z0-9_-]{10,}/, /tvly-[A-Za-z0-9_-]{6,}/i, /\b(password|passcode|pin)\s*[:=]/i];

export function checkMemoryText(text, existing = [], ignoreId = null) {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { ok: false, message: 'Type something to remember.' };
  if (t.length > MAX_ITEM_CHARS) return { ok: false, message: `Keep each memory under ${MAX_ITEM_CHARS} characters.` };
  if (SECRET_PATTERNS.some((re) => re.test(t)))
    return { ok: false, message: 'That looks like a password or API key, so it was not saved.' };
  const dup = existing.some((m) => m.id !== ignoreId && m.text.toLowerCase() === t.toLowerCase());
  if (dup) return { ok: false, message: 'You already saved that.' };
  return { ok: true, text: t };
}

export function createMemoryStore(storage, makeId, now = () => Date.now()) {
  async function load() {
    try {
      const raw = await storage.getItem(MEMORY_KEY);
      const m = raw ? JSON.parse(raw) : {};
      return { enabled: m.enabled !== false, items: Array.isArray(m.items) ? m.items : [] };
    } catch {
      return { enabled: true, items: [] };
    }
  }
  const save = (m) => storage.setItem(MEMORY_KEY, JSON.stringify(m));

  return {
    load,
    async add(text, source = 'manual') {
      const m = await load();
      if (m.items.length >= MAX_ITEMS) return { ok: false, message: 'Memory is full. Delete something first.' };
      const c = checkMemoryText(text, m.items);
      if (!c.ok) return c;
      const item = { id: makeId(), text: c.text, source, createdAt: now() };
      m.items.push(item);
      await save(m);
      return { ok: true, item };
    },
    async update(id, text) {
      const m = await load();
      const item = m.items.find((i) => i.id === id);
      if (!item) return { ok: false, message: 'Memory not found.' };
      const c = checkMemoryText(text, m.items, id);
      if (!c.ok) return c;
      item.text = c.text;
      await save(m);
      return { ok: true, item };
    },
    async remove(id) {
      const m = await load();
      m.items = m.items.filter((i) => i.id !== id);
      await save(m);
    },
    async clear() {
      const m = await load();
      m.items = [];
      await save(m);
    },
    async setEnabled(enabled) {
      const m = await load();
      m.enabled = !!enabled;
      await save(m);
    },
  };
}

/** The block added to the system prompt. Empty when memory is off or has nothing in it. */
export function buildMemoryBlock(memory, budget = PROMPT_BUDGET) {
  if (!memory?.enabled || !memory.items?.length) return '';
  const lines = [];
  let used = 0;
  for (const item of [...memory.items].sort((a, b) => b.createdAt - a.createdAt)) {
    if (used + item.text.length > budget) break;
    lines.push(`- ${item.text}`);
    used += item.text.length;
  }
  if (lines.length === 0) return '';
  return `Things the user asked you to remember. Use them only when relevant, and do not mention this list unless asked:\n${lines.join('\n')}`;
}

export function withMemory(system, memory) {
  const block = buildMemoryBlock(memory);
  return block ? `${system}\n\n${block}` : system;
}
