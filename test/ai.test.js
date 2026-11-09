import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sendChat, testConnection } from '../src/ai.js';

const KEY = 'gsk_SECRETKEY123';
const msgs = [{ role: 'user', content: 'hi' }];

const groqOk = (t = 'hello') =>
  new Response(JSON.stringify({ choices: [{ message: { content: t } }] }), { status: 200 });
const geminiOk = (t = 'hello') =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] }), { status: 200 });
const errRes = (status, message = 'x') =>
  new Response(JSON.stringify({ error: { message } }), { status });
const hang = (_u, init) =>
  new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));

test('success on Groq: text returned, key only in Authorization header, never in URL or body', async () => {
  let seen;
  const f = async (url, init) => { seen = { url, init }; return groqOk('hi there'); };
  const r = await sendChat({ provider: 'groq', apiKey: KEY, messages: msgs, fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.text, 'hi there');
  assert.equal(seen.init.headers.authorization, `Bearer ${KEY}`);
  assert.ok(!seen.url.includes(KEY));
  assert.ok(!seen.init.body.includes(KEY));
});

test('success on Gemini: key in header not URL, roles mapped, system prompt sent separately', async () => {
  let seen;
  const f = async (url, init) => { seen = { url, init }; return geminiOk('gem'); };
  const history = [{ role: 'user', content: 'q1' }, { role: 'assistant', content: 'a1' }, { role: 'user', content: 'q2' }];
  const r = await sendChat({ provider: 'gemini', apiKey: 'AIzaKEY', system: 'be brief', messages: history, fetchImpl: f });
  assert.equal(r.text, 'gem');
  const body = JSON.parse(seen.init.body);
  assert.deepEqual(body.contents.map((c) => c.role), ['user', 'model', 'user']);
  assert.equal(body.systemInstruction.parts[0].text, 'be brief');
  assert.equal(seen.init.headers['x-goog-api-key'], 'AIzaKEY');
  assert.ok(!seen.url.includes('AIzaKEY'));
});

test('missing key: no_key and no network call', async () => {
  let called = false;
  const f = async () => { called = true; return groqOk(); };
  for (const apiKey of ['', '   ', undefined]) {
    const r = await sendChat({ provider: 'groq', apiKey, messages: msgs, fetchImpl: f });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'no_key');
  }
  assert.equal(called, false);
});

test('unknown provider is rejected without a network call', async () => {
  const r = await sendChat({ provider: 'nope', apiKey: 'k', messages: msgs, fetchImpl: async () => { throw new Error('no'); } });
  assert.equal(r.code, 'bad_request');
});

test('default model used when blank, custom model respected', async () => {
  const bodies = [];
  const f = async (_u, init) => { bodies.push(JSON.parse(init.body)); return groqOk(); };
  await sendChat({ provider: 'groq', apiKey: KEY, model: '  ', messages: msgs, fetchImpl: f });
  await sendChat({ provider: 'groq', apiKey: KEY, model: 'custom-model', messages: msgs, fetchImpl: f });
  assert.equal(bodies[0].model, 'llama-3.3-70b-versatile');
  assert.equal(bodies[1].model, 'custom-model');
});

test('error mapping: 401/403 invalid_key, 429 rate_limited, 404 bad_model, 500 provider_error', async () => {
  const cases = [[401, 'invalid_key'], [403, 'invalid_key'], [429, 'rate_limited'], [404, 'bad_model'], [500, 'provider_error'], [503, 'provider_error']];
  for (const [status, code] of cases) {
    const r = await sendChat({ provider: 'groq', apiKey: KEY, messages: msgs, fetchImpl: async () => errRes(status) });
    assert.equal(r.ok, false);
    assert.equal(r.code, code, `status ${status}`);
    assert.ok(r.message.length > 0);
  }
});

test('Gemini 400 "API key not valid" maps to invalid_key; 400 about model maps to bad_model', async () => {
  const a = await sendChat({ provider: 'gemini', apiKey: 'k', messages: msgs, fetchImpl: async () => errRes(400, 'API key not valid. Please pass a valid API key.') });
  assert.equal(a.code, 'invalid_key');
  const b = await sendChat({ provider: 'gemini', apiKey: 'k', messages: msgs, fetchImpl: async () => errRes(400, 'models/foo is not found for model') });
  assert.equal(b.code, 'bad_model');
});

test('error detail never leaks the key even if the provider echoes it', async () => {
  const r = await sendChat({ provider: 'groq', apiKey: KEY, messages: msgs, fetchImpl: async () => errRes(401, `Invalid API key: ${KEY}`) });
  assert.equal(r.code, 'invalid_key');
  assert.ok(!JSON.stringify(r).includes(KEY));
});

test('timeout: hanging provider is aborted and reported as timeout', async () => {
  const r = await sendChat({ provider: 'groq', apiKey: KEY, messages: msgs, fetchImpl: hang, timeoutMs: 30 });
  assert.equal(r.code, 'timeout');
});

test('network failure maps to network', async () => {
  const r = await sendChat({ provider: 'groq', apiKey: KEY, messages: msgs, fetchImpl: async () => { throw new TypeError('Network request failed'); } });
  assert.equal(r.code, 'network');
});

test('empty or malformed replies map to empty_reply, never a fake answer', async () => {
  const bodies = [{ choices: [] }, { choices: [{ message: { content: '' } }] }, {}];
  for (const b of bodies) {
    const r = await sendChat({ provider: 'groq', apiKey: KEY, messages: msgs, fetchImpl: async () => new Response(JSON.stringify(b), { status: 200 }) });
    assert.equal(r.code, 'empty_reply');
  }
  const notJson = await sendChat({ provider: 'groq', apiKey: KEY, messages: msgs, fetchImpl: async () => new Response('<html>', { status: 200 }) });
  assert.equal(notJson.code, 'empty_reply');
});

test('testConnection returns ok for a working key and the right error for a bad one', async () => {
  const good = await testConnection({ provider: 'groq', apiKey: KEY, fetchImpl: async () => groqOk('OK') });
  assert.equal(good.ok, true);
  const bad = await testConnection({ provider: 'groq', apiKey: KEY, fetchImpl: async () => errRes(401) });
  assert.equal(bad.code, 'invalid_key');
});
