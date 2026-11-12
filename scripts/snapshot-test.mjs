/**
 * Regression test for snapshot().
 *
 * This exists because of a real bug: the walker recursed into every descendant
 * looking for text, set a "saw text" flag, and returned early — so a whole
 * section was never descended into and every card inside it was missing from
 * the build plan. A page reported 8 boxes when it should have reported ~117.
 *
 * jsdom does no layout, so geometry is stubbed. That is fine: what is under
 * test is the CLASSIFIER and the walk order, not the browser's box model.
 *
 *   node scripts/snapshot-test.mjs
 */
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const bundle = await build({
  stdin: {
    contents: `
      export { DEMO_SPEC } from './src/lib/samples';
      export { renderDocument } from './src/lib/render';
      export { snapshot } from './src/lib/blueprint';
      export { newSection } from './src/lib/presets';
    `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  external: ['jsdom'],
  logLevel: 'error',
});
const mod = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));

const { DEMO_SPEC, renderDocument, snapshot, newSection } = mod;

let failures = 0;
const check = (name, cond, detail = '') => {
  if (cond) return;
  failures++;
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
};

function stubLayout(dom) {
  const w = dom.window;
  w.Element.prototype.getBoundingClientRect = function () {
    const t = this.tagName.toLowerCase();
    const c = String(this.className || '');
    let s = [300, 40];
    if (t === 'html' || t === 'body') s = [1440, 6000];
    else if (t === 'nav') s = [1440, 64];
    else if (t === 'section' || t === 'header') s = [1440, 520];
    else if (t === 'footer') s = [1440, 96];
    else if (t === 'div' && c.includes('wrap')) s = [1080, 420];
    else if (t === 'div' && c.includes('hero-copy')) s = [600, 380];
    else if (t === 'ul') s = [1080, 320];
    else if (t === 'li') s = [320, 300];
    else if (t === 'div' && c.includes('plate')) s = [300, 300];
    const top = 40 + ((this.__i ??= Math.random() * 5000) | 0);
    return { left: 40, top, width: s[0], height: s[1], right: 40 + s[0], bottom: top + s[1], x: 40, y: top, toJSON: () => ({}) };
  };
  const style = (el) => {
    const t = el.tagName.toLowerCase();
    const c = String(el.className || '');
    const bg =
      t === 'nav' || t === 'section' || t === 'header'
        ? 'rgb(255,255,255)'
        : c.includes('card') || c.includes('product') || c.includes('tier') || c.includes('plate')
          ? 'rgb(250,250,250)'
          : 'rgba(0, 0, 0, 0)';
    return {
      display: 'block', visibility: 'visible', opacity: '1', backgroundColor: bg,
      borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'rgb(220,220,220)',
      borderTopLeftRadius: '4px', color: 'rgb(17,17,17)',
      fontSize: t === 'h1' ? '48px' : '17px', fontWeight: '400',
      fontFamily: 'Georgia, serif', textAlign: 'left',
    };
  };
  w.getComputedStyle = style;
  dom.window.document.defaultView.getComputedStyle = style;
  return dom;
}

function measure(html) {
  const dom = stubLayout(new JSDOM(html, { pretendToBeVisual: true }));
  return snapshot(dom.window.document);
}

/* ── the regression: nested content must survive ────────────────────────── */
const bp = measure(renderDocument(DEMO_SPEC));
console.log(`page: ${bp.boxes.length} boxes, ${bp.lines.length} lines, ${bp.texts.length} texts`);

check('finds the page background regions', bp.boxes.length > 40, `only ${bp.boxes.length}`);
check('finds the product tiles', bp.boxes.filter((b) => Math.round(b.h) === 300).length >= 6);
check('finds the nav', bp.boxes.some((b) => b.role === 'nav'));
check('finds buttons', bp.boxes.some((b) => b.role === 'button'));
check('finds text', bp.texts.length > 40, `${bp.texts.length}`);
check('steps cover everything', bp.steps.length === bp.boxes.length + bp.lines.length + bp.texts.length);
check('no NaN geometry', [...bp.boxes, ...bp.lines, ...bp.texts].every((o) =>
  Object.values(o).every((v) => typeof v !== 'number' || Number.isFinite(v))
));
check('text is never empty', bp.texts.every((t) => t.text.trim().length > 0));
check('steps point at real indices', bp.steps.every((s) =>
  s.kind === 'box' ? s.index < bp.boxes.length
  : s.kind === 'line' ? s.index < bp.lines.length
  : s.index < bp.texts.length
));

/* ── every section type must produce something to build ─────────────────── */
const types = ['hero','features','pricing','products','testimonials','faq','about','menu','gallery','stats','cta','contact','schedule'];
for (const t of types) {
  const spec = {
    ...DEMO_SPEC,
    sections: [newSection(t), newSection('about'), newSection('contact')],
  };
  const b = measure(renderDocument(spec));
  check(`section "${t}" yields buildable content`, b.texts.length > 3 && b.boxes.length > 3,
    `${b.boxes.length} boxes / ${b.texts.length} texts`);
}

/* ── an empty-ish page must not throw ───────────────────────────────────── */
try {
  const b = measure(renderDocument({ ...DEMO_SPEC, sections: DEMO_SPEC.sections.slice(0, 1) }));
  check('single-section page still builds', b.steps.length > 0);
} catch (e) {
  check('single-section page still builds', false, String(e));
}

console.log(failures === 0 ? '\nSNAPSHOT OK' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
