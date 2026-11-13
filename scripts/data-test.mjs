/**
 * Data-layer and export-path tests: things that must be true regardless of what
 * the browser does, checked against the real modules.
 *
 *   node scripts/data-test.mjs
 */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { writeFileSync } from 'node:fs';

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/lib/spec';
      export { renderDocument } from './src/lib/render';
      export { DEMO_SPEC } from './scripts/fixtures/sample-spec';
      export { THEMES, ACCENT_HEX, THEME_LIST, THEME_AFFINITY, themeCss } from './src/lib/themes';
      export { KIND_BRIEFS, defaultSections, questionCount } from './src/lib/questions';
      export { newSection } from './src/lib/presets';
      export { SECTION_FIELDS } from './src/app/editors';
        `,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
  outfile: 'data-test.mjs',
});

// write beside node_modules so bare imports resolve, then import it for real
const data_test_mjs = scratch('data-test.mjs');
writeFileSync(data_test_mjs.path, bundle.outputFiles[0].text);
const m = await import(data_test_mjs.url);

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const {
  SITE_KINDS, THEME_LIST, THEMES, ACCENT_HEX, KIND_BRIEFS, defaultSections,
  SECTION_FIELDS, DEMO_SPEC, renderDocument, renderBody, validateSpec,
  editSectionField, editMeta, moveSection, removeSection, duplicateSection,
  newPage, pageSlug, resolveHref, siteTitle, pageText, findSlop, SectionSchema,
  newSection, themeCss,
} = m;

/* ── the guarantee ──────────────────────────────────────────────────────── */
{
  const smuggled = JSON.parse(JSON.stringify(DEMO_SPEC));
  smuggled.sections[0].styles = { color: 'red' };
  ok('a smuggled style is rejected, not stripped',
    SectionSchema.safeParse(smuggled.sections[0]).success === false);

  /* The schema still refuses smuggled styling — that guard has not moved. What
     changed is the blast radius: the key is stripped and reported, and the page
     survives. One stray `className` must never cost the user their build. */
  const extraRoot = { ...DEMO_SPEC, css: 'body{}' };
  const stripped = validateSpec(extraRoot);
  ok('an extra root key does not destroy the page', stripped.ok === true);
  ok('the extra root key is gone from the result',
    !('css' in JSON.parse(JSON.stringify(stripped.spec))));
  ok('the stripping is reported as a repair',
    stripped.ok && stripped.repairs.some((r) => /invented field/.test(r)));
}

/* ── all ten kinds ──────────────────────────────────────────────────────── */
for (const kind of SITE_KINDS) {
  const brief = KIND_BRIEFS[kind];
  ok(`${kind} has a brief`, !!brief);
  const ids = brief.questions.map((q) => q.id);
  ok(`${kind} has unique question ids`, new Set(ids).size === ids.length);
  ok(`${kind} offers a hero`, brief.sections.some((s) => s.id === 'hero'));
  ok(`${kind} defaults to 3+ sections`, defaultSections(kind).filter((s) => s.on).length >= 3);
  ok(`${kind} suggests real themes`, brief.themes.every((t) => !!THEMES[t]));
  for (const q of brief.questions) {
    if (q.kind === 'choice') ok(`${kind}.${q.id} has options`, q.options.length >= 2);
  }
}
// question sets must genuinely differ
ok('store and portfolio ask different things',
  JSON.stringify(KIND_BRIEFS.store.questions.map((q) => q.id)) !==
  JSON.stringify(KIND_BRIEFS.portfolio.questions.map((q) => q.id)));

/* ── all eight themes, all six accents ──────────────────────────────────── */
for (const t of THEME_LIST) {
  const required = ['--font-display', '--font-body', '--surface', '--ink', '--rule', '--radius'];
  ok(`theme ${t.id} defines its tokens`, required.every((k) => t.vars[k]));
  const html = renderDocument({ ...DEMO_SPEC, meta: { ...DEMO_SPEC.meta, theme: t.id } });
  ok(`theme ${t.id} renders`, html.includes('--accent:') && html.includes('</html>'));
}
for (const a of Object.keys(ACCENT_HEX)) {
  ok(`accent ${a} is a hex colour`, /^#[0-9a-f]{6}$/i.test(ACCENT_HEX[a]));
}

/* ── every section type: preset valid, renders, has an editor ───────────── */
const types = Object.keys(SECTION_FIELDS);
ok('thirteen section types', types.length === 13, String(types.length));
for (const t of types) {
  const preset = newSection(t);
  ok(`preset ${t} is valid`, SectionSchema.safeParse(preset).success);
  const spec = { ...DEMO_SPEC, sections: [DEMO_SPEC.sections[0], preset, DEMO_SPEC.sections[1], DEMO_SPEC.sections[2]] };
  const html = renderDocument(spec);
  ok(`section ${t} renders`, html.length > 2000);
  ok(`section ${t} has editor fields`, (SECTION_FIELDS[t] ?? []).length > 0);
}

/* ── editing refuses what would break the schema ────────────────────────── */
{
  const r1 = editSectionField(DEMO_SPEC, 0, ['headline'], '');
  ok('empty headline refused', r1.rejected && (r1.spec.sections[0]).headline === 'Pots that get used');
  const r2 = editSectionField(DEMO_SPEC, 0, ['headline'], 'Fine headline');
  ok('valid headline accepted', !r2.rejected && r2.spec.sections[0].headline === 'Fine headline');
  const r3 = editMeta(DEMO_SPEC, ['meta', 'theme'], 'not-a-theme');
  ok('invalid theme refused', r3.rejected);
  ok('spec unchanged after refusals', DEMO_SPEC.meta.theme === 'warm');
}

/* ── structural rules ───────────────────────────────────────────────────── */
ok('hero cannot be removed', removeSection(DEMO_SPEC, 0) === null);
ok('three-section floor holds',
  removeSection({ ...DEMO_SPEC, sections: DEMO_SPEC.sections.slice(0, 3) }, 1) === null);
{
  const dup = duplicateSection(DEMO_SPEC, 1);
  ok('duplicate appends one', dup.sections.length === DEMO_SPEC.sections.length + 1);
  ok('duplicate is a deep copy', dup.sections[1] !== dup.sections.at(-1));
  const nine = { ...DEMO_SPEC, sections: Array(9).fill(DEMO_SPEC.sections[1]) };
  ok('nine is the cap', duplicateSection(nine, 1) === null);
}
ok('move swaps', moveSection(DEMO_SPEC, 1, -1).sections[0] === DEMO_SPEC.sections[1]);
ok('move out of range is a no-op', moveSection(DEMO_SPEC, 0, -1) === DEMO_SPEC);

/* ── pages and links ────────────────────────────────────────────────────── */
{
  const p2 = newPage(DEMO_SPEC, 'About');
  const pages = [DEMO_SPEC, p2];
  const slugs = pages.map(pageSlug);
  ok('export slugs are unique', new Set(slugs).size === slugs.length);
  ok('home is index', slugs[0] === 'index');
  ok('new page links home', p2.nav.links.some((l) => l.href === 'page:0'));
  ok('site title comes from page 0', siteTitle({ pages, current: 1 }) === DEMO_SPEC.meta.title);

  ok('in-app page link', resolveHref('page:1', 0, false) === '#page-1');
  ok('export page link uses the real filename',
    resolveHref('page:1', 0, true, slugs) === `./${slugs[1]}.html`);
  ok('self link is #top', resolveHref('page:0', 0, true, slugs) === '#top');
  ok('anchors pass through', resolveHref('#pricing', 0, true, slugs) === '#pricing');

  const exported = renderDocument(p2, { index: 1, exportMode: true, slugs });
  ok('exported page links to index.html', exported.includes('./index.html'));
  ok('exported page has no page: refs left', !exported.includes('page:0'));
}

/* ── images ─────────────────────────────────────────────────────────────── */
{
  const withImg = JSON.parse(JSON.stringify(DEMO_SPEC));
  withImg.sections[0].image = { src: 'media:a-b-c', alt: 'A bowl' };
  const html = renderDocument(withImg);
  ok('local media renders', html.includes('<img src="media:a-b-c"') && html.includes('alt="A bowl"'));
  ok('hero splits for a picture', html.includes('class="sec hero hero-split"'));

  const remote = JSON.parse(JSON.stringify(DEMO_SPEC));
  remote.sections[0].image = { src: 'https://evil.example/x.gif', alt: 'x' };
  const h2 = renderDocument(remote);
  ok('remote image refused', !h2.includes('evil.example') && !h2.includes('<img'));
  const headerTag = h2.match(/<header class="sec hero[^"]*"/)?.[0] ?? '';
  ok('no split for a refused image', headerTag === '<header class="sec hero"', headerTag);
  ok('a real image does split',
    (html.match(/<header class="sec hero[^"]*"/)?.[0] ?? '').includes('hero-split'));
}

/* ── four gallery compositions ──────────────────────────────────────────── */
for (const [layout, cls] of [['grid','gal-grid'],['feature','gal-feature'],['strip','gal-strip'],['masonry','gal-masonry']]) {
  const spec = JSON.parse(JSON.stringify(DEMO_SPEC));
  spec.sections.splice(1, 0, { type: 'gallery', heading: 'Work', layout,
    items: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }] });
  ok(`gallery ${layout} renders .${cls}`, renderDocument(spec).includes(cls));
}

/* ── escaping ───────────────────────────────────────────────────────────── */
{
  const evil = JSON.parse(JSON.stringify(DEMO_SPEC));
  evil.nav.brand = '<script>alert(1)</script>';
  evil.nav.links = [];
  evil.sections = [{ type: 'hero', headline: '<img src=x onerror=alert(1)>', sub: 'ok' },
                   DEMO_SPEC.sections[1], DEMO_SPEC.sections[2]];
  const html = renderDocument(evil);
  ok('markup in content is escaped', !html.includes('<script>alert(1)</script>'));
  ok('attribute injection is escaped', !html.includes('onerror=alert(1)>'));
  ok('escaped form is present', html.includes('&lt;script&gt;'));
}

/* ── slop guard ─────────────────────────────────────────────────────────── */
{
  const sloppy = JSON.parse(JSON.stringify(DEMO_SPEC));
  sloppy.sections[0].sub = 'Unlock the power of cutting-edge ceramics.';
  ok('slop is detected', findSlop(sloppy).length >= 2);
  ok('a clean page has none', findSlop(DEMO_SPEC).length === 0);
}

/* ── page text exposes contact details ──────────────────────────────────── */
ok('pageText includes the email', pageText(DEMO_SPEC).includes('workshop@kilnandtable.sa'));

/* ── theme css is well-formed ───────────────────────────────────────────── */
{
  const css = themeCss(THEMES.warm, 'clay');
  ok('themeCss declares the accent', css.includes('--accent: #8a4b32'));
  ok('themeCss is a complete rule', css.trim().startsWith(':root {') && css.trim().endsWith('}'));
}

/* ── a mixed nine-section page still validates and renders ──────────────── */
{
  let spec = { ...DEMO_SPEC, sections: [DEMO_SPEC.sections[0]] };
  for (const t of types.filter((x) => x !== 'hero')) {
    if (spec.sections.length >= 9) break;
    spec = { ...spec, sections: [...spec.sections, newSection(t)] };
  }
  ok('mixed nine-section page validates', validateSpec(spec).ok);
  ok('mixed nine-section page renders', renderDocument(spec).length > 3000);
}

console.log(fail === 0 ? '\nDATA OK' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
