/**
 * Does the build actually stop at the limit?
 *
 * The user's report was "140 seconds and no website". Every ceiling involved
 * looked fine in isolation; what was missing was anything that added them up.
 * These tests fail loudly if a second request ever reappears or if a stalled
 * response can outlive the shared budget.
 *
 *   node scripts/budget-test.mjs
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const b = await build({
  stdin: {
    contents: `export { buildSite, buildSpec, BUDGET_MS, GeminiError } from './src/lib/gemini';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
});
writeFileSync('.tmp/budget.mjs', b.outputFiles[0].text);
const { buildSite, buildSpec, BUDGET_MS } = await import(pathToFileURL(resolve('.tmp/budget.mjs')).href);

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

ok('the budget is at or under 90 seconds', BUDGET_MS <= 90_000, `${BUDGET_MS}ms`);

/* ── a stall must end at the deadline, not at 40s per attempt ───────────── */
{
  let requests = 0;
  // headers arrive, then the body never finishes
  globalThis.fetch = async () => {
    requests++;
    return {
      ok: true, status: 200,
      json: () => new Promise(() => {}),
    };
  };

  const started = Date.now();
  let err = null;
  try {
    await buildSpec('k', 'store', { name: 'X', about: 'Y' }, undefined, Date.now() + 1200);
  } catch (e) { err = e; }
  const took = Date.now() - started;

  ok('a stalled response is abandoned at the deadline', took < 2600, `${took}ms`);
  ok('it reports a timeout, not a generic failure', err?.status === 408, String(err?.status));
  ok('exactly one request was made', requests === 1, `${requests} requests`);
}

/* ── a healthy response costs one request ───────────────────────────────── */
{
  let requests = 0;
  const spec = {
    meta: { title: 'Kiln', description: 'Pots for cooks.', theme: 'warm', accent: 'clay' },
    nav: { brand: 'Kiln', links: [{ label: 'Shop', href: '#shop' }] },
    sections: [
      { type: 'hero', headline: 'Pots that get used', sub: 'Stoneware for home cooks.' },
      { type: 'features', heading: 'Making', items: [
        { title: 'Fired hot', body: 'To 1280C.' },
        { title: 'Two hands', body: 'Two people make these.' },
        { title: 'Ships fast', body: 'Two to three days.' },
      ] },
      { type: 'contact', heading: 'Write', email: 'a@b.co', form: true },
    ],
    footer: { note: 'Kiln & Table.' },
    voice: { register: 'Plain', facts: ['1280C'] },
  };
  globalThis.fetch = async () => {
    requests++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(spec) }] } }] }) };
  };

  const out = await buildSite('k', 'store', { name: 'X' }, { deadline: Date.now() + 60_000 });
  ok('a good build makes exactly one request', requests === 1, `${requests} requests`);
  ok('it returns a spec', out.spec.sections.length >= 3);
  ok('it reports the muses', out.reports.length >= 2);
}

/* ── slop does not buy a second request, it is reported ─────────────────── */
{
  let requests = 0;
  const sloppy = {
    meta: { title: 'Kiln', description: 'Pots.', theme: 'warm', accent: 'clay' },
    nav: { brand: 'Kiln', links: [] },
    sections: [
      { type: 'hero', headline: 'Unlock the power of clay', sub: 'A game-changer for cooks.' },
      { type: 'features', heading: 'Why', items: [
        { title: 'A', body: 'B' }, { title: 'C', body: 'D' }, { title: 'E', body: 'F' },
      ] },
      { type: 'contact', heading: 'Write', email: 'a@b.co', form: true },
    ],
    footer: { note: 'x' },
    voice: { register: 'Plain', facts: [] },
  };
  globalThis.fetch = async () => {
    requests++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(sloppy) }] } }] }) };
  };

  const out = await buildSite('k', 'store', {}, { deadline: Date.now() + 60_000 });
  ok('sloppy copy does not trigger a rewrite call', requests === 1, `${requests} requests`);
  ok('the slop is surfaced to the user instead',
    out.reports.some((r) => r.muse === 'Melpomene' && !r.changed));
}

/* ── an invalid draft is repaired locally, not resent ───────────────────── */
{
  let requests = 0;
  const tenSections = {
    meta: { title: 'Kiln', description: 'Pots.', theme: 'warm', accent: 'clay' },
    nav: { brand: 'Kiln', links: [] },
    sections: [
      { type: 'hero', headline: 'Pots', sub: 'For cooks.' },
      { type: 'features', heading: 'Why', items: [
        { title: 'A', body: 'B' }, { title: 'C', body: 'D' }, { title: 'E', body: 'F' },
      ] },
      { type: 'features', heading: 'Why again', items: [
        { title: 'A', body: 'B' }, { title: 'C', body: 'D' }, { title: 'E', body: 'F' },
      ] },
      { type: 'features', heading: 'Why a third time', items: [
        { title: 'A', body: 'B' }, { title: 'C', body: 'D' }, { title: 'E', body: 'F' },
      ] },
      { type: 'stats', items: [{ value: '1', label: 'a' }, { value: '2', label: 'b' }, { value: '3', label: 'c' }] },
      { type: 'faq', heading: 'Q', items: [{ q: 'a', a: 'b' }, { q: 'c', a: 'd' }, { q: 'e', a: 'f' }] },
      { type: 'cta', heading: 'Go', action: { label: 'Go', href: '#g' } },
      { type: 'contact', heading: 'Write', email: 'a@b.co', form: true },
      { type: 'about', heading: 'Us', body: ['Two people.'] },
      { type: 'gallery', heading: 'Work', items: [{ title: '1' }, { title: '2' }, { title: '3' }] },
    ],
    footer: { note: 'x' },
    voice: { register: 'Plain', facts: [] },
  };
  globalThis.fetch = async () => {
    requests++;
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(tenSections) }] } }] }) };
  };

  const out = await buildSite('k', 'store', {}, { deadline: Date.now() + 60_000 });
  ok('an over-long draft is trimmed, not resent', requests === 1, `${requests} requests`);
  ok('it is trimmed to nine', out.spec.sections.length === 9, String(out.spec.sections.length));
  ok('the repair is reported', out.repairs.some((r) => /9 sections/.test(r)), out.repairs.join('|'));
}

/* ── a rate limit fails fast and says so ────────────────────────────────── */
{
  globalThis.fetch = async () => ({
    ok: false, status: 429,
    json: async () => ({ error: { message: 'Quota exceeded' } }),
  });
  let err = null;
  try { await buildSpec('k', 'store', {}, undefined, Date.now() + 60_000); } catch (e) { err = e; }
  ok('429 is reported as a rate limit', err?.status === 429 && /rate limit/i.test(err.message), err?.message);
}

console.log(fail === 0 ? '\nBUDGET OK' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
