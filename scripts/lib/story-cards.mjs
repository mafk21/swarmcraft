/* ============================================================================
   Story cards — 1080×1920 images for an Instagram / WhatsApp story.

   A story is a different medium from a README: it is read in one second, on a
   phone, by someone who did not ask for it. So this is not a screenshot with a
   border around it. It is a poster: one claim, one drawing of the thing, one
   line of proof, one instruction.

   The card is HTML and is rendered by a real browser at 1080×1920, which means
   it uses the same typefaces the app uses and can be tweaked without touching a
   binary. `scripts/card.mjs` turns it into PNGs.

   Design rules it inherits from the app itself (src/styles/tokens.css):
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

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ── the copy of each card ───────────────────────────────────────────────────
   Kept as data, not baked into the markup, so the words can change without
   anyone having to read the HTML, and so `card-test.mjs` can assert that nobody
   smuggles an emoji or a superlative into a public image. */

export const CARDS = {
  /** The main one: what the thing is, in one look. */
  launch: {
    eyebrow: 'Swarmsmith',
    claim: 'Write a brief.\nWatch it get built.',
    sub: 'Nine cursors draw your website on a canvas — dragging boxes, typing the headline, stamping the cards — then the real, interactive page fades in underneath.',
    proof: ['One request · 80s hard limit', 'No backend · no account', 'MIT · runs on your machine'],
    cta: { label: 'github.com/mafk21/swarm-builder', note: 'link in bio' },
    kicker: 'v0.1',
  },

  /** The one that states the rule rather than the feature. */
  guarantee: {
    eyebrow: 'The one guarantee',
    claim: 'The model\nnever writes CSS.',
    sub: 'The spec is strict and has no field for a colour, a size or a class. The worst page it can produce is plain — never gradients, never three identical cards.',
    proof: ['Schema-enforced', 'Not a prompt request', '27 test suites'],
    cta: { label: 'github.com/mafk21/swarm-builder', note: 'link in bio' },
    kicker: 'no slop',
  },
};

/* ── the drawing ─────────────────────────────────────────────────────────────
   A page being built, drawn in the card's own hand: a hero box with its W×H
   badge, a headline half-typed with a caret, two cards stamped out with red
   measurement marks, a pen rule, and nine cursors — one per colour the app
   actually uses. Static, but it reads as a moment caught mid-draw. */

const CURSOR_COLOURS = ['#5b8cff', '#3dd68c', '#f0a92e', '#a97bff', '#35c6dd', '#ff7a94', '#c3d94e', '#ff9548', '#6fd0c0'];

/** A macOS-ish arrow, pointing at (0,0) = its tip. */
const arrow = (x, y, colour, size = 34) => `
  <svg class="cur" style="left:${x}px;top:${y}px;--cc:${colour}" width="${size}" height="${size}" viewBox="0 0 24 24">
    <path d="M3 2 L3 19 L8 14.4 L11.2 21 L14.4 19.4 L11.2 13 L18 12.6 Z"
          fill="${colour}" stroke="#0b0b0c" stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`;

function drawing() {
  const cursor = (x, y, i) => arrow(x, y, CURSOR_COLOURS[i % 9]);

  return `
  <div class="art">
    <div class="art-head">
      <span class="art-dot"></span><span class="art-dot"></span><span class="art-dot"></span>
      <span class="art-url">falconroasters.sa</span>
      <span class="art-badge">building</span>
    </div>

    <div class="art-body">
      <!-- hero, mid-drag, with the measurement badge a real drag shows -->
      <div class="hero-box">
        <span class="drag-label mono">880 × 364</span>
        ${cursor(816, 300, 0)}
      </div>

      <div class="eyebrow-line">Dammam, since 2019</div>

      <!-- headline, half typed -->
      <div class="h1">Roasted on Tuesday,<br>in your cup by Thu<span class="caret"></span></div>
      ${cursor(300, 566, 1)}

      <!-- the copy block, drawn as measured text runs -->
      <div class="runs">
        <i style="width:96%"></i><i style="width:92%"></i><i style="width:64%"></i>
      </div>

      <!-- two cards, one master and one copy, with red spacing marks -->
      <div class="cards">
        <div class="card">
          <span class="price mono">SAR 65</span>
          <i style="width:70%"></i><i style="width:46%"></i>
        </div>
        <div class="card copy">
          <span class="price mono">SAR 70</span>
          <i style="width:70%"></i><i style="width:46%"></i>
        </div>
        <span class="measure mono">24</span>
      </div>
      ${cursor(690, 800, 2)}
      ${cursor(238, 856, 7)}

      <!-- the pen drawing a rule -->
      <div class="rule"><span class="rule-end"></span></div>
      ${cursor(880, 928, 4)}
      ${cursor(120, 990, 5)}
      ${cursor(540, 210, 3)}
      ${cursor(470, 1046, 6)}
      ${cursor(930, 640, 8)}
    </div>
  </div>`;
}

/* ── the card ───────────────────────────────────────────────────────────── */

export function renderCard(spec = CARDS.launch) {
  const { eyebrow, claim, sub, proof, cta, kicker } = spec;
  const [a, b] = String(claim).split('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Swarmsmith — story card</title>
<style>
  @font-face { font-family: 'Serif'; src: url('/fonts/${CARD_FONTS.serif}') format('woff2'); font-weight: 400; font-display: block; }
  @font-face { font-family: 'Sans'; src: url('/fonts/${CARD_FONTS.sans}') format('woff2'); font-weight: 100 900; font-display: block; }
  @font-face { font-family: 'Mono'; src: url('/fonts/${CARD_FONTS.mono}') format('woff2'); font-weight: 100 800; font-display: block; }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${CARD_W}px; height: ${CARD_H}px; }
  body {
    background: #0b0b0c;
    color: #f5f3ef;
    font-family: 'Sans', system-ui, sans-serif;
    /* a real 32px drafting graticule at 2%, same as the app */
    background-image:
      linear-gradient(to right, #ffffff05 1px, transparent 1px),
      linear-gradient(to bottom, #ffffff05 1px, transparent 1px);
    background-size: 32px 32px;
    overflow: hidden;
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 96px 84px 84px;
  }

  /* safe area: keep text out of the top 250px and bottom 250px a story UI covers */
  .eyebrow {
    font-family: 'Mono', monospace; font-size: 26px; letter-spacing: .22em;
    text-transform: uppercase; color: #8a8780; margin-bottom: 34px;
  }
  .eyebrow b { color: #f5f3ef; font-weight: 500; }

  h1 {
    font-family: 'Serif', Georgia, serif; font-weight: 400;
    font-size: 104px; line-height: .98; letter-spacing: -.03em;
  }
  h1 em { font-style: normal; color: #ff9548; }

  .sub {
    margin-top: 30px; font-size: 31px; line-height: 1.42; color: #b6b3ac; max-width: 860px;
  }

  .art {
    margin: 54px 0 46px;
    border: 1px solid #2b2b30;
    border-radius: 10px;
    background: #111113;
    overflow: hidden;
    flex: none;
  }
  .art-head {
    display: flex; align-items: center; gap: 10px;
    padding: 16px 20px; border-bottom: 1px solid #1f1f23; background: #171719;
  }
  .art-dot { width: 11px; height: 11px; border-radius: 50%; background: #383840; }
  .art-url { font-family: 'Mono', monospace; font-size: 19px; color: #8a8780; margin-left: 12px; }
  .art-badge {
    margin-left: auto; font-family: 'Mono', monospace; font-size: 16px;
    letter-spacing: .16em; text-transform: uppercase; color: #3dd68c;
    border: 1px solid #1f3a2c; background: #102019; border-radius: 4px; padding: 5px 10px;
  }
  .art-body { position: relative; padding: 30px 30px 34px; }

  .hero-box {
    height: 196px; border: 1px dashed #4a4a53; border-radius: 4px; position: relative;
    background: repeating-linear-gradient(45deg, #ffffff04 0 10px, transparent 10px 20px);
    margin-bottom: 26px;
  }
  .drag-label {
    position: absolute; left: 12px; top: 12px; font-size: 17px; color: #b6b3ac;
    background: #1d1d21; border: 1px solid #383840; border-radius: 3px; padding: 4px 8px;
  }
  .eyebrow-line {
    font-family: 'Mono', monospace; font-size: 16px; letter-spacing: .2em;
    text-transform: uppercase; color: #8a8780; margin-bottom: 14px;
  }
  .h1 { font-family: 'Serif', Georgia, serif; font-size: 46px; line-height: 1.06; letter-spacing: -.02em; }
  .caret {
    display: inline-block; width: 3px; height: .82em; background: #3dd68c;
    vertical-align: -.06em; margin-left: 4px;
  }
  .runs { margin: 22px 0 26px; display: grid; gap: 10px; }
  .runs i, .card i { display: block; height: 9px; border-radius: 2px; background: #2b2b30; }

  .cards { display: flex; gap: 22px; position: relative; }
  .card {
    flex: 1; border: 1px solid #2b2b30; border-radius: 5px; background: #171719;
    padding: 18px; display: grid; gap: 10px;
  }
  .card.copy { border-color: #383840; }
  .price { font-family: 'Mono', monospace; font-size: 21px; color: #f5f3ef; margin-bottom: 4px; }
  .measure {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    font-size: 15px; color: #ff7a94; background: #1d1d21; padding: 2px 6px; border-radius: 2px;
  }
  .rule { margin-top: 30px; height: 1px; background: #383840; position: relative; }
  .rule-end { position: absolute; right: 0; top: -3px; width: 7px; height: 7px; border-radius: 50%; background: #35c6dd; }

  .cur { position: absolute; }

  .proof { display: grid; gap: 14px; }
  .proof div { display: flex; align-items: baseline; gap: 14px; font-size: 27px; color: #b6b3ac; }
  .tick { color: #3dd68c; font-family: 'Mono', monospace; font-size: 22px; }

  .foot { margin-top: auto; padding-top: 40px; }
  .cta {
    font-family: 'Mono', monospace; font-size: 30px; color: #f5f3ef;
    border-top: 1px solid #2b2b30; padding-top: 26px;
    display: flex; align-items: baseline; gap: 16px;
  }
  .cta small { font-size: 21px; color: #8a8780; }
  .kicker {
    margin-top: 16px; font-family: 'Mono', monospace; font-size: 19px;
    letter-spacing: .2em; text-transform: uppercase; color: #5d5b55;
    display: flex; justify-content: space-between;
  }
</style>
</head>
<body>
  <div class="eyebrow"><b>${esc(eyebrow)}</b> &nbsp;·&nbsp; a website builder that draws</div>

  <h1>${a ? esc(a) : ''}${b ? `<br>${esc(b)}` : ''}</h1>

  <p class="sub">${esc(sub)}</p>

  ${drawing()}

  <div class="proof">
    ${proof.map((p) => `<div><span class="tick">▸</span>${esc(p)}</div>`).join('\n    ')}
  </div>

  <div class="foot">
    <div class="cta">${esc(cta.label)} <small>${esc(cta.note)}</small></div>
    <div class="kicker"><span>${esc(kicker)}</span><span>MIT</span></div>
  </div>
</body>
</html>`;
}

/** The names `npm run card` accepts, and what each one is for. */
export const CARD_NAMES = {
  launch: 'the main story — what it is, in one look',
  guarantee: 'the rule — the model never writes CSS',
};
