/* ============================================================================
   "every time it says an error on the first try, the second try works — and
   then the one it said an error about is in the history"

   That sentence is a complete diagnosis, and it points at three real bugs:

   1. The module-level build deadline was armed on the first build and never
      cleared when that build SUCCEEDED. Ninety seconds later it fired against a
      dead build and pushed a store-level error onto whatever was on screen —
      which is why build #1 "failed" and build #2 was fine (its own deadline
      had not fired yet).

   2. A failed build had already been saved to IndexedDB before the animation
      ran, so the site it said it could not build appeared in "Your sites".

   3. A deadline that fires late must not be able to rewrite a build that has
      already succeeded or failed.

   This drives the REAL BuildScreen under StrictMode with the real store.
   ========================================================================== */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* the shortest budget we can test against, and a grace short enough to watch */
const BUDGET_MS = 900;
const GRACE_MS = 400;

const out = scratch('firstrun.mjs');
await build({
  entryPoints: ['scripts/fixtures/strict-entry.tsx'],
  bundle: true, format: 'esm', platform: 'browser', outfile: out.path,
  logLevel: 'silent', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{
    name: 'shrink-budget-stub-io',
    setup(b) {
      b.onResolve({ filter: /lib\/gemini$/ }, () => ({ path: 'g', namespace: 'g' }));
      b.onLoad({ filter: /.*/, namespace: 'g' }, async () => ({
        loader: 'ts',
        contents: readFileSync('src/lib/gemini.ts', 'utf8')
          .replace(/export const BUDGET_MS = [\d_]+;/, `export const BUDGET_MS = ${BUDGET_MS};`),
        resolveDir: 'src/lib',
      }));
      b.onLoad({ filter: /screens\/BuildScreen\.tsx$/ }, async (args) => ({
        loader: 'tsx',
        contents: readFileSync(args.path, 'utf8')
          .replace(/const HARD_STOP_GRACE_MS = [\d_]+;/, `const HARD_STOP_GRACE_MS = ${GRACE_MS};`),
        resolveDir: 'src/app/screens',
      }));
      /* The drawing is not what is under test here — the deadline's lifecycle
         and when a build is saved are. A real 22-second animation would make
         this a 30-second test, and jsdom has no canvas anyway. */
      b.onResolve({ filter: /lib\/swarm$/ }, () => ({ path: 'sw', namespace: 'sw' }));
      b.onLoad({ filter: /.*/, namespace: 'sw' }, () => ({
        loader: 'js',
        contents: `export const CURSOR_COLORS = ['#000'];
          export const MUSES = [{ name: 'x', role: 'y' }];
          export class Swarm {
            constructor() {}
            resize() {}
            get duration() { return 1000; }
            get workingSection() { return 0; }
            play(o) { setTimeout(() => o.onDone && o.onDone(), 120); }
            stop() {} finishAll() {} setSpeed() {}
          }
          export function summariseBlueprint() {
            return { sections: [{ index: 0, name: 'Hero', share: 1 }], boxes: 0, texts: 0, lines: 0, chars: 0 };
          }`,
      }));
      /* Measuring a real page in an iframe needs far more than a 900ms test
         budget, so the snapshot is stubbed to a tiny blueprint. What is under
         test is the deadline's lifecycle, not the measurer. */
      b.onResolve({ filter: /lib\/blueprint$/ }, () => ({ path: 'bp', namespace: 'bp' }));
      b.onLoad({ filter: /.*/, namespace: 'bp' }, () => ({
        loader: 'js',
        contents: `export async function snapshotHtml() {
          return { width: 1200, height: 2400, background: '#fff', ink: '#111', boxes: [], lines: [], texts: [], steps: [] };
        }`,
      }));
      b.onResolve({ filter: /lib\/db$/ }, () => ({ path: 'd', namespace: 'd' }));
      b.onLoad({ filter: /.*/, namespace: 'd' }, () => ({
        loader: 'js',
        contents: `export const saves = [];
          /* set by the pipeline when the page document exists; a save that
             happens before this is a save of something that was never built */

          export function storageAvailable(){return true}
          export class StorageUnavailable extends Error{}
          export async function getApiKey(){return 'FAKE'}
          export const usingFolder = () => false;
          export const folderName = () => null;
          export const folderSupported = () => false;
          export const rememberKeyForSession = () => {};
          export async function chooseFolder(){ return null; }
                    export async function getMedia(){return undefined}
          export async function saveProject(spec){
            saves.push({ title: spec && spec.meta && spec.meta.title, afterRender: !!(globalThis.__PIPE__ && globalThis.__PIPE__.rendered) });
            return 'p';
          } `,
      }));
    },
  }],
});

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
const w = dom.window;
globalThis.window = w; globalThis.document = w.document;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
globalThis.HTMLElement = w.HTMLElement; globalThis.Element = w.Element; globalThis.Node = w.Node;
globalThis.MutationObserver = w.MutationObserver;
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(1), 0);
globalThis.cancelAnimationFrame = () => {};
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.HTMLCanvasElement = w.HTMLCanvasElement;
/* jsdom has no 2D context; the canvas API is not what this test is about. */
const fakeCtx = new Proxy(
  { measureText: (t) => ({ width: String(t).length * 7 }), canvas: { width: 1200, height: 800 } },
  { get: (t, k) => (k in t ? t[k] : () => undefined), set: () => true }
);
w.HTMLCanvasElement.prototype.getContext = () => fakeCtx;

/* The pipeline records when the page document exists, so a save can be judged
   by whether there was anything to save. */
globalThis.__PIPE__ = { rendered: false };

const mod = await import(out.url);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SPEC = {
  meta: { title: 'Falcon Coffee', description: 'd', theme: 'editorial', accent: 'clay' },
  nav: { brand: 'Falcon', links: [] },
  sections: [
    { type: 'hero', headline: 'Coffee roasted here', sub: 'Weekly batches.' },
    { type: 'features', heading: 'What we do', items: [
      { title: 'Roast', body: 'Tuesday.' }, { title: 'Grind', body: 'To order.' }, { title: 'Ship', body: 'Same day.' }] },
    { type: 'contact', heading: 'Come by', form: true },
  ],
  footer: { note: 'Dammam' },
  voice: { register: 'plain', facts: [] },
};

let fail = 0;
const ok = (n, c, d = '') => { if (!c) { fail++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); } };

/* ── 1. a build that succeeds must never be failed by a stale deadline ───── */
{
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(SPEC) }] } }] }),
  });

  globalThis.__mountAt = Date.now();
  const a = mod.mountBuild(701);
  // let the pipeline run to a finished build
  await wait(BUDGET_MS + GRACE_MS + 600);
  const settled = (a.el.textContent ?? '').replace(/\s+/g, ' ');
  ok('the build got as far as drawing the page',
    /BUILT|Built|Canvas|Page/.test(settled), settled.slice(0, 160));

  /* Now wait past the deadline of a build that is already over. If the
     deadline was not cleared on success, it fires here and the store gets an
     error about a build that finished minutes ago. */
  await wait(BUDGET_MS + GRACE_MS + 3000);
  const after = (a.el.textContent ?? '').replace(/\s+/g, ' ');
  const storeErr = mod.useApp.getState().buildError;
  if (Date.now() > (globalThis.__probeAt ?? 0)) {
    globalThis.__probeAt = Date.now() + 1e9;
    /* one probe: does the armed deadline actually reach the store later? */
    console.log('    [dbg] elapsed since mount:', Date.now() - globalThis.__mountAt);
  }
  if (process.env.DBG) console.log('    [dbg] store.buildError =', JSON.stringify(storeErr), '| screen:', after.slice(0, 120));
  ok('a finished build is never failed by a stale deadline',
    !storeErr && !/Nothing was built|stopped|limit without finishing/.test(after),
    `store.buildError=${JSON.stringify(storeErr)} screen="${after.slice(0, 160)}"`);
  a.root.unmount();
}

/* ── 2. the build that fails is not the build that gets saved ───────────── */
{
  const before = mod.dbSaves.length;
  /* The model never answers: the request deadline stops it. */
  globalThis.fetch = () => new Promise(() => {});
  const b = mod.mountBuild(702);
  await wait(BUDGET_MS + GRACE_MS + 2500);
  const screen = (b.el.textContent ?? '').replace(/\s+/g, ' ');
  ok('a build that never got its page says so', /Nothing was built|ran out of time|limit/.test(screen),
    screen.slice(0, 160));
  ok('and nothing was written to Your sites for it',
    mod.dbSaves.length === before, `${mod.dbSaves.length - before} saves`);
  b.root.unmount();
}

/* ── 3. a build that DID finish is kept, and kept once ──────────────────── */
{
  const before = mod.dbSaves.length;
  /* a fresh page every case: this flag is what says a document exists */
  globalThis.__PIPE__ = { rendered: false };
  globalThis.fetch = async () => ({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(SPEC) }] } }] }),
  });
  const c = mod.mountBuild(703);
  /* The drawing itself is not what this test is about; it is capped, and the
     cap still fires onDone. Give it enough real time to reach it. */
  await wait(BUDGET_MS + GRACE_MS + 2500);
  if (process.env.DBG) console.log('    [dbg] screen:', (c.el.textContent ?? '').replace(/\s+/g, ' ').slice(0, 300));
  if (process.env.DBG) console.log('    [dbg] saves this run:', JSON.stringify(mod.dbSaves.slice(before)));
  ok('a finished build is saved exactly once',
    mod.dbSaves.length - before === 1, `${mod.dbSaves.length - before} saves`);
  ok('and it is saved only after a real page document exists',
    mod.dbSaves[mod.dbSaves.length - 1]?.afterRender === true,
    JSON.stringify(mod.dbSaves[mod.dbSaves.length - 1]));
  if (process.env.DBG) console.log('    [dbg] saved titles:', JSON.stringify(mod.dbSaves));
  c.root.unmount();
}

/* ── 4. a late deadline cannot rewrite a run it does not belong to ────────
   Ordering already stops most of this, but the guard is the belt to that
   braces: any timer that outlives its run — the module deadline, the watchdog,
   a retry that resolves late — must not be able to put an error on screen for
   a build that is not the one it was watching. */
{
  mod.useApp.setState({ runId: 801, buildError: '' });
  mod.failBuild('stale deadline for a build that no longer exists', 799);
  ok('a failure belonging to an old run is ignored',
    mod.useApp.getState().buildError === '',
    JSON.stringify(mod.useApp.getState().buildError));

  mod.failBuild('this run really did fail', 801);
  ok('a failure belonging to the current run still lands',
    mod.useApp.getState().buildError === 'this run really did fail',
    JSON.stringify(mod.useApp.getState().buildError));
}

console.log(fail === 0
  ? '\nFIRST RUN OK — a finished build is never failed by a stale deadline, and a failed build is never saved'
  : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
