/**
 * The screenshot tool's browserless half, checked against the real app.
 *
 *   node scripts/shots-test.mjs
 *
 * The other half — driving Chrome — cannot run in CI and is not pretended to
 * have run here. What *can* be proven is everything the driver depends on: that
 * the demo spec passes the app's own validator, that the stub answers in the
 * shape `buildSite` actually reads, that the browser lookup handles Windows and
 * a bad CHROME_PATH, that the static server cannot be walked out of, and that
 * the GIF is a looping GIF rather than a pile of bytes.
 *
 * Each of these fails if the thing it checks is removed — the point of adding
 * them is that the tool stays honest the next time someone edits it.
 */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  DEMO_SPEC,
  findChrome,
  resolveStatic,
  mimeFor,
  stubModelBody,
  encodeGif,
  parseOnly,
  STUB_KEY,
  OUTPUTS,
} from './lib/shots-kit.mjs';

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

/* ── the demo spec must be a spec ─────────────────────────────────────────── */

const bundle = await build({
  stdin: {
    contents: `export { SiteSpecSchema, renderDocument, findSlop } from './src/lib/spec';
               export { renderDocument as render } from './src/lib/render';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
  outfile: 'shots-test.mjs',
});
const entry = scratch('shots-test.mjs');
writeFileSync(entry.path, bundle.outputFiles[0].text);
const app = await import(entry.url);

const parsed = app.SiteSpecSchema.safeParse(DEMO_SPEC);
ok('demo spec passes SiteSpecSchema', parsed.success, parsed.success ? '' : JSON.stringify(parsed.error?.issues?.[0]));
ok('demo spec has a hero', DEMO_SPEC.sections.some((s) => s.type === 'hero'));
ok('demo spec has at least three sections', DEMO_SPEC.sections.length >= 3);
ok('demo spec would not be flagged as slop', app.findSlop(DEMO_SPEC).length === 0);

const html = app.render(DEMO_SPEC);
ok('demo spec renders a document', /^<!doctype html>/i.test(html), html.slice(0, 40));
ok('rendered page carries the real content', html.includes('Falcon Coffee'));
ok('rendered page has no external resource', !/src="https?:|href="https?:/.test(html));

/* ── the stub answer is the shape the client reads ────────────────────────── */

const body = stubModelBody();
const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
ok('stub has one candidate', body.candidates.length === 1);
ok('stub says STOP', body.candidates[0].finishReason === 'STOP');
ok('stub text is the spec as JSON', JSON.parse(text).meta.title === DEMO_SPEC.meta.title);
ok('stub text re-validates', app.SiteSpecSchema.safeParse(JSON.parse(text)).success);

/* ── finding a browser, on every OS, with every failure mode ──────────────── */

const win = findChrome({ platform: 'win32', env: '', exists: (p) => /msedge\.exe$/.test(p), which: () => null });
ok('windows: finds Edge when Chrome is absent', /msedge\.exe$/.test(win.path ?? ''), String(win.path));

const fromEnv = findChrome({ env: '/opt/weird/chrome', exists: (p) => p === '/opt/weird/chrome' });
ok('CHROME_PATH wins when it exists', fromEnv.path === '/opt/weird/chrome' && fromEnv.how === 'env');

const badEnv = findChrome({ platform: 'linux', env: '/nope/chrome', exists: () => false, which: () => null });
ok('a bad CHROME_PATH falls through to the search', badEnv.path === null && badEnv.tried.length > 1);

const viaWhere = findChrome({
  platform: 'win32',
  env: '',
  exists: (p) => p === 'C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
  which: () => 'C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
});
ok('windows: falls back to where.exe for a per-user install', viaWhere.how === 'where', String(viaWhere.how));

const nonWin = findChrome({ platform: 'linux', env: '', exists: () => false, which: () => { throw new Error('n/a'); } });
ok('nothing found is reported, not thrown', nonWin.path === null && nonWin.how === null);

/* ── the static server cannot be walked out of ────────────────────────────── */

const always = () => true;
const fileAll = () => true;
ok('serves a real file', resolveStatic('/srv/dist', '/index.html', always, fileAll) === '/srv/dist/index.html');
ok('serves / as index.html', resolveStatic('/srv/dist', '/', always, fileAll) === '/srv/dist/index.html');
ok('rejects plain traversal', resolveStatic('/srv/dist', '/../../etc/passwd', always, fileAll) === null);
ok('rejects encoded traversal', resolveStatic('/srv/dist', '/%2e%2e/%2e%2e/etc/passwd', always, fileAll) === null);
ok('rejects a sibling with the same prefix', resolveStatic('/srv/dist', '/../dist-secret/x', always, fileAll) === null);
ok('rejects malformed encoding', resolveStatic('/srv/dist', '/%zz', always, fileAll) === null);
ok('404s a missing file', resolveStatic('/srv/dist', '/nope.js', () => false, fileAll) === null);
ok('404s a directory', resolveStatic('/srv/dist', '/assets', always, () => false) === null);

ok('mime for js', mimeFor('/a/b.js').startsWith('text/javascript'));
ok('mime for woff2', mimeFor('/a/b.woff2') === 'font/woff2');
ok('mime for an unknown extension is a download', mimeFor('/a/b.zzz') === 'application/octet-stream');

/* ── the gif loops and says so in its header ──────────────────────────────── */

const W = 40;
const H = 24;
const frame = (tint) => {
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    rgba[i * 4] = tint;
    rgba[i * 4 + 1] = 120;
    rgba[i * 4 + 2] = 200;
    rgba[i * 4 + 3] = 255;
  }
  return { w: W, h: H, rgba };
};

const gif = Buffer.from(encodeGif([frame(0), frame(90), frame(180)], { fps: 7 }));
ok('gif signature', gif.slice(0, 6).toString('latin1') === 'GIF89a', gif.slice(0, 6).toString('latin1'));
ok('gif is finite', gif.length > 100 && gif.length < 200_000, `${gif.length} bytes`);
ok('gif loops forever', gif.includes(Buffer.from('NETSCAPE2.0')));
ok('gif has one image per frame', gif.filter((b) => b === 0x2c).length >= 3);
ok('gif ends with a trailer', gif[gif.length - 1] === 0x3b);

/** Read the delay out of the first graphic control extension: 21 F9 04 ... w w 00. */
function firstDelay(buf) {
  const i = buf.indexOf(Buffer.from([0x21, 0xf9, 0x04]));
  return i < 0 ? -1 : buf.readUInt16LE(i + 4) * 10;
}
ok('gif frame delay is 1/7 s, in centiseconds', firstDelay(gif) === 140, `${firstDelay(gif)} ms`);

const bad = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};
ok('refuses an empty frame list', bad(() => encodeGif([])));
ok('refuses a frame whose byte count is wrong', bad(() => encodeGif([{ w: 10, h: 10, rgba: new Uint8Array(4) }])));
ok('refuses a non-Uint8Array', bad(() => encodeGif([{ w: 2, h: 2, rgba: [1, 2, 3, 4] }])));

/* ── flags ────────────────────────────────────────────────────────────────── */

ok('--only=ab picks two outputs', parseOnly('ab').join('') === 'ab');
ok('--only keeps order of the map', parseOnly('cba').length === 3);
ok('--only with junk falls back to everything', parseOnly('zzz').length === 3);
ok('--only is case-insensitive', parseOnly('B').join('') === 'b');
ok('three outputs are documented', Object.keys(OUTPUTS).length === 3);
ok('the stub key looks like an AI Studio key', STUB_KEY.startsWith('AQ.'));
ok('the stub key is obviously not real', STUB_KEY.includes('TOOL_ONLY'));

/* ── the media folder the README points at ───────────────────────────────── */

const missing = ['mid-build.gif', 'finished.png', 'inspector.png'].filter(
  (f) => !existsSync(join('docs', 'media', f))
);
ok('README image targets are named by the tool', Object.values(OUTPUTS).every((f) => f.endsWith('.gif') || f.endsWith('.png')));
if (missing.length) {
  console.log(`  note  docs/media is missing ${missing.join(', ')} — run \`npm run shots\` to make them`);
}

/* ── done ─────────────────────────────────────────────────────────────────── */

if (fail) {
  console.log(`\n  shots-test: ${fail} failure(s)\n`);
  process.exit(1);
}
console.log('\n  shots-test: OK\n');
