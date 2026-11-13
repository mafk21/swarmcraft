/* ============================================================================
   The question that matters: does this still produce a PAGE?

   Four rounds were spent on request-shape rejections. Every one of them failed
   for a reason the app could have survived: the schema was a hard constraint on
   a request whose output is validated locally anyway. So this test hammers the
   worst realistic answers a model gives when it is NOT handcuffed by a schema,
   and requires a valid page from each — or a repair, never a crash.
   ========================================================================== */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import assert from 'node:assert/strict';

const out = scratch('robust.mjs');
await build({
  entryPoints: ['src/lib/gemini.ts'],
  bundle: true, format: 'esm', platform: 'node',
  outfile: out.path, logLevel: 'silent',
});
const g = await import(out.url);

const GOOD = {
  meta: { title: 'Falcon Coffee', description: 'Roasted in Dammam.', theme: 'editorial', accent: 'clay', themeReason: 'x' },
  nav: { brand: 'Falcon', links: [] },
  sections: [
    { type: 'hero', headline: 'Coffee roasted here', sub: 'Small batches.' },
    { type: 'features', heading: 'What we do', items: [
      { title: 'a', body: 'b' }, { title: 'c', body: 'd' }, { title: 'e', body: 'f' }] },
    { type: 'contact', heading: 'Come by', form: true },
  ],
  footer: { note: 'Dammam' },
  voice: { register: 'plain', facts: [] },
};

function respondWith(payload) {
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }] } }] }),
  });
}

async function buildWith(spec, label) {
  respondWith(spec);
  return g.buildSite('k', 'store', {});
}

/* ── 1. markdown fences, the single most common model habit ──────────────── */
const fenced = await buildWith('```json\n' + JSON.stringify(GOOD) + '\n```', 'fenced');
assert.equal(fenced.spec.meta.title, 'Falcon Coffee', 'markdown fences must be stripped');

/* ── 2. chatter before and after ─────────────────────────────────────────── */
const chatty = await buildWith('Sure! Here is your page:\n\n' + JSON.stringify(GOOD) + '\n\nHope this helps!', 'chatty');
assert.equal(chatty.spec.meta.title, 'Falcon Coffee', 'surrounding prose must not break parsing');

/* ── 3. extra keys the model invented ────────────────────────────────────── */
const extra = JSON.parse(JSON.stringify(GOOD));
extra.meta.css = 'body { color: red }';
extra.sections[0].className = 'hero-big';
extra.sections[2].style = 'padding: 4rem';
const cleaned = await buildWith(extra, 'extra');
const dumped = JSON.stringify(cleaned.spec);
assert.ok(!/css|className|"style":/.test(dumped), 'invented styling keys must be stripped, not rendered');
assert.equal(cleaned.spec.meta.title, 'Falcon Coffee', 'the page itself must survive');

/* ── 4. too many sections: keep nine, not crash ──────────────────────────── */
const many = JSON.parse(JSON.stringify(GOOD));
many.sections = Array.from({ length: 20 }, (_, i) => ({
  type: 'features', heading: `Group ${i}`,
  items: [{ title: 'a', body: 'b' }, { title: 'c', body: 'd' }, { title: 'e', body: 'f' }],
}));
many.sections.unshift({ type: 'hero', headline: 'Top', sub: 'x' });
const capped = await buildWith(many, 'many');
assert.ok(capped.spec.sections.length <= 9, `must cap at 9 sections, got ${capped.spec.sections.length}`);

/* ── 5. a bad section is dropped, the page survives ──────────────────────── */
const oneBad = JSON.parse(JSON.stringify(GOOD));
oneBad.sections.splice(1, 0, { type: 'features', heading: 'Broken', items: [] }); // below min
const repaired = await buildWith(oneBad, 'oneBad');
assert.ok(repaired.spec.sections.length >= 3, 'a page with one broken section must still be a page');
assert.ok(!repaired.spec.sections.some((s) => s.type === 'features' && s.items.length === 0), 'the broken section must not survive');

/* ── 6. unknown section type is dropped, not rendered ────────────────────── */
const unknown = JSON.parse(JSON.stringify(GOOD));
unknown.sections.splice(1, 0, { type: 'carousel', heading: 'Nope', items: [] });
const dropped = await buildWith(unknown, 'unknown');
assert.ok(!dropped.spec.sections.some((s) => s.type === 'carousel'), 'unknown types must be dropped');

/* ── 7. an unknown theme is replaced, not passed through ─────────────────── */
const oddTheme = JSON.parse(JSON.stringify(GOOD));
oddTheme.meta.theme = 'neon-cyberpunk';
const themed = await buildWith(oddTheme, 'oddTheme');
assert.ok(['editorial', 'studio', 'retail', 'nordic', 'brutalist', 'warm', 'terminal', 'minimal'].includes(themed.spec.meta.theme),
  'an invented theme must be replaced with a real one');

/* ── 8. prose instead of JSON fails with something readable ──────────────── */
respondWith('I am sorry, but I cannot help with that request.');
await assert.rejects(() => g.buildSite('k', 'store', {}), (e) => {
  assert.ok(e.message.length < 200, `message must be short, was ${e.message.length}`);
  assert.match(e.message, /did not return usable JSON|did not return JSON|nothing/i);
  return true;
}, 'prose must produce a short, clear failure');

/* ── 9. genuinely unusable output fails fast, not silently ───────────────── */
respondWith({ hello: 'world' });
await assert.rejects(() => g.buildSite('k', 'store', {}), /did not fit our shape/,
  'a missing page must be reported, not rendered');

/* ── 10. a response cut off mid-object is a sentence, not a SyntaxError ──── */
const cut = JSON.stringify(GOOD).slice(0, 220);
globalThis.fetch = async () => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{
    content: { parts: [{ text: cut }] },
    finishReason: 'MAX_TOKENS',
  }] }),
});
await assert.rejects(() => g.buildSite('k', 'store', {}), (e) => {
  assert.ok(!(e instanceof SyntaxError), 'truncation must not surface as a SyntaxError');
  assert.match(e.message, /ran out of room|did not return usable JSON/,
    'truncation must say what happened');
  assert.ok(e.message.length < 200, `message must be short, was ${e.message.length}`);
  return true;
}, 'a truncated answer must fail readably');

console.log('ROBUST OK — fences, chatter, invented keys, 20 sections, broken sections, unknown types, bad themes all still yield a page; truncated and unusable output fails readably');
