import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  searchTavily, testSearchKey, parseQueries, planQueries, collectSources,
  buildSynthesisRequest, verifyCitations, research, MAX_SOURCES, SNIPPET_CHARS,
} from '../src/research.js';

const KEY = 'tvly-SECRETKEY123456';
const hit = (n, extra = {}) => ({ title: `Title ${n}`, url: `https://site${n}.com/a`, content: `Content ${n}`, ...extra });
const tavilyOk = (results) => new Response(JSON.stringify({ results }), { status: 200 });
const hang = (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
const askOk = (text) => async () => ({ ok: true, text, provider: 'groq', model: 'm' });

// ---------- search ----------

test('search success: results parsed; key sent only as header and body field to Tavily, never in a URL', async () => {
  let seen;
  const f = async (url, init) => { seen = { url, init }; return tavilyOk([hit(1), hit(2)]); };
  const r = await searchTavily({ apiKey: KEY, query: 'kenya fuel price', fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.results.length, 2);
  assert.ok(!seen.url.includes(KEY));
  assert.equal(seen.init.headers.authorization, `Bearer ${KEY}`);
  assert.equal(JSON.parse(seen.init.body).query, 'kenya fuel price');
});

test('search drops malformed results and non-http URLs', async () => {
  const f = async () => tavilyOk([hit(1), { title: 'x', url: 'javascript:alert(1)', content: 'c' }, { url: 'https://ok.com', content: 5 }, null, hit(2)]);
  const r = await searchTavily({ apiKey: KEY, query: 'q', fetchImpl: f });
  assert.deepEqual(r.results.map((x) => x.url), ['https://site1.com/a', 'https://site2.com/a']);
});

test('search errors: missing key, bad key, limits, server error, timeout, network, bad JSON', async () => {
  const code = async (status) => (await searchTavily({ apiKey: KEY, query: 'q', fetchImpl: async () => new Response('x', { status }) })).code;
  assert.equal((await searchTavily({ apiKey: ' ', query: 'q', fetchImpl: async () => { throw new Error('no'); } })).code, 'no_search_key');
  assert.equal(await code(401), 'invalid_search_key');
  assert.equal(await code(403), 'invalid_search_key');
  assert.equal(await code(429), 'search_limit');
  assert.equal(await code(432), 'search_limit');
  assert.equal(await code(500), 'search_error');
  assert.equal((await searchTavily({ apiKey: KEY, query: 'q', fetchImpl: hang, timeoutMs: 30 })).code, 'search_timeout');
  assert.equal((await searchTavily({ apiKey: KEY, query: 'q', fetchImpl: async () => { throw new TypeError('x'); } })).code, 'search_network');
  assert.equal((await searchTavily({ apiKey: KEY, query: 'q', fetchImpl: async () => new Response('<html>', { status: 200 }) })).code, 'search_error');
});

test('testSearchKey reports ok for a working key and the real error for a bad one', async () => {
  assert.equal((await testSearchKey({ apiKey: KEY, fetchImpl: async () => tavilyOk([hit(1)]) })).ok, true);
  assert.equal((await testSearchKey({ apiKey: KEY, fetchImpl: async () => new Response('', { status: 401 }) })).code, 'invalid_search_key');
});

// ---------- planning ----------

test('parseQueries: valid arrays, fenced JSON, dedupe, cap at 3, junk falls back to the question', () => {
  assert.deepEqual(parseQueries('["a b","c"]', 'Q'), ['a b', 'c']);
  assert.deepEqual(parseQueries('```json\n["x"]\n```', 'Q'), ['x']);
  assert.deepEqual(parseQueries('["A","a","B","C","D"]', 'Q'), ['A', 'B', 'C']);
  assert.deepEqual(parseQueries('no json here', 'Q'), ['Q']);
  assert.deepEqual(parseQueries('[1,2,null]', 'Q'), ['Q']);
  assert.deepEqual(parseQueries(undefined, 'Q'), ['Q']);
});

test('planQueries: short questions skip the model call; long ones use it; model failure falls back', async () => {
  let calls = 0;
  const ask = async () => { calls++; return { ok: true, text: '["one","two"]' }; };
  assert.deepEqual(await planQueries('short question', ask), ['short question']);
  assert.equal(calls, 0);
  const long = 'q'.repeat(120);
  assert.deepEqual(await planQueries(long, ask), ['one', 'two']);
  assert.deepEqual(await planQueries(long, async () => ({ ok: false })), [long]);
});

// ---------- sources and citations ----------

test('collectSources: dedupes URLs (case, slash, hash), numbers from 1, caps count and snippet length', () => {
  const dupes = [[hit(1), hit(2, { url: 'https://SITE1.com/a/#frag' })], [hit(3)]];
  const s = collectSources(dupes);
  assert.deepEqual(s.map((x) => [x.id, x.url]), [[1, 'https://site1.com/a'], [2, 'https://site3.com/a']]);
  const many = collectSources([Array.from({ length: 20 }, (_, i) => hit(i, { content: 'x'.repeat(5000) }))]);
  assert.equal(many.length, MAX_SOURCES);
  assert.equal(many[0].content.length, SNIPPET_CHARS);
});

test('synthesis request numbers the sources and tells the model they are untrusted data', () => {
  const r = buildSynthesisRequest('Q?', collectSources([[hit(1), hit(2)]]));
  assert.match(r.system, /untrusted/);
  assert.match(r.system, /ONLY the numbered sources/);
  assert.match(r.messages[0].content, /\[1\] Title 1/);
  assert.match(r.messages[0].content, /\[2\] Title 2/);
});

test('verifyCitations keeps real markers and removes ones pointing at sources that do not exist', () => {
  const v = verifyCitations('Fact A [1]. Fact B [2, 5]. Made up [9]. Fine [2].', 3);
  assert.equal(v.text, 'Fact A [1]. Fact B [2]. Made up . Fine [2].');
  assert.deepEqual(v.cited, [1, 2]);
  assert.equal(v.removed, 2);
  assert.deepEqual(verifyCitations('No markers here', 3).cited, []);
  assert.equal(verifyCitations('Array a[0] is not a citation', 3).text, 'Array a[0] is not a citation');
  // glued brackets are plain text: left alone and not counted, even when the number is in range
  const glued = verifyCitations('Value x[1] and a real one [2].', 3);
  assert.equal(glued.text, 'Value x[1] and a real one [2].');
  assert.deepEqual(glued.cited, [2]);
  // a citation right after punctuation still counts
  assert.deepEqual(verifyCitations('End of claim.[3]', 3).cited, [3]);
});

// ---------- full flow ----------

test('research success: queries searched, sources numbered, citations verified, credits counted', async () => {
  const f = async () => tavilyOk([hit(1), hit(2)]);
  const r = await research({ question: 'What is the price of diesel in Kenya?', tavilyKey: KEY, ask: askOk('Diesel costs X [1]. Another point [2].'), fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.sources.length, 2);
  assert.deepEqual(r.cited, [1, 2]);
  assert.equal(r.creditsUsed, 1);
  assert.deepEqual(r.warnings, []);
});

test('research: input checks happen before any network call', async () => {
  const boom = async () => { throw new Error('should not be called'); };
  assert.equal((await research({ question: '  ', tavilyKey: KEY, ask: boom, fetchImpl: boom })).code, 'empty_question');
  assert.equal((await research({ question: 'x'.repeat(501), tavilyKey: KEY, ask: boom, fetchImpl: boom })).code, 'question_too_long');
  assert.equal((await research({ question: 'q', tavilyKey: '', ask: boom, fetchImpl: boom })).code, 'no_search_key');
});

test('research: search failure is reported with its real reason, and no answer is invented', async () => {
  let asked = false;
  const r = await research({ question: 'q', tavilyKey: KEY, ask: async () => { asked = true; return { ok: true, text: 'made up' }; }, fetchImpl: async () => new Response('', { status: 429 }) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'search_limit');
  assert.equal(asked, false);
});

test('research: zero usable results returns no_sources and never calls the model', async () => {
  let asked = false;
  const r = await research({ question: 'q', tavilyKey: KEY, ask: async () => { asked = true; return { ok: true, text: 'x' }; }, fetchImpl: async () => tavilyOk([]) });
  assert.equal(r.code, 'no_sources');
  assert.equal(asked, false);
});

test('research: model failure is surfaced with stage "answer"', async () => {
  const r = await research({ question: 'q', tavilyKey: KEY, ask: async () => ({ ok: false, code: 'rate_limited', message: 'slow' }), fetchImpl: async () => tavilyOk([hit(1)]) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'rate_limited');
  assert.equal(r.stage, 'answer');
});

test('research: fabricated citations are stripped and the user is warned; no citations at all is also flagged', async () => {
  const f = async () => tavilyOk([hit(1)]);
  const fake = await research({ question: 'q', tavilyKey: KEY, ask: askOk('Claim [1]. Invented [7].'), fetchImpl: f });
  assert.equal(fake.answer, 'Claim [1]. Invented .');
  assert.ok(fake.warnings.some((w) => /do not exist/.test(w)));
  const none = await research({ question: 'q', tavilyKey: KEY, ask: askOk('No markers at all'), fetchImpl: f });
  assert.ok(none.warnings.some((w) => /cites no sources/.test(w)));
});

test('research: partial search failure still answers but warns the results may be incomplete', async () => {
  let n = 0;
  const f = async () => (n++ === 0 ? tavilyOk([hit(1)]) : new Response('', { status: 500 }));
  const ask = async ({ system }) => (/JSON array/.test(system) ? { ok: true, text: '["one","two"]' } : { ok: true, text: 'Answer [1]' });
  const r = await research({ question: 'q'.repeat(100), tavilyKey: KEY, ask, fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.creditsUsed, 2);
  assert.ok(r.warnings.some((w) => /incomplete/.test(w)));
});

test('research: the Tavily key never appears in the model request or the result', async () => {
  let modelReq;
  const ask = async (req) => { modelReq = req; return { ok: true, text: 'Answer [1]' }; };
  const r = await research({ question: 'q', tavilyKey: KEY, ask, fetchImpl: async () => tavilyOk([hit(1)]) });
  assert.ok(!JSON.stringify(modelReq).includes(KEY));
  assert.ok(!JSON.stringify(r).includes(KEY));
});
