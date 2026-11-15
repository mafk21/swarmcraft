/* ============================================================================
   The parts of the screenshot tool that do not need a browser.

   Everything here is pure or nearly so — a browser lookup, a URL-to-file
   resolver, the stubbed model answer, and the GIF encoder. `scripts/shots.mjs`
   is the part that drives Chrome; this file is the part that can be tested on a
   machine with no Chrome at all, which is exactly the machine CI runs on.

   Keeping the boundary here is not tidiness for its own sake: the round that
   added this tool could not run a browser in the environment it was written in,
   and a tool that has never been executed is a rumour. The testable half is
   proven on every `npm test`; the browser half says so loudly when it cannot
   run instead of pretending to have captured something.
   ========================================================================== */

import gifenc from 'gifenc';
import { existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, resolve as resolvePath, sep } from 'node:path';

/* ── the demo page ───────────────────────────────────────────────────────────
   The brief the tool pretends to be given, and the spec the stub model returns
   for it. One made-up roastery, written by hand, so the README shows a page a
   person would recognise rather than lorem ipsum.

   It lives in this tool, not in the app: the product ships no demo content.
   The shape is enforced by `SiteSpecSchema` — `scripts/shots-test.mjs` parses
   this object through the real schema, so the stub cannot drift into something
   the app would reject. */

export const DEMO_SPEC = {
  meta: {
    title: 'Falcon Coffee Roasters',
    description:
      'Single-origin coffee roasted in Dammam every Tuesday, shipped anywhere in Saudi Arabia.',
    theme: 'editorial',
    accent: 'clay',
    themeReason: 'A printed, quiet system for a roastery that sells by the bag, not by the cup.',
  },
  nav: {
    brand: 'Falcon Coffee',
    links: [
      { label: 'Beans', href: '#products' },
      { label: 'How we roast', href: '#features' },
      { label: 'Visit', href: '#contact' },
    ],
  },
  sections: [
    {
      type: 'hero',
      eyebrow: 'Dammam, since 2019',
      headline: 'Roasted on Tuesday, in your cup by Thursday',
      sub: 'Two single origins and the paper to brew them with. Whole bean only, because we cannot grind coffee we have not tasted that week.',
      cta: { label: 'See the beans', href: '#products' },
    },
    {
      type: 'products',
      heading: 'Beans, by the bag',
      items: [
        { name: 'Espresso Roast', price: 'SAR 65', note: '250g. Chocolate, date, low acid.' },
        { name: 'Filter Roast', price: 'SAR 70', note: '250g. Apricot and black tea.' },
        { name: 'Filter Papers', price: 'SAR 12', note: '100 sheets, size 02.' },
      ],
    },
    {
      type: 'features',
      heading: 'How we roast',
      items: [
        {
          title: 'One roast day',
          body: 'Everything is roasted on Tuesday, so nothing sits in a bag for weeks before it reaches you.',
        },
        {
          title: 'Whole bean only',
          body: 'We do not grind, and we do not sell coffee by the cup. A bag leaves here the way it was roasted.',
        },
        {
          title: 'Shipped from Dammam',
          body: 'Orders leave the roastery within a day and arrive in two to three, anywhere in the Kingdom.',
        },
      ],
    },
    {
      type: 'schedule',
      heading: 'When the roastery is open',
      days: [
        { day: 'Saturday to Thursday', items: [{ time: '9:00 – 17:00', title: 'Collections and tastings' }] },
        { day: 'Friday', items: [{ time: 'Closed', title: 'No roast, no shop' }] },
      ],
    },
    {
      type: 'contact',
      heading: 'Come by, or write',
      email: 'hello@falconroasters.sa',
      phone: '013 812 4400',
      address: 'King Fahd Road, Dammam',
      form: true,
    },
  ],
  footer: { note: 'Falcon Coffee Roasters · King Fahd Road, Dammam' },
  voice: {
    register: 'Plain and specific. Prices and days, not adjectives.',
    facts: [
      'Roasted every Tuesday',
      'Espresso SAR 65, filter SAR 70, papers SAR 12',
      'Ships in two to three days within Saudi Arabia',
      'Closed Friday',
    ],
  },
};

/* ── finding a browser ───────────────────────────────────────────────────────
   The tool uses the Chrome the user already has (Edge counts). No 150 MB
   download, no "install our browser first". Injected dependencies make this
   testable without a browser being present. */

const MAC = '/Applications';
const WIN = 'C:\\Program Files';
const WIN86 = 'C:\\Program Files (x86)';

const CANDIDATES = {
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ],
  darwin: [
    `${MAC}/Google Chrome.app/Contents/MacOS/Google Chrome`,
    `${MAC}/Chromium.app/Contents/MacOS/Chromium`,
    `${MAC}/Microsoft Edge.app/Contents/MacOS/Microsoft Edge`,
    `${MAC}/Brave Browser.app/Contents/MacOS/Brave Browser`,
  ],
  win32: [
    `${WIN}\\Google\\Chrome\\Application\\chrome.exe`,
    `${WIN86}\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    `${WIN86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${WIN}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ],
};

/**
 * @returns {{ path: string|null, tried: string[], how: 'env'|'known'|'where'|null }}
 */
export function findChrome({
  env = process.env.CHROME_PATH,
  platform = process.platform,
  exists = existsSync,
  which = defaultWhich,
} = {}) {
  const tried = [];

  if (env) {
    tried.push(env);
    if (exists(env)) return { path: env, tried, how: 'env' };
  }

  for (const candidate of CANDIDATES[platform] ?? CANDIDATES.linux) {
    tried.push(candidate);
    if (exists(candidate)) return { path: candidate, tried, how: 'known' };
  }

  /* Windows installs per-user as well, and that path contains the user name, so
     asking the PATH is more reliable than guessing it. */
  if (platform === 'win32') {
    for (const exe of ['chrome.exe', 'msedge.exe']) {
      let found = null;
      try {
        found = which(exe);
      } catch {
        found = null;
      }
      if (found) {
        tried.push(found);
        if (exists(found)) return { path: found, tried, how: 'where' };
      } else {
        tried.push(`where ${exe}`);
      }
    }
  }

  return { path: null, tried, how: null };
}

function defaultWhich(exe) {
  const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', [exe], {
    stdio: ['ignore', 'pipe', 'ignore'],
    encoding: 'utf8',
  });
  const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
  return first ?? null;
}

/* ── serving dist/, plus the stubbed model ───────────────────────────────────
   The images must come from the real pipeline, and the real pipeline normally
   spends one Gemini request. This answers that request locally instead, in
   Google's own response shape, so nothing is mocked except the model's opinion
   about a made-up roastery. Zero quota, no key, no network. */

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function mimeFor(path) {
  return MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/** The exact envelope `buildSite` reads: one candidate, one text part, STOP. */
export function stubModelBody(spec = DEMO_SPEC) {
  return {
    candidates: [
      {
        finishReason: 'STOP',
        content: { parts: [{ text: JSON.stringify(spec) }] },
      },
    ],
  };
}

/**
 * Map a request path onto a file inside `root`, or null.
 *
 * The tool serves a static directory to a local browser, so a path that climbs
 * out of it is a bug even when the browser is ours: `..%2f..%2fetc` must not
 * become a file read. `resolvePath` collapses the traversal, then the prefix
 * check rejects whatever is left outside.
 */
export function resolveStatic(root, pathname, exists = existsSync, isFile = defaultIsFile, mounts = null) {
  /* `mounts` is checked first, longest prefix wins, so one server can hand out
     `dist/` and the two font files a story card needs out of node_modules. */
  if (mounts && typeof mounts === 'object') {
    for (const [prefix, dir] of Object.entries(mounts).sort((a, b) => b[0].length - a[0].length)) {
      if (pathname.startsWith(prefix)) {
        return resolveStatic(dir, pathname.slice(prefix.length) || '/', exists, isFile);
      }
    }
  }
  let decoded;
  try {
    decoded = decodeURIComponent(pathname.split('?')[0].split('#')[0]);
  } catch {
    return null; // malformed percent-encoding
  }
  if (decoded.endsWith('/')) decoded += 'index.html';
  if (decoded === '') decoded = '/index.html';

  const rootAbs = resolvePath(root);
  const file = resolvePath(join(rootAbs, decoded));

  if (file !== rootAbs && !file.startsWith(rootAbs + sep)) return null;
  if (!exists(file)) return null;
  if (!isFile(file)) return null;
  return file;
}

function defaultIsFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/* ── the GIF ─────────────────────────────────────────────────────────────────
   A README animation has to loop, or the reader sees one pass and a freeze.
   `gifenc` writes the NETSCAPE2.0 application extension only for the first
   frame, which is also the only frame that carries the palette — so both are
   passed on the first frame, explicitly.

   `gifenc` ships a CJS build and an ES module whose default export is the whole
   API object. `import { GIFEncoder } from 'gifenc'` is what its docs show and it
   throws "Named export not found" before any of this runs, so the namespace is
   imported once at the top and used through that. */

export function encodeGif(frames, { fps = 7 } = {}) {
  if (!frames.length) throw new Error('encodeGif needs at least one frame');

  const gif = gifenc.GIFEncoder();
  const delay = Math.round(1000 / fps);

  frames.forEach((frame, i) => {
    if (!(frame.rgba instanceof Uint8Array)) {
      throw new Error(`encodeGif frame ${i}: rgba must be a Uint8Array`);
    }
    const expected = frame.w * frame.h * 4;
    if (frame.rgba.length !== expected) {
      throw new Error(`encodeGif frame ${i}: ${frame.rgba.length} bytes, expected ${expected}`);
    }

    // One palette per frame. Frames differ a lot here (a mostly-empty canvas
    // versus a full page), so a shared palette would band the later ones.
    const palette = gifenc.quantize(frame.rgba, 128, { format: 'rgb444' });
    const indexed = gifenc.applyPalette(frame.rgba, palette, 'rgb444');

    /* The loop block (NETSCAPE2.0, repeat = forever) is written by gifenc for
       the first frame only, which is also the only frame that carries the
       global palette. Passing a palette on every frame gives each one its own
       local table, so a mostly-empty early frame cannot band a later one. */
    gif.writeFrame(indexed, frame.w, frame.h, { palette, delay });
  });

  gif.finish();
  return gif.bytes();
}

/* ── tiny helpers the driver shares ──────────────────────────────────────── */

/** The stub key. Shaped like the real thing so the UI treats it as one. */
export const STUB_KEY = 'AQ.Ab8Xk2nQ9wBiA_SCREENSHOT_TOOL_ONLY';

/** What `--only` accepts: one letter per output. */
export const OUTPUTS = {
  a: 'mid-build.gif',
  b: 'finished.png',
  c: 'inspector.png',
};

export function parseOnly(raw) {
  const letters = String(raw)
    .toLowerCase()
    .split('')
    .filter((c) => c in OUTPUTS);
  return letters.length ? letters : Object.keys(OUTPUTS);
}

