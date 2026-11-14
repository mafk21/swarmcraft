/* ============================================================================
   THE SWARM ENGINE

   Nine cursors. One canvas. They rebuild a real page.

   ── what it is copying, and why ─────────────────────────────────────────────

   The look being matched is Swarm / Swarm Rebuild (Joel Califa's choreography):
   a page that wipes itself blank and is drawn back by a flock of cursors that
   behave like designers in a multiplayer design tool, not like ballerinas.

   The first version of this engine got the physics right and the *work* wrong.
   It scheduled one step for every measured box, line and text line — hundreds
   of them — each cursor taking whatever was nearest. The result was a swarm
   that flew about aimlessly: a cursor would hold a text line for a fifth of a
   second, move on, and the page assembled itself in flickers nobody watched.
   Nothing was ever *touched*.

   So the schedule is now built the way a person builds a page:

     1. REGION      each cursor owns a horizontal band of the page (three
                    columns × three rows) and stays in it. You can watch one
                    worker finish a card instead of nine crossing the screen.
     2. STRUCTURE   surfaces first (nav, hero, cards, rules), top to bottom.
                    A box seeds all the text that sits inside it, so the cursor
                    never leaves a card to type a line belonging to another one.
     3. CONTENT     text is typed where it belongs, inside the box just drawn.
     4. DUPLICATES  repeated siblings are one master plus copies: the cursor
                    master-drags the ▸ ▸ ▸ marks and stamps a copy, and the copy
                    appears at full size the instant it lands.
     5. HAND-OFF    the last cursor closes the page, then the flock disperses and
                    the finished site fades in underneath.

   Painting follows the same rule: a box is dragged out with a crosshair and a
   live W × H badge, text is typed glyph by glyph with a caret and a heading that
   steps up in size, lines are drawn with a pen and a rubber band, guides slide
   in from the rulers, and a duplicate is stamped rather than re-typed. Once a
   piece lands it stays landed — a finished page is never un-drawn.

   The camera follows the work and eases; it never cuts.
   ========================================================================== */

import type { Blueprint, BoxNode, LineNode, LineText, Step } from './blueprint';
import type { BuildSound } from './audio';

/* ── cursors ─────────────────────────────────────────────────────────────── */

export const CURSOR_COLORS = [
  '#e0483a',
  '#2f6fd0',
  '#2f9e59',
  '#d98423',
  '#8a4fc4',
  '#c9377f',
  '#0e9aa7',
  '#a8852a',
  '#5a6b7d',
];

export const MUSES = [
  { name: 'Calliope', role: 'order' },
  { name: 'Thalia', role: 'voice' },
  { name: 'Euterpe', role: 'copy' },
  { name: 'Urania', role: 'data' },
  { name: 'Melpomene', role: 'guard' },
  { name: 'Polyhymnia', role: 'access' },
  { name: 'Terpsichore', role: 'motion' },
  { name: 'Erato', role: 'extract' },
  { name: 'Clio', role: 'consistency' },
];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ── plan ────────────────────────────────────────────────────────────────── */

type Planned = {
  step: Step;
  agent: number;
  start: number;
  dur: number;
  /** travel allowance before work begins */
  travel: number;
  /**
   * How the work is drawn:
   *   rect   drag a box out from its corner, then fill it
   *   text   type glyph by glyph; `big` headings step up in size first
   *   line   pen stroke, anchor to anchor
   *   dup    stamp a copy of the master this step duplicates
   */
  draw: 'rect' | 'text' | 'line' | 'dup';
  /** set for a duplicate: the master step it copies */
  master?: Planned;
  /** set for a step seeded by a box: the box it starts inside */
  parent?: Step;
};

export type PlayOptions = {
  speed?: number;
  onProgress?: (p: number) => void;
  onDone?: () => void;
  /** called whenever a piece of the page lands, for the HUD */
  onLand?: (kind: 'rect' | 'text' | 'line' | 'dup') => void;
  /**
   * Hard stop in ms of real time, from the moment play() is called.
   *
   * Speed is a request, not a promise: a machine that cannot draw a frame
   * quickly enough will fall behind whatever multiplier we ask for, and there
   * is nothing the animation can do about that. This is the promise. When the
   * cap is reached the page is painted finished and onDone fires, whether or
   * not every cursor got to its last box.
   */
  hardCapMs?: number;
};

/* ── region assignment ───────────────────────────────────────────────────── */

/** Three columns by three rows: which region a point belongs to. */
function regionOf(x: number, y: number, w: number, h: number): number {
  const col = clamp(Math.floor((x / Math.max(1, w)) * 3), 0, 2);
  const row = clamp(Math.floor((y / Math.max(1, h)) * 3), 0, 2);
  return row * 3 + col;
}

/* ── the engine ──────────────────────────────────────────────────────────── */

export class Swarm {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bp: Blueprint;
  private dpr: number;
  private sound: BuildSound | null;

  private agents: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    name: string;
    /** the region of the page this cursor owns */
    region: number;
    /** screen-space rotation of the pointer arrow, follows velocity */
    angle: number;
    /** 0..1 progress of the current step's paint */
    progress: number;
    activeIndex: number;
    typing: number;
    /** set while the cursor is pressing the mouse */
    pressing: boolean;
    /** last text typed, for the key-click sound */
    typedChars: number;
  }[] = [];

  private plan: Planned[] = [];
  private doneBoxes = new Set<number>();
  private doneLines = new Set<number>();
  private typingText = new Map<number, number>(); // text index -> chars drawn
  /** text indices that are complete and must keep their full string */
  private fullText = new Set<number>();

  /**
   * Scene time in ms: how far into the animation we are. Derived from real time
   * and speed, so pausing freezes it and changing speed changes its rate.
   */
  private clock = 0;

  /**
   * Real elapsed ms since play(), excluding paused spells.
   *
   * The build is measured against this, not against a sum of frame deltas. A
   * frame that takes longer than 50ms used to be clamped in `dt`, which
   * silently stretched a 27s animation into a minute or more on a slow machine:
   * the screen stayed on the build while the user counted to 140.
   */
  private wall = 0;
  private wallStart = 0;
  private pausedMs = 0;
  private pausedAt = 0;

  /** Real seconds of animation actually shown, for the honest "built in Ns". */
  get elapsedWall() {
    return this.wall;
  }
  private raf = 0;
  private last = 0;
  private total = 0;

  private camY = 0;
  private targetCamY = 0;
  private viewH = 0;

  private speed = 1;
  private paused = false;
  /** respected: no intro, no orbit, no flocking theatrics — just land it */
  private reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private finished = false;
  /** set once every step has committed — the canvas then paints the truth */
  private complete = false;
  private returning = false;

  private opts: PlayOptions = {};

  /* rulers slide in at the start; a guide is dragged out when text snaps */
  private rulerIn = 0;
  private guideIn = 0;

  /* the blank page, then work, then a short dispersal */
  private elapsed = 0;
  private readonly introMs = 900;
  private readonly outroMs = 760;
  private outroPoint = { x: 0, y: 0 };
  /** the page dissolving into blank, 0..1 */
  private wipe = 0;

  constructor(canvas: HTMLCanvasElement, bp: Blueprint, sound?: BuildSound) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.bp = bp;
    this.sound = sound ?? null;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.planSchedule();
    this.resetAgents();

    // one-time index maps so the render loop is O(n), not O(n²)
    bp.boxes.forEach((b, i) => this.boxIdx.set(b, i));
    bp.lines.forEach((l, i) => this.lineIdx.set(l, i));
    // group in-progress steps by kind+index for fast lookup
    for (const p of this.plan) {
      const key = `${p.step.kind}:${p.step.index}`;
      const arr = this.stepByTarget.get(key);
      if (arr) arr.push(p);
      else this.stepByTarget.set(key, [p]);
    }
  }

  private boxIdx = new WeakMap<object, number>();
  private lineIdx = new WeakMap<object, number>();
  private stepByTarget = new Map<string, Planned[]>();

  /* ── scheduling ──────────────────────────────────────────────────────── */

  private planSchedule() {
    const bp = this.bp;

    /* Which text belongs inside which box.
       A cursor types the lines of the card it just drew, in reading order, and
       never leaves to type a line on the other side of the page. That single
       rule is most of the difference between "working" and "wandering". */
    const textParent = new Map<number, number>(); // text index -> box index
    const textInside = new Map<number, number[]>(); // box index -> text indices
    const boxContainsText = (b: BoxNode) =>
      (t: LineText) =>
        t.x >= b.x - 6 &&
        t.x <= b.x + b.w &&
        t.y >= b.y - 4 &&
        t.y + t.h <= b.y + b.h + 6;

    bp.texts.forEach((t, ti) => {
      let best = -1;
      let bestArea = Infinity;
      bp.boxes.forEach((b, bi) => {
        if (!boxContainsText(b)(t)) return;
        const area = b.w * b.h;
        if (area < bestArea) {
          bestArea = area;
          best = bi;
        }
      });
      if (best >= 0) {
        textParent.set(ti, best);
        const arr = textInside.get(best) ?? [];
        arr.push(ti);
        textInside.set(best, arr);
      }
    });

    /* Repeated siblings become one master and copies.
       We have no DOM siblings any more, only measured rects — so "a repeat" is
       detected geometrically: same size, same column, evenly spaced down the
       page. That is exactly the nav-link / card / list-row pattern the reel
       shows being ⌥-dragged. */
    const dupOf = new Map<number, number>(); // box index -> master box index
    const byShape = new Map<string, number[]>();
    bp.boxes.forEach((b, i) => {
      const key = `${Math.round(b.w / 4)}x${Math.round(b.h / 4)}:${Math.round(b.x / 6)}`;
      const arr = byShape.get(key) ?? [];
      arr.push(i);
      byShape.set(key, arr);
    });
    for (const [, idxs] of byShape) {
      if (idxs.length < 3) continue;
      const sorted = [...idxs].sort((a, b) => bp.boxes[a].y - bp.boxes[b].y);
      const master = sorted[0];
      for (const i of sorted.slice(1)) {
        // never duplicate a large surface; that is a section, not a repeat
        if (bp.boxes[i].w * bp.boxes[i].h > bp.width * 260) continue;
        dupOf.set(i, master);
      }
    }

    /* ── lanes ─────────────────────────────────────────────────────────────
       Nine lanes, one per cursor. A lane never starts its next step before the
       last one has finished, so nothing is abandoned half-dragged, and each
       cursor is drawn toward work inside its own region. */
    const laneFree = new Array(9).fill(0);
    const laneRegion = new Array(9).fill(-1);
    const lastPos = new Array(9).fill(0).map(() => ({ x: bp.width * 0.5, y: 200 }));

    const bandOf = (y: number) => Math.floor(y / 220);

    type Task = {
      step: Step;
      draw: Planned['draw'];
      band: number;
      /** structural tasks (a box) must come before the text inside it */
      rank: number;
      region: number;
      weight: number;
      parent?: Step;
      master?: number;
    };

    const tasks: Task[] = [];

    /* Structure: every box is a rect task, in reading order. */
    bp.boxes.forEach((b, i) => {
      const isDup = dupOf.has(i);
      const masterIdx = dupOf.get(i);
      tasks.push({
        step: {
          kind: 'box',
          index: i,
          from: { x: b.x + b.w + 140 + (i % 5) * 24, y: b.y + b.h * 0.5 },
          to: { x: b.x, y: b.y },
          weight:
            1.6 +
            Math.min(3.2, Math.sqrt(b.w * b.h) / 150) +
            (b.role === 'image' ? 1.4 : 0) +
            (b.role === 'card' ? 0.4 : 0),
        },
        draw: isDup ? 'dup' : 'rect',
        band: bandOf(b.y),
        rank: 0,
        region: regionOf(b.x, b.y, bp.width, bp.height),
        weight: 1.6 + Math.min(3.2, Math.sqrt(b.w * b.h) / 150),
        master: masterIdx,
      });
    });

    /* Structure: rules and lines, still before text in the same band. */
    bp.lines.forEach((l, i) => {
      tasks.push({
        step: {
          kind: 'line',
          index: i,
          from: { x: l.x2 + 130 + (i % 4) * 26, y: l.y1 + 30 },
          to: { x: l.x1, y: l.y1 },
          weight: 0.9,
        },
        draw: 'line',
        band: bandOf(l.y1),
        rank: 1,
        region: regionOf(l.x1, l.y1, bp.width, bp.height),
        weight: 0.9,
      });
    });

    /* Content: text, bucketed with the box that contains it. */
    bp.texts.forEach((t, i) => {
      const parentBox = textParent.get(i);
      const parentStep =
        parentBox !== undefined
          ? tasks.find((x) => x.step.kind === 'box' && x.step.index === parentBox)?.step
          : undefined;
      tasks.push({
        step: {
          kind: 'text',
          index: i,
          from: { x: t.x + t.w + 150 + (i % 6) * 20, y: t.y + t.h * 0.6 },
          to: { x: t.x, y: t.y + t.h * 0.6 },
          weight: 0.9 + Math.min(4, t.text.length / 16),
        },
        draw: 'text',
        band: bandOf(t.y),
        rank: 2,
        region: regionOf(t.x, t.y, bp.width, bp.height),
        weight: 0.9 + Math.min(4, t.text.length / 16),
        parent: parentStep,
      });
    });

    /* Top to bottom, structure before content. */
    tasks.sort((a, b) => a.band - b.band || a.rank - b.rank || a.step.to.x - b.step.to.x);

    for (const task of tasks) {
      /* Pick the lane. Strong preference for the lane that already owns this
         region, and for the lane with the least work queued — so one cursor
         never carries the whole page while three drift. */
      /* A step seeded by a box goes to the cursor that drew the box: it has
         just finished it, it is standing on it, and it is the one that can type
         the words inside it without crossing the page. */
      const parentPlan =
        task.parent !== undefined
          ? this.plan.find(
              (q) => q.step.kind === task.parent!.kind && q.step.index === task.parent!.index
            )
          : undefined;

      let best = -1;
      let bestScore = Infinity;
      for (let a = 0; a < 9; a++) {
        if (parentPlan && parentPlan.agent === a) {
          best = a;
          break;
        }
        const sameRegion = laneRegion[a] === task.region || laneRegion[a] === -1;
        const dist = Math.hypot(lastPos[a].x - task.step.to.x, lastPos[a].y - task.step.to.y);
        const score =
          laneFree[a] +
          Math.min(6000, dist * 2.6) +
          (sameRegion ? 0 : 5200) +
          (laneRegion[a] === -1 ? -2400 : 0) +
          Math.random() * 180;
        if (score < bestScore) {
          bestScore = score;
          best = a;
        }
      }

      /* A duplicate waits for its master, and text waits for the box it lives
         in. You cannot type inside a card that has not been drawn. */
      let earliest = laneFree[best];
      if (parentPlan) {
        earliest = Math.max(earliest, parentPlan.start + parentPlan.dur * 1000 + 60);
      }
      if (task.master !== undefined) {
        const masterIdx = this.plan.findIndex(
          (p) => p.step.kind === 'box' && p.step.index === task.master
        );
        if (masterIdx >= 0) {
          const m = this.plan[masterIdx];
          earliest = Math.max(earliest, m.start + m.dur * 1000 + 120);
        }
      }

      const dist = Math.hypot(
        lastPos[best].x - task.step.to.x,
        lastPos[best].y - task.step.to.y
      );
      const travel = Math.min(1.4, dist / 1100);
      const dur =
        task.draw === 'text'
          ? 0.55 + task.weight * 0.11
          : task.draw === 'dup'
            ? 0.4
            : 0.34 + task.weight * 0.12;

      /* The stagger is what makes it look hand-made. Without it every landmark
         inside a band completes at the same instant and the page appears to
         assemble itself in rows. */
      const spread =
        task.draw === 'rect' ? 620 : task.draw === 'text' ? 300 : task.draw === 'dup' ? 240 : 420;
      const start = earliest + Math.random() * spread;

      laneFree[best] = start + dur * 1000 + 60;
      if (laneRegion[best] === -1) laneRegion[best] = task.region;
      lastPos[best] = { x: task.step.to.x, y: task.step.to.y };

      this.plan.push({
        step: task.step,
        agent: best,
        start,
        dur,
        travel,
        draw: task.draw,
        parent: task.parent,
      });
    }

    /* Resolve duplicate → master into a real reference now every step exists. */
    for (let i = 0; i < this.plan.length; i++) {
      const p = this.plan[i];
      const masterBox = p.draw === 'dup' ? dupOf.get(p.step.index) : undefined;
      if (masterBox === undefined) continue;
      const m = this.plan.find((q) => q.step.kind === 'box' && q.step.index === masterBox);
      if (m) p.master = m;
    }

    this.plan.sort((a, b) => a.start - b.start);
    this.total = Math.max(...laneFree) + 700;
  }

  private resetAgents() {
    const w = this.bp.width;
    const cx = w / 2;
    const cy = 300;
    this.agents = CURSOR_COLORS.map((color, i) => {
      const a = (i / CURSOR_COLORS.length) * Math.PI * 2;
      return {
        x: cx + Math.cos(a) * rand(240, 420),
        y: cy + Math.sin(a) * rand(140, 240),
        vx: 0,
        vy: 0,
        color,
        name: MUSES[i].name,
        region: i,
        angle: 0,
        progress: 0,
        activeIndex: -1,
        typing: 0,
        pressing: false,
        typedChars: 0,
      };
    });
  }

  /* ── sizing ──────────────────────────────────────────────────────────── */

  resize() {
    const parent = this.canvas.parentElement!;
    const r = parent.getBoundingClientRect();
    this.viewH = r.height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.canvas.style.width = `${r.width}px`;
    this.canvas.style.height = `${r.height}px`;
  }

  /* ── controls ────────────────────────────────────────────────────────── */

  play(opts: PlayOptions = {}) {
    this.opts = opts;
    this.speed = opts.speed ?? 1;

    // Someone who asked the OS for less motion gets the finished page, not a
    // four-second animation they have to sit through.
    if (this.reduced) {
      this.finished = true;
      this.complete = true;
      this.camY = 0;
      this.targetCamY = 0;
      this.render(true);
      opts.onProgress?.(1);
      opts.onDone?.();
      return;
    }
    this.paused = false;
    this.finished = false;
    this.complete = false;
    this.returning = false;
    this.clock = 0;
    this.wall = 0;
    this.wallStart = performance.now();
    this.pausedMs = 0;
    this.pausedAt = 0;
    this.last = performance.now();
    this.doneBoxes.clear();
    this.doneLines.clear();
    this.typingText.clear();
    this.fullText.clear();
    this.wipe = 0;
    this.guideIn = 0;
    for (const a of this.agents) {
      a.progress = 0;
      a.activeIndex = -1;
      a.typing = 0;
      a.pressing = false;
      a.typedChars = 0;
    }
    this.resetAgents();
    this.camY = 0;
    this.targetCamY = 0;
    this.sound?.dissolve();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.tick);
  }

  setSpeed(s: number) {
    this.speed = s;
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.pausedAt = performance.now();
  }

  resume() {
    if (!this.paused) return;
    this.pausedMs += performance.now() - this.pausedAt;
    this.pausedAt = 0;
    this.paused = false;
    this.last = performance.now();
  }

  get time() {
    return this.clock;
  }

  get duration() {
    return this.total;
  }

  /** jump to the finished state */
  finishAll() {
    this.finished = true;
    this.complete = true;
    this.returning = true;
    this.wipe = 1;
    this.camY = 0;
    this.targetCamY = 0;
    this.render(true);
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }

  /** screen-space location of the busiest cursor — used by the outro flock */
  get busyCursor() {
    const active = this.agents.filter((a) => a.activeIndex >= 0);
    return active[0] ?? this.agents[0];
  }

  /* ── the frame ───────────────────────────────────────────────────────── */

  private tick = (now: number) => {
    /* dt is only used for steering smoothing, so clamping a long frame is right
       there — a 300ms hitch must not fling the cursors across the page. It is
       NOT right for the timeline, which is why wall time is measured separately
       below rather than accumulated from dt. */
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    if (!this.paused && !this.finished) {
      const pausedNow = this.pausedMs + (this.pausedAt ? now - this.pausedAt : 0);
      this.wall = Math.max(0, now - this.wallStart - pausedNow);

      /* Out of time: paint the finished page and hand over. Reached only when
         the machine cannot draw fast enough for the requested speed. */
      if (this.opts.hardCapMs && this.wall >= this.opts.hardCapMs) {
        this.finished = true;
        this.complete = true;
        this.clock = this.total;
        this.render(true);
        this.opts.onProgress?.(1);
        this.opts.onDone?.();
        return;
      }

      // scene position: real time spent, scaled by speed
      this.clock = this.wall * this.speed;
      const elapsed = this.clock;

      this.advance(elapsed);
      this.steer(dt);
      this.camera(elapsed);

      const p = Math.min(1, elapsed / this.total);
      this.opts.onProgress?.(p);

      if (p >= 1 && !this.finished) {
        this.finished = true;
        // paint the truth, then hand off
        this.render(true);
        this.sound?.finished();
        this.opts.onDone?.();
        return;
      }
    }

    this.render(false);
    this.raf = requestAnimationFrame(this.tick);
  };

  /** figure out what each cursor should be doing right now */
  private advance(elapsed: number) {
    this.elapsed = elapsed;
    this.rulerIn = Math.min(1, elapsed / 600);
    this.wipe = Math.min(1, Math.max(0, (elapsed - 120) / 520));

    /* the outro: the flock disperses off the finished page */
    if (elapsed >= this.total - this.outroMs) {
      const last = this.plan[this.plan.length - 1];
      this.outroPoint = last
        ? { x: last.step.to.x + 26, y: last.step.to.y + 18 }
        : { x: this.bp.width / 2, y: this.viewH / 2 };
    }

    if (elapsed >= this.total) {
      // the page is fully built: head back to the top for the hand-off
      this.complete = true;
      this.returning = true;
    }

    /* A guide is dragged out the first time a heading is typed, then stays —
       text snapping to a shared left edge is what the reference is showing. */
    if (this.guideIn === 0 && elapsed > this.introMs) this.guideIn = 0.0001;

    for (let a = 0; a < this.agents.length; a++) {
      const agent = this.agents[a];

      // the step this agent should be on: the latest one that has started
      // (plan is sorted by start, so the last match wins)
      let activeIdx = -1;
      for (let k = 0; k < this.plan.length; k++) {
        const p = this.plan[k];
        if (p.agent === a && elapsed >= p.start) activeIdx = k;
        if (p.start > elapsed) break;
      }

      if (activeIdx < 0) {
        agent.progress = 0;
        agent.activeIndex = -1;
        agent.typing = 0;
        agent.pressing = false;
        continue;
      }

      const active = this.plan[activeIdx];
      agent.activeIndex = activeIdx;
      const work = Math.min(1, (elapsed - active.start) / (active.dur * 1000));
      // the first 18% is the cursor travelling; work happens after it lands
      agent.progress = Math.max(0, Math.min(1, (work - 0.18) / 0.82));
      agent.pressing = work > 0.12 && work < 0.98;

      const st = active.step;
      if (st.kind === 'text' && agent.progress >= 0) {
        const t = this.bp.texts[st.index];
        if (t) {
          const chars = Math.ceil(t.text.length * agent.progress);
          const prev = this.typingText.get(st.index) ?? 0;
          if (chars > prev) {
            this.typingText.set(st.index, Math.min(t.text.length, chars));
            /* one key click per few glyphs, not one per frame: a real keyboard
               is ~8 keys a second, and a click per character is a machine gun */
            if (this.sound && chars - prev >= 2) {
              const pan = (t.x / this.bp.width) * 2 - 1;
              this.sound.key(pan, t.text[chars - 1] === ' ');
            }
          }
          // the caret only shows on the line actually being typed
          agent.typing = agent.progress < 1 ? st.index : -1;
        }
      }

      if (agent.progress >= 0.985) {
        const fresh =
          st.kind === 'box'
            ? !this.doneBoxes.has(st.index)
            : st.kind === 'line'
              ? !this.doneLines.has(st.index)
              : !this.fullText.has(st.index);
        if (st.kind === 'box') this.doneBoxes.add(st.index);
        else if (st.kind === 'line') this.doneLines.add(st.index);
        else this.fullText.add(st.index);

        if (fresh) {
          this.opts.onLand?.(active.draw === 'rect' ? 'rect' : active.draw);
          if (this.sound) {
            const pan = (st.to.x / this.bp.width) * 2 - 1;
            if (active.draw === 'dup') this.sound.press(pan);
            this.sound.land(pan, active.step.weight);
          }
        }
      }
    }
  }

  /** flocking + arrival */
  private steer(dt: number) {
    const inOutro = !this.reduced && this.elapsed > this.total - this.outroMs;
    const intro = !this.reduced && this.elapsed < this.introMs;

    const targetFor = (agentIndex: number) => {
      const agent = this.agents[agentIndex];
      if (inOutro) {
        // disperse upward and outward, out of the way of the page underneath
        const spread = (agentIndex - 4) * 90;
        const t = (this.elapsed - (this.total - this.outroMs)) / this.outroMs;
        return {
          x: this.bp.width / 2 + spread + Math.cos(agentIndex * 2.1) * 120,
          y: this.camY - 80 - t * 60 - (agentIndex % 3) * 40,
        };
      }
      if (intro) {
        /* The page wipes blank, then the swarm fans out from the middle of the
           viewport — the opening beat before any work starts. */
        const t = this.elapsed / 1000;
        const a = (agentIndex / 9) * Math.PI * 2 + t * 1.1;
        const r = 120 + t * 210;
        return {
          x: this.bp.width / 2 + Math.cos(a) * r,
          y: this.camY + this.viewH * 0.42 + Math.sin(a) * r * 0.55,
        };
      }
      if (agent.activeIndex < 0) {
        /* Idle means waiting, not dancing: park inside the cursor's own region,
           low in the viewport, so the page never looks like a screensaver. */
        const p = this.plan.find((q) => q.agent === agentIndex && q.start > this.elapsed);
        const home = p ? p.step.to : { x: (agent.region % 3) * (this.bp.width / 3), y: this.camY + this.viewH * 0.6 };
        const t = performance.now() / 1000;
        return {
          x: home.x + Math.cos(t * 0.6 + agentIndex) * 14,
          y: home.y + 26 + Math.sin(t * 0.5 + agentIndex * 1.7) * 10,
        };
      }
      const p = this.plan[agent.activeIndex];
      /* Work is done at the moving end of the thing being drawn, not at its
         origin: while a box is dragged out the cursor rides its bottom-right
         corner; while text is typed it rides the caret. That is the fix for
         "the mouse is not touching what it builds". */
      return this.workPoint(p, this.agents[agentIndex].progress);
    };

    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      const target = targetFor(i);

      // arrival force
      const dx = target.x - a.x;
      const dy = target.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speedCap = 1500 + dist * 2.2;
      const gain = inOutro ? 6.5 : a.activeIndex >= 0 ? 6.2 : 3.4;
      const desired = Math.min(speedCap, dist * gain);
      let fx = (dx / dist) * desired;
      let fy = (dy / dist) * desired;

      // separation — stay out of each other's way
      for (let j = 0; j < this.agents.length; j++) {
        if (i === j) continue;
        const b = this.agents[j];
        const sx = a.x - b.x;
        const sy = a.y - b.y;
        const sd = Math.hypot(sx, sy);
        if (sd > 0 && sd < 110) {
          const push = (110 - sd) * 4.4;
          fx += (sx / sd) * push;
          fy += (sy / sd) * push;
        }
      }

      // cohesion toward the pack centroid, lightly
      let cxs = 0;
      let cys = 0;
      for (const b of this.agents) {
        cxs += b.x;
        cys += b.y;
      }
      cxs /= this.agents.length;
      cys /= this.agents.length;
      fx += (cxs - a.x) * 0.04;
      fy += (cys - a.y) * 0.04;

      const ax = fx - a.vx * 3.4;
      const ay = fy - a.vy * 3.4;

      a.vx += ax * dt * 9;
      a.vy += ay * dt * 9;
      a.x += a.vx * dt;
      a.y += a.vy * dt;

      // stay inside the page
      const pad = 14;
      if (a.x < pad) { a.x = pad; a.vx = Math.abs(a.vx) * 0.4; }
      if (a.x > this.bp.width - pad) { a.x = this.bp.width - pad; a.vx = -Math.abs(a.vx) * 0.4; }
      if (a.y < pad) { a.y = pad; a.vy = Math.abs(a.vy) * 0.4; }

      const sp = Math.hypot(a.vx, a.vy);
      if (sp > 4) a.angle = Math.atan2(a.vy, a.vx) + Math.PI / 4;
      else a.angle += (0 - a.angle) * dt * 6; // settle upright when still
    }
  }

  /** Where the work physically is on this step, given 0..1 progress. */
  private workPoint(p: Planned, progress: number): { x: number; y: number } {
    const st = p.step;
    if (st.kind === 'box') {
      const b = this.bp.boxes[st.index];
      if (!b) return st.to;
      const g = Math.min(1, progress / 0.9);
      /* The corner being dragged: bottom-right, from the top-left origin. The
         hair of offset is the arrow tip resting just outside the rule rather
         than on top of it — scaled by progress so the drag genuinely begins at
         the origin corner and lands exactly on the far one. */
      return { x: b.x + b.w * g + 2 * g, y: b.y + b.h * g + 2 * g };
    }
    if (st.kind === 'text') {
      const t = this.bp.texts[st.index];
      if (!t) return st.to;
      const chars = Math.ceil(t.text.length * progress);
      // the caret, roughly: proportional to how much is typed
      const frac = chars / Math.max(1, t.text.length);
      return { x: t.x + t.w * frac, y: t.y + t.h * 0.6 };
    }
    const l = this.bp.lines[st.index];
    if (!l) return st.to;
    return { x: l.x1 + (l.x2 - l.x1) * progress, y: l.y1 + (l.y2 - l.y1) * progress };
  }

  private camera(elapsed: number) {
    // the outro disperses upward — take the camera with it
    if (elapsed > this.total - this.outroMs) {
      this.targetCamY = this.outroPoint.y - this.viewH * 0.55;
      this.returning = false;
      this.easeCam();
      return;
    }

    // after the outro, travel back to the top so the reveal lands on the nav
    if (this.returning) {
      this.targetCamY = 0;
      this.easeCam();
      return;
    }

    /* Follow the work, not the average of everyone: the cursor doing the
       lowest thing on the page sets the camera, so the reader is always looking
       at where the page is being written. */
    let y = -1;
    for (const a of this.agents) {
      if (a.activeIndex >= 0) y = Math.max(y, this.plan[a.activeIndex].step.to.y);
    }
    if (y >= 0) {
      const target = Math.max(0, y - this.viewH * 0.55);
      this.targetCamY = Math.min(Math.max(0, this.bp.height - this.viewH), target);
    } else {
      const p = Math.min(1, elapsed / this.total);
      this.targetCamY = p * Math.max(0, this.bp.height - this.viewH);
    }
    this.easeCam();
  }

  private easeCam() {
    const maxCam = Math.max(0, this.bp.height - this.viewH);
    this.targetCamY = Math.min(maxCam, Math.max(0, this.targetCamY));

    // ease, and snap the last few pixels so the final frame is exact
    this.camY += (this.targetCamY - this.camY) * 0.06;
    if (Math.abs(this.targetCamY - this.camY) < 0.3) this.camY = this.targetCamY;
  }

  /* ── painting ────────────────────────────────────────────────────────── */

  private render(final: boolean) {
    const { ctx, dpr, bp } = this;
    const w = this.canvas.width / dpr;
    const h = this.canvas.height / dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // page background
    ctx.fillStyle = bp.background;
    ctx.fillRect(0, 0, w, h);

    const cam = this.camY;
    ctx.save();
    ctx.translate(0, -cam);
    const viewTop = cam - 200;
    const viewBottom = cam + h + 200;

    const all = final || this.complete;

    /* The blank sheet. Before the first box lands the page is an empty canvas
       with rulers — the moment the reel opens on. */
    if (!final && !all && this.wipe < 1) {
      this.drawBlank(w, h, cam);
    }

    /* guides: the red alignment rule text snaps to */
    if (!final && !all) this.drawGuide(w, h, cam, viewTop, viewBottom);

    /* rulers last, so they sit above the page edge */
    if (!final) this.drawRulers(w, h, cam);

    /* boxes */
    for (const b of bp.boxes) {
      if (!all && (b.y + b.h < viewTop || b.y > viewBottom)) continue;
      const idx = this.boxIdx.get(b)!;
      if (all || this.doneBoxes.has(idx)) this.paintBox(ctx, b, 1);
      else {
        const plans = this.stepByTarget.get(`box:${idx}`);
        if (plans) {
          for (const p of plans) {
            const a = this.agents[p.agent];
            if (a.progress > 0.02 && a.progress < 1) {
              if (p.draw === 'dup' && p.master) this.paintDupDrag(ctx, b, a.progress, a, p);
              else this.paintBoxDrag(ctx, b, a.progress, a, p.step.weight);
            }
          }
        }
      }
    }

    /* rules / lines */
    for (const l of bp.lines) {
      if (!all && (Math.max(l.y1, l.y2) < viewTop || Math.min(l.y1, l.y2) > viewBottom)) continue;
      const idx = this.lineIdx.get(l)!;
      if (all || this.doneLines.has(idx)) this.paintLine(ctx, l, 1);
      else {
        const plans = this.stepByTarget.get(`line:${idx}`);
        if (plans) {
          for (const p of plans) {
            const a = this.agents[p.agent];
            if (a.progress > 0.05 && a.progress < 1) {
              this.paintLine(ctx, l, a.progress);
              // the pen: anchor dots at each end, rubber band to the cursor
              this.paintPen(ctx, l, a.progress, a.x, a.y);
            }
          }
        }
      }
    }

    /* text */
    for (let i = 0; i < bp.texts.length; i++) {
      const t = bp.texts[i];
      if (t.y < viewTop || t.y > viewBottom) {
        if (!all) continue;
      }
      if (all) {
        this.paintText(ctx, t, t.text.length, false);
      } else if (this.fullText.has(i)) {
        this.paintText(ctx, t, t.text.length, false);
      } else {
        const chars = this.typingText.get(i);
        if (chars && chars > 0) {
          const blinking =
            this.agents.some((a) => a.typing === i) &&
            Math.floor(performance.now() / 420) % 2 === 0;
          // a heading steps up in size as it is typed
          const p = this.plan.find((q) => q.step.kind === 'text' && q.step.index === i);
          const prog = p ? this.agents[p.agent].progress : 1;
          this.paintText(ctx, t, chars, blinking, t.size > 28 ? 0.55 + 0.45 * prog : 1);
        }
      }
    }

    ctx.restore();

    /* cursors */
    if (!final) {
      const outro = Math.max(0, (this.elapsed - (this.total - this.outroMs)) / this.outroMs);
      const fade = 1 - Math.min(1, Math.max(0, (outro - 0.55) / 0.45));
      if (fade > 0.01) {
        for (const a of this.agents) {
          ctx.globalAlpha = fade;
          this.paintCursor(ctx, a.x, a.y - cam, a.color, a.angle, a.pressing);
          if (a.activeIndex >= 0 && outro < 0.2) {
            this.paintLabel(ctx, a.x, a.y - cam, a.name, a.color);
          }
        }
        ctx.globalAlpha = 1;
      }
    }
  }

  /** the blank sheet: page colour, a faint grid, nothing else */
  private drawBlank(w: number, h: number, cam: number) {
    const ctx = this.ctx;
    const a = this.wipe;
    if (a <= 0) return;
    const bp = this.bp;
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = bp.background;
    ctx.fillRect(0, 0, w, h);

    /* a 24px drafting grid, barely there — it is what makes the empty canvas
       read as a canvas rather than a white rectangle */
    ctx.strokeStyle = withAlpha(bp.ink, 0.06);
    ctx.lineWidth = 1;
    ctx.beginPath();
    const g = 24;
    const ox = 0;
    const oy = -cam % g;
    for (let x = ox; x < w; x += g) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = oy; y < h; y += g) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** a red alignment guide with its measured position */
  private drawGuide(w: number, h: number, cam: number, top: number, bottom: number) {
    if (this.guideIn <= 0) return;
    const ctx = this.ctx;
    // pull the first heading's left edge out of the blueprint
    const firstBig = this.bp.texts.find((t) => t.size > 24) ?? this.bp.texts[0];
    if (!firstBig) return;
    const x = Math.round(firstBig.x) + 0.5;
    if (x < 0 || x > w) return;

    const t = Math.min(1, (this.elapsed - this.introMs) / 700);
    ctx.save();
    ctx.globalAlpha = 0.9 * t;
    ctx.strokeStyle = 'rgba(224, 72, 58, 0.85)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, Math.max(0, firstBig.y - cam - 1));
    ctx.lineTo(x, Math.min(h, (bottom - top) + 0));
    ctx.stroke();
    ctx.setLineDash([]);

    // the little flag with the value, at the top of the guide
    const label = `${Math.round(firstBig.x)}`;
    ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    const lw = ctx.measureText(label).width + 10;
    ctx.fillStyle = 'rgba(224, 72, 58, 0.92)';
    roundRect(ctx, x + 3, Math.max(22, firstBig.y - cam), lw, 13, 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 8, Math.max(22, firstBig.y - cam) + 7);
    ctx.restore();
  }

  private paintBox(ctx: CanvasRenderingContext2D, b: BoxNode, p: number) {
    const r = b.radius;
    if (b.fill) {
      ctx.globalAlpha = 0.96 * p;
      ctx.fillStyle = b.fill;
      roundRect(ctx, b.x, b.y, b.w, b.h, r);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (b.border > 0) {
      ctx.strokeStyle = b.borderColor;
      ctx.lineWidth = b.border;
      roundRect(ctx, b.x + b.border / 2, b.y + b.border / 2, b.w - b.border, b.h - b.border, r);
      ctx.stroke();
    }
    if (b.role === 'image') {
      // a plate, drawn as a light hatch so it reads as a placeholder image
      ctx.save();
      roundRect(ctx, b.x, b.y, b.w, b.h, r);
      ctx.clip();
      ctx.strokeStyle = withAlpha(b.borderColor, 0.5);
      ctx.lineWidth = 1;
      for (let i = -b.h; i < b.w; i += 14) {
        ctx.beginPath();
        ctx.moveTo(b.x + i, b.y + b.h);
        ctx.lineTo(b.x + i + b.h, b.y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  /**
   * A box being dragged out. The reference draws the rectangle from its corner
   * with a crosshair and a live size badge; the fill only arrives at the end, so
   * you watch the shape being made rather than a block fading in.
   */
  private paintBoxDrag(
    ctx: CanvasRenderingContext2D,
    b: BoxNode,
    p: number,
    agent: { color: string },
    weight: number
  ) {
    const g = Math.min(1, p / 0.86);
    const w = b.w * g;
    const h = b.h * g;

    ctx.save();
    // the placeholder the page will occupy, ghosted
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(120,120,128,0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // the live drag
    ctx.strokeStyle = 'rgba(60,60,72,0.9)';
    ctx.lineWidth = 1.25;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, w, h);

    // crosshair at the moving corner — this is what the cursor is holding
    const cx = b.x + w;
    const cy = b.y + h;
    ctx.strokeStyle = agent.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy + 0.5);
    ctx.lineTo(cx + 7, cy + 0.5);
    ctx.moveTo(cx + 0.5, cy - 7);
    ctx.lineTo(cx + 0.5, cy + 7);
    ctx.stroke();
    ctx.restore();

    // the size badge, following the corner
    if (g > 0.02) {
      const label = `${Math.round(w)} × ${Math.round(h)}`;
      this.badge(ctx, cx + 9, cy - 6, label, agent.color, weight);
    }
  }

  /** ⌥-drag: the master is copied, and the copy lands at full size */
  private paintDupDrag(
    ctx: CanvasRenderingContext2D,
    b: BoxNode,
    p: number,
    agent: { color: string; x: number; y: number },
    plan: Planned
  ) {
    const g = Math.min(1, p / 0.8);
    const m = plan.master ? this.bp.boxes[plan.master.step.index] : null;

    // from the master to the copy: a rubber band and a ghost outline
    ctx.save();
    if (m) {
      ctx.strokeStyle = 'rgba(224, 72, 58, 0.55)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(m.x + m.w / 2, m.y + m.h / 2);
      ctx.lineTo(b.x + b.w / 2, b.y + b.h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // the ghost of the thing being stamped
    ctx.globalAlpha = 0.5 * g;
    ctx.strokeStyle = agent.color;
    ctx.lineWidth = 1.25;
    roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w, b.h, b.radius);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();

    if (g > 0.05) {
      /* red spacing marks: the gap between the master and this copy, which is
         the detail that makes a duplicate read as ⌥-drag rather than "pop in" */
      if (m) {
        const gap = Math.round(Math.abs(b.y - (m.y + m.h)));
        if (gap > 2) {
          const gx = b.x + b.w + 12;
          const y1 = Math.min(m.y + m.h, b.y);
          const y2 = Math.max(m.y + m.h, b.y);
          ctx.save();
          ctx.strokeStyle = 'rgba(224, 72, 58, 0.9)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(gx + 0.5, y1);
          ctx.lineTo(gx + 0.5, y2);
          ctx.moveTo(gx - 3, y1 + 0.5);
          ctx.lineTo(gx + 4, y1 + 0.5);
          ctx.moveTo(gx - 3, y2 + 0.5);
          ctx.lineTo(gx + 4, y2 + 0.5);
          ctx.stroke();
          ctx.restore();
          this.badge(ctx, gx + 6, (y1 + y2) / 2 + 7, `${gap}`, 'rgba(224,72,58,0.95)', 1);
        }
      }
      this.badge(ctx, b.x + b.w + 9, b.y + b.h - 4, 'copy', agent.color, 1);
    }
  }

  private paintLine(ctx: CanvasRenderingContext2D, l: LineNode, p: number) {
    const x2 = l.x1 + (l.x2 - l.x1) * p;
    const y2 = l.y1 + (l.y2 - l.y1) * p;
    ctx.strokeStyle = l.color;
    ctx.lineWidth = l.weight;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /** pen tool: anchor at the start, a rubber band out to the cursor */
  private paintPen(
    ctx: CanvasRenderingContext2D,
    l: LineNode,
    p: number,
    cx: number,
    cy: number
  ) {
    const x2 = l.x1 + (l.x2 - l.x1) * p;
    const y2 = l.y1 + (l.y2 - l.y1) * p;
    ctx.save();
    ctx.strokeStyle = 'rgba(60,60,72,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(cx, cy);
    ctx.stroke();
    ctx.setLineDash([]);
    // anchors
    for (const [ax, ay] of [
      [l.x1, l.y1],
      [x2, y2],
    ]) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(60,60,72,0.9)';
      ctx.fillRect(ax - 2.5, ay - 2.5, 5, 5);
      ctx.strokeRect(ax - 2.5, ay - 2.5, 5, 5);
    }
    ctx.restore();
  }

  private paintText(
    ctx: CanvasRenderingContext2D,
    t: LineText,
    chars: number,
    caret: boolean,
    scale = 1
  ) {
    const text = chars >= t.text.length ? t.text : t.text.slice(0, chars);
    const size = t.size * scale;
    ctx.font = `${t.weight} ${size}px ${t.font}`;
    ctx.fillStyle = t.color;
    ctx.textBaseline = 'alphabetic';

    const baseY = t.y + t.h * 0.78 + (t.size - size) * 0.2;
    ctx.fillText(text, t.x, baseY);

    if (caret) {
      const wpx = ctx.measureText(text).width;
      ctx.fillStyle = t.color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(t.x + wpx + 1.5, t.y + t.h * 0.14, Math.max(1, size * 0.055), t.h * 0.76);
      ctx.globalAlpha = 1;
    }
  }

  private paintCursor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    angle: number,
    pressing = false
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // the click: a ring that grows out from the tip while the mouse is down
    if (pressing) {
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.strokeStyle = withAlpha(color, 0.35);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // a hand-drawn arrow, not a system cursor
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, 15);
    ctx.lineTo(4.2, 11.4);
    ctx.lineTo(7.2, 17.6);
    ctx.lineTo(9.9, 16.3);
    ctx.lineTo(6.9, 10.3);
    ctx.lineTo(12, 9.6);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.restore();
  }

  private paintLabel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    name: string,
    color: string
  ) {
    ctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    const w = ctx.measureText(name).width + 12;
    const lx = x + 15;
    const ly = y + 19;
    ctx.fillStyle = color;
    roundRect(ctx, lx, ly, w, 15, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.97)';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, lx + 6, ly + 8);
  }

  private badge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    color: string,
    weight: number
  ) {
    ctx.font = '500 9px ui-monospace, SFMono-Regular, Menlo, monospace';
    const w = ctx.measureText(label).width + 9;
    void weight;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.95;
    roundRect(ctx, x, y - 13, w, 13, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 4.5, y - 6.5);
  }

  private drawRulers(w: number, h: number, cam: number) {
    const a = this.rulerIn;
    if (a <= 0) return;
    const ctx = this.ctx;
    const step = 50;

    ctx.save();
    ctx.globalAlpha = 0.95 * a;

    // top
    const topY = 0 - 0;
    ctx.fillStyle = 'rgba(250,250,250,0.96)';
    ctx.fillRect(0, topY, w, 18);
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 18.5);
    ctx.lineTo(w, 18.5);
    ctx.stroke();

    ctx.font = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.textBaseline = 'top';
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 12);
      ctx.lineTo(x + 0.5, 18);
      ctx.stroke();
      if (x % 200 === 0) ctx.fillText(String(Math.round(x)), x + 3, 2);
    }

    // left, scrolling with the page
    ctx.fillStyle = 'rgba(250,250,250,0.96)';
    ctx.fillRect(0, 0, 18, h);
    ctx.beginPath();
    ctx.moveTo(18.5, 0);
    ctx.lineTo(18.5, h);
    ctx.stroke();

    ctx.textBaseline = 'middle';
    const startY = Math.floor(cam / step) * step;
    for (let y = startY; y < cam + h; y += step) {
      const sy = y - cam;
      ctx.beginPath();
      ctx.moveTo(12, sy + 0.5);
      ctx.lineTo(18, sy + 0.5);
      ctx.stroke();
      if (y % 200 === 0) {
        ctx.save();
        ctx.translate(4, sy);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(String(Math.round(y)), 0, 0);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  if (rr === 0) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function withAlpha(color: string, a: number): string {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((s) => s.trim());
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${a})`;
  }
  // #rrggbb
  const h = color.match(/^#([0-9a-f]{6})$/i);
  if (h) {
    const n = parseInt(h[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  return color;
}
