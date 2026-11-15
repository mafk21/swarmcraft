/* ============================================================================
   The mark.

   A logo for a program whose claim is "the drawing is real" cannot be a
   sparkle, a gradient orb, or nine icons on a circle — the last one is the
   stock AI-brand shape and it says nothing.

   The idea here is the product's own smallest true statement: **a box that is
   not finished, and the cursor that is finishing it.** The page is a rounded
   rectangle with one corner open; the cursor sits in the opening, dragging that
   corner out. That is what every build does, ninety times, in the first twenty
   seconds — and it reads at 16px because it is two shapes.

     · 1.5-unit stroke on a 24 grid, so it holds at favicon size and at 512
     · one accent (the cursor), the rest ink — the product's own policy
     · the corner radius on the three closed corners is the app's radius,
       squared off on the open one, so the mark looks drawn rather than typed
     · works on dark, on light, and in one colour
   ========================================================================== */

export const MARK_ACCENT = '#5b8cff';

/* Both the wordmark and the cards need to know how wide a string is before
   anything is drawn, so the estimate lives in measure.mjs. Importing it from
   story-cards.mjs made a cycle, because story-cards.mjs draws its link preview
   with this very function. */
import { advance } from './measure.mjs';

/** A cursor arrow pointing down-right, tip at (0,0), drawn for a 6-unit box. */
const ARROW = 'M0 0 L0 5.6 L1.45 4.2 L2.45 6.4 L3.6 5.85 L2.6 3.75 L4.6 3.5 Z';

/**
 * @param {object} opts
 * @param {number} opts.size        rendered px (viewBox is always 24)
 * @param {'tile'|'bare'} opts.mode tile = rounded dark square behind it
 * @param {boolean} opts.multi      accent cursor (true) or single ink (false)
 * @param {string} opts.ink         the line colour; also the cursor when not multi
 * @param {boolean} opts.title      include <title>
 */
export function markSvg({ size = 24, mode = 'bare', multi = true, ink = '#f5f3ef', title = 'Swarmcraft' } = {}) {
  const L = 3.2; // left
  const T = 3.2; // top
  const R = 20.8; // right
  const B = 20.8; // bottom
  const open = 6.4; // how far the bottom edge stops short of the corner
  const r = 3; // corner radius on the closed corners

  /* One continuous stroke: up the left, over the top, down the right, and it
     stops short of the bottom-right corner — that gap is where the cursor is,
     which is the whole idea. Drawing it as two subpaths produced a hook. */
  const box =
    `M${L + open} ${B} H${L + r} A${r} ${r} 0 0 1 ${L} ${B - r} V${T + r} ` +
    `A${r} ${r} 0 0 1 ${L + r} ${T} H${R - r} A${r} ${r} 0 0 1 ${R} ${T + r} V${B - r}`;

  const cursor = multi ? MARK_ACCENT : ink;

  const bg =
    mode === 'tile'
      ? `<rect width="24" height="24" rx="5.5" fill="#0b0b0c"/><rect x="0.5" y="0.5" width="23" height="23" rx="5" fill="none" stroke="#2b2b30"/>`
      : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${title}">
  ${title ? `<title>${title}</title>` : ''}
  ${bg}
  <path d="${box}" fill="none" stroke="${mode === 'tile' ? '#f5f3ef' : ink}" stroke-width="1.6" stroke-linecap="round"/>
  <g transform="translate(${R - 3.9} ${B - 4.2}) scale(0.92)"><path d="${ARROW}" fill="${cursor}" stroke="#0b0b0c" stroke-width="0.8" stroke-linejoin="round"/></g>
</svg>`;
}

export function faviconSvg() {
  return markSvg({ size: 64, mode: 'tile', title: 'Swarmcraft' });
}

/**
 * Wordmark: the mark, the name, a hairline, and what it is.
 * The name is set in the app's own serif — a separate logotype would be a
 * second voice in a product that only has one.
 */
export function wordmarkSvg({ height = 44, ink = '#f5f3ef', sub = '#8a8780', head = 'Swarmcraft', tail = 'website builder' } = {}) {
  const markSize = Math.round(height * 0.92);
  const gap = Math.round(height * 0.38);
  const nameSize = height * 0.66;
  const tailSize = height * 0.2;
  const textX = markSize + gap;
  /* Sizes from the same estimator the cards use, so the box fits the words
     instead of clipping them. */
  const nameW = advance(head, nameSize, 'serif');
  const tailW = advance(tail.toUpperCase(), tailSize, 'mono') * 1.1; // letter-spacing
  const ruleX = textX + nameW + gap * 0.75;
  const tailX = ruleX + gap * 0.75;
  const width = Math.ceil(tailX + tailW + gap * 0.3);
  const base = height * 0.685;

  /* The mark is inlined rather than nested, so it inherits this document's
     scaling. Its own width/height have to come off, or it renders at its own
     size in the top-left corner. */
  const inner = `<g transform="translate(0 ${(height - markSize) / 2}) scale(${(markSize / 24).toFixed(4)})">${markSvg({ size: markSize, mode: 'tile', title: '' })
    .replace(/^<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<title><\/title>/, '')}</g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${head} — ${tail}">
  <title>${head} — ${tail}</title>
  ${inner}
  <text x="${textX}" y="${base}" font-family="Instrument Serif" font-size="${nameSize}" fill="${ink}">${head}</text>
  <line x1="${ruleX}" y1="${base - height * 0.14}" x2="${ruleX}" y2="${base - height * 0.46}" stroke="${sub}" stroke-width="1" opacity="0.5"/>
  <text x="${tailX}" y="${base - height * 0.1}" font-family="JetBrains Mono" font-size="${tailSize}" letter-spacing="${tailSize * 0.1}" fill="${sub}">${tail.toUpperCase()}</text>
</svg>`;
}
