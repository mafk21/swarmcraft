/* ============================================================================
   The net of last resort, tested with every other net destroyed.

   Three times the build ran for 500-5000 seconds. Each time, every mechanism
   inside the build effect was already dead — cancelled by a teardown, or never
   restarted — and every suite was green because they all drove the happy paths.

   This test removes the request's own timeout entirely (4 hours) and hangs the
   network, so the ONLY thing that can end the build is a timer that lives
   outside the component. If that works, then no single failure inside the
   effect can hang the app. If it does not, this fails loudly.

   It needs a production bundle and three minutes. It is slow on purpose.
   ========================================================================== */
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { build as esbuild } from 'esbuild';
import { scratch } from './_scratch.mjs';
import * as IDB from 'fake-indexeddb';
import assert from 'node:assert/strict';

if (!existsSync('dist/index.html')) {
  console.log('  FAIL  dist/ is missing — run `npm run build` first');
  process.exit(1);
}

/* Build a variant bundle whose model call can never time out, so that the
   request scoped deadline cannot be the thing that saves us. */
const out = scratch('lastresort.js');
await esbuild({
  entryPoints: ['src/main.tsx'],
  bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic',
  outfile: out.path, logLevel: 'silent',
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.css': 'empty' },
  plugins: [
    {
      name: 'no-request-timeout',
      setup(b) {
        /* resolve the import explicitly so the rewrite lands on the real file */
        b.onResolve({ filter: /gemini$/ }, () => ({
          path: resolve('src/lib/gemini.ts'),
          namespace: 'nogemini',
        }));
        b.onLoad({ filter: /.*/, namespace: 'nogemini' }, () => ({
          loader: 'ts',
          contents: readFileSync(resolve('src/lib/gemini.ts'), 'utf8').replace(
            'const allowed = Math.min(TIMEOUT_MS, remaining);',
            'const allowed = 4 * 60 * 60 * 1000; // test: never times out'
          ),
          resolveDir: resolve('src/lib'),
        }));
      },
    },
    {
      name: 'url-imports',
      setup(b) {
        b.onResolve({ filter: /\?url$/ }, () => ({ path: 'u', namespace: 'urlstub' }));
        b.onLoad({ filter: /.*/, namespace: 'urlstub' }, () => ({ contents: 'export default "x";', loader: 'js' }));
      },
    },
  ],
});

/* Prove the rewrite actually landed. esbuild prints the product as `4*60*60*1e3`,
   so check for the expression rather than a single number. */
const built = readFileSync(out.path, 'utf8');
assert.ok(
  /allowed\s*=\s*4\s*\*\s*60\s*\*\s*60/.test(built),
  'the request timeout must really be removed, or this test proves nothing'
);
assert.ok(
  !/Math\.min\(TIMEOUT_MS/.test(built),
  'the original timeout clamp must be gone'
);

/* jsdom cannot load modules; the two import.meta uses only run on a failed
   chunk load, which this test never triggers */
const js = readFileSync(out.path, 'utf8')
  /* esbuild leaves import.meta.env for vite to define; define it here the same
     way vite does */
  .replace(/import\.meta\.env/g, '({MODE:"test",DEV:true,PROD:false,SSR:false})')
  .replace(/import\.meta\.resolve/g, 'void 0')
  .replace(/import\.meta\.url/g, 'document.baseURI');
const dom = new JSDOM('<!doctype html><div id="root"></div>', {
  url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
w.requestAnimationFrame = (cb) => setTimeout(() => cb(1), 16);
w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
w.HTMLCanvasElement.prototype.getContext = () => null;
for (const n of ['indexedDB', 'IDBKeyRange', 'IDBRequest', 'IDBOpenDBRequest', 'IDBIndex',
  'IDBObjectStore', 'IDBCursor', 'IDBCursorWithValue', 'IDBDatabase', 'IDBTransaction',
  'IDBVersionChangeEvent']) {
  w[n] = IDB[n];
  globalThis[n] = IDB[n];
}

/* The model hangs forever; the key PROBE answers normally.
   Setup now makes a real generateContent call rather than listing models —
   listing proves nothing, since a retired model is still listed. The two
   calls are told apart by their prompt: the probe asks for one word. */
w.fetch = (u, init) => {
  const body = String(init?.body ?? '');
  if (body.includes('Reply with the single word')) {
    return Promise.resolve({
      ok: true, status: 200,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ready' }] } }] }),
    });
  }
  return new Promise(() => {});
};
globalThis.fetch = w.fetch;

w.eval(js);
await new Promise((r) => setTimeout(r, 300));

const root = w.document.getElementById('root');
const type = (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
};
const click = async (el, ms = 350) => {
  assert.ok(el, 'expected something to click');
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, ms));
};
const bt = (re) => [...root.querySelectorAll('button')].find((b) => re.test((b.textContent || '').trim()));

/* walk the funnel the way a person does */
type(root.querySelector('input'), 'AIzaSyFAKEKEYFORTESTINGONLY123456789');
await new Promise((r) => setTimeout(r, 100));
await click(bt(/save and continue/i), 900);
await click(bt(/build a site/i), 400);
await click(bt(/^\s*Store(?=[A-Z]|\s|$)/), 300);
await click(bt(/^\s*Continue\s*$/i), 400);
type(root.querySelector('input'), 'Falcon');
type(root.querySelector('textarea'), 'We roast beans in Dammam and ship them across the Kingdom in two days.');
await new Promise((r) => setTimeout(r, 80));
await click(bt(/^\s*Continue\s*$/i), 400);
await click(bt(/^\s*Continue\s*$/i), 400);
await click(bt(/choose/i), 300);
const card = [...root.querySelectorAll('button')].find((b) => /editorial/i.test(b.textContent || ''));
if (card) await click(card, 200);

const started = Date.now();
await click(root.querySelector('button.btn-primary'), 100);

/* budget 80s + 5s grace; allow a slow box, but never beyond 100s */
const LIMIT = 100_000;
let stopped = false;
while (Date.now() - started < LIMIT + 10_000) {
  await new Promise((r) => setTimeout(r, 500));
  const copy = (root.textContent || '').replace(/\s+/g, ' ');
  if (/It stopped before it started/.test(copy)) { stopped = true; break; }
}
const took = Date.now() - started;
const copy = (root.textContent || '').replace(/\s+/g, ' ');

assert.ok(
  stopped,
  `with the request unable to time out, the build must still end itself. after ${Math.round(took / 1000)}s it read: ${copy.slice(0, 200)}`
);
assert.ok(took < LIMIT, `must stop inside the budget, took ${Math.round(took / 1000)}s`);
assert.match(copy, /still on|ran out of time|did not finish/, 'it must say why');
assert.doesNotMatch(copy, /WRITING THE PAGE/i, 'the working screen must be replaced by the failure screen');

console.log(
  `LASTRESORT OK — request timeout removed, network hung: the build still stopped itself in ${Math.round(
    took / 1000
  )}s and said why`
);
process.exit(0);
