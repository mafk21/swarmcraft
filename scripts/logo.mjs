/* ============================================================================
   npm run logo — write the mark, the wordmark, the favicon, and the README
   versions of each.

     npm run logo            all of it
     npm run logo -- --check names and files only

   Everything is written into docs/media/ (and public/ for the favicon):

     docs/media/logo.svg              the mark, bare, ink on transparent (dark)
     docs/media/logo-dark.svg         the mark on its own dark tile
     docs/media/logo-light.svg        the same, ink on a light tile — for a white page
     docs/media/logo-512.png          the tile at 512, for avatars and stores
     docs/media/logo-128.png
     docs/media/wordmark.svg          mark + name + what it is
     docs/media/wordmark.png
     public/favicon.svg               what the browser tab shows

   The mark is a box that is not finished, and the cursor that is finishing it.
   See scripts/lib/logo.mjs for why it is that and not something else.

   Exit codes: 0 written · 1 failed · 2 cannot run here (missing fonts/deps).
   ========================================================================== */
import { Resvg } from '@resvg/resvg-js';
import wawoff2 from 'wawoff2';
import { existsSync, mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';

import { markSvg, wordmarkSvg, faviconSvg } from './lib/logo.mjs';
import { CARD_FONTS, CARD_FONT_DIRS } from './lib/story-cards.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const MEDIA = join(ROOT, 'docs', 'media');
const PUBLIC = join(ROOT, 'public');
const NM = join(ROOT, 'node_modules');
const CHECK_ONLY = process.argv.includes('--check');

const kb = (p) => `${(statSync(p).size / 1024).toFixed(1)} kB`.padStart(8);

async function main() {
  const MISSING = Object.keys(CARD_FONTS).map((k) => join(NM, CARD_FONT_DIRS[k], CARD_FONTS[k]));
  const missing = MISSING.filter((p) => !existsSync(p));
  if (missing.length) {
    console.error(`\n  Fonts missing — run npm install:\n${missing.map((p) => `    ${p}`).join('\n')}\n`);
    return 2;
  }
  if (CHECK_ONLY) {
    console.log('  mark      box with an open corner + cursor');
    console.log('  outputs   logo{,-dark,-light}.svg, logo-512.png, logo-128.png, wordmark{,.png}, public/favicon.svg');
    console.log('\n  CHECKS PASSED\n');
    return 0;
  }

  mkdirSync(MEDIA, { recursive: true });
  mkdirSync(PUBLIC, { recursive: true });

  /* woff2 → ttf, one at a time: wawoff2 is not concurrency-safe and a corrupt
     buffer makes resvg fall back to a system face without a word. */
  const dir = mkdtempSync(join(tmpdir(), 'swarmcraft-logo-'));
  const names = { serif: 'InstrumentSerif', sans: 'InstrumentSans', mono: 'JetBrainsMono' };
  const fontFiles = [];
  for (const key of Object.keys(CARD_FONTS)) {
    const ttf = join(dir, `${names[key]}.ttf`);
    writeFileSync(ttf, Buffer.from(await wawoff2.decompress(readFileSync(join(NM, CARD_FONT_DIRS[key], CARD_FONTS[key])))));
    fontFiles.push(ttf);
  }
  const FONT = { font: { fontFiles, loadSystemFonts: false } };

  const write = (path, data) => {
    writeFileSync(path, data);
    console.log(`  ${path.replace(ROOT + '/', '').padEnd(30)} ${kb(path)}`);
  };

  const png = (svg, background) =>
    new Resvg(svg, { ...FONT, background }).render().asPng();

  /* The mark: three contexts, because a logo that only works on one background
     is a logo that gets used wrong. */
  write(join(MEDIA, 'logo.svg'), markSvg({ size: 512, mode: 'bare', ink: '#f5f3ef' }));
  write(join(MEDIA, 'logo-dark.svg'), markSvg({ size: 512, mode: 'tile' }));
  write(join(MEDIA, 'logo-light.svg'), markSvg({ size: 512, mode: 'bare', ink: '#0b0b0c', multi: true }));

  write(join(MEDIA, 'logo-512.png'), png(markSvg({ size: 512, mode: 'tile' })));
  write(join(MEDIA, 'logo-128.png'), png(markSvg({ size: 128, mode: 'tile' })));

  /* The light version has to be proved legible on white, or it is just a file. */
  const lightProbe = png(markSvg({ size: 128, mode: 'bare', ink: '#0b0b0c' }), '#ffffff');
  const darkProbe = png(markSvg({ size: 128, mode: 'tile' }));
  const same = createHash('md5').update(lightProbe).digest('hex') === createHash('md5').update(darkProbe).digest('hex');
  if (same) {
    console.error('\n  FAILED  the light and dark marks are identical — the ink is not being applied.\n');
    return 1;
  }

  /* Wordmark: SVG for the README (scales), PNG for anywhere that wants one. */
  write(join(MEDIA, 'wordmark.svg'), wordmarkSvg({ height: 96 }));
  /* On the app's own surface, not on transparent: a light-on-transparent PNG
     looks broken in every viewer with a white background, which is most of them. */
  write(join(MEDIA, 'wordmark.png'), png(wordmarkSvg({ height: 96 }), '#0b0b0c'));

  write(join(PUBLIC, 'favicon.svg'), faviconSvg());

  console.log('\n  LOGO OK\n');
  return 0;
}

process.exitCode = await main();
