/* ============================================================================
   npm run card — render the 1080×1920 story cards to PNG.

     npm run card                 # every card in scripts/lib/story-cards.mjs
     npm run card -- launch       # just one
     npm run card -- --headed     # watch it render
     npm run card -- --check      # verify the plumbing, write nothing

   Writes docs/media/story-<name>.png. Same rules as `npm run shots`: it drives
   the Chrome you already have, it needs no key and no network, and if it cannot
   find a browser it exits 2 and prints what it looked for rather than writing a
   placeholder — a card that is not the real thing is worse than no card.

   Exit codes: 0 written · 1 failed while rendering · 2 cannot run here.
   ========================================================================== */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, statSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { findChrome, mimeFor } from './lib/shots-kit.mjs';
import { renderCard, CARDS, CARD_NAMES, CARD_W, CARD_H, CARD_FONTS, CARD_FONT_DIRS } from './lib/story-cards.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const MEDIA = join(ROOT, 'docs', 'media');
const NM = join(ROOT, 'node_modules');

const argv = process.argv.slice(2);
const HEADED = argv.includes('--headed');
const CHECK_ONLY = argv.includes('--check');
const wanted = argv.filter((a) => !a.startsWith('--'));
const names = wanted.length ? wanted : Object.keys(CARD_NAMES);

const log = (m) => console.log(m);

/* Two things need serving: the card document for each name, and the three font
   files it asks for. Both come out of this repo, so the only path handling that
   matters is keeping every request inside those two directories. */
function serve() {
  const fontIndex = fontIndex_();
  const server = createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;

    const card = pathname.match(/^\/([a-z-]+)$/);
    if (card && card[1] in CARDS) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderCard(CARDS[card[1]]));
      return;
    }
    if (pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderCard(CARDS[names[0]]));
      return;
    }

    const file = fontIndex[pathname.replace(/^\//, '')];
    if (!file) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': mimeFor(file) });
    res.end(readFileSync(file));
  });

  return new Promise((ok, no) => {
    server.once('error', no);
    server.listen(0, '127.0.0.1', () => ok(server));
  });
}

/** filename → absolute path, for the woff2 files the card actually names. Only
    names in CARD_FONTS are ever exposed, so the listing cannot leak the rest. */
function fontIndex_() {
  const index = {};
  for (const [key, dir] of Object.entries(CARD_FONT_DIRS)) {
    const name = CARD_FONTS[key];
    const path = join(NM, dir, name);
    if (existsSync(path)) index[name] = path;
  }
  return index;
}

/* ── main ────────────────────────────────────────────────────────────────── */

async function main() {
  const unknown = names.filter((n) => !(n in CARDS));
  if (unknown.length) {
    console.error(`\n  Unknown card: ${unknown.join(', ')}\n\n  Available:\n`);
    for (const [k, v] of Object.entries(CARD_NAMES)) console.error(`    ${k.padEnd(12)} ${v}`);
    console.error('');
    return 1;
  }

  /* Font files come out of node_modules, so a fresh clone that has not run
     `npm install` fails here rather than rendering in a fallback face and
     looking wrong. */
  const fontPaths = Object.entries(CARD_FONT_DIRS).map(([k, dir]) => join(NM, dir, CARD_FONTS[k]));
  const missing = fontPaths.filter((p) => !existsSync(p));
  if (missing.length) {
    console.error(`\n  The @fontsource files are not installed:\n${missing.map((p) => `    ${p}`).join('\n')}\n\n  Run: npm install\n`);
    return 2;
  }

  if (CHECK_ONLY) {
    log(`  fonts     ${fontPaths.length} bundled faces found`);
    log(`  cards     ${names.join(', ')}`);
    log(`  size      ${CARD_W}×${CARD_H}, one PNG per card → docs/media/story-<name>.png`);
    log('\n  CHECKS PASSED — run without --check to render (needs Chrome or Edge).\n');
    return 0;
  }

  const found = findChrome();
  if (!found.path) {
    console.error(`\n  No Chrome or Edge found, so no card was rendered.

  This tool drives the browser you already have. Point it at yours:

      CHROME_PATH="/path/to/chrome" npm run card

  Looked in:
${found.tried.map((p) => `      ${p}`).join('\n')}
`);
    return 2;
  }
  log(`  browser   ${found.path}`);

  const browser = await chromium.launch({ executablePath: found.path, headless: !HEADED });
  const context = await browser.newContext({
    viewport: { width: CARD_W, height: CARD_H },
    deviceScaleFactor: 1, // 1080×1920 IS the story size; 2x would be 4x the bytes
    colorScheme: 'dark',
  });
  const page = await context.newPage();

  mkdirSync(MEDIA, { recursive: true });

  /* The @font-face URLs are absolute, so the document has to be loaded over
     http — a data: URL has no origin to resolve /fonts/... against. */
  const server = await serve();
  const port = server.address().port;

  let code = 0;
  try {
    for (const name of names) {
      await page.goto(`http://127.0.0.1:${port}/${name}`, { waitUntil: 'networkidle' });

      /* The faces are bundled, so this settles in milliseconds. It still has to
         be awaited: a card captured before the face loads falls back to Georgia
         and looks wrong in a way nobody notices until it is published. */
      const loaded = await page.evaluate(async () => {
        await document.fonts.ready;
        return {
          serif: document.fonts.check('400 100px Serif'),
          sans: document.fonts.check('400 30px Sans'),
          mono: document.fonts.check('400 20px Mono'),
        };
      });
      if (!loaded.serif || !loaded.sans || !loaded.mono) {
        console.error(`  WARNING   ${name}: a bundled font did not load ${JSON.stringify(loaded)}`);
      }

      const out = join(MEDIA, `story-${name}.png`);
      await page.locator('body').screenshot({ path: out, type: 'png' });
      log(`  ${`story-${name}.png`.padEnd(22)} ${(statSync(out).size / 1024).toFixed(0)} kB  ${CARD_W}×${CARD_H}`);
    }
    log('\n  CARDS OK\n');
  } catch (e) {
    console.error(`\n  FAILED while rendering:\n    ${String(e.message).split('\n').slice(0, 4).join('\n    ')}\n`);
    code = 1;
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
  return code;
}

main().then((c) => {
  process.exitCode = c;
});
