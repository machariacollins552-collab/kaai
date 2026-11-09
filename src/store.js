// Persistence. Storage backends are injected so this is testable without a phone:
//   secure  -> expo-secure-store (Android Keystore) for API keys only
//   storage -> AsyncStorage for settings and chat history

const KEY_PREFIX = 'ai_key_';
const SETTINGS_KEY = 'settings_v1';
const CHATS_KEY = 'chats_v1';
export const MAX_CHATS = 50;
export const MAX_MESSAGES = 200;
const CONTEXT_CHARS = 12000;

export const DEFAULT_SETTINGS = {
  provider: 'groq',
  models: { groq: '', gemini: '' }, // blank = provider default
  preset: 'general',
};

// ---------- API keys ----------

export function createKeyStore(secure) {
  const name = (provider) => `${KEY_PREFIX}${provider}`;
  return {
    async get(provider) {
      return (await secure.getItemAsync(name(provider))) ?? '';
    },
    async set(provider, key) {
      const k = (key ?? '').trim();
      if (!k) return secure.deleteItemAsync(name(provider));
      return secure.setItemAsync(name(provider), k);
    },
    async remove(provider) {
      return secure.deleteItemAsync(name(provider));
    },
    async has(provider) {
      return !!(await secure.getItemAsync(name(provider)));
    },
  };
}

/** Show only the end of a key, e.g. "••••••••abcd". Never the whole thing. */
export function maskKey(key) {
  if (!key) return '';
  const tail = key.length > 8 ? key.slice(-4) : '';
  return '••••••••' + tail;
}

// ---------- settings ----------

export function createSettingsStore(storage) {
  return {
    async load() {
      try {
        const raw = await storage.getItem(SETTINGS_KEY);
        const s = raw ? JSON.parse(raw) : {};
        return {
          ...DEFAULT_SETTINGS,
          ...s,
          models: { ...DEFAULT_SETTINGS.models, ...(s.models ?? {}) },
        };
      } catch {
        return { ...DEFAULT_SETTINGS, models: { ...DEFAULT_SETTINGS.models } };
      }
    },
    async save(settings) {
      await storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    },
  };
}

// ---------- chats ----------

export function titleFrom(text) {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return 'New chat';
  return t.length > 40 ? t.slice(0, 40).trimEnd() + '…' : t;
}

export function newChat(id, now = Date.now()) {
  return { id, title: 'New chat', createdAt: now, updatedAt: now, messages: [] };
}

export function createChatStore(storage) {
  async function readAll() {
    try {
      const raw = await storage.getItem(CHATS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  async function writeAll(chats) {
    const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CHATS);
    await storage.setItem(CHATS_KEY, JSON.stringify(sorted));
  }
  return {
    async list() {
      const all = await readAll();
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async get(id) {
      return (await readAll()).find((c) => c.id === id) ?? null;
    },
    async save(chat) {
      const trimmed = { ...chat, messages: chat.messages.slice(-MAX_MESSAGES) };
      const all = await readAll();
      const i = all.findIndex((c) => c.id === trimmed.id);
      if (i >= 0) all[i] = trimmed;
      else all.push(trimmed);
      await writeAll(all);
    },
    async remove(id) {
      await writeAll((await readAll()).filter((c) => c.id !== id));
    },
    async clear() {
      await storage.removeItem(CHATS_KEY);
    },
  };
}

/**
 * Pick the most recent messages that fit the budget, always keeping the latest message,
 * and always starting on a user turn (providers reject a conversation that starts with the assistant).
 */
export function contextWindow(messages, maxChars = CONTEXT_CHARS) {
  const out = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const len = m.content.length;
    if (out.length > 0 && used + len > maxChars) break;
    out.unshift({ role: m.role, content: m.content });
    used += len;
  }
  while (out.length > 1 && out[0].role !== 'user') out.shift();
  return out;
}
