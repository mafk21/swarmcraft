/**
 * Measurement must not be able to freeze the build.
 *
 * The 300-second report was not the model and not the animation: it was
 * `snapshot()`. lineChunks() set a Range over one character at a time and read
 * its rects — ~2,000 synchronous layout reflows on a modest page, far more on a
 * long one. Every one of them blocks the main thread, and a blocked main thread
 * cannot run the setTimeout that would have fired the build's deadline. So an
 * 80-second limit became five minutes of a frozen screen.
 *
 * Two things are asserted here:
 *   1. layout queries scale with LINES, not characters;
 *   2. a page far too big to measure is bounded instead of unbounded.
 *
 *   node scripts/measure-test.mjs
 */
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const b = await build({
  stdin: { contents: `export { snapshot } from './src/lib/blueprint'; export { renderDocument } from './src/lib/render'; export { DEMO_SPEC } from './scripts/fixtures/sample-spec';`,
    resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
});
writeFileSync('.tmp/measure.mjs', b.outputFiles[0].text);
const { snapshot, renderDocument, DEMO_SPEC } = await import(pathToFileURL(resolve('.tmp/measure.mjs')).href);

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

/* Give jsdom a layout engine good enough to answer geometry: text wraps at 70
   characters per line, everything else is a plain block. This is a model of a
   browser, not a browser — but it makes the CALL COUNT honest, which is the
   defect being guarded. */
function instrument(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  let queries = 0;

  const lineOf = (node, offset) =>
    Math.floor(offset / 70); // 70 chars per visual line

  const mkRect = (top, left, w, h) => ({ top, bottom: top + h, left, right: left + w, width: w, height: h, x: left, y: top });

  dom.window.Range.prototype.getClientRects = function () {
    queries++;
    const text = this.startContainer?.textContent ?? '';
    const line = lineOf(this.startContainer, this.startOffset);
    const col = this.startOffset % 70;
    const w = Math.max(1, (this.endOffset - this.startOffset) * 8);
    return [mkRect(line * 24, col * 8, w, 20)];
  };
  dom.window.Range.prototype.getBoundingClientRect = function () {
    queries++;
    return this.getClientRects()[0];
  };
  dom.window.Element.prototype.getBoundingClientRect = function () {
    queries++;
    return mkRect(0, 0, 1200, 24);
  };
  dom.window.getComputedStyle = () => ({
    fontSize: '16px', fontWeight: '400', color: 'rgb(0,0,0)',
    backgroundColor: 'rgba(0, 0, 0, 0)', borderTopWidth: '0px',
    borderTopColor: 'transparent', borderTopStyle: 'none',
    borderTopLeftRadius: '0px', fontFamily: 'serif', textAlign: 'left',
    display: 'block', visibility: 'visible', opacity: '1',
  });
  // scroll sizes the layout reader asks for
  Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollWidth', { get: () => 1440, configurable: true });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollHeight', { get: () => 4000, configurable: true });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { get: () => 1440, configurable: true });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { get: () => 800, configurable: true });
  return { doc, queries: () => queries, reset: () => (queries = 0) };
}

/* ── the real demo page ─────────────────────────────────────────────────── */
{
  const inst = instrument(renderDocument(DEMO_SPEC));
  const chars = [...inst.doc.querySelectorAll('*')]
    .filter((e) => e.childElementCount === 0)
    .reduce((n, e) => n + (e.textContent ?? '').length, 0);

  inst.reset();
  const bp = snapshot(inst.doc);
  const q = inst.queries();

  console.log(`demo page: ${chars} characters of text, ${bp.texts.length} lines measured`);
  console.log(`           ${q} layout queries for the whole page`);

  ok('the page still measures something', bp.boxes.length > 0 || bp.texts.length > 0,
    `${bp.boxes.length} boxes, ${bp.texts.length} texts`);
  ok('queries do not grow with character count', q < chars,
    `${q} queries for ${chars} characters`);
  ok('queries stay in the low hundreds for a demo page', q < 900, `${q}`);
}

/* ── a page of many words in few lines vs few words in many lines ───────── */
{
  const longText = 'word '.repeat(1200); // 6000 chars, ~86 lines at 70/line
  const inst = instrument(`<html><body><p>${longText}</p></body></html>`);
  inst.reset();
  snapshot(inst.doc);
  const q = inst.queries();
  console.log(`          ${q} layout queries for 6000 characters in one paragraph`);
  ok('a wall of text does not cost one query per character', q < 300, `${q} queries`);
}

/* ── an absurd page is bounded, not unbounded ───────────────────────────── */
{
  const many = Array.from({ length: 3000 }, (_, i) => `<div><p>Item ${i} with some words on it.</p></div>`).join('');
  const inst = instrument(`<html><body>${many}</body></html>`);
  const before = Date.now();
  inst.reset();
  snapshot(inst.doc);
  const q = inst.queries();
  const took = Date.now() - before;
  console.log(`          3000-element page: ${q} queries in ${took}ms`);
  ok('a 3000-element page is capped', q < 20000, `${q} queries`);
  ok('it returns rather than hanging', took < 5000, `${took}ms`);
}

console.log(fail === 0 ? '\nMEASURE OK' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
