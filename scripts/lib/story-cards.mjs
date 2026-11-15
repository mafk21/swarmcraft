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
    eyebrow: 'Swarmsmith · a website builder that draws',
    claim: 'Write a brief.\nWatch it get built.',
    sub: 'Nine cursors draw your website — dragging the boxes out, typing the headline, stamping the cards — then the real page fades in underneath.',
    proof: ['One request · 80s hard limit', 'No backend · no account', 'MIT · runs on your machine'],
    cta: { label: 'github.com/mafk21/swarm-builder', note: 'link in bio' },
    kicker: 'v0.1',
    art: 'building',
  },

  /** The one that states the rule rather than the feature. */
  guarantee: {
    eyebrow: 'Swarmsmith · the one guarantee',
    claim: 'The model\nnever writes CSS.',
    sub: 'The spec is strict and has no field for a colour, a size or a class. The worst page it can make is plain — never gradients, never three identical cards.',
    proof: ['Enforced by the schema', 'Not a prompt request', '27 test suites'],
    cta: { label: 'github.com/mafk21/swarm-builder', note: 'link in bio' },
    kicker: 'no slop',
    art: 'schema',
  },
};

export const CARD_NAMES = {
  launch: 'the main story — what it is, in one look',
  guarantee: 'the rule — the model never writes CSS',
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

export function measure(text, size, face = 'sans') {
  let w = 0;
  for (const ch of String(text)) w += charW(ch, face) * size;
  /* Per-character arithmetic cannot know about kerning or the real advance
     widths, and it was under-measuring by about 6% — enough for a line to run
     off the card. The factor is a fudge, and it is a fudge in the safe
     direction: lines wrap early rather than overflow. */
  return w * 1.06;
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

/** The `<style>`-free part of the palette the tests want to assert on. */
export const CARD_ACCENT = ACC;
export const CURSOR_COLOURS = CURSORS;
