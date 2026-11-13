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
  const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
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
assert.ok(sent.generationConfig.responseSchema, 'must send a schema');
const flat = JSON.stringify(sent.generationConfig.responseSchema);
assert.ok(!/"(css|style|class|className|color|font)"\s*:/.test(flat), 'schema must not offer styling fields');
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
await expectFail(() => g.buildSite('k', 'store', {}), /did not return JSON/, 'prose instead of JSON is caught');

reset();
respond = () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: JSON.stringify({ meta: {} }) }] } }] } });
await expectFail(() => g.buildSite('k', 'store', {}), /did not pass validation/, 'a spec that fails the schema says so');

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
  /ran out of time|did not finish/i,
  'a hung request must hit the deadline'
);
const took = Date.now() - started;
assert.ok(took < 3000, `deadline must win, took ${took}ms`);

/* ── 6. no deadline passed means the build budget still applies ──────────── */

assert.equal(typeof g.BUDGET_MS, 'number');
assert.ok(g.BUDGET_MS <= 90_000, `build budget must fit inside 90s, got ${g.BUDGET_MS}`);

/* ── 7. testKey never throws, whatever Google says ──────────────────────── */

reset(); respond = () => ({ status: 200, body: { models: [] } });
assert.equal((await g.testKey('good')).ok, true);

reset(); respond = () => ({ status: 400, body: { error: { message: 'API key not valid.' } } });
const bad = await g.testKey('bad');
assert.equal(bad.ok, false);
assert.match(bad.message, /API key not valid/);

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
