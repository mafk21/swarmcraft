import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import assert from 'node:assert/strict';

const out = scratch('gemini.bundle.mjs');
await build({
  entryPoints: ['src/lib/gemini.ts'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: out.path, logLevel: 'silent',
});
const g = await import(out.url);

/* ── a fake Gemini so the real code paths run unmodified ─────────────────── */

const realFetch = globalThis.fetch;
let calls = [];
let respond = () => ({ status: 200, body: {} });

globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
  const r = respond(String(url), init);
  if (r.hang) return new Promise(() => {}); // never settles
  if (r.throw) throw r.throw;

  /* an SSE response: pieces arrive one at a time, the way Gemini streams */
  if (r.sse) {
    const pieces = r.sse;
    let i = 0;
    return {
      ok: true,
      status: r.status ?? 200,
      headers: { get: () => 'text/event-stream' },
      body: {
        getReader: () => ({
          read: async () => {
            if (r.stallAfter !== undefined && i >= r.stallAfter) {
              return new Promise(() => {}); // never settles again
            }
            if (i >= pieces.length) return { done: true, value: undefined };
            const piece = pieces[i++];
            return { done: false, value: new TextEncoder().encode(piece) };
          },
        }),
      },
      json: async () => ({}),
    };
  }

  const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    headers: { get: () => 'application/json' },
    json: async () => JSON.parse(text),
    text: async () => text,
  };
};
const reset = () => { calls = []; };

const GOOD_SPEC = {
  meta: { title: 'Falcon Coffee', description: 'A roastery in Dammam.', theme: 'minimal', accent: 'clay', themeReason: 'Quiet.' },
  nav: { brand: 'Falcon', links: [{ label: 'Products', href: '#products' }] },
  sections: [
    { type: 'hero', headline: 'Coffee roasted here', sub: 'Small batches, weekly.' },
    { type: 'features', heading: 'What we do', items: [
      { title: 'Roast', body: 'Every Tuesday.' }, { title: 'Grind', body: 'To order.' }, { title: 'Ship', body: 'Same day.' }] },
    { type: 'contact', heading: 'Come by', email: 'hi@falcon.co', form: true },
  ],
  footer: { note: 'Dammam' },
  voice: { register: 'plain', facts: [] },
};
const ok = (body) => () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] } });

/* ── 1. the happy path: one call, validated spec, no extra round trips ───── */

reset();
respond = ok(GOOD_SPEC);
const built = await g.buildSite('KEY', 'store', { name: 'Falcon' });
assert.equal(calls.length, 1, `must be exactly ONE model call, got ${calls.length}`);
assert.equal(built.spec.meta.title, 'Falcon Coffee');
assert.ok(built.spec.sections[0].type === 'hero', 'hero must lead');
assert.ok(built.reports.length >= 3, 'all deterministic Muses must report');
assert.deepEqual(built.reports.map((r) => r.muse), ['Calliope', 'Melpomene', 'Polyhymnia']);

/* the request itself: no CSS field anywhere, schema is strict, thinking off */
const sent = calls[0].body;
assert.equal(sent.generationConfig.responseMimeType, 'application/json');
assert.equal(sent.generationConfig.thinkingConfig.thinkingBudget, 0, 'thinking must be off or the budget is blown');
/* Deliberately NO responseSchema: one unsupported keyword (`const`) made every
   build fail with a 400 that could not fall back. The contract lives in the
   system prompt and the output is validated locally. */
assert.equal(
  sent.generationConfig.responseSchema,
  undefined,
  'no responseSchema may be sent — it is a narrow OpenAPI subset and it failed hard'
);
assert.equal(
  sent.generationConfig.responseJsonSchema,
  undefined,
  'the JSON-schema variant is preview-only; do not depend on it'
);
const sys = sent.systemInstruction.parts[0].text;
for (const t of ['hero', 'features', 'pricing', 'products', 'testimonials', 'faq', 'about', 'menu', 'gallery', 'stats', 'cta', 'contact', 'schedule']) {
  assert.match(sys, new RegExp(`"type": "${t}"`), `the prompt must name the "${t}" section shape`);
}
assert.match(sys, /Return ONE JSON object/, 'the prompt must state the output contract');
assert.match(sys, /editorial.*studio.*retail.*nordic.*brutalist.*warm.*terminal.*minimal/s, 'the prompt must list the themes');
assert.match(calls[0].url, /key=KEY/, 'key goes in the query');
assert.ok(!/KEY/.test(String(sent.contents)), 'the key must never be echoed into the prompt');

/* ── 2. the user's own words are primary, and the PDF text is included ───── */

reset();
respond = ok(GOOD_SPEC);
await g.buildSite('K', 'store', {
  name: 'Falcon',
  prompt: 'We roast coffee in Dammam and sell beans.',
  __source: 'X'.repeat(100) + ' The roastery opened in 2019.',
  __sections: ['hero', 'products', 'contact'],
});
const prompt = calls[0].body.contents[0].parts[0].text;
assert.match(prompt, /We roast coffee in Dammam/, 'the user brief must be verbatim');
assert.ok(prompt.indexOf('We roast coffee') < prompt.indexOf('SOURCE DOCUMENT'), 'their words come before supporting material');
assert.match(prompt, /SOURCE DOCUMENT/, 'PDF text must be included');
assert.match(prompt, /opened in 2019/, 'PDF facts must survive');
assert.match(prompt, /Sections the user wants: hero, products, contact/);

/* ── 3. error handling: every failure gets a message a person can act on ─── */

async function expectFail(fn, re, label) {
  await assert.rejects(fn, (e) => {
    assert.ok(e instanceof Error, `${label}: must be an Error`);
    assert.match(e.message, re, `${label}: message was "${e.message}"`);
    return true;
  }, label);
}

reset();
respond = () => ({ status: 400, body: { error: { message: 'API key not valid' } } });
await expectFail(() => g.buildSite('bad', 'store', {}), /API key not valid/, '400 surfaces Google\'s own words');

reset();
respond = () => ({ status: 429, body: { error: { message: 'quota' } } });
await expectFail(() => g.buildSite('k', 'store', {}), /rate limit/, '429 must tell the user to wait');

reset();
respond = () => ({ status: 500, body: { error: { message: 'boom' } } });
await expectFail(() => g.buildSite('k', 'store', {}), /boom/, '500 surfaces the detail');

reset();
respond = () => ({ throw: new TypeError('Failed to fetch') });
await expectFail(() => g.buildSite('k', 'store', {}), /Could not reach Google/, 'offline is not a crash');

reset();
respond = () => ({ status: 200, body: { promptFeedback: { blockReason: 'SAFETY' } } });
await expectFail(() => g.buildSite('k', 'store', {}), /refused.*SAFETY/, 'a blocked prompt is explained');

reset();
respond = () => ({ status: 200, body: { candidates: [{ finishReason: 'MAX_TOKENS' }] } });
await expectFail(() => g.buildSite('k', 'store', {}), /cut off|nothing/i, 'truncation is explained');

reset();
respond = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: 'I cannot do that.' }] } }] } });
await expectFail(() => g.buildSite('k', 'store', {}), /did not return usable JSON|did not return JSON/, 'prose instead of JSON is caught');

reset();
respond = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ meta: {} }) }] } }] } });
await expectFail(() => g.buildSite('k', 'store', {}), /did not fit our shape/, 'a spec that fails the schema says so');

/* ── 3b. a schema-vocabulary rejection is explained, not dumped ──────────── */
reset();
respond = () => ({
  status: 400,
  body: { error: { message:
    'Invalid JSON payload received. Unknown name "const" at \'generation_config.response_schema.properties[2].value.items.anyOf[0].properties[0].value\': Cannot find field. ' +
    'Invalid JSON payload received. Unknown name "const" at \'generation_config.response_schema.properties[2].value.items.anyOf[1].properties[0].value\': Cannot find field. '.repeat(10)
  } },
});
await assert.rejects(() => g.buildSite('k', 'store', {}), (e) => {
  assert.ok(e.message.length < 300, `the message must be readable, was ${e.message.length} chars`);
  assert.match(e.message, /does not accept "const"/, 'it must name the offending field');
  assert.match(e.message, /bug in the app, not in your key/, 'it must say whose fault it is');
  return true;
}, 'a schema rejection must be humanised');

/* ── 3c. thinking config is sent in the shape each model accepts ───────────
   This is the bug that produced "Ran out of time": thinkingBudget: 0 is
   silently IGNORED by Gemini 3.x, so the model thought at its default before
   writing, and thought tokens are billed against maxOutputTokens. The wrong
   shape is also a hard 400 (`minimal` on 3.8 Flash), so it must be per-model. */

reset();
respond = ok(GOOD_SPEC);
await g.buildSite('k', 'store', {});
const cfg = calls[0].body.generationConfig;
assert.ok(cfg.thinkingConfig, 'a thinking config must be sent — without it the model thinks at length');
assert.ok(
  !('thinkingBudget' in cfg.thinkingConfig && 'thinkingLevel' in cfg.thinkingConfig),
  'sending both thinkingBudget and thinkingLevel is a 400 on every 3.x model'
);
assert.ok(
  cfg.thinkingConfig.thinkingBudget === 0 || cfg.thinkingConfig.thinkingLevel,
  `the thinking config must actually constrain thinking, got ${JSON.stringify(cfg.thinkingConfig)}`
);
/* the first candidate is the moving alias, which still takes the legacy budget */
assert.equal(calls[0].body.generationConfig.thinkingConfig.thinkingBudget, 0,
  'the gemini-flash-latest alias takes thinkingBudget');

/* and 3.8 Flash must NOT get `minimal` — Google returns 400 for it */
reset();
respond = (url) =>
  url.includes('gemini-flash-latest')
    ? { status: 404, body: { error: { message: 'no longer available to new users' } } }
    : ok(GOOD_SPEC)();
await g.buildSite('k', 'store', {});
const on38 = calls.find((c) => c.url.includes('gemini-3.8-flash'));
assert.ok(on38, 'must fall through to 3.8 Flash');
assert.notEqual(on38.body.generationConfig.thinkingConfig.thinkingLevel, 'minimal',
  'gemini-3.8-flash rejects thinkingLevel "minimal" with a 400');
assert.equal(on38.body.generationConfig.thinkingConfig.thinkingLevel, 'low',
  'low is the documented floor on 3.8 Flash');

/* ── 3d. the answer streams, and arrives in pieces ───────────────────────── */

reset();
{
  const json = JSON.stringify(GOOD_SPEC);
  const half = Math.floor(json.length / 2);
  /* three SSE frames, deliberately split in the middle of the JSON — a reader
     that parses each network read independently loses the object here */
  respond = () => ({
    sse: [
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: json.slice(0, half) }] } }] })}\n\n`,
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: json.slice(half) }] } }] })}\n\n`,
      'data: [DONE]\n\n',
    ],
  });
  const streamed = await g.buildSite('k', 'store', {});
  assert.equal(streamed.spec.meta.title, 'Falcon Coffee', 'a streamed answer must assemble into the page');
  assert.match(calls[0].url, /alt=sse/, 'the request must ask for a stream');
}

/* ── 3e. a stream that dies halfway fails in seconds, not minutes ────────── */

reset();
{
  respond = () => ({
    sse: [
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"meta":' }] } }] })}\n\n`,
    ],
    stallAfter: 1,
  });
  /* The idle timeout is 25s in production, which is right: the model may think
     before its first token. A test cannot wait that long, so the seam lets the
     watchdog be observed at 300ms while the deadline stays at 20s — the point
     being that SILENCE, not the budget, is what ends it. */
  g.setIdleTimeoutForTesting(300);
  const t0 = Date.now();
  await expectFail(
    () => g.buildSite('k', 'store', {}, { deadline: Date.now() + 20_000 }),
    /went quiet|stopped sending|did not start/i,
    'a stalled stream must be detected, not waited out'
  );
  const took = Date.now() - t0;
  assert.ok(took > 250, `the watchdog must actually wait for silence, took ${took}ms`);
  assert.ok(took < 5000, `a stall must be caught in seconds, not at the deadline — took ${took}ms`);
  g.setIdleTimeoutForTesting(25_000);
}

/* ── 3f. a rate limit is waited out, not reported ──────────────────────────
   The free tier is a handful of requests per minute and the user has 80
   seconds. Giving up on the first 429 — and telling them to come back in a
   minute — is the app handing its own work back to the user.                */

reset();
{
  let n = 0;
  respond = () => {
    n++;
    /* throttled twice, then accepted: the normal free-tier shape */
    return n <= 2
      ? { status: 429, body: { error: { message: 'Resource has been exhausted.' } } }
      : ok(GOOD_SPEC)();
  };
  const t0 = Date.now();
  const out = await g.buildSite('k', 'store', {}, { deadline: Date.now() + 60_000 });
  assert.equal(out.spec.meta.title, 'Falcon Coffee', 'a throttled build must still produce a page');
  assert.ok(n === 3, `must retry after throttling, saw ${n} calls`);
  assert.ok(Date.now() - t0 > 1000, 'it must actually wait between retries, not hammer the key');
}

/* and when the budget genuinely cannot absorb the wait, say so clearly */
reset();
respond = () => ({ status: 429, body: { error: { message: 'Resource has been exhausted.' } } });
await expectFail(
  () => g.buildSite('k', 'store', {}, { deadline: Date.now() + 5_000 }),
  /rate limit/i,
  'a rate limit with no time left must say what it is'
);

/* ── 3g. enough output room for thinking, which Gemini 3 cannot disable ─── */

reset();
respond = ok(GOOD_SPEC);
await g.buildSite('k', 'store', {});
const maxOut = calls[0].body.generationConfig.maxOutputTokens;
assert.ok(
  maxOut >= 8000,
  `thought tokens are billed against maxOutputTokens and cannot be disabled on Gemini 3, so a nine-section page needs real headroom — got ${maxOut}`
);

/* ── 4. JSON wrapped in chatter is still recovered ───────────────────────── */

reset();
respond = () => ({ status: 200, body: { candidates: [{ content: { parts: [
  { text: 'Sure! Here is the JSON:\n' + JSON.stringify(GOOD_SPEC) + '\nHope that helps.' }] } }] } });
const rescued = await g.buildSite('k', 'store', {});
assert.equal(rescued.spec.meta.title, 'Falcon Coffee', 'must dig the object out of surrounding prose');

/* ── 5. the deadline actually fires: a stalled body cannot hang forever ──── */

reset();
respond = () => ({ hang: true });
const started = Date.now();
await expectFail(
  () => g.buildSite('k', 'store', {}, { deadline: Date.now() + 700 }),
  /ran out of time|did not finish|did not start answering/i,
  'a hung request must hit the deadline'
);
const took = Date.now() - started;
assert.ok(took < 3000, `deadline must win, took ${took}ms`);

/* ── 6. no deadline passed means the build budget still applies ──────────── */

assert.equal(typeof g.BUDGET_MS, 'number');
assert.ok(g.BUDGET_MS <= 90_000, `build budget must fit inside 90s, got ${g.BUDGET_MS}`);

/* ── 7. testKey proves the key can BUILD, not merely that it exists ─────── */

/* The old version called models.list and reported success. A retired model
   still shows up there, so setup said "Key works" and the first build died
   with a 404. These four cases pin the honest behaviour. */

reset(); respond = ok('ready');
const good = await g.testKey('good');
assert.equal(good.ok, true);
assert.match(good.message, /Key works/);
assert.equal(calls.length, 1, 'setup must make a real generateContent call');
assert.match(calls[0].url, /:generateContent/, 'models.list is not proof of anything');
assert.ok(calls[0].body.generationConfig.maxOutputTokens <= 16,
  'the setup call must be tiny — it is a probe, not a build');

/* a key Google rejects is a real failure */
reset(); respond = () => ({ status: 400, body: { error: { message: 'API key not valid.' } } });
const bad = await g.testKey('bad');
assert.equal(bad.ok, false);
assert.match(bad.message, /API key not valid/);

/* a retired model is OUR fault: setup must walk on to one that works, and
   still finish by saying the key is fine */
reset();
respond = (url) =>
  url.includes('gemini-flash-latest')
    ? { status: 404, body: { error: { message: 'This model models/gemini-flash-latest is no longer available to new users.' } } }
    : ok('ready')();
const retired = await g.testKey('k');
assert.equal(retired.ok, true, 'a retired model name must not fail the key');
assert.equal(calls.length, 2, 'must try the next model name after a 404');

/* rate limiting is not a bad key — do not send the user to regenerate it */
reset(); respond = () => ({ status: 429, body: { error: { message: 'Resource exhausted.' } } });
const limited = await g.testKey('k');
assert.equal(limited.ok, true, '429 means the key is valid but throttled');
assert.match(limited.message, /rate-limiting|wait/i);

reset(); respond = () => ({ throw: new TypeError('offline') });
const down = await g.testKey('k');
assert.equal(down.ok, false);
assert.match(down.message, /Could not reach Google/);

/* ── 8. the deterministic Muses do their job ────────────────────────────── */

const messy = JSON.parse(JSON.stringify(GOOD_SPEC));
messy.sections = [
  { type: 'contact', heading: 'Come by', form: true },
  { type: 'hero', headline: 'Coffee', sub: 'Beans.', cta: { label: 'Learn more', href: '#products' } },
  { type: 'features', heading: 'What we do', items: [
    { title: 'a', body: 'b' }, { title: 'c', body: 'd' }, { title: 'e', body: 'f' }] },
];
const restructured = g.calliope(messy, ['hero', 'pricing']);
assert.equal(restructured.spec.sections[0].type, 'hero', 'hero must be hoisted');
assert.equal(restructured.spec.sections.at(-1).type, 'contact', 'contact must end up last');
assert.ok(restructured.reports[0].notes.some((n) => /never produced: pricing/.test(n)), 'missing sections are named');

/* a full, valid page containing the two things Polyhymnia exists to catch */
const sloppy = JSON.parse(JSON.stringify(GOOD_SPEC));
sloppy.sections.push({ type: 'gallery', items: [
  { title: 'Batch one', image: { src: 'media:abc', alt: '   ' } },
  { title: 'Batch two' }, { title: 'Batch three' }] });
sloppy.sections.push({ type: 'cta', heading: 'Go', action: { label: 'click here', href: '#products' } });
const a11y = g.polyhymnia(sloppy);
assert.equal(a11y.reports[0].changed, true, 'it did change things');
const cta = a11y.spec.sections.find((x) => x.type === 'cta');
assert.equal(cta.action.label, 'Read the details', '"click here" must actually be rewritten in the spec');
const gal = a11y.spec.sections.find((x) => x.type === 'gallery');
assert.equal(gal.items[0].image.alt, '', 'blank alt must be made explicit');
assert.match(a11y.reports[0].notes.join(' '), /alt text/, 'and the report must say so');

/* and when a repair cannot survive validation, it must NOT claim to have made it */
const broken = JSON.parse(JSON.stringify(GOOD_SPEC));
broken.sections.push({ type: 'cta', heading: 'Go', action: { label: 'click here', href: '#nowhere' } });
const noClaim = g.polyhymnia({ ...broken, sections: broken.sections.slice(0, 2) });
assert.equal(noClaim.reports[0].changed, false, 'must not report a change it did not make');

globalThis.fetch = realFetch;
console.log('GEMINI OK — one call per build, strict schema, no styling fields, 8 failure modes explained, deadline fires, Muses deterministic');
