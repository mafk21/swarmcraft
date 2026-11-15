/* ============================================================================
   npm run card — render the 1080×1920 story cards to PNG.

     npm run card                 # every card
     npm run card -- launch       # just one
     npm run card -- --svg        # write the SVGs only, no PNG
     npm run card -- --check      # fonts and names only, render nothing

   Writes docs/media/story-<name>.png (and .svg beside it).

   This used to need Chrome. It does not any more: the card is SVG, and
   @resvg/resvg-js rasterises it with the bundled woff2 faces. That means the
   images can be made on any machine, in CI, and by whoever wrote the tool —
   which is the difference between a tool that exists and a tool that has been
   run.

   Exit codes: 0 written · 1 failed while rendering · 2 cannot run here.
   ========================================================================== */
import { Resvg } from '@resvg/resvg-js';
import wawoff2 from 'wawoff2';
import { existsSync, mkdirSync, writeFileSync, statSync, readFileSync, mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

import { CARDS, CARD_NAMES, CARD_W, CARD_H, CARD_FONTS, CARD_FONT_DIRS, renderCardSvg } from './lib/story-cards.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const MEDIA = join(ROOT, 'docs', 'media');
const NM = join(ROOT, 'node_modules');

const argv = process.argv.slice(2);
const SVG_ONLY = argv.includes('--svg');
const CHECK_ONLY = argv.includes('--check');
const wanted = argv.filter((a) => !a.startsWith('--'));
const names = wanted.length ? wanted : Object.keys(CARD_NAMES);

const kb = (p) => `${(statSync(p).size / 1024).toFixed(0)} kB`.padStart(8);

async function main() {
  const unknown = names.filter((n) => !(n in CARDS));
  if (unknown.length) {
    console.error(`\n  Unknown card: ${unknown.join(', ')}\n\n  Available:\n`);
    for (const [k, v] of Object.entries(CARD_NAMES)) console.error(`    ${k.padEnd(12)} ${v}`);
    console.error('');
    return 1;
  }

  /* The faces come out of node_modules, so a fresh clone that has not run
     `npm install` fails here rather than rendering in a fallback and looking
     wrong in a way nobody notices until it is posted. */
  const faces = Object.entries(CARD_FONT_DIRS).map(([k, dir]) => join(NM, dir, CARD_FONTS[k]));
  const missing = faces.filter((p) => !existsSync(p));
  if (missing.length) {
    console.error(`\n  The @fontsource files are not installed:\n${missing.map((p) => `    ${p}`).join('\n')}\n\n  Run: npm install\n`);
    return 2;
  }

  if (CHECK_ONLY) {
    console.log(`  fonts     ${faces.length} bundled faces found`);
    console.log(`  cards     ${names.join(', ')}`);
    console.log(`  size      ${CARD_W}×${CARD_H} → docs/media/story-<name>.png`);
    console.log('\n  CHECKS PASSED — run without --check to render.\n');
    return 0;
  }

  mkdirSync(MEDIA, { recursive: true });

  /* Two conversion steps are needed and neither is obvious.

     resvg only understands TrueType/OpenType, not the woff2 files the app
     actually ships, and it will not say so: hand it a woff2 and it silently
     falls back to a built-in sans, which is how the first version of this card
     came out in Helvetica while looking perfectly fine.

     It also has to be given the files as *files*, addressed by their real
     family names in the SVG. Passing the buffer was ignored; passing a file
     path as the font-family was worse — every string came out in the first face
     loaded. So: decompress to .ttf on disk, name the families properly. */
  const fontDir = mkdtempSync(join(tmpdir(), 'swarmsmith-cards-'));
  const NAMES = { serif: 'InstrumentSerif', sans: 'InstrumentSans', mono: 'JetBrainsMono' };

  /* One at a time, deliberately. `wawoff2.decompress` is not concurrency-safe:
     running three of them through `Promise.all` returns three buffers of the
     right length, two of them corrupt, and resvg then falls back to a system
     face without a word. It cost an hour of staring at a card that was in the
     wrong typeface for no visible reason, so it is written down here. */
  const fontFiles = [];
  for (const key of Object.keys(CARD_FONTS)) {
    const woff2 = readFileSync(join(NM, CARD_FONT_DIRS[key], CARD_FONTS[key]));
    const ttf = join(fontDir, `${NAMES[key]}.ttf`);
    writeFileSync(ttf, Buffer.from(await wawoff2.decompress(woff2)));
    fontFiles.push(ttf);
  }

  for (const name of names) {
    const svg = renderCardSvg(CARDS[name]);
    const svgPath = join(MEDIA, `story-${name}.svg`);
    writeFileSync(svgPath, svg);
    console.log(`  ${`story-${name}.svg`.padEnd(22)} ${kb(svgPath)}`);

    if (SVG_ONLY) continue;

    /* loadSystemFonts:false means a missing face is a loud failure rather than a
       silent fallback to Arial — the card has exactly three faces and no ninth
       opinion about which to use. */
    const png = new Resvg(svg, {
      font: { fontFiles, loadSystemFonts: false },
      background: '#0b0b0c',
    })
      .render()
      .asPng();

    /* A card in the wrong typeface is a card nobody should publish, and resvg
       does not complain when it substitutes one. So the faces are proved to be
       distinguishable by rendering the claim's first character alone in each and
       failing if two come out byte-identical. */
    const distinct = new Set(
      ['Instrument Serif', 'Instrument Sans', 'JetBrains Mono'].map((family) => {
        const probe = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="#000"/><text x="8" y="92" font-family="${family}" font-size="80" fill="#fff">Rg8</text></svg>`;
        const bytes = new Resvg(probe, { font: { fontFiles, loadSystemFonts: false } }).render().asPng();
        return createHash('md5').update(bytes).digest('hex');
      })
    );
    if (distinct.size !== 3) {
      console.error(`\n  FAILED  the three faces are not rendering distinctly (${distinct.size}/3) — resvg fell back.\n`);
      return 1;
    }

    const pngPath = join(MEDIA, `story-${name}.png`);
    writeFileSync(pngPath, png);
    console.log(`  ${`story-${name}.png`.padEnd(22)} ${kb(pngPath)}  ${CARD_W}×${CARD_H}`);
  }

  console.log('\n  CARDS OK\n');
  return 0;
}

process.exitCode = await main();
