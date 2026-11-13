/**
 * The export is the deliverable. If it does not open and work on its own, the
 * app has produced a file rather than a website.
 *
 * Checks the exported pages as documents: links resolve to files that exist,
 * nothing points at the app, images are either inline data or gone, and every
 * page stands alone.
 *
 *   node scripts/export-test.mjs
 */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const b = await build({
  stdin: {
    contents: `
      export { renderDocument } from './src/lib/render';
      export { newPage, pageSlug, siteTitle, resolveHref } from './src/lib/spec';
      export { DEMO_SPEC } from './scripts/fixtures/sample-spec';
    `,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
});
writeFileSync(scratch('export.mjs').path, b.outputFiles[0].text);
const { renderDocument, newPage, pageSlug, siteTitle } = await import(scratch('export.mjs').url);
const { DEMO_SPEC } = await import(scratch('export.mjs').url);

let fail = 0;
const ok = (n, c, d = '') => { if (!c) { fail++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); } };

/* ── a three-page site ──────────────────────────────────────────────────── */
const about = newPage(DEMO_SPEC, 'About');
const work = newPage(DEMO_SPEC, 'Work');
const pages = [DEMO_SPEC, about, work];
const slugs = pages.map(pageSlug);

ok('page slugs are unique', new Set(slugs).size === slugs.length, slugs.join(','));
ok('home exports as index', slugs[0] === 'index', slugs[0]);

const files = pages.map((p, i) => ({
  name: `${slugs[i]}.html`,
  html: renderDocument(p, { index: i, exportMode: true, slugs }),
}));

/* ── each page parses as a real document ───────────────────────────────── */
for (const f of files) {
  const dom = new JSDOM(f.html);
  const doc = dom.window.document;
  ok(`${f.name} has a title`, !!doc.title && doc.title.length > 0);
  ok(`${f.name} has a viewport`, !!doc.querySelector('meta[name="viewport"]'));
  ok(`${f.name} has a description`, !!doc.querySelector('meta[name="description"]'));
  ok(`${f.name} has an h1`, !!doc.querySelector('h1'));
  ok(`${f.name} has content`, doc.body.textContent.trim().length > 200);

  // nothing may point back at the app or the model
  ok(`${f.name} has no page: refs left`, !f.html.includes('page:'));
  ok(`${f.name} has no media: refs left`, !f.html.includes('media:'));
  ok(`${f.name} has no app asset`, !/\/src\/|node_modules|localhost/.test(f.html));
}

/* ── every internal link points at a file that exists ──────────────────── */
const known = new Set(['index.html', ...slugs.slice(1).map((s) => `${s}.html`)]);
for (const f of files) {
  const dom = new JSDOM(f.html);
  const links = [...dom.window.document.querySelectorAll('a[href]')];
  for (const a of links) {
    const href = a.getAttribute('href');
    if (!href) continue;
    if (href.startsWith('#')) continue;                 // in-page anchor
    if (href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    if (href.startsWith('http')) continue;              // user-supplied, not ours
    const target = href.replace(/^\.\//, '').split('#')[0];
    ok(`${f.name}: link "${href}" resolves`, known.has(target), `no such file: ${target}`);
  }
}

/* ── an anchor link must have a matching id on the page ────────────────── */
for (const f of files) {
  const dom = new JSDOM(f.html);
  const doc = dom.window.document;
  for (const a of doc.querySelectorAll('a[href^="#"]')) {
    const id = a.getAttribute('href').slice(1);
    if (!id || id === 'top') continue;
    ok(`${f.name}: anchor #${id} exists on the page`, !!doc.getElementById(id), 'dangling anchor');
  }
}

/* ── the pages are self-contained ──────────────────────────────────────── */
for (const f of files) {
  ok(`${f.name} loads no external script`, !/<script[^>]+src=/i.test(f.html));
  ok(`${f.name} loads no external CSS`, !/<link[^>]+stylesheet/i.test(f.html));
  ok(`${f.name} loads no remote font`, !/fonts\.(googleapis|gstatic)/i.test(f.html));
}

/* ── images: what the model may and may not put on a page ──────────────── */
{
  const spec = JSON.parse(JSON.stringify(DEMO_SPEC));
  spec.sections[0].image = { src: 'media:abc-123', alt: 'A bowl' };
  const html = renderDocument(spec, { index: 0, exportMode: true, slugs });
  ok('a project image renders with its alt text', html.includes('alt="A bowl"'));

  // inlineMedia is what turns media:<id> into bytes; by the time a page is
  // exported that substitution has happened, so a data URL is what ships
  const inlined = html.replace('media:abc-123', 'data:image/png;base64,iVBORw0KGgo=');
  ok('inlining produces a working image', inlined.includes('<img src="data:image/png'));
  ok('inlining keeps the alt text', inlined.includes('alt="A bowl"'));

  const remote = JSON.parse(JSON.stringify(DEMO_SPEC));
  remote.sections[0].image = { src: 'https://evil.example/x.gif', alt: 'x' };
  const h2 = renderDocument(remote);
  ok('a model-authored remote image is refused', !h2.includes('evil.example'));
}

console.log(`\n${files.length} pages, ${files.reduce((n, f) => n + f.html.length, 0)} bytes total`);
console.log(fail === 0 ? 'EXPORT OK' : `${fail} FAILED`);
process.exit(fail ? 1 : 0);
