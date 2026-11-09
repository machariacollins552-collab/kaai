// AI client: talks directly to Groq or Gemini using the key the user typed into Settings.
// Pure JS with an injectable fetch so it can be tested in Node without a phone.
// The key is only ever sent in a request header to the provider. It is never logged,
// never put in a URL, and never included in an error message.

export const PROVIDERS = {
  groq: {
    label: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    keyHint: 'Starts with gsk_',
  },
  gemini: {
    label: 'Google Gemini',
    // Listed as free-tier on Google's pricing page (read 2026-11-08). Not tried with a real key.
    defaultModel: 'gemini-3.8-flash',
    keyHint: 'Starts with AIza',
  },
};

const DEFAULT_TIMEOUT_MS = 30000;

const ERROR_TEXT = {
  no_key: 'Add your API key in Settings first.',
  invalid_key: 'The provider rejected this API key. Check it in Settings.',
  rate_limited: 'The provider is rate limiting you. Wait a minute and try again.',
  bad_model: 'The provider does not recognise this model name. Change it in Settings.',
  timeout: 'The provider took too long to answer. Try again.',
  network: 'Could not reach the provider. Check your internet connection.',
  provider_error: 'The provider had a problem. Try again shortly.',
  empty_reply: 'The provider returned an empty reply. Try again.',
  bad_request: 'The provider could not process this request.',
};

function fail(code, detail) {
  return { ok: false, code, message: ERROR_TEXT[code], ...(detail ? { detail } : {}) };
}

// Pull a short, safe error string from a provider error body (never echo the key).
async function readDetail(res) {
  try {
    const raw = await res.text();
    let msg = raw;
    try {
      const j = JSON.parse(raw);
      msg = j?.error?.message ?? raw;
    } catch {
      /* keep raw text */
    }
    return String(msg).slice(0, 200);
  } catch {
    return '';
  }
}

// Redact the key from text shown to the user. Real keys are long; skip tiny strings
// so we never mangle ordinary words.
function redact(text, apiKey) {
  return apiKey && apiKey.length >= 8 ? text.split(apiKey).join('[key]') : text;
}

function classify(status, detail) {
  const d = (detail || '').toLowerCase();
  if (status === 401 || status === 403) return 'invalid_key';
  if (status === 429) return 'rate_limited';
  if (status === 404) return 'bad_model';
  if (status === 400) {
    if (d.includes('api key') || d.includes('api_key')) return 'invalid_key';
    if (d.includes('model')) return 'bad_model';
    return 'bad_request';
  }
  if (status >= 500) return 'provider_error';
  return 'provider_error';
}

function buildGroq(apiKey, model, system, messages) {
  const msgs = [...(system ? [{ role: 'system', content: system }] : []), ...messages];
  return {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: msgs }),
    },
    parse: (data) => data?.choices?.[0]?.message?.content,
  };
}

function buildGemini(apiKey, model, system, messages) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      }),
    },
    parse: (data) => data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join(''),
  };
}

const BUILDERS = { groq: buildGroq, gemini: buildGemini };

/**
 * Send a chat to the chosen provider.
 * @returns {Promise<{ok:true,text:string,provider:string,model:string}|{ok:false,code:string,message:string,detail?:string}>}
 */
export async function sendChat({
  provider,
  apiKey,
  model,
  system = '',
  messages,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const key = (apiKey ?? '').trim();
  if (!key) return fail('no_key');
  const build = BUILDERS[provider];
  if (!build) return fail('bad_request', `Unknown provider: ${provider}`);
  const useModel = (model ?? '').trim() || PROVIDERS[provider].defaultModel;

  const { url, init, parse } = build(key, useModel, system, messages);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const raw = await readDetail(res);
      return fail(classify(res.status, raw), redact(raw, key));
    }
    let data;
    try {
      data = await res.json();
    } catch {
      return fail('empty_reply');
    }
    const text = parse(data);
    if (typeof text !== 'string' || text.trim() === '') return fail('empty_reply');
    return { ok: true, text, provider, model: useModel };
  } catch (err) {
    return fail(err?.name === 'AbortError' ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

/** Cheap check used by the Settings "Test key" button. */
export function testConnection(opts) {
  return sendChat({
    ...opts,
    system: '',
    messages: [{ role: 'user', content: 'Reply with the single word: OK' }],
    timeoutMs: opts.timeoutMs ?? 15000,
  });
}
