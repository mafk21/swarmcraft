/**
 * The mark and the wordmark, checked without rendering to anything.
 *
 *   node scripts/logo-test.mjs
 *
 * A logo is the one asset that gets used in contexts you did not design for:
 * a 16px favicon, a white background, a store listing, one colour on a receipt.
 * These check the properties that make those uses work, and the ones that would
 * make the mark look like everything else on the internet.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { markSvg, wordmarkSvg, faviconSvg, MARK_ACCENT } from './lib/logo.mjs';

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

/* ── the mark ─────────────────────────────────────────────────────────────── */

const bare = markSvg({ size: 512 });
const tile = markSvg({ size: 512, mode: 'tile' });
const mono = markSvg({ size: 512, multi: false, ink: '#0b0b0c' });
const light = markSvg({ size: 512, mode: 'bare', ink: '#0b0b0c' });

ok('is an svg with a 24 viewBox', /^<svg [^>]*viewBox="0 0 24 24"/.test(bare));
ok('scales by attribute, not by redrawing', bare.includes('width="512"') && markSvg({ size: 16 }).includes('width="16"'));
ok('has an accessible title', bare.includes('<title>Swarmcraft</title>') && bare.includes('aria-label'));
ok('is a single path plus a cursor', (bare.match(/<path /g) ?? []).length === 2, String((bare.match(/<path /g) ?? []).length));
ok('uses the one accent on the cursor', bare.includes(MARK_ACCENT));
ok('the box is not filled', /<path d="M[^"]*" fill="none"/.test(bare), 'a filled box is an app icon, not a mark');
/* The bottom-right corner is deliberately absent from the path: the cursor is
   in the gap. Counted on the vertices rather than eyeballed. */
const boxPath = (bare.match(/<path d="(M[^"]*)" fill="none"/) ?? [])[1] ?? '';
ok('leaves a corner open for the cursor', boxPath.startsWith('M') && boxPath.split('V').length === 3, String(boxPath.split('V').length - 1));
ok('the box is one continuous stroke', (boxPath.match(/M/g) ?? []).length === 1, 'two subpaths produced a hook instead of a frame');

/* The tile is what a store listing and an avatar need: an opaque square with
   padding, not a transparent glyph floating on whatever the host uses. */
ok('the tile has a background', tile.includes('<rect width="24" height="24" rx="5.5" fill="#0b0b0c"/>'));
ok('the tile keeps the page inside', !tile.includes('stroke-width="1.6" stroke-linecap="round" fill="none" stroke="none"'));
ok('tile and bare differ', tile !== bare);

/* One colour must still read: that is what a stamp, a fax and a monospace
   terminal have in common. */
ok('mono drops the accent', !mono.includes(MARK_ACCENT) && mono.includes('#0b0b0c'));
ok('light ink is applied', light.includes('#0b0b0c') && !light.includes('#f5f3ef'));

/* Anti-slop, in the mark this time: no gradient, no glow, no circle of icons. */
ok('no gradient', !/Gradient/i.test(bare));
ok('no filter or glow', !/<filter|feGaussian|drop-shadow/.test(bare));
ok('no foreign object or image', !/<image|foreignObject/.test(bare));
ok('no sparkle path (the AI-brand cliché)', !/M12 2 L13.5 9/.test(bare), 'this was checked against the mark actually in use');

/* The mark must not be a ring of evenly spaced glyphs — that was the first
   attempt and it is the stock shape. It is one box and one arrow now. */
ok('exactly one cursor', (bare.match(/M0 0 L0 5.6/g) ?? []).length === 1);

/* ── the wordmark ─────────────────────────────────────────────────────────── */

const wm = wordmarkSvg({ height: 96 });

ok('wordmark embeds the mark', wm.includes('rx="5.5"'));
ok('wordmark sets the name in the app serif', wm.includes('font-family="Instrument Serif"'));
ok('wordmark sets the tail in the app mono', wm.includes('font-family="JetBrains Mono"'));
ok('wordmark says what it is', wm.includes('WEBSITE BUILDER'));
ok('wordmark has a title', wm.includes('<title>'));
ok('wordmark scales the embedded mark', /scale\(\d/.test(wm), 'without this the mark renders at its own size in the corner');

/* The box has to be wide enough for the words: an svg that clips its own name
   is worse than no logo. */
const width = Number((wm.match(/width="(\d+)"/) ?? [])[1]);
ok('wordmark width is sane for its type', width > 500 && width < 1200, String(width));
ok('wordmark is no taller than asked', Number((wm.match(/height="(\d+)"/) ?? [])[1]) === 96);

/* ── the favicon ──────────────────────────────────────────────────────────── */

const fav = faviconSvg();
ok('favicon is a tile', fav.includes('rx="5.5"'));
ok('favicon is small enough to inline', fav.length < 2000, `${fav.length} bytes`);
ok('favicon carries a title', fav.includes('<title>'));

/* ── what the tool must have written ──────────────────────────────────────── */

const MEDIA = join(process.cwd(), 'docs', 'media');
const expected = ['logo.svg', 'logo-dark.svg', 'logo-light.svg', 'logo-512.png', 'logo-128.png', 'wordmark.svg', 'wordmark.png'];
const absent = expected.filter((f) => !existsSync(join(MEDIA, f)));
if (absent.length) console.log(`  note  docs/media is missing ${absent.join(', ')} — run \`npm run logo\``);

/* A PNG that is actually a PNG, not an error page saved with the wrong name. */
for (const f of ['logo-512.png', 'logo-128.png', 'wordmark.png']) {
  const p = join(MEDIA, f);
  if (!existsSync(p)) continue;
  const head = readFileSync(p).subarray(0, 8);
  ok(`${f} is a png`, head.toString('hex') === '89504e470d0a1a0a', head.toString('hex'));
}

if (existsSync(join(process.cwd(), 'public', 'favicon.svg'))) {
  ok('public/favicon.svg matches the generator', readFileSync(join(process.cwd(), 'public', 'favicon.svg'), 'utf8') === faviconSvg());
}

/* ── done ─────────────────────────────────────────────────────────────────── */

if (fail) {
  console.log(`\n  logo-test: ${fail} failure(s)\n`);
  process.exit(1);
}
console.log('\n  logo-test: OK\n');
