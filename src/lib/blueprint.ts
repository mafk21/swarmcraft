/* ============================================================================
   snapshot() — take a real, rendered document apart into a Blueprint.

   We do not design the animation from the spec. We measure the ACTUAL DOM in
   a hidden iframe, at real size, and record where every visible box, every
   ruled line, and every visual line of text sits.

   Text is measured per character and grouped into visual lines, so the
   rebuild draws exactly what the browser laid out — no re-flow, no guessing
   line breaks. That is why it is indistinguishable from a person building
   the page: it IS the page.
   ========================================================================== */

export type Rect = { x: number; y: number; w: number; h: number };

/** One visual line of text, with its exact glyph box. */
export type LineText = Rect & {
  text: string;
  /** which `.sec[data-sec]` this line sits in; null outside a section */
  section?: number | null;
  size: number;
  weight: number;
  font: string; // full CSS font-family list, usable by ctx.font
  mono: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
};

export type BoxNode = Rect & {
  role: 'surface' | 'card' | 'rule' | 'image' | 'button' | 'input' | 'nav';
  /** which `.sec[data-sec]` this box sits in; null for the page frame */
  section?: number | null;
  radius: number;
  border: number;
  borderColor: string;
  fill: string | null;
};

export type LineNode = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  weight: number;
  color: string;
};

export type Step = {
  kind: 'box' | 'text' | 'line';
  index: number;
  /** where the cursor approaches from */
  from: { x: number; y: number };
  /** the anchor the cursor works at */
  to: { x: number; y: number };
  /** relative work cost, used to pace the schedule */
  weight: number;
};

export type Blueprint = {
  width: number;
  height: number;
  boxes: BoxNode[];
  texts: LineText[];
  lines: LineNode[];
  steps: Step[];
  background: string;
  ink: string;
};

const px = (v: string) => parseFloat(v) || 0;
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

/* ── per-character line extraction ───────────────────────────────────────── */

type Chunk = { text: string; rect: DOMRect };

/**
 * Split a text node into visual lines using character-level measurement.
 * Returns one chunk per line, preserving the exact string on that line.
 */
/**
 * Split a text node into visual lines.
 *
 * The old version set a Range over ONE CHARACTER at a time and asked for its
 * rects — thousands of `getClientRects()` calls on a real page, and every one of
 * them forces a synchronous layout reflow. That is main-thread CPU work, and it
 * is the reason the build's own deadline could not fire: a `setTimeout` cannot
 * run while the thread is busy, so an 80-second limit became five minutes of a
 * frozen screen. It is also just slow.
 *
 * This walks the node by word instead. The number of layout queries is now
 * proportional to the number of LINES, not characters: a line's rect is taken
 * from the first word on it, and the words are grouped by their `top`.
 *
 * Where a character-accurate box is needed (a single line of text), that is
 * exactly what this returns, because one line means one rect.
 */
function lineChunks(node: Text): Chunk[] {
  const raw = node.textContent || '';
  if (!raw.trim()) return [];

  const doc = node.ownerDocument!;
  const parent = node.parentElement;
  if (!parent) return [];

  const range = doc.createRange();

  /* Engines without per-character rects (and odd document contexts — this is
     what the tests run in) get the whole node as one line rather than a throw. */
  if (typeof (range as Range).getClientRects !== 'function') {
    const txt = raw.replace(/\s+/g, ' ').trim();
    return txt ? [{ text: txt, rect: parent.getBoundingClientRect() }] : [];
  }

  /* Measure a span of the node. One layout query, however long the span. */
  const rectOf = (a: number, b: number): { top: number; bottom: number; left: number; right: number } | null => {
    range.setStart(node, a);
    range.setEnd(node, b);
    const r = range.getClientRects()[0];
    return r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null;
  };

  /* How a line break is found without asking per character.

     A paragraph of 6,000 characters is ~1,200 words but only ~85 lines, and the
     thing that costs is the QUERY, not the arithmetic. So: take a segment, read
     its top; take a single character at the end, read its top. If they match,
     the whole segment is on one line — one query did the work of a thousand.
     If they differ, the segment spans a break: halve it and try again. Then skip
     to the line the second half starts on and repeat.

     The result is a query count proportional to lines × log(segment), instead of
     to characters. The per-character loop this replaces forced a synchronous
     reflow for every letter on the page, which blocked the main thread long
     enough that the build's own deadline could not fire. */
  const out: Chunk[] = [];
  let i = 0;
  let guard = 0;

  while (i < raw.length && guard++ < 4000) {
    // skip leading whitespace between lines
    while (i < raw.length && /\s/.test(raw[i])) i++;
    if (i >= raw.length) break;

    // grow a segment while it stays on one line
    let end = Math.min(raw.length, i + 64);
    let head = rectOf(i, i + 1);
    if (!head) { i++; continue; }

    let lo = i + 1;
    let hi = end;
    let lineEnd = i + 1;

    while (lo <= hi) {
      const probe = rectOf(i, hi);
      if (probe && Math.abs(probe.top - head.top) <= 2) {
        // the whole [i, hi) is on one line; try further
        lineEnd = hi;
        const next = Math.min(raw.length, hi + 64);
        if (next === hi) break;
        lo = hi + 1;
        hi = next;
      } else {
        // a break falls inside [lo, hi): halve
        hi = Math.floor((lo + hi) / 2);
        if (hi < lo) break;
      }
    }

    // trim trailing whitespace, keep the text of this line
    const text = raw.slice(i, lineEnd).replace(/\s+/g, ' ').trim();
    const box = rectOf(i, lineEnd) ?? head;
    if (text) {
      out.push({
        text,
        rect: {
          left: box.left,
          top: box.top,
          width: Math.max(1, box.right - box.left),
          height: Math.max(1, box.bottom - box.top),
        } as DOMRect,
      });
    }

    if (lineEnd <= i) break;
    i = lineEnd;
  }

  range.detach?.();
  return out;
}

/* ── snapshot ────────────────────────────────────────────────────────────── */

/**
 * How many elements will be measured. Above this the page is bigger than any
 * build animation can show anyway, and measuring it is how a 90-second budget
 * becomes five minutes. Kept as a guard rather than a limit on correctness: a
 * 400-element page is far beyond the nine-section cap.
 */
const MAX_ELEMENTS = 4000;

export function snapshot(doc: Document): Blueprint {
  const win = doc.defaultView!;
  const body = doc.body;
  const root = doc.documentElement;

  const width = Math.max(body.scrollWidth, root.clientWidth, 1200);
  const height = Math.max(body.scrollHeight, root.clientHeight, 800);

  const boxes: BoxNode[] = [];
  const texts: LineText[] = [];
  const lines: LineNode[] = [];

  const bodyRect = body.getBoundingClientRect();
  const rel = (r: { left: number; top: number; width: number; height: number }): Rect => ({
    x: r.left - bodyRect.left,
    y: r.top - bodyRect.top,
    w: r.width,
    h: r.height,
  });

  /* Which `.sec[data-sec]` an element belongs to, or null. Read off the DOM
     rather than assumed, because the renderer is the one that knows where its
     sections are — and the nav and footer are outside every one of them. */
  const sectionOf = (el: Element): number | null => {
    const host = el.closest('[data-sec]');
    if (!host) return null;
    const v = host.getAttribute('data-sec');
    const n = v === null ? NaN : parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };

  let visited = 0;
  const walk = (el: Element) => {
    if (++visited > MAX_ELEMENTS) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'head' || tag === 'meta' || tag === 'link')
      return;

    const cs = win.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    if (rect.width < 1 || rect.height < 1) return;
    if (cs.display === 'none' || cs.visibility === 'hidden' || px(cs.opacity) === 0) return;

    const r = rel(rect);
    const short = Math.min(r.w, r.h);
    const long = Math.max(r.w, r.h);

    /* ── rules: thin, long, and drawn as lines ── */
    if (short <= 3 && long >= 10) {
      const horizontal = r.w >= r.h;
      const color = cs.backgroundColor !== TRANSPARENT ? cs.backgroundColor : cs.borderTopColor;
      lines.push({
        x1: horizontal ? r.x : r.x + r.w / 2,
        y1: horizontal ? r.y + r.h / 2 : r.y,
        x2: horizontal ? r.x + r.w : r.x + r.w / 2,
        y2: horizontal ? r.y + r.h / 2 : r.y + r.h,
        weight: Math.max(1, Math.min(4, short)),
        color,
      });
      return;
    }

    const bg = cs.backgroundColor;
    const hasBg = bg !== TRANSPARENT && bg !== 'transparent';
    const bw = px(cs.borderTopWidth);
    const hasBorder = bw > 0 && cs.borderTopStyle !== 'none' && cs.borderTopColor !== TRANSPARENT;

    const isMedia = tag === 'img' || tag === 'svg' || tag === 'canvas' || tag === 'video';
    const isControl = tag === 'input' || tag === 'textarea' || tag === 'select';
    const isLinkButton =
      (tag === 'a' || tag === 'button') && (hasBg || hasBorder) && r.h < 90;

    const wantsBox =
      (hasBg && r.w > 20 && r.h > 12) ||
      (hasBorder && r.w > 20 && r.h > 12) ||
      isMedia ||
      isControl ||
      isLinkButton ||
      tag === 'nav';

    if (wantsBox) {
      let role: BoxNode['role'] = 'surface';
      if (isMedia) role = 'image';
      else if (isControl) role = 'input';
      else if (isLinkButton) role = 'button';
      else if (tag === 'nav') role = 'nav';
      else if (hasBorder && !hasBg) role = 'card';

      boxes.push({
        ...r,
        role,
        section: sectionOf(el),
        radius: px(cs.borderTopLeftRadius),
        border: hasBorder ? Math.min(6, bw) : 0,
        borderColor: hasBorder ? cs.borderTopColor : TRANSPARENT,
        fill: hasBg ? bg : null,
      });
    }

    /* ── text: this element's OWN direct text, split into visual lines ──
       Only direct text children. The old version recursed into every
       descendant, set a flag, then returned early — which meant any section
       containing any text was never descended into, and every card, product
       tile and gallery plate below it was silently missing from the plan. */
    let hasOwnText = false;
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType !== 3 /* TEXT_NODE */) continue;
      const chunks = lineChunks(child as Text);
      if (!chunks.length) continue;
      hasOwnText = true;
      for (const c of chunks) {
        texts.push({
          ...rel(c.rect),
          text: c.text,
          section: sectionOf(el),
          size: px(cs.fontSize) || 16,
          weight: parseInt(cs.fontWeight, 10) || 400,
          font: cs.fontFamily,
          mono: /mono/i.test(cs.fontFamily),
          color: cs.color,
          align: (['center', 'right'].includes(cs.textAlign)
            ? cs.textAlign
            : 'left') as LineText['align'],
        });
      }
    }

    // An element that holds nothing but text has no interesting children?
    // It does — inline spans, links. Keep descending either way; the cost is
    // trivial and skipping is what lost entire sections.
    void hasOwnText;
    Array.from(el.children).forEach(walk);
  };

  Array.from(body.children).forEach(walk);

  /* ── order into a human build order ─────────────────────────────────────
     Top to bottom in 8px bands. Within a band: surfaces, then rules, then
     text — structure before content, exactly as a person would work.      */

  const band = (y: number) => Math.round(y / 10);

  boxes.sort((a, b) => band(a.y) - band(b.y) || a.x - b.x);
  lines.sort((a, b) => band(a.y1) - band(b.y1) || a.x1 - b.x1);
  texts.sort((a, b) => band(a.y) - band(b.y) || a.x - b.x);

  /* ── build steps ────────────────────────────────────────────────────── */

  const rightEdge = width - 50;

  const steps: Step[] = [];

  boxes.forEach((b, i) => {
    steps.push({
      kind: 'box',
      index: i,
      from: {
        x: Math.min(rightEdge, b.x + b.w + 140 + (i % 5) * 24),
        y: b.y + b.h * 0.5,
      },
      to: { x: b.x, y: b.y },
      weight:
        1.6 +
        Math.min(3.2, Math.sqrt(b.w * b.h) / 150) +
        (b.role === 'image' ? 1.4 : 0) +
        (b.role === 'card' ? 0.4 : 0),
    });
  });

  lines.forEach((l, i) => {
    steps.push({
      kind: 'line',
      index: i,
      from: { x: l.x2 + 130 + (i % 4) * 26, y: l.y1 + 30 },
      to: { x: l.x1, y: l.y1 },
      weight: 0.9,
    });
  });

  texts.forEach((t, i) => {
    steps.push({
      kind: 'text',
      index: i,
      from: {
        x: Math.min(rightEdge, t.x + t.w + 150 + (i % 6) * 20),
        y: t.y + t.h * 0.6,
      },
      to: { x: t.x, y: t.y + t.h * 0.6 },
      weight: 0.9 + Math.min(4, t.text.length / 16),
    });
  });

  /* Re-order by region so each band of the page is built coherently:
     surfaces → rules → text, top to bottom, 220px bands. */
  const stepBand = (s: Step) => Math.floor(s.to.y / 220);
  const kindRank = { box: 0, line: 1, text: 2 } as const;
  steps.sort(
    (a, b) =>
      stepBand(a) - stepBand(b) ||
      kindRank[a.kind] - kindRank[b.kind] ||
      a.to.x - b.to.x
  );

  return {
    width,
    height,
    boxes,
    texts,
    lines,
    steps,
    // the DOCUMENT's window, not the global one: inside an iframe these differ,
    // and the global one would style against the wrong document
    background: win.getComputedStyle(body).backgroundColor,
    ink: win.getComputedStyle(body).color,
  };
}

/** Measure a spec-rendered document inside a hidden, offscreen iframe. */
export async function snapshotHtml(
  html: string,
  viewportWidth = 1440,
  /** absolute epoch ms; measurement is abandoned when the build runs out */
  deadline = Infinity
): Promise<Blueprint> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = `position:fixed;left:-99999px;top:0;width:${viewportWidth}px;height:1000px;border:0;visibility:hidden;pointer-events:none;`;
  document.body.appendChild(frame);

  try {
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        // one extra frame so layout settles
        requestAnimationFrame(() => setTimeout(resolve, 0));
      };
      frame.onload = finish;
      frame.srcdoc = html;
      setTimeout(finish, 1500);
      /* and never past the build's own deadline, whatever the frame does */
      const left = Math.max(0, deadline - Date.now());
      if (left < Infinity) setTimeout(finish, Math.min(1500, left));
    });

    const doc = frame.contentDocument;
    if (!doc) throw new Error('Could not read the rendered document.');

    /* Everything below reads layout, and the whole measurement is synchronous:
       while it runs, no timer can fire. That is why an 80-second deadline could
       be blown by five minutes of work — the callback that would have aborted
       the build never got a turn. One frame here lets the caller's clock run,
       and gives the browser a chance to finish the layout it is about to be
       asked about. */
    await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

    /* A font that never settles must not become a build that never ends.
       `fonts.ready` has no timeout of its own, so it gets one here. Measuring a
       hair early is invisible; never measuring at all is the bug the user hit. */
    try {
      const fonts = (doc as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts?.ready) {
        await Promise.race([
          fonts.ready,
          new Promise<void>((r) => setTimeout(r, 600)),
        ]);
      }
    } catch {
      /* engines without FontFaceSet */
    }

    return snapshot(doc);
  } finally {
    frame.remove();
  }
}
