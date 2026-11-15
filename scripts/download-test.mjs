/* ============================================================================
   Can the user actually GET the file?

   The export button was dead in Chrome and every existing test passed, because
   they all tested the DOCUMENT (does the HTML stand alone?) and none of them
   tested the DELIVERY (does clicking the button produce a file?).

   The bug was a browser rule: `showSaveFilePicker` and anchor downloads must
   fire inside a user gesture. The code awaited page rendering and media
   inlining first, which spent the gesture, so the picker threw and the anchor
   was inert — while the UI reported success.

   This drives the real export code with a picker that enforces the rule: it
   throws NotAllowedError unless it is called synchronously from the click.
   ========================================================================== */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { JSDOM } from 'jsdom';

const out = scratch('download.mjs');
await build({
  entryPoints: ['scripts/fixtures/result-entry.tsx'],
  bundle: true, format: 'esm', platform: 'browser', outfile: out.path,
  logLevel: 'silent', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [{
    name: 'stub-storage',
    setup(b) {
      b.onResolve({ filter: /lib\/db$/ }, () => ({ path: 'd', namespace: 'd' }));
      b.onLoad({ filter: /.*/, namespace: 'd' }, () => ({
        loader: 'js',
        contents: `export function storageAvailable(){return true}
          export class StorageUnavailable extends Error{}
          export async function getApiKey(){return 'AQ.Ab8Xk2nQ9wBiA_TESTKEY_123456789'}
          export const usingFolder = () => false;
          export const folderName = () => null;
          export const folderSupported = () => false;
          export const rememberKeyForSession = () => {};
          export async function chooseFolder(){ return null; }
                    export async function setApiKey(){}
          export async function clearApiKey(){}
          export async function saveProject(){return 'p1'}
          export async function listProjects(){return []}
          export async function getProject(){return undefined}
          export async function renameProject(){}
          export async function deleteProject(){}
          export async function countProjects(){return 0}
          export async function addMedia(){return 'm1'}
          export async function listMedia(){return []}
          export async function getMedia(){return undefined}
          export async function deleteMedia(){}
          export async function inlineMedia(h){return h}`,
      }));
    },
  }],
});

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
const w = dom.window;
globalThis.window = w; globalThis.document = w.document;
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true });
for (const k of ['HTMLElement', 'Element', 'Node', 'MutationObserver', 'Blob', 'URL', 'DOMException'])
  globalThis[k] = w[k];
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(1), 0);
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.HTMLCanvasElement = w.HTMLCanvasElement;
w.HTMLCanvasElement.prototype.getContext = () => null;

let fail = 0;
const ok = (n, c, d = '') => { if (!c) { fail++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); } };

const mod = await import(out.url);

/* ── the harness: a picker that enforces the gesture rule ─────────────────── */
let pickerCalled = false;
let wrote = null;
let gestureOpen = false;
let blockedByGesture = false;

const swallow = (e) => { if (e?.name === 'NotAllowedError') return; throw e; };
process.on('unhandledRejection', swallow);

w.showSaveFilePicker = async () => {
  pickerCalled = true;
  /* THE RULE: outside a user gesture, the browser throws this — and the page
     is NOT allowed to open the dialog any other way. */
  if (!gestureOpen) {
    blockedByGesture = true;
    throw new w.DOMException('Must be handled by user activation.', 'NotAllowedError');
  }
  return {
    name: 'my-site.html',
    createWritable: async () => ({
      write: async (blob) => { wrote = await blob.text(); },
      close: async () => {},
    }),
  };
};

const a = mod.mountResult();
await new Promise((r) => setTimeout(r, 300));

const btn = [...a.el.querySelectorAll('button')].find((b) => /export/i.test(b.textContent || ''));
ok('the result screen offers Export', !!btn,
  `buttons: ${[...a.el.querySelectorAll('button')].map((b) => b.textContent?.trim()).join(' | ')}`);

if (btn) {
  /* A user gesture is open only for the SYNCHRONOUS run of the handler. The
     moment the handler awaits anything, the browser suspends it and the
     activation is spent — resuming later does not restore it. Modelling that
     with a timer is not enough: `setTimeout(0)` fires before a long awaited
     chain finishes, which let the old, broken code pass. So the flag is
     cleared by the first thing that suspends: a promise `then`, a timer, or
     a microtask boundary. */
  gestureOpen = true;
  btn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  /* dispatchEvent runs the handler synchronously up to its first await; the
     synchronous part is the only part that has the gesture. */
  gestureOpen = false;
  await new Promise((r) => setTimeout(r, 900));

  /* The unhandled rejection is the failure itself, reported rather than thrown
     as a crash so the message says what went wrong. */
  ok('the export does not reject with NotAllowedError', !blockedByGesture,
    'the page awaited before asking for a file, so the browser refused the dialog');
}

ok('the picker is called inside the click, not after an await', !blockedByGesture,
  'the browser refused the dialog because the user gesture was spent by an await');
ok('clicking Export asks the browser for a file', pickerCalled,
  'the picker was never called — the button does nothing');
ok('and the file actually gets written', !!wrote && wrote.length > 500,
  wrote ? `${wrote.length} chars` : 'nothing was written');
ok('the written file is a complete document',
  !!wrote && /<!doctype html>/i.test(wrote) && /<\/html>/i.test(wrote),
  'the export must be a standalone page');
ok('the app itself is not referenced in it',
  !!wrote && !/localhost|swarmcraft\.|vite/.test(wrote),
  'the exported page must not point back at the app');

console.log(fail === 0 ? '\nDOWNLOAD OK — the export button produces a real file inside the click' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
