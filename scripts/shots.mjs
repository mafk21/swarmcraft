/* ============================================================================
   npm run shots — the three README images, captured from a real run.

   Why it drives a browser at all: every image in the README has to be the real
   product. So this does not draw a mock-up. It builds the app, serves `dist/`
   from a local port, answers the one Gemini request with `stubModelBody()`
   instead of spending quota, and then walks the screens by clicking the same
   buttons a person clicks — kind, brief, sections, theme, build. The spec goes
   through the real parser, the real validator, the real renderer, the real
   measurer and the real swarm, because none of them are stubbed.

   Outputs:
     docs/media/mid-build.gif   the swarm mid-draw, 7 s at 7 fps, 960 px wide
     docs/media/finished.png    the page after the cursors finish
     docs/media/inspector.png   the workbench, inspector open

     npm run shots                 all three
     npm run shots -- --only=ab    just the GIF and the finished page
     npm run shots -- --headed     watch it happen, at 1x, no headless
     npm run shots -- --check      do not capture; prove the plumbing works
     npm run shots -- --dev        use a running `npm run dev` on :5173

   Exit codes: 0 captured · 1 failed while driving · 2 cannot run here.

   It needs Chrome or Edge (the user already has one; nothing is downloaded).
   If it cannot find one it says so and exits 2 — it never writes a placeholder
   image, because a fake screenshot is worse than a missing one.
   ========================================================================== */
import { chromium } from 'playwright-core';
import { build as viteBuild } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

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

const ROOT = resolve(import.meta.dirname, '..');
const MEDIA = join(ROOT, 'docs', 'media');
const DIST = join(ROOT, 'dist');
const DEV_URL = 'http://127.0.0.1:5173';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : undefined;
};

const HEADED = flag('headed');
const CHECK_ONLY = flag('check');
const USE_DEV = flag('dev');
const ONLY = parseOnly(opt('only') ?? 'abc');

const log = (m) => console.log(m);
const step = (m) => console.log(`\n  ${m}`);

function die(code, message) {
  console.error(`\n${message}\n`);
  return code;
}

/* ── the brief the tool types in ─────────────────────────────────────────────
   Long enough to pass `briefReady` (>20 characters, plus a name) and worded so
   the demo spec is a fair answer to it: the facts in the spec are all facts in
   this paragraph, which is the app's own rule. */
const DEMO_NAME = 'Falcon Coffee Roasters';
const DEMO_BRIEF =
  'A single-origin coffee roastery on King Fahd Road in Dammam, open since 2019. ' +
  'We roast every Tuesday and ship anywhere in Saudi Arabia, two to three days. ' +
  'We sell three things: Espresso Roast at SAR 65 for a 250g bag, Filter Roast at SAR 70 ' +
  'for a 250g bag, and 100 filter papers at SAR 12. Whole bean only — we do not grind and ' +
  'we do not sell coffee by the cup. Open Saturday to Thursday 9 to 5, closed Friday. ' +
  'hello@falconroasters.sa, 013 812 4400.';

/* ── 1. the server ───────────────────────────────────────────────────────── */

function serveStatic(root) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/api/gemini') {
      const body = JSON.stringify(stubModelBody(DEMO_SPEC));
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }

    const file = resolveStatic(root, url.pathname, existsSync, (p) => {
      try {
        return statSync(p).isFile();
      } catch {
        return false;
      }
    });

    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
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

/* ── 2. the walk through the app ─────────────────────────────────────────── */

/** Put the key in IndexedDB so the run starts where a returning user starts. */
async function seedKey(page, base) {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (key) => {
    const db = await new Promise((ok, no) => {
      const req = indexedDB.open('swarmsmith', 2);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('projects')) {
          d.createObjectStore('projects', { keyPath: 'id' }).createIndex('updated', 'updated');
        }
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('pages')) {
          d.createObjectStore('pages', { keyPath: 'id' }).createIndex('projectId', 'projectId');
        }
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => no(req.error);
    });
    await new Promise((ok, no) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key: 'geminiKey', value: key });
      tx.oncomplete = ok;
      tx.onerror = () => no(tx.error);
    });
    db.close();
  }, STUB_KEY);
}

/**
 * Click through the funnel. Selectors name what is on screen — a heading, a
 * button's label — not a class invented for the tool, so a rename in the app
 * breaks this loudly instead of silently hunting for nothing.
 */
async function walkToBuild(page) {
  step('Choosing a kind');
  await page.getByRole('heading', { name: 'What are you making?' }).waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: /^Store/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  step('Writing the brief');
  await page.locator('.prompt-box').waitFor({ timeout: 20_000 });
  await page.getByPlaceholder('Two to four words').fill(DEMO_NAME);
  await page.locator('.prompt-box').fill(DEMO_BRIEF);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  step('Picking sections');
  await page.getByRole('heading', { name: 'What goes on the page?' }).waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  step('Type and colour');
  await page.getByRole('heading', { name: 'Type and colour' }).waitFor({ timeout: 20_000 });
  /* `auto` is the default mode, so the button is live as-is. The model's own
     choice is what a real first run gets, and the stub's is `editorial`. */
  await page.getByRole('button', { name: 'Build my page' }).click();
}

/* ── 3. capture ──────────────────────────────────────────────────────────── */

/**
 * The GIF frames are counted in page time, not wall time: each frame is one
 * screenshot round trip, and the wait between frames is whatever is left of the
 * frame's slot. If a frame takes longer than a slot, the animation simply runs
 * slower than 7 fps in the capture and no frame is dropped — the GIF still
 * reads as continuous, which is the only thing that matters here.
 */
async function captureGif(page, fps = 7, seconds = 7, width = 960) {
  const frames = [];
  const started = Date.now();

  while (Date.now() - started < seconds * 1000) {
    const png = await page.screenshot({ type: 'png' });
    const framePx = await downsample(page, png.toString('base64'), width);
    frames.push({ w: framePx.w, h: framePx.h, rgba: Uint8Array.from(framePx.rgba) });

    const due = started + (frames.length * 1000) / fps;
    const wait = due - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
  }

  const out = join(MEDIA, OUTPUTS.a);
  writeFileSync(out, encodeGif(frames, { fps }));
  log(`  ${OUTPUTS.a.padEnd(16)} ${kb(out)}  ${frames.length} frames, ${frames[0].w}×${frames[0].h}`);
}

/**
 * Node cannot decode a PNG without a dependency, and adding an image library to
 * a project with four runtime deps just to resize a screenshot is not a trade
 * worth making. Chrome can do both: it has the decoder and a canvas.
 */
async function downsample(page, base64, width) {
  return page.evaluate(
    async ({ base64, width }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const scale = Math.min(1, width / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, c.width, c.height);
      const data = x.getImageData(0, 0, c.width, c.height).data;
      /* Converted here rather than shipping 3.5 million JSON numbers through
         the protocol: this array goes back as a byte list either way, but the
         typed array keeps the round trip to one allocation. */
      return { w: c.width, h: c.height, rgba: Array.from(data) };
    },
    { base64, width }
  );
}

function kb(path) {
  return `${(statSync(path).size / 1024).toFixed(0)} kB`.padStart(8);
}

const shot = async (page, name) => {
  const out = join(MEDIA, name);
  await page.screenshot({ path: out, type: 'png' });
  log(`  ${name.padEnd(16)} ${kb(out)}`);
};

/* ── 4. main ─────────────────────────────────────────────────────────────── */

async function main() {
  const base = USE_DEV ? DEV_URL : null;

  if (!base && !existsSync(join(DIST, 'index.html'))) {
    step('dist/ is missing — building the app first');
    const built = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (built.status !== 0) return die(1, '  The app does not build, so there is nothing to photograph.');
  }

  const found = findChrome();
  if (!found.path) {
    return die(
      2,
      `  No Chrome or Edge found, so nothing was captured.

  This tool drives the browser you already have — it does not download one.
  Point it at yours and run again:

      Linux    CHROME_PATH=/usr/bin/google-chrome npm run shots
      macOS    CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run shots
      Windows  set CHROME_PATH=C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe
               npm run shots

  Looked in:
${found.tried.map((p) => `      ${p}`).join('\n')}`
    );
  }
  log(`  browser   ${found.path}`);

  let server = null;
  let url = base;
  if (!base) {
    server = await serveStatic(DIST);
    url = `http://127.0.0.1:${server.address().port}`;
    log(`  serving   ${url}`);
  } else {
    log(`  serving   ${url} (your dev server, not started by this tool)`);
  }

  let browser;
  try {
    browser = await chromium.launch({
      executablePath: found.path,
      headless: !HEADED,
      args: ['--force-color-profile=srgb', '--hide-scrollbars', '--font-render-hinting=none'],
    });
  } catch (e) {
    server?.close();
    return die(2, `  Could not launch ${found.path}\n  ${String(e.message).split('\n')[0]}`);
  }

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1, // the GIF is 960 wide; 2x would only be thrown away
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => pageErrors.push(String(e.message).slice(0, 300)));

  /* Send the one model request to our own stub. Done as an init script so it is
     installed before the app's first import can capture `fetch`. */
  await context.addInitScript(() => {
    const real = window.fetch;
    window.fetch = (input, init) => {
      const href = String(input?.url ?? input);
      return href.includes('generativelanguage.googleapis.com') ? real('/api/gemini', init) : real(input, init);
    };
  });

  mkdirSync(MEDIA, { recursive: true });

  let code = 0;
  try {
    await seedKey(page, url);
    await page.goto(url, { waitUntil: 'networkidle' });

    if (CHECK_ONLY) {
      const heading = await page.getByRole('heading', { name: 'No sites yet' }).isVisible().catch(() => false);
      const probe = await page.evaluate(async () => {
        const res = await fetch('/api/gemini', { method: 'POST', body: '{}' });
        const json = await res.json();
        return json?.candidates?.[0]?.content?.parts?.[0]?.text?.length ?? 0;
      });
      log(`\n  start screen   ${heading ? 'ok — the seeded key skipped setup' : 'NOT the site list'}`);
      log(`  model stub     ${probe ? `ok — ${probe} bytes of spec` : 'NOT answering'}`);
      log(`  page errors    ${pageErrors.length ? pageErrors.join(' | ') : 'none'}`);
      if (!heading || !probe || pageErrors.length) code = 1;
      else log('\n  CHECKS PASSED — run without --check to capture.\n');
    } else {
      await walkToBuild(page);

      step('Watching it build');
      await page.locator('.build-canvas').waitFor({ timeout: 30_000 });

      /* The build screen composes, measures, then draws. The GIF has to open on
         cursors already in flight, so wait for the swarm itself — the HUD is the
         first thing that exists only while drawing. */
      await page.locator('.hud').waitFor({ timeout: 90_000 });
      if (ONLY.includes('a')) await captureGif(page);

      step('Waiting for the page');
      const finish = page.getByRole('button', { name: 'Finish', exact: true });
      await finish.waitFor({ timeout: 120_000 });

      if (ONLY.includes('b')) {
        /* The result bar fades the moment it appears; a beat keeps the shot
           from catching it mid-transition. */
        await page.waitForTimeout(900);
        await shot(page, OUTPUTS.b);
      }

      if (ONLY.includes('c')) {
        /* A section card open, so the right-hand panel shows the editing UI
           rather than a list of collapsed headers. */
        await page.locator('.sec-card strong').first().click();
        await page.waitForTimeout(900);
        await shot(page, OUTPUTS.c);
      }

      const failed = await page.locator('.err').count();
      if (failed) {
        log('\n  The app put an error on screen — the images above are suspect.');
        code = 1;
      }
    }
  } catch (e) {
    console.error(`\n  FAILED while driving the app:\n    ${String(e.message).split('\n').slice(0, 5).join('\n    ')}`);
    try {
      await page.screenshot({ path: join(MEDIA, '_failure.png') });
      console.error('  Where it stopped: docs/media/_failure.png');
    } catch {
      /* the page may already be gone */
    }
    code = 1;
  } finally {
    if (pageErrors.length) log(`\n  page errors:\n${pageErrors.map((e) => `    ${e}`).join('\n')}`);
    await browser.close().catch(() => {});
    server?.close();
  }

  if (code === 0) {
    log('\n  SHOTS OK\n');
    log('  Next: check the GIF loops and opens on moving cursors, then commit the three files.\n');
  }
  return code;
}

main().then((code) => {
  process.exitCode = code;
});
