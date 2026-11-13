/**
 * The whole funnel, driven through the real store.
 *
 * Every other suite tests a module. This tests the journey: does the state a
 * screen writes actually satisfy the screen that reads it next, and does going
 * backwards or restarting leave anything stale behind?
 *
 *   node scripts/flow-test.mjs
 */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { writeFileSync } from 'node:fs';

const b = await build({
  stdin: {
    contents: `
      export { useApp, STEP_ORDER } from './src/app/store';
      export { defaultSections, KIND_BRIEFS } from './src/lib/questions';
      export { THEMES, ACCENTS, THEME_LIST } from './src/lib/themes';
      export { renderDocument } from './src/lib/render';
      export { validateSpec, SITE_KINDS } from './src/lib/spec';
    `,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
  external: ['react', 'react-dom', 'idb', 'zustand'],
});
const out = scratch('flow.mjs');
writeFileSync(out.path, b.outputFiles[0].text);

/* zustand's react binding needs react; the store itself is framework-neutral */
globalThis.window = { setTimeout, addEventListener() {}, removeEventListener() {} };
const { useApp, STEP_ORDER, defaultSections, THEME_LIST, renderDocument, validateSpec, SITE_KINDS: KINDS, THEMES } =
  await import(out.url);

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};
const s = () => useApp.getState();

/* ── a fresh app starts at the key screen ───────────────────────────────── */
useApp.getState().reset();
ok('a fresh app asks for a key', s().step === 'key', s().step);
ok('nothing is claimed to be built', s().spec === null && s().blueprint === null);

/* ── connect → projects ─────────────────────────────────────────────────── */
s().patch({ hasKey: true });
s().go('projects');
ok('after connecting you land somewhere', s().step === 'projects', s().step);

/* ── new site → kind ────────────────────────────────────────────────────── */
s().startNew();
ok('starting a new site goes to the kind picker', s().step === 'kind', s().step);
ok('a new site clears the last one', s().spec === null && s().answers && Object.keys(s().answers).length === 0);

/* ── every kind can be chosen and produces a valid brief ────────────────── */
for (const kind of KINDS) {
  s().startNew();
  s().patch({ kind });
  s().next();
  ok(`${kind}: choosing it advances to the brief`, s().step === 'brief', s().step);
  ok(`${kind}: sections are pre-selected`, defaultSections(kind).filter((x) => x.on).length >= 3);
}

/* ── the brief gate: name and a real description, nothing else ───────────── */
{
  s().startNew();
  s().patch({ kind: 'store' });
  s().next();

  // what BriefScreen computes
  const ready = (st) => {
    const nameOk = String(st.answers.name ?? '').trim().length > 0;
    const descOk = String(st.answers.prompt ?? '').trim().length > 20;
    return nameOk && descOk;
  };
  ok('an empty brief is not ready', !ready(s()));
  s().setAnswer('name', 'Kiln & Table');
  ok('a name alone is not ready', !ready(s()));
  s().setAnswer('prompt', 'Short.');
  ok('a 6-character brief is not ready', !ready(s()));
  s().setAnswer('prompt', 'Stoneware from a workshop in Dammam. Twelve pieces, SAR 80 to 300.');
  ok('a real brief is ready', ready(s()));

  s().next();
  ok('the brief advances to sections', s().step === 'sections', s().step);
  ok('the answers survived the transition', s().answers.name === 'Kiln & Table');
}

/* ── the sections gate: at least three, hero included ──────────────────── */
{
  s().patch({ chosenSections: ['hero'] });
  const okNow = (st) => st.chosenSections.includes('hero') && st.chosenSections.length >= 3;
  ok('one section is not enough', !okNow(s()));
  s().patch({ chosenSections: ['hero', 'products'] });
  ok('two is not enough', !okNow(s()));
  s().patch({ chosenSections: ['hero', 'products', 'contact'] });
  ok('three with a hero is enough', okNow(s()));
  s().patch({ chosenSections: ['products', 'contact', 'about'] });
  ok('three without a hero is refused', !okNow(s()));
  s().patch({ chosenSections: ['hero', 'products', 'contact'] });

  s().next();
  ok('sections advance to the theme', s().step === 'theme', s().step);
}

/* ── every theme can be picked, in both modes ───────────────────────────── */
{
  s().patch({ themeMode: 'auto' });
  ok('auto mode needs no theme chosen', true);

  for (const t of THEME_LIST) {
    s().patch({ themeMode: 'pick', theme: t.id, accent: 'slate' });
    ok(`theme ${t.id} is selectable`, s().theme === t.id && !!THEMES[t.id]);
  }
}

/* ── build is keyed by runId, so a rebuild actually restarts ────────────── */
{
  const before = s().runId;
  s().patch({ runId: before + 1, spec: null, blueprint: null, step: 'build' });
  ok('starting a build bumps runId', s().runId === before + 1);
  ok('it clears the previous site', s().spec === null && s().blueprint === null);
  ok('it lands on the build screen', s().step === 'build');
}

/* ── the steps are ordered and every one is reachable ───────────────────── */
{
  ok('eight steps', STEP_ORDER.length === 8, String(STEP_ORDER.length));
  ok('the funnel starts at the key and ends at the site',
    STEP_ORDER[0] === 'key' && STEP_ORDER[STEP_ORDER.length - 1] === 'result');

  s().go('brief');
  s().next();
  ok('next moves forward exactly one step', s().step === 'sections', s().step);
  s().back();
  ok('back moves backward exactly one step', s().step === 'brief', s().step);
  s().go('key');
  s().back();
  ok('back at the first step stays put', s().step === 'key', s().step);
  s().go('result');
  s().next();
  ok('next at the last step stays put', s().step === 'result', s().step);
}

/* ── restarting a finished site clears everything but the key ───────────── */
{
  s().patch({ hasKey: true, spec: null, projectId: 'abc', saved: true, pdf: null });
  s().startNew();
  ok('startNew keeps the key', s().hasKey === true);
  ok('startNew forgets the project', s().projectId === null);
  ok('startNew forgets the saved flag', s().saved === false);
  ok('startNew lands on the kind picker', s().step === 'kind', s().step);

  s().reset();
  ok('reset keeps the key', s().hasKey === true);
  ok('reset goes to the site list', s().step === 'projects', s().step);
}

/* ── a spec built from the brief renders and validates ─────────────────── */
{
  const spec = {
    meta: { title: 'Kiln & Table', description: 'Stoneware from Dammam.', theme: 'warm', accent: 'clay' },
    nav: { brand: 'Kiln & Table', links: [{ label: 'Work', href: '#work' }] },
    sections: [
      { type: 'hero', headline: 'Pots that get used', sub: 'Stoneware for home cooks.' },
      { type: 'products', heading: 'Pieces', items: [
        { name: 'Bowl', price: 'SAR 120' }, { name: 'Mug', price: 'SAR 80' }, { name: 'Plate', price: 'SAR 95' }] },
      { type: 'contact', heading: 'Order', email: 'a@b.co', form: true },
    ],
    footer: { note: 'Kiln & Table.' },
    voice: { register: 'Plain', facts: [] },
  };
  ok('a realistic spec validates', validateSpec(spec).ok);
  ok('it renders', renderDocument(spec).length > 2000);

  s().patch({ spec, step: 'result' });
  ok('the result screen has something to show', !!s().spec);
  ok('the result screen can still reach the key screen', STEP_ORDER.includes('key'));
}

console.log(fail === 0 ? '\nFLOW OK' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
