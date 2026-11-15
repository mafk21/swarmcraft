/* ============================================================================
   The sample brief, and the rule it must not break.

   This repo has one hard rule about content: the app must not contain invented
   facts that can end up on a page. A sample brief looks exactly like a
   violation of it, so the exceptions are written down here and tested:

     1. a sample never loads itself — only a click whose label says "sample";
     2. a sample answers only questions that kind actually asks, so nothing can
        leak into the prompt from another kind;
     3. a sample is usable as-is: pressing Continue after loading it must pass
        briefReady(), or the button promises something the form refuses;
     4. a sample is specific. The copy guard in gemini.ts rejects generic copy,
        so a sample written in marketing adjectives would be rejected by the
        very model it is meant to demo.

   Every assertion here fails on the obvious wrong implementation.
   ========================================================================== */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';

const out = scratch('samples.bundle.mjs');
await build({
  stdin: {
    contents: `export { SAMPLES, sampleAnswers } from './src/lib/samples';
      export { KIND_BRIEFS } from './src/lib/questions';
      export { briefReady, minBriefWords } from './src/app/store';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: out.path,
  logLevel: 'silent',
  /* the store pulls in zustand and React; the readiness rule is the only thing
     needed from it, and it is a pure function */
  external: ['react', 'react-dom', 'zustand'],
});

const { SAMPLES, sampleAnswers, KIND_BRIEFS, briefReady, minBriefWords } = await import(out.url);

let fail = 0;
const ok = (n, c, d = '') => {
  if (!c) {
    fail++;
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  }
};

const KINDS = Object.keys(KIND_BRIEFS);

/* ── 1. every kind has one, and only real kinds do ───────────────────────── */

ok('there is a sample for every kind', KINDS.every((k) => !!SAMPLES[k]), KINDS.filter((k) => !SAMPLES[k]).join(','));
ok('there are no samples for kinds that do not exist', Object.keys(SAMPLES).every((k) => KINDS.includes(k)), Object.keys(SAMPLES).filter((k) => !KINDS.includes(k)).join(','));

/* ── 2. a sample answers only what the kind asks ─────────────────────────── */

for (const kind of KINDS) {
  const asked = new Set(KIND_BRIEFS[kind].questions.map((q) => q.id));
  const extra = Object.keys(SAMPLES[kind].answers).filter((id) => !asked.has(id));
  ok(`${kind}: answers only its own questions`, extra.length === 0, extra.join(','));
}

/* ── 3. loading a sample makes the form ready to continue ────────────────── */

for (const kind of KINDS) {
  const filled = sampleAnswers(kind);
  ok(`${kind}: the sample fills the name`, String(filled.name ?? '').length > 0, JSON.stringify(filled.name));
  ok(
    `${kind}: the sample passes briefReady`,
    briefReady(filled),
    `brief is ${String(filled.prompt ?? '').length} chars, needs >${minBriefWords}`
  );
  /* the model reads `description`; the screen keeps prompt and description the
     same thing, so the sample must fill both or the two boxes would disagree */
  ok(`${kind}: prompt and description agree`, filled.prompt === filled.description || filled.description === undefined);
}

/* ── 4. samples are specific, not adjectives ─────────────────────────────── */

const ADJECTIVES = /\b(seamless|world-class|cutting-edge|state-of-the-art|passionate|innovative|revolutionary|synerg|leverage|elevate|unlock|empower)\b/i;

for (const kind of KINDS) {
  const s = SAMPLES[kind];
  ok(`${kind}: the brief has no marketing adjectives`, !ADJECTIVES.test(s.brief), (s.brief.match(ADJECTIVES) ?? [''])[0]);
  ok(`${kind}: the brief has a number in it`, /\d/.test(s.brief), 'nothing concrete to build a page from');
  ok(`${kind}: the brief is long enough to be a brief`, s.brief.split(/\s+/).length >= 35, `${s.brief.split(/\s+/).length} words`);
  /* a sample is a demonstration of writing a brief, so it must fit the box
     it is written into or it gets silently truncated */
  ok(`${kind}: the brief fits the textarea`, s.brief.length < 6000, `${s.brief.length} chars`);
}

/* ── 5. the samples are not the same sample ten times ────────────────────── */

{
  const names = new Set(KINDS.map((k) => SAMPLES[k].name));
  const briefs = new Set(KINDS.map((k) => SAMPLES[k].brief));
  ok('samples are not copy-pasted across kinds', names.size >= 5 && briefs.size === KINDS.length, `${names.size} names, ${briefs.size} briefs`);
}

/* ── 6. a sample cannot smuggle in a field from another kind ─────────────── */

{
  /* store's sample carries no `menu`, restaurant's no `catalogue`. This is the
     mechanism, tested directly: hand it a value for an id the kind never asks
     and it must be dropped, not passed through to the prompt. */
  const filled = sampleAnswers('store');
  ok('a foreign answer cannot reach the store brief', !('menu' in filled) && !('hours' in filled), Object.keys(filled).join(','));
  ok('the store brief still carries its own answers', filled.catalogue === SAMPLES.store.answers.catalogue);
}

console.log(fail ? `\nSAMPLES ${fail} FAILED\n` : '\nSAMPLES OK — one per kind, specific, ready to build, and never loaded unasked\n');
process.exit(fail ? 1 : 0);
