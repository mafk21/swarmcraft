/* ============================================================================
   "make the building better" — the part you can check.

   Three things were added to the build and all three can lie:

     1. summariseBlueprint() — the figures under the progress rail. If it
        counted steps instead of measuring the page, or named sections by guess
        instead of by measurement, the HUD would be decoration pretending to be
        telemetry.
     2. Swarm.workingSection — the live caption. If it returned the first
        section, or the last, or a section no cursor is in, it would be a lie
        that looks like information.
     3. The landing marks. They are drawn from a list; if that list never
        empties it is a leak that eventually costs frames.

   Each assertion here fails on the obvious wrong implementation, which is the
   only reason to write it down.
   ========================================================================== */
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export { Swarm, summariseBlueprint } from './src/lib/swarm';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
});

globalThis.window = {
  devicePixelRatio: 1,
  innerWidth: 1440,
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
  removeEventListener() {},
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };

const mod = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);
const { Swarm, summariseBlueprint } = mod;

let fail = 0;
const ok = (n, c, d = '') => {
  if (!c) {
    fail++;
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  }
};

/* ── a blueprint shaped like a measured page ───────────────────────────────
   Two sections: a big hero (two boxes, two lines of text) and a small footer
   band (one box, one line). Deliberately different sizes so "share" has to be
   area-weighted, not a count of nodes. */
function measuredPage() {
  const bp = {
    width: 1400,
    height: 2400,
    background: '#fff',
    ink: '#111',
    boxes: [
      { x: 0, y: 0, w: 1400, h: 900, role: 'surface', radius: 0, border: 0, borderColor: '#000', fill: '#eee', section: 0 },
      { x: 100, y: 120, w: 600, h: 300, role: 'card', radius: 4, border: 1, borderColor: '#ddd', fill: null, section: 0 },
      { x: 0, y: 1000, w: 1400, h: 100, role: 'surface', radius: 0, border: 0, borderColor: '#000', fill: '#f8f8f8', section: 1 },
      // outside every section: the nav
      { x: 0, y: -80, w: 1400, h: 64, role: 'nav', radius: 0, border: 0, borderColor: '#000', fill: '#fff', section: null },
    ],
    lines: [
      { x1: 0, y1: 950, x2: 1400, y2: 950, weight: 1, color: '#ddd' },
    ],
    texts: [
      { x: 100, y: 160, w: 500, h: 60, text: 'Falcon Coffee', size: 56, weight: 700, font: 'sans', mono: false, color: '#111', align: 'left', section: 0 },
      { x: 100, y: 240, w: 300, h: 20, text: 'Roasted here', size: 16, weight: 400, font: 'sans', mono: false, color: '#333', align: 'left', section: 0 },
      { x: 100, y: 1030, w: 200, h: 20, text: 'Hours', size: 14, weight: 400, font: 'sans', mono: false, color: '#333', align: 'left', section: 1 },
    ],
    steps: [],
  };
  return bp;
}

/* ── 1. the figures are measurements, not counts of steps ────────────────── */

{
  const bp = measuredPage();
  const sum = summariseBlueprint(bp, { 0: 'Hero', 1: 'Footer' });

  ok('figures come from the page', sum.boxes === 4 && sum.texts === 3 && sum.lines === 1);
  ok('characters are the real string length', sum.chars === 'Falcon Coffee'.length + 'Roasted here'.length + 'Hours'.length, String(sum.chars));

  ok('both named sections are listed', sum.sections.length === 2, String(sum.sections.length));
  ok('names come from the caller, in page order', sum.sections[0]?.name === 'Hero' && sum.sections[1]?.name === 'Footer');

  /* the nav belongs to no section, so it must not invent one: three sections
     would mean it counted the nav as a section of its own */
  ok('a box outside every section adds no section', sum.sections.length === 2);

  /* shares are area-weighted: the hero is 1400x900 plus a 600x300 card, the
     footer is a 1400x100 band. Anything near 0.5 would mean counting nodes. */
  const heroShare = sum.sections[0].share;
  ok('share is measured area, not node count', heroShare > 0.9, heroShare.toFixed(3));
  ok('shares add up to one', Math.abs(heroShare + sum.sections[1].share - 1) < 1e-9);
}

{
  /* No labels passed: the HUD must say "Section 2", never a guessed name. */
  const sum = summariseBlueprint(measuredPage());
  ok('unlabelled sections are numbered, not guessed', sum.sections[1]?.name === 'Section 2', sum.sections[1]?.name);
}

{
  /* A page with nothing section-tagged must produce no section claims at all,
     and must still not divide by zero. */
  const bare = summariseBlueprint({ width: 800, height: 600, background: '#fff', ink: '#000', boxes: [], lines: [], texts: [], steps: [] });
  ok('an empty page claims no sections', bare.sections.length === 0);
  ok('an empty page does not divide by zero', bare.sections.every((s) => Number.isFinite(s.share)));
}

/* ── 2. the live caption names the section the work is in ────────────────── */

function swarmFor(bp) {
  const canvas = {
    width: 1440,
    height: 900,
    style: {},
    parentElement: { getBoundingClientRect: () => ({ width: 1440, height: 900 }) },
    getContext: () => new Proxy({}, { get: () => () => ({}) }),
  };
  const sw = new Swarm(canvas, bp, null);
  sw.resize();
  return sw;
}

{
  const sw = swarmFor(measuredPage());

  /* Before anything starts, no cursor is inside anything, so the caption must
     be silent rather than defaulting to the first section. */
  ok('the caption is empty before the work starts', sw.workingSection === null, String(sw.workingSection));

  /* Walk the whole schedule: the caption must visit more than one section,
     which it cannot do if it is hard-wired to the first or the last. */
  const seen = new Set();
  const total = sw.duration * 1000;
  for (let t = 0; t <= total; t += 60) {
    sw.elapsed = t;
    const s = sw.workingSection;
    if (s !== null) seen.add(s);
  }
  ok('the caption moves through the page', seen.size >= 2, `${seen.size} sections seen`);

  /* And every section it names must be one the cursor is actually in — the
     sections it names must all exist in the page. */
  const known = new Set(measuredPage().boxes.concat(measuredPage().texts).map((n) => n.section).filter((n) => n !== null));
  ok('it only names sections that exist', [...seen].every((s) => known.has(s)), [...seen].join(','));
}

/* ── 3. the landing marks do not accumulate ──────────────────────────────── */

{
  const sw = swarmFor(measuredPage());
  /* `lands` is private at the type level and public at runtime: reaching in is
     the point of the test. */
  ok('there are no marks before a build', (sw.lands ?? []).length === 0);

  /* Paint a frame with the marks list pre-filled, the way a long build fills
     it, then move the clock past their lifetime and paint again. */
  const now = performance.now();
  sw.lands = [
    { x: 100, y: 100, at: now, color: '#f00', kind: 'box' },
    { x: 200, y: 200, at: now, color: '#0f0', kind: 'text' },
  ];
  const ctx = new Proxy(
    {},
    {
      get: (_t, k) =>
        k === 'canvas' ? { width: 1440, height: 900 } : typeof k === 'string' && k !== 'then' ? () => {} : undefined,
      set: () => true,
    }
  );
  sw.drawLandings(ctx, 0);
  ok('a fresh mark survives a frame', sw.lands.length === 2, String(sw.lands.length));

  sw.lands = sw.lands.map((l) => ({ ...l, at: now - 5000 }));
  sw.drawLandings(ctx, 0);
  ok('a stale mark is dropped, not kept', sw.lands.length === 0, String(sw.lands.length));
}

/* ── 4. a replay starts clean ─────────────────────────────────────────────
   Replay reuses the same Swarm and the same canvas. Anything the previous run
   left behind would be drawn over the new one, so play() must clear it. */

{
  const sw = swarmFor(measuredPage());
  sw.lands = [{ x: 1, y: 1, at: performance.now(), color: '#f00', kind: 'box' }];
  sw.doneBoxes.add(0);
  sw.play({});
  ok('a replay clears the marks from the last run', (sw.lands ?? []).length === 0, String((sw.lands ?? []).length));
  ok('a replay clears the landed boxes too', sw.doneBoxes.size === 0);
}

console.log(fail ? `\nHUD ${fail} FAILED\n` : '\nHUD OK — the figures are measured, the caption follows the work, the marks expire\n');
process.exit(fail ? 1 : 0);
