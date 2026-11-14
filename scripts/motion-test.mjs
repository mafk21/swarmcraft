/* ============================================================================
   "the site is way too bored"

   The renderer had zero animation: a static document that looked correct and
   felt dead. This checks the motion layer is real, and — more importantly —
   that it fails SAFE. A page whose sections are hidden by CSS and revealed by a
   script is one blocked script away from being completely blank.
   ========================================================================== */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const out = scratch('motion.mjs');
await build({ entryPoints: ['src/lib/render.ts'], bundle: true, format: 'esm', platform: 'node', outfile: out.path, logLevel: 'silent' });
const { renderDocument } = await import(out.url);

let fail = 0;
const ok = (n, c, d = '') => { if (!c) { fail++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); } };

const SPEC = {
  meta: { title: 'Motion', description: 'd', theme: 'warm', accent: 'clay' },
  nav: { brand: 'B', links: [] },
  sections: [
    { type: 'hero', headline: 'H', sub: 's' },
    { type: 'features', heading: 'F', items: [
      { title: 'a', body: 'b' }, { title: 'c', body: 'd' }, { title: 'e', body: 'f' }] },
    { type: 'contact', heading: 'C', form: true },
  ],
  footer: { note: 'n' }, voice: { register: 'plain', facts: [] },
};

const html = renderDocument(SPEC);

/* ── the motion is actually there ──────────────────────────────────────── */
ok('the page defines animations', /@keyframes/.test(html),
  'a site with no @keyframes is a document, not a site');
ok('elements respond to hover', /:hover/.test(html) && /transition/.test(html),
  'nothing transitions on hover');
ok('the hero animates in on load', /\.hero h1\{animation:/.test(html),
  'the first thing a visitor sees should not just be there');
ok('sections reveal', /IntersectionObserver/.test(html), 'no reveal script');
ok('the nav reacts to scrolling', /scrolled/.test(html), 'the nav never changes');

/* ── and it does not break the page it is decorating ───────────────────── */
ok('reduced motion is respected', /prefers-reduced-motion/.test(html),
  'a site that ignores the setting is broken for some readers');
ok('the capture guard exists', /is-capture/.test(html),
  'the swarm draws this DOM; running reveals while it does would fight it');

/* THE IMPORTANT ONE: nothing may be hidden until the script says so. */
/* a bare rule opening with .reveal, i.e. not gated behind .motion-ready */
const hiddenByDefault = /(^|[\s}])[^\w-]\.reveal\{opacity:0/.test(html.replace(/\.motion-ready \.reveal\{[^}]*\}/g, ''));
ok('sections are NOT hidden by plain CSS', !hiddenByDefault,
  'opacity:0 outside .motion-ready means a blocked script shows a blank page');
ok('hiding is gated behind motion-ready', /\.motion-ready \.reveal\{opacity:0/.test(html));

/* ── run the script for real in a DOM ──────────────────────────────────── */
{
  const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
  const d = dom.window.document;
  await new Promise((r) => setTimeout(r, 120));

  ok('the script ran at all', d.documentElement.classList.contains('motion-ready'),
    'motion-ready was never set, so nothing would animate');
  const revealed = d.querySelectorAll('.reveal').length;
  ok('below-the-fold sections are marked for reveal', revealed >= 2,
    `${revealed} sections marked`);
  ok('the hero is not hidden on arrival',
    !d.querySelector('.hero')?.classList.contains('reveal'),
    'the hero must be visible immediately');
  ok('grid children are staggered', d.querySelectorAll('.stag').length >= 3,
    `${d.querySelectorAll('.stag').length} staggered items`);
}

/* the capture variant must be inert */
{
  const cap = renderDocument(SPEC, { capture: true });
  ok('capture mode marks the body', /class="is-capture"/.test(cap));
  ok('capture mode freezes animation', /\.is-capture \*/i.test(cap) && /animation:none!important/.test(cap));
}

console.log(fail === 0
  ? '\nMOTION OK — the page animates, and a blocked script still leaves a readable page'
  : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
