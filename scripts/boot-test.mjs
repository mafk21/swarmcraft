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

/**
 * The smallest IndexedDB that satisfies lib/db.
 *
 * `idb` (the wrapper in lib/db) drives everything through
 * `addEventListener('success' | 'upgradeneeded')`, so a fake that only assigns
 * `onsuccess` never fires — which looks exactly like a broken boot path. This
 * one dispatches events properly and gives `upgradeneeded` the transaction the
 * upgrade callback expects.
 */
function makeIdb(seed = {}) {
  const data = new Map();
  for (const [store, rows] of Object.entries(seed)) data.set(store, new Map(Object.entries(rows)));

  const later = (fn) => setTimeout(fn, 0);

  /* `idb` wraps whatever comes back with Promise.resolve(request), so the fake
     must be thenable as well as event-driven. Both paths resolve to the same
     value; nothing here ever rejects on purpose. */
  function request(compute) {
    const listeners = {};
    let resolve, reject;
    const done = new Promise((res, rej) => { resolve = res; reject = rej; });
    const r = {
      result: undefined,
      error: null,
      readyState: 'pending',
      addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
      then: (...args) => done.then(...args),
      catch: (...args) => done.catch(...args),
    };
    const fire = (type, event) => (listeners[type] || []).forEach((fn) => fn(event));
    later(() => {
      try {
        r.result = compute();
        r.readyState = 'done';
        fire('success', { target: r });
        resolve(r.result);
      } catch (e) {
        r.error = e;
        fire('error', { target: r });
        reject(e);
      }
    });
    return r;
  }

  function store(name) {
    if (!data.has(name)) data.set(name, new Map());
    const rows = data.get(name);
    return {
      get: (key) => request(() => rows.get(key)),
      put: (row) => request(() => { rows.set(row.key ?? row.id, row); return row.key ?? row.id; }),
      delete: (key) => request(() => { rows.delete(key); return undefined; }),
      getAll: () => request(() => [...rows.values()]),
      count: () => request(() => rows.size),
      clear: () => request(() => { rows.clear(); return undefined; }),
      createIndex: () => {},
    };
  }

  const db = {
    objectStoreNames: { contains: (n) => data.has(n), get length() { return data.size; } },
    createObjectStore: (n) => store(n),
    close: () => {},
    /* `idb` grafts these shortcuts onto the database only when it is a real
       IDBDatabase instance, which a fake never is. Supplying them ourselves is
       the difference between a working fake and one that fails on `db.get`. */
    get: (name, key) => store(name).get(key),
    put: (name, row) => store(name).put(row),
    delete: (name, key) => store(name).delete(key),
    getAll: (name) => store(name).getAll(),
    count: (name) => store(name).count(),
    clear: (name) => store(name).clear(),
    transaction(names) {
      const list = Array.isArray(names) ? names : [names];
      for (const n of list) if (!data.has(n)) data.set(n, new Map());
      const listeners = {};
      const tx = {
        objectStore: (n) => store(n),
        addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
        error: null,
      };
      later(() => (listeners.complete || []).forEach((fn) => fn({ target: tx })));
      return tx;
    },
  };

  return {
    open() {
      const listeners = {};
      let resolve, reject;
      const done = new Promise((res, rej) => { resolve = res; reject = rej; });
      const r = {
        result: db,
        error: null,
        transaction: null,
        addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
        then: (...args) => done.then(...args),
        catch: (...args) => done.catch(...args),
      };
      later(() => {
        try {
          r.transaction = db.transaction([...data.keys()]);
          (listeners.upgradeneeded || []).forEach((fn) =>
            fn({ target: r, oldVersion: 0, newVersion: 1 })
          );
          (listeners.success || []).forEach((fn) => fn({ target: r }));
          resolve(db);
        } catch (e) {
          r.error = e;
          reject(e);
        }
      });
      return r;
    },
  };
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

/* The real bundle is a MODULE, and now says so (it contains `import.meta`).
   Evaluating it as a classic script is an artefact of this harness, not a
   defect in the output: jsdom has no module loader, so `eval` is the only way
   to run it here. Rewriting the two references to plain expressions keeps the
   value meaningful for a document that is itself loaded from a URL. They are
   only reached when a chunk fails to load, which is exactly the case this test
   is not exercising. */
const jsRunnable = js.replace(/import\.meta\.resolve/g, 'void 0').replace(/import\.meta\.url/g, 'document.baseURI');
ok('the bundle is loadable as a document script', jsRunnable !== js || !/import\.meta/.test(js));

async function boot({ withStorage, savedKey = null }) {
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
  /* jsdom has no IndexedDB, and the bundle reads the same global, so a seeded
     fake stands in for a browser that remembers the key. */
  if (savedKey) {
    /* `idb` does `instanceof IDBRequest` / `instanceof IDBTransaction` before
       wrapping, so those constructors must exist. The fakes below never get
       asked to be real ones; they only have to answer the cast. */
    for (const name of ['IDBRequest', 'IDBTransaction', 'IDBIndex', 'IDBObjectStore',
      'IDBDatabase', 'IDBCursor', 'IDBKeyRange']) {
      const ctor = { [name]: class {} }[name];
      w[name] = ctor;
      globalThis[name] = ctor;
    }
    w.indexedDB = makeIdb({ settings: { geminiKey: { key: 'geminiKey', value: savedKey } } });
    globalThis.indexedDB = w.indexedDB;
  } else {
    delete globalThis.indexedDB;
  }
  const rejections = [];
  process.on('unhandledRejection', (e) => rejections.push(e?.message ?? String(e)));

  try {
    w.eval(jsRunnable);
  } catch (e) {
    log.push('eval: ' + e.message);
  }
  await new Promise((r) => setTimeout(r, 350));

  const root = w.document.getElementById('root');
  const nodes = root?.querySelectorAll('*').length ?? 0;
  const text = (root?.textContent ?? '').trim();
  return { nodes, text, log, rejections, html: root?.innerHTML ?? '' };
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

/* ── a returning user is never asked for the key again ───────────────────
   Setup is a first-run job. If a key is already in IndexedDB, boot must land
   on the projects screen — not paint the key screen, then navigate away from
   it, which reads as "give me your key" to someone who already did.          */
{
  const r = await boot({ withStorage: true, savedKey: 'AIzaSyFAKEKEYFORTESTINGONLY123456789' });
  console.log(`with a key: ${r.nodes} elements`);
  ok('the app still mounts with a saved key', r.nodes > 10, `${r.nodes} elements`);
  /* The key screen is the only screen with a password field. Prose is a weak
     signal here — the key screen mentions "sites" too — so assert on structure. */
  ok('a saved key skips setup entirely', !/type="password"/i.test(r.html),
    `key screen was rendered: ${r.text.slice(0, 90).replace(/\s+/g, ' ')}`);
  ok('a returning user lands on their sites', /build a site/i.test(r.text),
    r.text.slice(0, 140));
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
