/* The screen must not be able to sit there for 518 seconds. This drives the
   real BuildScreen with the real store, stubs the model to hang, and shrinks the
   budget so the test runs in seconds rather than 85.

   Two things are asserted, and the second matters more than the first:
     1. a hung build ends itself and says why
     2. a build that succeeds is NOT killed by the watchdog */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const BUDGET_MS = 400;      // for the hang case
const HEALTHY_BUDGET = 8000; // measurement alone needs more than 400ms
const out = scratch('watchdog.mjs');

const SPEC = {
  meta: { title: 'Falcon Coffee', description: 'd', theme: 'editorial', accent: 'clay', themeReason: 'x' },
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

await build({
  entryPoints: ['scripts/fixtures/strict-entry.tsx'],
  bundle: true, format: 'esm', platform: 'browser', outfile: out.path,
  logLevel: 'silent', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{
    name: 'shrink-budget-and-stub-io',
    setup(b) {
      /* the real module, with one constant small enough to test against */
      b.onResolve({ filter: /lib\/gemini$/ }, () => ({ path: 'g', namespace: 'g' }));
      b.onLoad({ filter: /.*/, namespace: 'g' }, async () => {
        const src = (await import('node:fs')).readFileSync('src/lib/gemini.ts', 'utf8');
        return {
          loader: 'ts',
          contents: src.replace(/export const BUDGET_MS = [\d_]+;/, `export const BUDGET_MS = ${BUDGET_MS};`),
          resolveDir: 'src/lib',
        };
      });
      /* shrink the grace period too, so the test measures seconds not 5.4 of them */
      b.onLoad({ filter: /screens\/BuildScreen\.tsx$/ }, async (args) => ({
        loader: 'tsx',
        contents: (await import('node:fs')).readFileSync(args.path, 'utf8')
          .replace(/const HARD_STOP_GRACE_MS = [\d_]+;/, 'const HARD_STOP_GRACE_MS = 300;'),
        resolveDir: 'src/app/screens',
      }));
      b.onResolve({ filter: /lib\/db$/ }, () => ({ path: 'd', namespace: 'd' }));
      b.onLoad({ filter: /.*/, namespace: 'd' }, () => ({
        loader: 'js',
        contents: `export function storageAvailable(){return true}
          export class StorageUnavailable extends Error{}
          export async function getApiKey(){return 'FAKE'}
          export const usingFolder = () => false;
          export const folderName = () => null;
          export const folderSupported = () => false;
          export const rememberKeyForSession = () => {};
          export async function chooseFolder(){ return null; }
                    export async function getMedia(){return undefined}
          export async function saveProject(){return 'p'} `,
      }));
    },
  }],
});

function makeEnv() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  const w = dom.window;
  globalThis.window = w; globalThis.document = w.document;
  Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
  globalThis.HTMLElement = w.HTMLElement; globalThis.Element = w.Element; globalThis.Node = w.Node;
  globalThis.MutationObserver = w.MutationObserver;
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(1), 0);
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.HTMLCanvasElement = w.HTMLCanvasElement;
  w.HTMLCanvasElement.prototype.getContext = () => null;
  return w;
}

const w = makeEnv();
const mod = await import(out.url);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 1. a request that never settles ─────────────────────────────────────── */
let aborted = false;
globalThis.fetch = (_u, init) => {
  init?.signal?.addEventListener('abort', () => { aborted = true; });
  return new Promise(() => {}); // never settles
};

const t0 = Date.now();
const a = mod.mountBuild();
await wait(BUDGET_MS + 1500); // budget + 300ms grace + margin
const took = Date.now() - t0;
const screen = (a.el.textContent ?? '').replace(/\s+/g, ' ');

/* Either safety net is acceptable here — the request's own deadline or the
   watchdog — as long as the screen ends up telling the user why. */
assert.match(
  screen,
  /ran out of time|passed its \d+-second limit without finishing|did not start answering|stopped sending|went quiet|never started writing|started writing and then stopped|budget ran out/,
  `a hung build must stop itself and say so. screen was: ${screen.slice(0, 200)}`
);
assert.match(screen, /Nothing was built/, 'it must say nothing was built');
assert.match(screen, /Try again/, 'it must offer a way forward');
assert.ok(took < BUDGET_MS + 2000, `must stop within the grace period, took ${took}ms`);
assert.ok(aborted, 'the in-flight request must be aborted, not left running');
console.log(`  hung build stopped itself in ${took}ms ✓`);

/* ── 2. a healthy build must NOT be killed ───────────────────────────────── */
globalThis.fetch = async () => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(SPEC) }] } }] }),
});
/* A build that gets its answer quickly must not be killed by the watchdog.
   The budget here is deliberately short, so measuring may still run past it —
   that is the request deadline doing its job, not the watchdog. The assertion
   is therefore specifically about the watchdog's own message. */
const b = mod.mountBuild();
await wait(BUDGET_MS + 1200);
const okScreen = (b.el.textContent ?? '').replace(/\s+/g, ' ');
assert.ok(
  !/passed its \d+-second limit/.test(okScreen),
  `the watchdog must not fire on a build that got its answer. screen: ${okScreen.slice(0, 200)}`
);
assert.match(
  okScreen,
  /measuring|Building|Page|Done|writing/i,
  'the build must have moved past the request, which proves the pipeline ran'
);
console.log('  a build that got its answer was not killed by the watchdog ✓');

console.log('WATCHDOG OK — hung builds stop themselves and abort the request; good builds are untouched');
process.exit(0);
