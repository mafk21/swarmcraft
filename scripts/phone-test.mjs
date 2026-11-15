/* ============================================================================
   The Phone button must actually show a phone.

   A preview width is easy to add and easy to get wrong in a way nobody notices,
   because the wrong version still draws a narrow page: it is just the DESKTOP
   layout, squeezed. That happens when the frame is narrower than the bench but
   wider than the page's first breakpoint.

   The page's breakpoints live in render.ts as literal CSS, so this reads them
   from there rather than trusting a number written in the stylesheet, and
   asserts the phone width is below the smallest of them. If someone moves the
   layout's breakpoints, this fails and the toggle gets fixed with them.
   ========================================================================== */
import { readFileSync } from 'node:fs';

const css = readFileSync('src/lib/render.ts', 'utf8');
const app = readFileSync('src/styles/app.css', 'utf8');

let fail = 0;
const ok = (n, c, d = '') => {
  if (!c) {
    fail++;
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  }
};

/* ── what the phone frame is ─────────────────────────────────────────────── */

/* Default to NaN, not undefined: an assertion that reports "frame NaNpx" is
   readable, and one that crashes never runs. This was an undefined in the first
   draft and the missing-width mutation slipped past it. */
/* Look at the TOP-LEVEL rule only. A width declared inside @media
   (max-width: 1000px) only applies on a small app window, so a phone frame
   defined there alone would be full-width on a desktop — which is the bug this
   test exists for. The @media blocks are stripped before matching. */
function stripMedia(cssText) {
  let out = '';
  let i = 0;
  while (i < cssText.length) {
    const at = cssText.indexOf('@media', i);
    if (at === -1) {
      out += cssText.slice(i);
      break;
    }
    out += cssText.slice(i, at);
    let depth = 0;
    let j = at;
    for (; j < cssText.length; j++) {
      if (cssText[j] === '{') depth++;
      else if (cssText[j] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    i = j + 1;
  }
  return out;
}

const topLevel = stripMedia(app);
const widthMatch = topLevel.match(/\.bench-stage\.on-phone iframe\s*\{[^}]*width:\s*(\d+)px/);
const phoneWidth = widthMatch ? Number(widthMatch[1]) : NaN;
ok('the phone frame has a fixed width', Number.isFinite(phoneWidth) && phoneWidth > 0, String(phoneWidth));

/* ── what the generated page considers narrow ────────────────────────────── */

const breakpoints = [...css.matchAll(/@media\s*\(max-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
const smallest = Math.min(...breakpoints);
ok('the page has breakpoints to hit', breakpoints.length > 0 && Number.isFinite(smallest), `${breakpoints.length} found`);

/* The whole point: at this width the page's own media queries must fire. */
ok(
  'the phone frame is narrower than the first breakpoint',
  phoneWidth < smallest,
  `frame ${phoneWidth}px vs smallest breakpoint ${smallest}px — the page would still be in its desktop layout`
);

/* A frame that is too wide is a lie; one that is absurdly narrow has no
   relationship to a device. 320–420 is the range real phones report. */
ok('the phone width is a real phone width', phoneWidth >= 320 && phoneWidth <= 420, `${phoneWidth}px`);

/* ── the frame is the same document, not a second render ─────────────────── */

ok(
  'phone mode does not re-render the page',
  /\.bench-stage\.on-phone iframe\s*\{[^}]*width:/.test(topLevel) && !/on-phone[\s\S]{0,400}srcDoc/.test(app),
  'the frame must be sized by CSS so the page keeps the same scroll position and the same DOM'
);

/* ── both buttons exist and one is on ────────────────────────────────────── */

const screen = readFileSync('src/app/screens/ResultScreen.tsx', 'utf8');
ok('there is a desktop button', /Desktop/.test(screen));
ok('there is a phone button', /Phone/.test(screen));
ok('the default is desktop', /useState<'desktop' \| 'phone'>\('desktop'\)/.test(screen));
ok(
  'the pressed state is exposed to assistive tech',
  (screen.match(/aria-pressed=\{device === '(desktop|phone)'\}/g) ?? []).length === 2
);

console.log(fail ? `\nPHONE ${fail} FAILED\n` : `\nPHONE OK — ${phoneWidth}px, below every breakpoint at ${smallest}px, same document\n`);
process.exit(fail ? 1 : 0);
