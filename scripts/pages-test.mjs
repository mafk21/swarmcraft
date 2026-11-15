/* ============================================================================
   Sub-pages — generated, stored, and reachable.

   Two bugs are behind this file.

   1. A build made exactly one page. `+ Page` made an empty one, so a shop
      that needed a catalogue page got a placeholder that said "Replace this
      with what belongs here."

   2. The pages after home lived in ResultScreen's React state. They were in
      memory only: close the tab, reopen the site from "Your sites", and the
      home page came back while every other page was gone — even though the
      tab was still saying "3 pages".

   So these tests do two things: they prove the nav wiring (a `page:N` link
   must point at the page the reader expects, including after a page is
   removed), and they prove the pages survive by writing them to a fake
   IndexedDB and reading them back through a second, fresh call.

   What each group would catch:
     · a sub-page that steals the home page's theme, or its title
     · a page listed but orphaned — in the site, with no link to it
     · a self-link, or a nav that only works in one direction
     · `page:2` still pointing at slot 2 after a page was deleted
     · pages saved in creation order rather than page order
     · a removed page resurrected by the next save
   ========================================================================== */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';

let fail = 0;
const ok = (n, c, d = '') => {
  if (!c) {
    fail++;
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  }
};

/* ── tiny fake IndexedDB ────────────────────────────────────────────────────
   lib/pages.ts writes through lib/db.ts, which uses `idb` and refuses to work
   when `indexedDB` is undefined. That guard is real and is tested elsewhere,
   so here the environment is given a database instead of the guard being
   weakened: a table per store, and `idb` aliased to a shim that hands back the
   same table. What is written is therefore what is read back, which is the
   only thing worth proving about a store. */
const tables = new Map();
const table = (name) => {
  if (!tables.has(name)) tables.set(name, new Map());
  return tables.get(name);
};

const fakeDb = {
  getAll: async (store) => [...table(store).values()],
  getAllFromIndex: async (store, index, value) =>
    [...table(store).values()].filter((r) => r[index] === value),
  put: async (store, row) => {
    table(store).set(row.id, structuredClone(row));
    return row.id;
  },
  get: async (store, id) => table(store).get(id),
  delete: async (store, id) => {
    table(store).delete(id);
  },
  count: async (store) => table(store).size,
  objectStoreNames: { contains: () => true },
  close: () => undefined,
};

globalThis.indexedDB = fakeDb;

const fs = await import('node:fs');
const idbShim = scratch('pages-idb-shim.mjs');
fs.writeFileSync(
  idbShim.path,
  'export const openDB = () => Promise.resolve(globalThis.__FAKE_DB__);\nexport const deleteDB = () => Promise.resolve();\n'
);
globalThis.__FAKE_DB__ = fakeDb;

const bundle = scratch('pages.bundle.mjs');
await build({
  entryPoints: ['src/lib/pages.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: bundle.path,
  logLevel: 'silent',
  alias: { idb: idbShim.path },
});

const pages = await import(bundle.url);
const specBundle = scratch('spec.bundle.mjs');
await build({
  entryPoints: ['src/lib/spec.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: specBundle.path,
  logLevel: 'silent',
});
const specMod = await import(specBundle.url);

/* ── fixtures ─────────────────────────────────────────────────────────────── */

const page = (title, hrefs = [], sections = []) => ({
  meta: { title, description: `${title} page`, theme: 'editorial', accent: 'ink' },
  nav: {
    brand: 'Kiln',
    links: hrefs.map((h) => ({ label: h.replace(/[#page:]/g, '') || 'Link', href: h })),
  },
  sections: sections.length
    ? sections
    : [
        { type: 'hero', headline: title, sub: 'A sentence.' },
        { type: 'about', heading: 'About', body: ['One paragraph.'] },
        { type: 'contact', heading: 'Contact', email: 'a@b.co', form: false },
      ],
  footer: { note: 'Kiln' },
  voice: { register: 'plain', facts: [] },
});

/* ── 1. nav wiring ────────────────────────────────────────────────────────── */

{
  const home = page('Kiln', ['#about']);
  home.sections.push({ type: 'about', heading: 'About', body: ['x'] });
  const menu = page('Menu');              // no nav of its own at all
  const booked = page('Book a table', ['page:1']); // one link, and not home

  const wired = pages.wireNav([home, menu, booked]);

  const homeLinks = wired[0].nav.links;
  ok('home links to every sub-page', homeLinks.some((l) => l.href === 'page:1') && homeLinks.some((l) => l.href === 'page:2'), JSON.stringify(homeLinks));
  ok('the link is labelled with the page title', homeLinks.find((l) => l.href === 'page:1')?.label === 'Menu', JSON.stringify(homeLinks));
  ok('the home page keeps its own anchor', homeLinks.some((l) => l.href === '#about'));

  ok('a sub-page can get home', wired[1].nav.links.some((l) => l.href === 'page:0'));
  ok('a sub-page does not link to itself', !wired[2].nav.links.some((l) => l.href === 'page:2'));
  ok('a link from one page to another survives', wired[2].nav.links.some((l) => l.href === 'page:1'), JSON.stringify(wired[2].nav.links));

  /* A page removed from the middle: the links must follow the page, not the
     slot. These fixtures are already wired, so re-wiring is the real case —
     delete() removes page 1 and renumbers. */
  const after = pages.wireNav([wired[0], wired[2]]);
  ok('after a removal the surviving page is reachable', after[0].nav.links.some((l) => l.href === 'page:1'), JSON.stringify(after[0].nav.links));
  ok('no link points past the last page', after.every((p) => p.nav.links.every((l) => !/^page:\d+$/.test(l.href) || Number(l.href.slice(5)) < after.length)), JSON.stringify(after.map((p) => p.nav.links)));

  ok('one page is left alone', pages.wireNav([home]).length === 1 && pages.wireNav([home])[0].nav.links.length === 1);
  ok('a duplicate target is kept once', pages.wireNav([{ ...home, nav: { brand: 'K', links: [{ label: 'a', href: 'page:1' }, { label: 'b', href: 'page:1' }] } }, menu])[0].nav.links.filter((l) => l.href === 'page:1').length === 1);
}

/* ── 2. storage: pages outlive the tab ────────────────────────────────────── */

{
  const projectId = 'p1';
  const home = page('Kiln');
  const extras = [page('Menu'), page('Visit')];

  await pages.savePages(projectId, extras);
  ok('the pages are written', table('pages').size === 2, String(table('pages').size));

  /* a fresh call = a fresh page load */
  const back = await pages.loadPages(projectId);
  ok('every page comes back', back.length === 2, `${back.length} of 2`);
  ok('and in page order', back[0]?.meta.title === 'Menu' && back[1]?.meta.title === 'Visit', back.map((p) => p.meta.title).join(' | '));
  ok('the sections survive, not just the title', back[0]?.sections.length === 3, String(back[0]?.sections.length));

  /* page order is not creation order */
  const titlesToIds = () =>
    Object.fromEntries([...table('pages').values()].map((r) => [r.title, r.id]));
  const original = titlesToIds();

  const reordered = [extras[1], extras[0]];
  await pages.savePages(projectId, reordered);
  const again = await pages.loadPages(projectId);
  ok('re-ordering is stored', again[0]?.meta.title === 'Visit', again.map((p) => p.meta.title).join(' | '));
  ok('re-ordering does not duplicate the rows', table('pages').size === 2, String(table('pages').size));
  /* Each page keeps its own row. Matching by slot instead of by page would
     hand Menu's identity to Visit, and any saved reference to one page would
     then open the other. */
  const afterSwap = titlesToIds();
  ok('a re-ordered page keeps its own id', original.Visit === afterSwap.Visit && original.Menu === afterSwap.Menu, `${JSON.stringify(original)} → ${JSON.stringify(afterSwap)}`);

  /* An edit keeps the page's identity. Compared per title rather than as a set:
     a swapped pair of ids is the same set, and swapping is exactly the bug —
     it would mean a saved page link now opens a different page. */
  const byTitle = () =>
    Object.fromEntries([...table('pages').values()].map((r) => [r.title, r.id]));
  const idsBefore = byTitle();
  const edited = [again[0], { ...again[1], sections: again[1].sections.slice(0, 2) }];
  await pages.savePages(projectId, edited);
  const idsAfter = byTitle();
  ok('editing a page keeps its id', JSON.stringify(idsBefore) === JSON.stringify(idsAfter), `${JSON.stringify(idsBefore)} → ${JSON.stringify(idsAfter)}`);
  ok('an edit keeps each page on its own id', idsBefore.Visit === idsAfter.Visit && idsBefore.Menu === idsAfter.Menu);

  /* removal is real: not left behind to be resurrected */
  await pages.savePages(projectId, [edited[0]]);
  ok('a removed page is deleted', table('pages').size === 1, String(table('pages').size));
  ok('the page that stayed is the right one', (await pages.loadPages(projectId))[0]?.meta.title === 'Visit');

  /* nothing at all */
  await pages.savePages(projectId, []);
  ok('no extras means no rows', table('pages').size === 0, String(table('pages').size));
  ok('and loading an empty site is empty', (await pages.loadPages(projectId)).length === 0);

  /* another project's pages are not this project's pages */
  await pages.savePages('p1', [page('One')]);
  await pages.savePages('p2', [page('Two')]);
  const one = await pages.loadPages('p1');
  ok('pages belong to their project', one.length === 1 && one[0].meta.title === 'One', one.map((p) => p.meta.title).join(' | '));
}

/* ── 3. a stored row that is not a page is dropped, not rendered ──────────── */

{
  await table('pages').clear();
  await pages.savePages('p3', [page('Good')]);
  await table('pages').set('junk', {
    id: 'junk',
    projectId: 'p3',
    title: 'junk',
    slug: 'junk',
    order: 0,
    created: Date.now(),
    spec: { meta: { title: 'junk' } }, // no nav, no sections
  });
  const back = await pages.loadPages('p3');
  ok('a corrupt page is skipped', back.length === 1 && back[0].meta.title === 'Good', back.map((p) => p.meta.title).join(' | '));
}

/* ── 4. blankPage matches the home page's voice ───────────────────────────── */

{
  const home = page('Kiln');
  const blank = pages.blankPage(home, 'Roasting');
  ok('a hand-added page keeps the theme', blank.meta.theme === home.meta.theme);
  ok('and the accent', blank.meta.accent === home.meta.accent);
  ok('and the brand', blank.nav.brand === home.nav.brand);
  ok('it is a valid spec', specMod.validateSpec(blank).ok === true);
  ok('a hand-added page has a way home', blank.nav.links.every((l) => l.href !== `page:0`) ? pages.wireNav([home, blank])[1].nav.links.some((l) => l.href === 'page:0') : true);
}

console.log(
  fail ? `\nPAGES ${fail} FAILED\n` : '\nPAGES OK — a site keeps its pages, and every link lands somewhere\n'
);
process.exit(fail ? 1 : 0);
