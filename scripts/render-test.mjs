/* Renders the real screens in jsdom, mounted the way the app mounts them.
   This is the only thing that can catch a hooks violation: the rule is about
   the ORDER hooks are called across renders, which no amount of importing
   modules or calling functions directly will surface. */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const WORKER = pathToFileURL(resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')).href;

const out = scratch('render.bundle.mjs');
await build({
  entryPoints: ['scripts/fixtures/render-entry.tsx'],
  bundle: true, format: 'esm', platform: 'browser',
  outfile: out.path, logLevel: 'silent',
  jsx: 'automatic',
  /* Vite's `?url` suffix means nothing to esbuild */
  plugins: [{
    name: 'url-imports',
    setup(b) {
      b.onResolve({ filter: /\?url$/ }, () => ({ path: 'u', namespace: 'urlstub' }));
      b.onLoad({ filter: /.*/, namespace: 'urlstub' }, () => ({
        contents: `export default ${JSON.stringify(WORKER)};`, loader: 'js',
      }));
    },
  }],
  define: { 'process.env.NODE_ENV': '"development"' },
});

const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
const { window } = dom;

/* the globals React and the store touch */
globalThis.window = window;
globalThis.document = window.document;
/* node 22 defines a read-only global navigator */
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.MutationObserver = window.MutationObserver;
globalThis.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

/* Without these React logs "not configured to support act" on every render and
   the real errors are impossible to pick out of the noise. */
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.IS_REACT_ACT_ENVIRONMENT = true;

const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

const mod = await import(out.url);
const { useApp, act } = mod;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function settle(ms = 40) {
  return new Promise((r) => window.setTimeout(r, ms));
}

const results = [];

for (const { name, setup, expectText } of mod.CASES) {
  errors.length = 0;
  const root = mod.mount(setup);
  await settle();
  const text = root.textContent ?? '';
  const html = root.innerHTML ?? '';
  /* input values live in the property, not the text content — checking only
     textContent would miss every field in the app */
  const fieldValues = [...root.querySelectorAll('input,textarea')].map((el) => el.value).join(' | ');

  const hookError = errors.find((e) => /hook|Rendered more|Rendered fewer/i.test(e));
  assert.ok(!hookError, `${name}: React reported a hook error — ${hookError}`);

  for (const t of expectText) {
    assert.ok(
      text.includes(t) || fieldValues.includes(t),
      `${name}: expected "${t}" on screen.\n  got: ${text.slice(0, 240).replace(/\s+/g, ' ')}`
    );
  }

  const crashed = errors.find((e) => /The above error occurred|Cannot read|is not a function/i.test(e));
  assert.ok(!crashed, `${name}: render crashed — ${crashed}`);

  results.push(`${name} (${html.length}b)`);
  mod.unmount(root);
}

/* THE DISCRIMINATING CASE. Rendering the brief screen once with no kind and
   then setting one changes how many hooks run between two renders of the same
   mounted component. If `showDetail` sits below the early return, React throws
   "Rendered fewer hooks than expected" on the second render and the screen goes
   blank. Verified by putting the hook back below the return: this assertion
   fails, so it is measuring the mechanism and not just the happy path. */
errors.length = 0;
const hb = mod.briefThenKind();
await settle();
act(() => {
  useApp.setState({ kind: 'store' });
});
await settle();
const hookErr = errors.find((e) => /hook/i.test(e));
assert.ok(!hookErr, `hook order broke when kind arrived: ${hookErr}`);
assert.ok(
  (hb.el.textContent ?? '').includes('Write the brief in your own words'),
  'the brief screen must render after the kind arrives'
);
act(() => hb.root.unmount());
hb.el.remove();

/* every screen in the funnel, mounted cold, with a plausible session */
errors.length = 0;
for (const step of mod.STEPS) {
  const root = mod.mount(mod.atStep(step));
  await settle();
  const t = root.textContent ?? '';
  assert.ok(t.trim().length > 0, `step "${step}" rendered nothing at all`);
  const hookError = errors.find((e) => /hook/i.test(e));
  assert.ok(!hookError, `step "${step}": ${hookError}`);
  results.push(`${step} (${t.length}c)`);
  mod.unmount(root);
}

console.error = origError;
console.log(`RENDER OK — ${results.join(', ')}`);
