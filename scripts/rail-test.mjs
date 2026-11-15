/* ============================================================================
   The progress rail must not lie — in either direction.

   The rail used to be `progress`, which is 0 for the entire time the model is
   writing (most of most builds) and then jumps. The obvious "fix" is a fake
   animated bar, which is a spinner in a nicer suit. What it does now is show
   two real things in sequence:

     · while the model writes: the honest elapsed share of the build budget;
     · while the page is drawn: the share of the page that has been drawn,
       measured area, from the sections the swarm has reached.

   These assertions are the contract. Each fails on the wrong implementation.
   ========================================================================== */
import { build } from 'esbuild';

/* The share maths lives in the screen, which is React. Rather than render a
   component to test arithmetic, the two scale helpers are exported from
   timing.ts so both the screen and this file call the same functions. */
const bundle = await build({
  stdin: {
    contents: `export { writeShare, drawShare } from './src/lib/timing';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
});

const { writeShare, drawShare } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
);

let fail = 0;
const ok = (n, c, d = '') => {
  if (!c) {
    fail++;
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  }
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

/* ── the writing half ────────────────────────────────────────────────────── */

{
  ok('nothing elapsed reads as nothing', writeShare(0, 80000) === 0);
  ok('half the budget reads as half', near(writeShare(40000, 80000), 0.5));
  ok('the last second is not empty', writeShare(79999, 80000) > 0.99);
  /* A build that overruns the budget must not show 140% or go backwards. */
  ok('an overrun is clamped, not extrapolated', writeShare(200000, 80000) === 1);
  /* Guard against divide-by-zero on a zero budget. */
  ok('a zero budget does not divide by zero', Number.isFinite(writeShare(10, 0)));
}

/* ── the drawing half ────────────────────────────────────────────────────── */

const sections = [
  { index: 0, name: 'Hero', share: 0.3 },
  { index: 1, name: 'Features', share: 0.3 },
  { index: 2, name: 'Products', share: 0.3 },
  { index: 3, name: 'Contact', share: 0.1 },
];

{
  /* Nothing has started: the bar must not claim progress. */
  ok('no section, no progress', drawShare(sections, null, 0) === 0);

  /* In the hero, the hero's share counts — not nothing, and not the whole page. */
  const hero = drawShare(sections, 0, 0.2);
  ok('working in the first section shows its share', near(hero, 0.3), String(hero));

  /* Two sections in, the share is cumulative: this is a bar, not a step. */
  const two = drawShare(sections, 1, 0.5);
  ok('progress accumulates down the page', near(two, 0.6), String(two));

  /* The bar is monotone as the swarm moves down the page. */
  let prev = -1;
  let monotone = true;
  for (const s of [null, 0, 1, 2, 3]) {
    const v = drawShare(sections, s, s === null ? 0 : 0.5);
    if (v < prev - 1e-9) monotone = false;
    prev = v;
  }
  ok('the bar never goes backwards while drawing', monotone);

  /* Finished: full, regardless of rounding in the shares. The interesting case
     is a finished page whose caption points at a section that is not in the
     list — after a fallback render, or if a section was renumbered. Without an
     explicit "finished" rule that reads as 0% on a completed build, which is the
     worst possible moment to be wrong. */
  ok('a finished draw is full', drawShare(sections, 3, 1) === 1);
  /* The last frames are exactly this: the draw is complete, but the cursor is
     still parked on an early step, so the caption says Hero. Without an explicit
     finished rule the rail sits at 30% on a page that is fully drawn. */
  ok(
    'a finished draw is full even while the caption lags behind',
    drawShare(sections, 0, 1) === 1,
    String(drawShare(sections, 0, 1))
  );
  ok(
    'a finished draw is full even when the caption is stale',
    drawShare(sections, 99, 1) === 1,
    String(drawShare(sections, 99, 1))
  );

  /* A page with no measurable sections must not divide by zero. */
  ok('no sections does not divide by zero', drawShare([], 0, 0.5) === 0);
  ok('all-zero shares do not divide by zero', drawShare([{ index: 0, name: 'x', share: 0 }], 0, 0.5) === 0);

  /* Shares that do not sum to 1 (a page whose nav is outside every section)
     must still clamp to full rather than overshoot the rail. */
  const short = [{ index: 0, name: 'x', share: 0.5 }];
  ok('shares that under-sum still end full', drawShare(short, 0, 1) === 1);
}

console.log(fail ? `\nRAIL ${fail} FAILED\n` : '\nRAIL OK — two honest scales, no fake motion, never backwards\n');
process.exit(fail ? 1 : 0);
