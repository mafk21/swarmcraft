/* ============================================================================
   "There is no place to see my past works."

   Two things made that true, and neither was a missing screen — the screen
   existed the whole time. First, a build was never SAVED: it lived in memory
   until the user pressed Save on the result screen, so anyone who closed the
   tab, or never noticed the button, had an empty history forever. Second, the
   result screen hid the header, so there was no way back to the list.

   This drives a real build and then asks the database what exists.
   ========================================================================== */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { JSDOM } from 'jsdom';

const out = scratch('history.mjs');
const SPEC = {
  meta: { title: 'Falcon Coffee', description: 'Roasted in Dammam.', theme: 'editorial', accent: 'clay', themeReason: 'x' },
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

/* A real in-memory idb, so "was it saved" is answered by a database and not by
   a spy on saveProject. */
const store = new Map();

await build({
  entryPoints: ['scripts/fixtures/strict-entry.tsx'],
  bundle: true, format: 'esm', platform: 'browser', outfile: out.path,
  logLevel: 'silent', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{
    name: 'stub-storage',
    setup(b) {
      b.onResolve({ filter: /lib\/db$/ }, () => ({ path: 'd', namespace: 'd' }));
      b.onLoad({ filter: /.*/, namespace: 'd' }, () => ({
        loader: 'js',
        contents: `const store = globalThis.__STORE__;
          export function storageAvailable(){return true}
          export class StorageUnavailable extends Error{}
          export async function getApiKey(){return 'AQ.Ab8Xk2nQ9wBiA_TESTKEY_123456789'}
          export const usingFolder = () => false;
          export const folderName = () => null;
          export const folderSupported = () => false;
          export const rememberKeyForSession = () => {};
          export async function chooseFolder(){ return null; }
                    export async function setApiKey(){}
          export async function clearApiKey(){}
          let n = 0;
          export async function saveProject(spec, opts = {}) {
            globalThis.__SAVECALLS__ = (globalThis.__SAVECALLS__ ?? 0) + 1;
            const id = opts.id ?? 'proj-' + (++n);
            store.set(id, { id, name: spec.meta.title, kind: opts.kind ?? null,
              created: Date.now(), updated: Date.now(), spec });
            return id;
          }
          export async function listProjects(){ return [...store.values()] }
          export async function getProject(id){ return store.get(id) }
          export async function renameProject(){}
          export async function deleteProject(id){ store.delete(id) }
          export async function countProjects(){ return store.size }
          export async function addMedia(){return 'm1'}
          export async function listMedia(){return []}
          export async function getMedia(){return undefined}
          export async function deleteMedia(){}
          export async function inlineMedia(h){return h}`,
      }));
    },
  }],
});

globalThis.__STORE__ = store;

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
const w = dom.window;
globalThis.window = w; globalThis.document = w.document;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
for (const k of ['HTMLElement', 'Element', 'Node', 'MutationObserver', 'Blob', 'URL', 'DOMException'])
  globalThis[k] = w[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(1), 0);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
w.requestAnimationFrame = globalThis.requestAnimationFrame;
w.cancelAnimationFrame = globalThis.cancelAnimationFrame;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.HTMLCanvasElement = w.HTMLCanvasElement;
/* a no-op 2D context: the swarm renders for real, it just does not paint */
const ctx = new Proxy(
  { measureText: (t) => ({ width: String(t).length * 7 }), canvas: { width: 2800, height: 1720 } },
  { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? () => undefined : undefined), set: () => true }
);
w.HTMLCanvasElement.prototype.getContext = () => ctx;

/* the model answers instantly with a good page */
globalThis.fetch = async () => ({
  ok: true, status: 200,
  headers: { get: () => 'application/json' },
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(SPEC) }] } }] }),
});
w.fetch = globalThis.fetch;

let fail = 0;
const ok = (n, c, d = '') => { if (!c) { fail++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); } };

const mod = await import(out.url);

const before = store.size;
ok('nothing is saved before a build', before === 0, `${before} rows`);

mod.mountBuild();
/* a full build: model, measure, animation. Generous, but the test is about the
   database, not the clock. */
await new Promise((r) => setTimeout(r, 30_000));

const after = [...store.values()];
ok('finishing a build SAVES it, without being asked', after.length === 1,
  `${after.length} rows in the database`);
ok('what was saved is the page that was built',
  after[0] && after[0].spec?.meta?.title === 'Falcon Coffee',
  after[0] ? JSON.stringify(after[0].spec?.meta?.title) : 'nothing saved');
ok('it is listed as a site, so "Your sites" can show it',
  after[0] && typeof after[0].name === 'string' && after[0].name.length > 0,
  after[0]?.name);
ok('it records when it was made, for the history ordering',
  after[0] && typeof after[0].updated === 'number', String(after[0]?.updated));

console.log(fail === 0
  ? '\nHISTORY OK — a finished build is in the database, so it appears in "Your sites"'
  : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
