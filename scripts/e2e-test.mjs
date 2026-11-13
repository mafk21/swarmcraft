/* ============================================================================
   The test that should have caught this twice and did not.

   Every other suite mounts a screen the way a test mounts it, or calls the
   library directly. The user's browser does neither: it parses index.html,
   runs the hashed bundle, and React StrictMode double-mounts from the app's
   own entry point. Twice now a build hung for 500+ seconds while all of my
   suites were green.

   So: build for real, run the real bundle in jsdom, and drive it through the
   ACTUAL DOM — click the buttons, tick the sections, wait. No internal
   imports, no store pokes. If the user can do it, this does it.
   ========================================================================== */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import * as IDB from 'fake-indexeddb';

import assert from 'node:assert/strict';

if (!existsSync('dist/index.html')) {
  console.log('  FAIL  dist/ is missing — run `npm run build` first');
  process.exit(1);
}

const html = readFileSync('dist/index.html', 'utf8');
const ref = html.match(/src="([^"]+\.js)"/);
assert.ok(ref, 'index.html must reference a bundle');

let js = readFileSync('dist' + ref[1], 'utf8');
/* jsdom has no module loader; the two import.meta uses are only reached on a
   failed chunk load, which this test does not exercise. */
js = js.replace(/import\.meta\.resolve/g, 'void 0').replace(/import\.meta\.url/g, 'document.baseURI');

const SPEC = {
  meta: { title: 'Falcon Coffee', description: 'Roasted in Dammam.', theme: 'editorial', accent: 'clay', themeReason: 'Quiet.' },
  nav: { brand: 'Falcon', links: [] },
  sections: [
    { type: 'hero', headline: 'Coffee roasted here', sub: 'Small batches, weekly.' },
    { type: 'features', heading: 'What we do', items: [
      { title: 'Roast', body: 'Every Tuesday.' }, { title: 'Grind', body: 'To order.' }, { title: 'Ship', body: 'Same day.' }] },
    { type: 'contact', heading: 'Come by', email: 'hi@falcon.co', form: true },
  ],
  footer: { note: 'Dammam' },
  voice: { register: 'plain', facts: [] },
};

const HANG = process.argv.includes('--hang');

const log = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => log.push('jsdom: ' + (e.detail?.message ?? e.message)));

const dom = new JSDOM(html.replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/, ''), {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const w = dom.window;

w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(Date.now()), 16);
w.cancelAnimationFrame = (h) => w.clearTimeout(h);
w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
w.HTMLCanvasElement.prototype.getContext = () => null;
/* jsdom has no IndexedDB. Without one the app correctly refuses to save the
   key and the walk stops on the first screen — so the test would never reach
   the code it exists to exercise. Give the window a real implementation. */
/* `idb` references these by bare name inside the bundle, and a bare reference
   resolves against the window that eval'd it — so they all have to be here. */
for (const name of [
  'indexedDB', 'IDBKeyRange', 'IDBRequest', 'IDBOpenDBRequest', 'IDBIndex',
  'IDBObjectStore', 'IDBCursor', 'IDBCursorWithValue', 'IDBDatabase',
  'IDBTransaction', 'IDBVersionChangeEvent',
]) {
  w[name] = IDB[name];
  globalThis[name] = IDB[name];
}

/* storage: a working in-memory IndexedDB is a lot to fake, so the key is
   injected through the same store the app uses — but everything AFTER that is
   driven by clicking, which is the part that was broken. */
let fetches = 0;
let lastAbort = false;
const signalLog = [];
w.fetch = (url, init) => {
  fetches++;
  const sig = init?.signal;
  signalLog.push(sig ? (sig.aborted ? 'aborted' : 'live') : 'no-signal');
  sig?.addEventListener('abort', () => { lastAbort = true; console.log('[signal aborted]'); });
  if (HANG) return new Promise(() => {});
  return Promise.resolve({
    ok: true, status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(SPEC) }] } }] }),
  });
};
const realFetch = w.fetch;
globalThis.fetch = realFetch;

const errors = [];
vc.on('error', (e) => errors.push(String(e)));

w.eval(js);
await new Promise((r) => setTimeout(r, 300));

const root = w.document.getElementById('root');
const txt = () => (root.textContent || '').replace(/\s+/g, ' ').trim();
assert.ok(root.querySelectorAll('*').length > 3, 'the app must mount');

/* ── drive it by clicking, the way a person would ──────────────────────── */
const byText = (sel, re) =>
  [...root.querySelectorAll(sel)].find((el) => re.test((el.textContent || '').trim()));

/**
 * React tracks input values through a property descriptor, so assigning
 * `el.value` directly is invisible to it and every controlled form stays
 * disabled. Go through the native setter, then fire the event React listens for.
 */
function type(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
}

/** click, then let React and its effects settle */
async function click(el, settle = 250) {
  assert.ok(el, 'expected an element to click');
  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, settle));
}

/* the key screen: type a key and submit */
const keyInput = root.querySelector('input');
assert.ok(keyInput, 'the key screen must show an input');
type(keyInput, 'AIzaSyFAKEKEYFORTESTINGONLY123456789'); // >20 chars or the screen refuses it
await new Promise((r) => setTimeout(r, 60));
/* the key screen's button is "Save and continue"; it calls testKey first */
/* setup makes a real generateContent probe now, not a models.list call */
w.fetch = (u, init) =>
  Promise.resolve({
    ok: true, status: 200,
    json: async () =>
      String(init?.body ?? '').includes('Reply with the single word')
        ? { candidates: [{ content: { parts: [{ text: 'ready' }] } }] }
        : { models: [] },
  });
globalThis.fetch = w.fetch;
await click(byText('button', /save and continue|test|save/i), 900);
w.fetch = realFetch;
globalThis.fetch = realFetch;

/* sites → new site */
const newSite = byText('button', /build a site|new site|start|begin/i);
assert.ok(newSite, `the projects screen must offer a way to start. screen: ${txt().slice(0, 200)}`);
await click(newSite, 400);

/* pick a kind */
/* the kind cards carry their label AND their blurb in one button */
/* the label is concatenated with its blurb, so there is no word boundary
   between "Store" and "Sell" — match on the label alone */
const store = byText('button', /^\s*Store(?=[A-Z]|\s|$)/);
assert.ok(store, `the kind screen must offer a store. screen: ${txt().slice(0, 220)}`);
await click(store, 300);
/* choosing a kind only selects it; the bar's Continue moves on */
await click(byText('button', /^\s*Continue\s*$/i), 400);

/* brief */
const nameIn = root.querySelector('input');
if (nameIn) type(nameIn, 'Falcon Coffee');
const ta = root.querySelector('textarea');
assert.ok(
  ta,
  `the brief screen must show the prompt box. screen: ${txt().slice(0, 240)} | buttons: ${[...root.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).join(' | ')}`
);
type(ta, 'We roast single-origin beans in Dammam and ship them across the Kingdom in two days.');
await new Promise((r) => setTimeout(r, 60));
await click(byText('button', /^continue/i), 300);

/* sections */
if (byText('button', /^continue/i)) await click(byText('button', /^continue/i), 300);

/* theme */
if (byText('button', /choose/i)) await click(byText('button', /choose/i), 300);
const themeCard = [...root.querySelectorAll('button')].find((b) => /editorial|studio|retail|nordic|minimal/i.test(b.textContent || ''));
if (themeCard) await click(themeCard, 200);

/* build */
/* NOT a bare /build/ — the step rail contains a "5Build" nav button, and
   matching that would silently skip the whole screen. The primary action is
   the only `.btn-primary` on the theme screen. */
const buildBtn =
  root.querySelector('button.btn-primary') ?? byText('button', /build my page/i);
assert.ok(buildBtn, `expected a build button. screen: ${txt().slice(0, 200)}`);
await click(buildBtn, 100);

const started = Date.now();
assert.equal(fetches, 1, `the build must issue ONE request, got ${fetches}. screen: ${txt().slice(0, 200)}`);

/* ── the assertion that matters ───────────────────────────────────────── */
if (HANG) {
  /* with a model that never answers, the screen must give up inside the
     budget + grace. Allow a generous margin for a slow CI box. */
  /* budget 80s + 5s clock grace + slack for a slow box */
  const LIMIT = 88_000;
  let stopped = false;
  while (Date.now() - started < LIMIT + 5_000) {
    await new Promise((r) => setTimeout(r, 500));
    /* Careful: the clock shows "past the 25s limit for this step" at 25
       seconds — that is a warning, not a stop. Matching on "limit" made an
       earlier version of this test pass while the build was still running. */
    const copy = txt();
    if (/it stopped before it started|nothing was built|was still on \"|ran out of time|try again|change the brief/i.test(copy)) {
      stopped = true;
      break;
    }
  }
  const took = Date.now() - started;
  const screen = txt().slice(0, 240);
  assert.ok(stopped, `a hung build must stop itself. after ${took}ms the screen still read: ${screen}`);
  assert.ok(took < LIMIT, `must stop within the budget, took ${took}ms`);
  assert.ok(
    lastAbort,
    `the in-flight request must be aborted. signals seen: ${signalLog.join(', ')}; screen: ${screen.slice(0, 160)}`
  );
  console.log(`E2E OK — clicking the real bundle: one request, hung build stopped itself in ${Math.round(took / 1000)}s, screen: "${screen.slice(0, 80)}"`);
} else {
  /* a good answer must actually produce a page */
  let done = false;
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 500));
    /* the built page is rendered inside the preview iframe, not in the app's
       own DOM, so look there as well as at the hud */
    /* jsdom does not parse `srcdoc` into the frame's document, so assert on
       the attribute itself — that is the exact markup a browser renders. */
    const frame = root.querySelector('iframe');
    const srcdoc = frame?.getAttribute('srcdoc') ?? '';
    if (/coffee roasted here/i.test(srcdoc) && srcdoc.length > 1000) { done = true; break; }
    if (/it stopped before it started|ran out of time/i.test(txt())) break;
  }
  assert.ok(done, `a good build must render the page. screen: ${txt().slice(0, 240)}`);
  console.log('E2E OK — typing, clicking and building through the real bundle produced the page');
}
process.exit(0);
