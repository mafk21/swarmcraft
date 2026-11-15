/* ============================================================================
   How wide is this string? — the one estimate both the cards and the wordmark
   use.

   SVG has no line wrapping, so lines are wrapped here. That needs a width for a
   string, and getting one properly means shaping the font — which the renderer
   will do anyway, differently, later. A per-character estimate is used instead:
   generous, so the result wraps early rather than overflowing. It is wrong by a
   few percent per line, which is invisible at these sizes and honest about what
   it is.

   This file exists because it was inside story-cards.mjs and logo.mjs imported
   it from there, while story-cards.mjs imported the wordmark from logo.mjs.
   That cycle did not show up locally — it depended on which module loaded
   first — and it took CI down: the wordmark was built before the card module
   had initialised its accent colour. Anything two modules need belongs in a
   third, not at the top of one of them.
   ========================================================================== */

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
