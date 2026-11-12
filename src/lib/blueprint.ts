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
  size: number;
  weight: number;
  font: string; // full CSS font-family list, usable by ctx.font
  mono: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
};

export type BoxNode = Rect & {
  role: 'surface' | 'card' | 'rule' | 'image' | 'button' | 'input' | 'nav';
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
function lineChunks(node: Text): Chunk[] {
  const raw = node.textContent || '';
  if (!raw.trim()) return [];

  const doc = node.ownerDocument!;
  const range = doc.createRange();
  const out: Chunk[] = [];

  let current: { top: number; bottom: number; left: number; right: number; text: string } | null =
    null;

  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];

    // collapse runs of whitespace fast, but keep the character for spacing
    range.setStart(node, i);
    range.setEnd(node, i + 1);
    const r = range.getClientRects()[0];

    if (!r || r.width === 0 && ch.trim() === '') {
      if (current && ch === ' ') current.text += ' ';
      i += 1;
      continue;
    }
    if (!r) {
      i += 1;
      continue;
    }

    const tol = 2;
    if (current && Math.abs(r.top - current.top) <= tol) {
      current.text += ch;
      current.right = Math.max(current.right, r.right);
      current.bottom = Math.max(current.bottom, r.bottom);
      current.left = Math.min(current.left, r.left);
    } else {
      if (current) out.push(flush(current));
      current = { top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: ch };
    }
    i += 1;
  }
  if (current) out.push(flush(current));

  range.detach?.();
  return out.filter((c) => c.text.trim().length > 0);

  function flush(c: {
    top: number;
    bottom: number;
    left: number;
    right: number;
    text: string;
  }): Chunk {
    const rect = new DOMRect(c.left, c.top, Math.max(1, c.right - c.left), Math.max(1, c.bottom - c.top));
    return { text: c.text.replace(/\s+/g, ' ').trim(), rect };
  }
}

/* ── snapshot ────────────────────────────────────────────────────────────── */

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

  const walk = (el: Element) => {
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
        radius: px(cs.borderTopLeftRadius),
        border: hasBorder ? Math.min(6, bw) : 0,
        borderColor: hasBorder ? cs.borderTopColor : TRANSPARENT,
        fill: hasBg ? bg : null,
      });
    }

    /* ── text: split every text node into visual lines ── */
    let sawText = false;
    const walkTextNodes = (node: Node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          const chunks = lineChunks(child as Text);
          if (chunks.length) sawText = true;
          for (const c of chunks) {
            texts.push({
              ...rel(c.rect),
              text: c.text,
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
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const t = (child as Element).tagName.toLowerCase();
          if (t === 'script' || t === 'style' || t === 'svg' || t === 'img') return;
          walkTextNodes(child);
        }
      });
    };
    walkTextNodes(el);

    // If this element only held text, its children are covered; stop.
    if (sawText) return;

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
    background: getComputedStyle(body).backgroundColor,
    ink: getComputedStyle(body).color,
  };
}

/** Measure a spec-rendered document inside a hidden, offscreen iframe. */
export async function snapshotHtml(html: string, viewportWidth = 1440): Promise<Blueprint> {
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
    });

    const doc = frame.contentDocument;
    if (!doc) throw new Error('Could not read the rendered document.');

    try {
      await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready;
    } catch {
      /* engines without FontFaceSet */
    }

    return snapshot(doc);
  } finally {
    frame.remove();
  }
}
