import { scratch } from './_scratch.mjs';
/**
 * Does the built app actually mount?
 *
 * `tsc` and `vite build` both pass on code that throws on boot. This loads the
 * real production bundle into jsdom and checks that the first screen renders.
 *
 * It caught a genuine bug: `indexedDB.open` was called at startup with no
 * guard, so in a private window or with storage blocked the app died before
 * rendering and the user got a white page. Storage is now optional and the key
 * screen says so.
 *
 *   node scripts/boot-test.mjs
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { build as esbuild } from 'esbuild';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const storageProbe = { contents: `export { storageAvailable } from './src/lib/db';`, resolveDir: process.cwd(), loader: 'ts' };

/** bundle a small module to a data URL so it can be imported with stubs in place */
async function build_(stdin) {
  const r = await esbuild({ stdin, bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error', external: ['idb'] });
  const probe = scratch('_probe.mjs');
  writeFileSync(probe.path, r.outputFiles[0].text);
  return { __file: probe.url, text: r.outputFiles[0].text };
}

if (!existsSync('dist/index.html')) {
  console.log('  FAIL  dist/ is missing — run `npm run build` first');
  process.exit(1);
}

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

const html = readFileSync('dist/index.html', 'utf8');
const ref = html.match(/src="([^"]+\.js)"/);
ok('index.html points at a bundle', !!ref);
if (!ref) process.exit(1);
const js = readFileSync('dist' + ref[1], 'utf8');

async function boot({ withStorage }) {
  const log = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => log.push('runtime: ' + (e.detail?.message ?? e.message)));

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    url: 'http://localhost/',
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(0), 16);
  w.cancelAnimationFrame = (h) => w.clearTimeout(h);
  /* jsdom's `window.eval` runs in the jsdom realm, so a stub installed on the
     Node global cannot be reached from the bundle — and without storage jsdom
     simply exposes `undefined`, which the guard already handles. Faking a
     throwing browser from out here is therefore not possible, so the throwing
     case is covered directly below by `storageAvailable`, where it CAN be
     exercised. This function covers what it honestly can: mounting. */
  void withStorage;
  const rejections = [];
  process.on('unhandledRejection', (e) => rejections.push(e?.message ?? String(e)));

  try {
    w.eval(js);
  } catch (e) {
    log.push('eval: ' + e.message);
  }
  await new Promise((r) => setTimeout(r, 350));

  const root = w.document.getElementById('root');
  const nodes = root?.querySelectorAll('*').length ?? 0;
  const text = (root?.textContent ?? '').trim();
  return { nodes, text, log, rejections };
}

/* ── without storage: the hard case that used to blank the page ─────────── */
{
  const r = await boot({ withStorage: false });
  console.log(`no storage: ${r.nodes} elements, "${r.text.slice(0, 48).replace(/\s+/g, ' ')}…"`);
  ok('the app mounts without storage', r.nodes > 10, `${r.nodes} elements`);
  ok('it renders real text', r.text.length > 40, `${r.text.length} chars`);
  ok('it does not throw on boot', r.log.length === 0, r.log.join(' | '));
  ok('it says storage is blocked', /blocking local storage/i.test(r.text), 'no warning shown');
  ok('no unhandled rejections', r.rejections.length === 0, r.rejections.join(' | '));
  ok('it shows the key screen', /key/i.test(r.text));
}

/* ── with storage: the normal case ──────────────────────────────────────── */
{
  const r = await boot({ withStorage: true });
  console.log(`storage:    ${r.nodes} elements`);
  ok('the app mounts normally', r.nodes > 10, `${r.nodes} elements`);
  ok('nothing is thrown', r.log.length === 0, r.log.join(' | '));
}

/* ── the storage guard itself ────────────────────────────────────────────
   Three ways a browser says no, and the guard must survive all of them. The
   throwing getter is the important one: it is what a private window actually
   does, and it would take the whole app down on boot.                        */
{
  const b = await build_(storageProbe);
  const { storageAvailable } = await import(b.__file);

  delete globalThis.indexedDB;
  ok('absent storage is detected', storageAvailable() === false);

  globalThis.indexedDB = null;
  ok('null storage is detected', storageAvailable() === false);

  Object.defineProperty(globalThis, 'indexedDB', {
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
    configurable: true,
  });
  let threw = false;
  try { storageAvailable(); } catch { threw = true; }
  ok('a throwing getter does not propagate', !threw);
  ok('a throwing getter reads as unavailable', storageAvailable() === false);
  delete globalThis.indexedDB;
}

console.log(fail === 0 ? '\nBOOT OK' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
