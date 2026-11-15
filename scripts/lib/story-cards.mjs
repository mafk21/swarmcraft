/* ============================================================================
   Story cards — 1080×1920 posters, as SVG.

   A story is a different medium from a README: read in one second, on a phone,
   by someone who did not ask for it. So this is not a screenshot with a border
   around it. It is a poster: one claim, one drawing of the thing, three proofs,
   one instruction.

   The card is SVG, which matters for two reasons:
     · it renders to PNG with @resvg/resvg-js — no browser, so `npm run card`
       works on any machine and in CI, and I could actually produce the image
       instead of handing over a command that has never been run;
     · the drawing stays sharp at any size, and the file is small enough to
       review as text.

   Design rules it inherits from the app (src/styles/tokens.css):
     · monochrome surfaces, one accent, no gradients, no glow, no emoji
     · Instrument Serif for the claim, Instrument Sans for the reading, JetBrains
       Mono for the things a machine said
     · the ONLY saturated colour is the nine cursor colours, and here they are
       doing the drawing — which is the point of the card.
   ========================================================================== */

import { readFileSync } from 'node:fs';

/**
 * How many suites `npm test` runs, read from package.json.
 *
 * This card used to say "27 test suites" as a string literal. It was true once,
 * then the suite grew and the picture kept claiming 27 — a number in a
 * marketing asset that drifts from reality is worse than no number, because it
 * is checkable and wrong.
 */
function suiteCount() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    return (String(pkg.scripts?.test ?? '').match(/node scripts\/[a-z-]+-test\.mjs/g) ?? []).length;
  } catch {
    return 0;
  }
}

/**
 * The product's name, read from package.json rather than typed again.
 *
 * The poster said SWARMSMITH for months after the rename, and nothing caught it
 * because a rendered image is not greppable. One source, one spelling.
 */
export const BRAND = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).name.toUpperCase();

export const CARD_W = 1080;
export const CARD_H = 1920;

export const CARD_FONTS = {
  serif: 'instrument-serif-latin-400-normal.woff2',
  sans: 'instrument-sans-latin-wght-normal.woff2',
  mono: 'jetbrains-mono-latin-wght-normal.woff2',
};

/** Where each font file lives, relative to the repo root. */
export const CARD_FONT_DIRS = {
  serif: '@fontsource/instrument-serif/files',
  sans: '@fontsource-variable/instrument-sans/files',
  mono: '@fontsource-variable/jetbrains-mono/files',
};

/* ── palette: the app's own tokens, copied so the card cannot drift ──────── */

const S0 = '#0b0b0c'; // page
const S1 = '#111113'; // panel
const S2 = '#171719'; // raised
const S3 = '#1d1d21'; // input
const L1 = '#1f1f23'; // hairline
const L2 = '#2b2b30'; // border
const L3 = '#383840'; // strong
const L4 = '#4a4a53'; // focus
const T0 = '#f5f3ef'; // primary
const T1 = '#b6b3ac'; // secondary
const T2 = '#8a8780'; // tertiary
const T3 = '#5d5b55'; // disabled
const ACC = '#ff9548'; // the one accent

const CURSORS = [
  '#5b8cff',
  '#3dd68c',
  '#f0a92e',
  '#a97bff',
  '#35c6dd',
  '#ff7a94',
  '#c3d94e',
  '#ff9548',
  '#6fd0c0',
];

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ── the copy of each card ───────────────────────────────────────────────────
   Kept as data, so the words can change without reading the drawing code, and
   so `card-test.mjs` can assert that nobody smuggles an emoji or a superlative
   into a public image. */

export const CARDS = {
  /** The main one: what the thing is, in one look. */
  launch: {
    eyebrow: 'Swarmcraft · a website builder that draws',
    claim: 'Write a brief.\nWatch it get built.',
    sub: 'Nine cursors draw your website — dragging the boxes out, typing the headline, stamping the cards — then the real page fades in underneath.',
    proof: ['One request · 80s hard limit', 'No backend · no account', 'MIT · runs on your machine'],
    cta: { label: 'github.com/mafk21/swarmcraft', note: 'link in bio' },
    kicker: 'v0.1',
    art: 'building',
  },

  /** The one that states the rule rather than the feature. */
  guarantee: {
    eyebrow: 'Swarmcraft · the one guarantee',
    claim: 'The model\nnever writes CSS.',
    sub: 'The spec is strict: no field takes a colour, a size, a class or a stylesheet. The model can describe a page and cannot style one — so the worst page it can make is plain, never a gradient, never three identical cards.',
    proof: ['Enforced by the schema', 'Not a prompt request', `${suiteCount()} test suites`],
    cta: { label: 'github.com/mafk21/swarmcraft', note: 'link in bio' },
    kicker: 'no slop',
    art: 'schema',
  },
};

export const CARD_NAMES = {
  launch: 'the main story — what it is, in one look',
  guarantee: 'the rule — the model never writes CSS',
  poster: 'the story poster — one claim, one sheet of paper, no bullet points',
  social: 'the 1280×640 link preview — upload it in Settings → Social preview',
};

/** Names `npm run card` renders, and which renderer each one uses. */
export const CARD_RENDERERS = {
  launch: () => renderCardSvg(CARDS.launch),
  guarantee: () => renderCardSvg(CARDS.guarantee),
  poster: () => renderPosterSvg(),
  /** not a story: GitHub's 1280×640 link preview */
  social: () => renderSocialSvg(),
};

/* ── text measurement ────────────────────────────────────────────────────────
   SVG has no line wrapping, so lines are wrapped here. That needs a width for a
   string, and getting one properly means shaping the font — which the renderer
   will do anyway, differently, later. A per-character estimate is used instead:
   generous, so the result wraps early rather than overflowing. It is wrong by a
   few percent per line, which is invisible at these sizes and honest about what
   it is. */

const NARROW = 'iIlj.,:;!|\'’ tfr()[]';
const WIDE = 'WMmw—';

function charW(ch, face) {
  const base = face === 'serif' ? 0.50 : face === 'mono' ? 0.60 : 0.53;
  if (ch === ' ') return base * 0.52;
  if (NARROW.includes(ch)) return base * 0.62;
  if (WIDE.includes(ch)) return base * 1.52;
  if (ch >= 'A' && ch <= 'Z') return base * 1.18;
  if (ch >= '0' && ch <= '9') return base * 1.0;
  return base;
}

/** The raw per-character estimate. Right to a few percent, both ways. */
export function advance(text, size, face = 'sans') {
  let w = 0;
  for (const ch of String(text)) w += charW(ch, face) * size;
  return w;
}

/**
 * The estimate used for wrapping and for anything that must not overflow.
 *
 * Per-character arithmetic cannot know about kerning or real advance widths, and
 * the raw version under-measured enough for a line to run off the card. The
 * factor is a fudge, in the safe direction: lines wrap early rather than
 * overflow. Placement (a caret after a word, an underline) uses `advance`
 * instead, because there a 6% pad puts the caret in the wrong place — which is
 * exactly how it looked on the poster.
 */
export function measure(text, size, face = 'sans') {
  return advance(text, size, face) * 1.06;
}

/** Greedy wrap to `maxWidth` px. Always returns at least one line. */
export function wrap(text, size, maxWidth, face = 'sans') {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (measure(next, size, face) <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

/* ── the drawing ─────────────────────────────────────────────────────────────
   A page being built, drawn in the card's own hand: a hero box with its W×H
   badge, a headline half-typed with a caret, two cards stamped out with red
   measurement marks, a pen rule, and nine cursors — one per colour the app
   actually uses. Static, but it reads as a moment caught mid-draw.

   `schema` is the same frame showing the other card's argument: the spec as a
   list of fields, with every styling field struck out. */

const ARROW = 'M3 2 L3 19 L8 14.4 L11.2 21 L14.4 19.4 L11.2 13 L18 12.6 Z';

const cursor = (x, y, i, size = 34) => `
    <g transform="translate(${x} ${y}) scale(${size / 24})">
      <path d="${ARROW}" fill="${CURSORS[i % 9]}" stroke="${S0}" stroke-width="1.2" stroke-linejoin="round"/>
    </g>`;

const dots = `<circle cx="112" cy="577" r="5.5" fill="${L3}"/><circle cx="132" cy="577" r="5.5" fill="${L3}"/><circle cx="152" cy="577" r="5.5" fill="${L3}"/>`;

function frame({ url, badge, children, y = 556 }) {
  return `
  <g transform="translate(0 ${y - 556})">
    <rect x="84" y="556" width="912" height="676" rx="10" fill="${S1}" stroke="${L2}"/>
    <path d="M84 566 a10 10 0 0 1 10-10 h892 a10 10 0 0 1 10 10 v32 h-912 z" fill="${S2}"/>
    <line x1="84" y1="598" x2="996" y2="598" stroke="${L1}"/>
    ${dots}
    <text x="180" y="584" font-family="JetBrains Mono" font-size="19" fill="${T2}">${esc(url)}</text>
    <rect x="846" y="564" width="132" height="27" rx="4" fill="#102019" stroke="#1f3a2c"/>
    <text x="912" y="583" text-anchor="middle" font-family="JetBrains Mono" font-size="15" letter-spacing="2.4" fill="#3dd68c">${esc(badge)}</text>
    ${children}
  </g>`;
}

/** A run of grey bars standing in for measured text lines. */
const runs = (x, y, widths, gap = 12, h = 9) =>
  widths.map((w, i) => `<rect x="${x}" y="${y + i * (h + gap)}" width="${w}" height="${h}" rx="2" fill="${L2}"/>`).join('\n    ');

function artBuilding(y) {
  return frame({
    url: 'falconroasters.sa',
    badge: 'BUILDING',
    y,
    children: `
    <!-- the hero, caught mid-drag, with the measurement badge a real drag shows -->
    <rect x="112" y="626" width="856" height="170" rx="4" fill="#ffffff04" stroke="${L4}" stroke-dasharray="6 5"/>
    <rect x="124" y="638" width="96" height="28" rx="3" fill="${S3}" stroke="${L3}"/>
    <text x="172" y="657" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${T1}">880 × 364</text>
    ${cursor(930, 764, 0, 32)}

    <text x="112" y="836" font-family="JetBrains Mono" font-size="15" letter-spacing="3" fill="${T2}">DAMMAM, SINCE 2019</text>

    <text x="112" y="900" font-family="Instrument Serif" font-size="44" fill="${T0}">Roasted on Tuesday, in your</text>
    <text x="112" y="950" font-family="Instrument Serif" font-size="44" fill="${T0}">cup by Thursday</text>
    <rect x="${112 + measure('cup by Thursday', 44, 'serif') + 8}" y="918" width="3" height="36" fill="#3dd68c"/>
    ${cursor(700, 930, 1, 30)}

    ${runs(112, 986, [700, 660, 430])}

    <rect x="112" y="1078" width="410" height="86" rx="5" fill="${S2}" stroke="${L2}"/>
    <text x="132" y="1110" font-family="JetBrains Mono" font-size="19" fill="${T0}">SAR 65</text>
    ${runs(132, 1124, [220, 140], 10, 8)}
    <rect x="558" y="1078" width="410" height="86" rx="5" fill="${S2}" stroke="${L3}"/>
    <text x="578" y="1110" font-family="JetBrains Mono" font-size="19" fill="${T0}">SAR 70</text>
    ${runs(578, 1124, [220, 140], 10, 8)}
    <line x1="540" y1="1064" x2="540" y2="1178" stroke="#ff7a94" stroke-width="1"/>
    <rect x="520" y="1110" width="40" height="19" rx="2" fill="${S3}"/>
    <text x="540" y="1124" text-anchor="middle" font-family="JetBrains Mono" font-size="12" fill="#ff7a94">24</text>
    ${cursor(760, 1150, 2, 30)}
    ${cursor(196, 1186, 7, 28)}

    <line x1="112" y1="1206" x2="968" y2="1206" stroke="${L3}"/>
    <circle cx="968" cy="1206" r="4" fill="#35c6dd"/>
    ${cursor(300, 690, 3, 28)}
    ${cursor(820, 800, 4, 30)}
    ${cursor(160, 1040, 5, 28)}
    ${cursor(520, 1180, 6, 28)}
    ${cursor(880, 1000, 8, 30)}`
  });
}

function artSchema(y) {
  const rows = [
    ['sections', false],
    ['heading', false],
    ['body', false],
    ['cta', false],
    ['theme', false],
    ['style', true],
    ['className', true],
    ['css', true],
  ];
  const rowsSvg = rows
    .map(([field, banned], i) => {
      const y = 700 + i * 58;
      const colour = banned ? '#ff7a94' : T1;
      return `
    <text x="150" y="${y}" font-family="JetBrains Mono" font-size="25" fill="${colour}">${esc(field)}</text>
    <text x="330" y="${y}" font-family="JetBrains Mono" font-size="25" fill="${T3}">${banned ? '— no such field' : 'string · required'}</text>
    ${banned ? `<line x1="140" y1="${y - 9}" x2="${330 + measure('— no such field', 25, 'mono')}" y2="${y - 9}" stroke="#ff7a94" stroke-width="1.5" opacity="0.7"/>` : ''}`;
    })
    .join('');

  return frame({
    url: 'SiteSpecSchema',
    badge: 'STRICT',
    y,
    children: `
    <rect x="112" y="626" width="856" height="560" rx="5" fill="${S0}" stroke="${L2}"/>
    <text x="140" y="664" font-family="JetBrains Mono" font-size="17" letter-spacing="2.4" fill="${T2}">WHAT THE MODEL MAY RETURN</text>
    ${rowsSvg}
    <text x="140" y="1190" font-family="JetBrains Mono" font-size="16" fill="${T3}">anything else is stripped, not rendered</text>
    ${cursor(820, 640, 0, 30)}
    ${cursor(700, 900, 3, 28)}
    ${cursor(880, 1130, 4, 30)}
    ${cursor(420, 1240, 6, 28)}
    ${cursor(200, 1130, 1, 28)}
    ${cursor(760, 1240, 2, 28)}
    ${cursor(520, 700, 5, 28)}
    ${cursor(940, 980, 7, 28)}
    ${cursor(150, 1230, 8, 28)}`
  });
}

/* ── the card ───────────────────────────────────────────────────────────────
   One flat document, no external requests, no script. The only interpolation is
   copy, and it is escaped. */

export function renderCardSvg(spec = CARDS.launch) {
  const { eyebrow, claim, sub, proof, cta, kicker, art } = spec;

  /* The layout is computed, not hand-placed, because the copy is editable: a
     longer claim must push the drawing down, not run underneath it. Baseline
     positions only — the drawing keeps its own coordinate space and is shifted
     as a block. */
  const CLAIM_SIZE = 88;
  const CLAIM_LEAD = 96;
  const SUB_SIZE = 31;
  const SUB_LEAD = 44;

  const claimLines = String(claim)
    .split('\n')
    .flatMap((line) => wrap(line, CLAIM_SIZE, 900, 'serif'));
  const claimTop = 330;
  const claimSvg = claimLines
    .map(
      (line, i) =>
        `<text x="84" y="${claimTop + i * CLAIM_LEAD}" font-family="Instrument Serif" font-size="${CLAIM_SIZE}" fill="${T0}">${esc(line)}</text>`
    )
    .join('\n  ');

  const subLines = wrap(sub, SUB_SIZE, 872, 'sans');
  const subTop = claimTop + claimLines.length * CLAIM_LEAD + 6;
  const subSvg = subLines
    .map(
      (line, i) => `<text x="84" y="${subTop + i * SUB_LEAD}" font-family="Instrument Sans" font-size="${SUB_SIZE}" fill="${T1}">${esc(line)}</text>`
    )
    .join('\n  ');

  const artY = subTop + subLines.length * SUB_LEAD + 46;
  const artSvg = art === 'schema' ? artSchema(artY) : artBuilding(artY);
  const artBottom = artY + 676;

  const proofTop = artBottom + 74;
  const proofSvg = proof
    .map(
      (p, i) =>
        `<line x1="86" y1="${proofTop + i * 50 - 9}" x2="86" y2="${proofTop + i * 50 + 1}" stroke="${ACC}" stroke-width="2.5"/>` +
        `<text x="112" y="${proofTop + i * 50}" font-family="Instrument Sans" font-size="28" fill="${T1}">${esc(p)}</text>`
    )
    .join('\n  ');

  /* Footer pinned to the bottom, inside the band a story UI does not cover. */
  const footRule = 1752;
  const footCta = 1816;
  const footKick = 1872;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <pattern id="graticule" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0 H0 V32" fill="none" stroke="#f5f3ef" stroke-opacity="0.022" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" fill="${S0}"/>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#graticule)"/>

  <text x="84" y="188" font-family="JetBrains Mono" font-size="24" letter-spacing="5" fill="${T2}">${esc(String(eyebrow).toUpperCase())}</text>

  ${claimSvg}

  ${subSvg}

  ${artSvg}

  ${proofSvg}

  <line x1="84" y1="${footRule}" x2="996" y2="${footRule}" stroke="${L2}"/>
  <text x="84" y="${footCta}" font-family="JetBrains Mono" font-size="30" fill="${T0}">${esc(cta.label)}</text>
  <text x="996" y="${footCta}" text-anchor="end" font-family="JetBrains Mono" font-size="21" fill="${T2}">${esc(cta.note)}</text>
  <text x="84" y="${footKick}" font-family="JetBrains Mono" font-size="19" letter-spacing="4" fill="${T3}">${esc(String(kicker).toUpperCase())}</text>
  <text x="996" y="${footKick}" text-anchor="end" font-family="JetBrains Mono" font-size="19" letter-spacing="4" fill="${T3}">MIT</text>
</svg>`;
}


/* ── the poster ──────────────────────────────────────────────────────────────
   Different job from the launch card. That one explains; this one has to stop a
   thumb.

   So: no explanation, no three proofs in a row, no bullet list — those are the
   shapes that read as generated. One enormous line of type, one sheet of paper
   with a corner still being dragged, and the swarm's own cursors on it. The
   claim is the picture; the picture is the product.

   Everything is placed from the sheet's geometry rather than centred by eye,
   because a poster that is off by four pixels looks like a mistake and a poster
   that is composed looks deliberate. */

export function renderPosterSvg() {
  const SHEET = { x: 76, y: 806, w: 928, h: 660 };
  const inner = SHEET.x + 44;

  /* Nine cursors, each on a corner or an edge of the sheet, each pointing at
     what it is about to touch. Positions are fractions of the sheet, so the
     drawing survives being resized. */
  const on = (fx, fy, i, size = 40) =>
    cursor(SHEET.x + SHEET.w * fx, SHEET.y + SHEET.h * fy, i, size);

  const sheet = `
  <g>
    <rect x="${SHEET.x}" y="${SHEET.y}" width="${SHEET.w}" height="${SHEET.h}" rx="8" fill="${S1}" stroke="${L2}"/>
    <!-- the top bar of the page, measured -->
    <path d="M${SHEET.x + 8} ${SHEET.y} h${SHEET.w - 16} a8 8 0 0 1 8 8 v26 h-${SHEET.w} v-26 a8 8 0 0 1 8-8 z" fill="${S2}"/>
    <line x1="${SHEET.x}" y1="${SHEET.y + 34}" x2="${SHEET.x + SHEET.w}" y2="${SHEET.y + 34}" stroke="${L1}"/>
    <circle cx="${inner}" cy="${SHEET.y + 17}" r="4.5" fill="${L3}"/>
    <circle cx="${inner + 17}" cy="${SHEET.y + 17}" r="4.5" fill="${L3}"/>
    <text x="${inner + 40}" y="${SHEET.y + 22}" font-family="JetBrains Mono" font-size="17" fill="${T2}">falconroasters.sa</text>

    <!-- the headline: the one thing this poster says twice -->
    <text x="${inner}" y="${SHEET.y + 146}" font-family="Instrument Serif" font-size="66" fill="${T0}">Roasted on Tuesday,</text>
    <text x="${inner}" y="${SHEET.y + 218}" font-family="Instrument Serif" font-size="66" fill="${T0}">in your cup by Thursday</text>
    <rect x="${inner + advance('in your cup by Thursday', 66, 'serif') + 7}" y="${SHEET.y + 168}" width="4" height="58" fill="${MARK_ACCENT}"/>

    <line x1="${inner}" y1="${SHEET.y + 264}" x2="${SHEET.x + SHEET.w - 44}" y2="${SHEET.y + 264}" stroke="${L1}"/>

    <!-- three product rows, drawn as measured rules, not as cards -->
    ${[0, 1, 2]
      .map((i) => {
        const y = SHEET.y + 306 + i * 74;
        return `
    <text x="${inner}" y="${y}" font-family="Instrument Sans" font-size="26" fill="${T1}">${['Espresso Roast', 'Filter Roast', 'Filter Papers'][i]}</text>
    <text x="${SHEET.x + SHEET.w - 44}" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-size="24" fill="${T2}">${['SAR 65', 'SAR 70', 'SAR 12'][i]}</text>
    <line x1="${inner}" y1="${y + 22}" x2="${SHEET.x + SHEET.w - 44}" y2="${y + 22}" stroke="${L1}" opacity="0.7"/>`;
      })
      .join('')}

    <!-- the corner that is not finished, and the handle that is dragging it -->
    <path d="M${SHEET.x + SHEET.w - 132} ${SHEET.y + SHEET.h} h${104}" stroke="${MARK_ACCENT}" stroke-width="3" stroke-linecap="round"/>
    <rect x="${SHEET.x + SHEET.w - 34}" y="${SHEET.y + SHEET.h - 6}" width="12" height="12" fill="${MARK_ACCENT}"/>
    <rect x="${SHEET.x + SHEET.w - 150}" y="${SHEET.y + SHEET.h - 34}" width="92" height="26" rx="3" fill="${S3}" stroke="${L3}"/>
    <text x="${SHEET.x + SHEET.w - 104}" y="${SHEET.y + SHEET.h - 16}" text-anchor="middle" font-family="JetBrains Mono" font-size="15" fill="${T1}">928 × 660</text>

    ${on(0.99, 0.99, 0, 44)}
    ${on(0.50, 0.80, 1)}
    ${on(0.78, 0.42, 2)}
    ${on(0.72, 0.29, 3)}
    ${on(0.06, 0.56, 4)}
    ${on(0.42, 0.63, 5)}
    ${on(0.94, 0.62, 6)}
    ${on(0.3, 0.88, 7)}
    ${on(0.68, 0.84, 8)}
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <pattern id="graticule" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0 H0 V32" fill="none" stroke="#f5f3ef" stroke-opacity="0.022" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${CARD_W}" height="${CARD_H}" fill="${S0}"/>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#graticule)"/>

  <text x="76" y="188" font-family="JetBrains Mono" font-size="22" letter-spacing="6" fill="${T2}">${BRAND}</text>
  <line x1="76" y1="216" x2="1004" y2="216" stroke="${L2}"/>

  <text x="72" y="404" font-family="Instrument Serif" font-size="176" fill="${T0}">Your website,</text>
  <text x="72" y="576" font-family="Instrument Serif" font-size="176" fill="${T0}">drawn</text>
  <text x="72" y="748" font-family="Instrument Serif" font-size="176" font-style="italic" fill="${ACC}">in front of you.</text>

  ${sheet}

  <line x1="76" y1="1600" x2="1004" y2="1600" stroke="${L2}"/>
  <text x="76" y="1664" font-family="JetBrains Mono" font-size="29" fill="${T0}">github.com/mafk21/swarmcraft</text>
  <text x="1004" y="1664" text-anchor="end" font-family="JetBrains Mono" font-size="21" fill="${T2}">link in bio</text>
  <text x="76" y="1718" font-family="JetBrains Mono" font-size="18" letter-spacing="4" fill="${T3}">NINE CURSORS · ONE REQUEST · 80 SECONDS</text>
  <text x="1004" y="1718" text-anchor="end" font-family="JetBrains Mono" font-size="18" letter-spacing="4" fill="${T3}">MIT</text>
</svg>`;
}

/* ── the social preview ──────────────────────────────────────────────────────
   GitHub's social preview is 1280×640 and shows on every link to the repo:
   Slack, X, WhatsApp, a CV. It is the most-seen picture this project has, and
   until now there was not one, so the link previewed as a grey rectangle with a
   truncated README line.

   Not a crop of the story card: 1280×640 is a different shape and a different
   reading distance. The claim goes left, big; the thing it is about goes right,
   drawn; the one URL sits under the claim where a preview's eye already is.

   GitHub accepts nothing larger than 1 MB here, so this is rendered at exactly
   1280×640 rather than drawn huge and scaled down. */

export const SOCIAL_W = 1280;
export const SOCIAL_H = 640;

export function renderSocialSvg() {
  /* The sheet: the page being built, at the right, measured off its own box so
     the cursors land on its edges instead of near them. */
  const SHEET = { x: 706, y: 152, w: 470, h: 372 };
  const inner = SHEET.x + 30;
  const on = (fx, fy, i, size = 30) =>
    cursor(SHEET.x + SHEET.w * fx, SHEET.y + SHEET.h * fy, i, size);

  const sheet = `
  <g>
    <rect x="${SHEET.x}" y="${SHEET.y}" width="${SHEET.w}" height="${SHEET.h}" rx="7" fill="${S1}" stroke="${L2}"/>
    <path d="M${SHEET.x + 7} ${SHEET.y} h${SHEET.w - 14} a7 7 0 0 1 7 7 v22 h-${SHEET.w} v-22 a7 7 0 0 1 7-7 z" fill="${S2}"/>
    <line x1="${SHEET.x}" y1="${SHEET.y + 29}" x2="${SHEET.x + SHEET.w}" y2="${SHEET.y + 29}" stroke="${L1}"/>
    <text x="${inner}" y="${SHEET.y + 19}" font-family="JetBrains Mono" font-size="13" fill="${T2}">falconroasters.sa</text>

    <text x="${inner}" y="${SHEET.y + 96}" font-family="Instrument Serif" font-size="40" fill="${T0}">Roasted on</text>
    <text x="${inner}" y="${SHEET.y + 140}" font-family="Instrument Serif" font-size="40" fill="${T0}">Tuesday</text>
    <rect x="${inner + advance('Tuesday', 40, 'serif') + 5}" y="${SHEET.y + 110}" width="3" height="34" fill="${MARK_ACCENT}"/>

    <line x1="${inner}" y1="${SHEET.y + 172}" x2="${SHEET.x + SHEET.w - 30}" y2="${SHEET.y + 172}" stroke="${L1}"/>

    ${[0, 1]
      .map((i) => {
        const y = SHEET.y + 214 + i * 48;
        return `
    <text x="${inner}" y="${y}" font-family="Instrument Sans" font-size="18" fill="${T1}">${['Espresso Roast', 'Filter Papers'][i]}</text>
    <text x="${SHEET.x + SHEET.w - 30}" y="${y}" text-anchor="end" font-family="JetBrains Mono" font-size="16" fill="${T2}">${['SAR 65', 'SAR 12'][i]}</text>
    <line x1="${inner}" y1="${y + 15}" x2="${SHEET.x + SHEET.w - 30}" y2="${y + 15}" stroke="${L1}" opacity="0.7"/>`;
      })
      .join('')}

    <!-- the card being stamped, two corners still open -->
    <rect x="${inner}" y="${SHEET.y + 288}" width="186" height="58" rx="4" fill="${S3}" stroke="${L3}" stroke-dasharray="6 5"/>
    <text x="${inner + 93}" y="${SHEET.y + 322}" text-anchor="middle" font-family="JetBrains Mono" font-size="13" fill="${T1}">186 × 58</text>

    <!-- the corner still being dragged, and the handle on it -->
    <path d="M${SHEET.x + SHEET.w - 74} ${SHEET.y + SHEET.h} h54" stroke="${MARK_ACCENT}" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="${SHEET.x + SHEET.w - 24}" y="${SHEET.y + SHEET.h - 5}" width="10" height="10" fill="${MARK_ACCENT}"/>

    ${on(0.99, 0.99, 0, 34)}
    ${on(0.2, 0.1, 1)}
    ${on(0.62, 0.5, 2)}
    ${on(0.06, 0.72, 3)}
    ${on(0.86, 0.44, 4)}
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SOCIAL_W}" height="${SOCIAL_H}" viewBox="0 0 ${SOCIAL_W} ${SOCIAL_H}">
  <defs>
    <pattern id="graticule" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0 H0 V32" fill="none" stroke="#f5f3ef" stroke-opacity="0.022" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="${SOCIAL_W}" height="${SOCIAL_H}" fill="${S0}"/>
  <rect width="${SOCIAL_W}" height="${SOCIAL_H}" fill="url(#graticule)"/>

  <text x="72" y="96" font-family="JetBrains Mono" font-size="17" letter-spacing="5" fill="${T2}">${BRAND} · A WEBSITE BUILDER THAT DRAWS</text>
  <line x1="72" y1="122" x2="1208" y2="122" stroke="${L2}"/>

  <text x="68" y="266" font-family="Instrument Serif" font-size="104" fill="${T0}">Write a brief.</text>
  <text x="68" y="374" font-family="Instrument Serif" font-size="104" fill="${T0}">Nine cursors</text>
  <text x="68" y="482" font-family="Instrument Serif" font-size="104" font-style="italic" fill="${ACC}">draw it.</text>

  <text x="72" y="540" font-family="JetBrains Mono" font-size="22" fill="${T0}">github.com/mafk21/swarmcraft</text>
  <text x="72" y="580" font-family="JetBrains Mono" font-size="15" letter-spacing="3" fill="${T3}">ONE REQUEST · 80 SECONDS · NO BACKEND · MIT</text>

  ${sheet}
</svg>`;
}

/** The `<style>`-free part of the palette the tests want to assert on. */
export const CARD_ACCENT = ACC;
export const MARK_ACCENT = '#5b8cff';
export const CURSOR_COLOURS = CURSORS;
