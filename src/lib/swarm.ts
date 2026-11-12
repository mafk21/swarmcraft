/* ============================================================================
   THE SWARM ENGINE

   Nine cursors. One canvas. They rebuild a real page.

   How it works:
   1. A BuildPlan is made from the Blueprint's steps — each step gets a Muse,
      a start time and a duration, weighted by how much work it is.
   2. Every frame, each cursor steers toward its current step's anchor with
      flocking (separation + cohesion + arrival). They do NOT move in straight
      lines and they do NOT teleport.
   3. Each cursor paints into the canvas when it arrives:
        box   → crosshair corners, drag, live W×H badge, then the fill
        line  → pen stroke from one end to the other, with a ruler guide
        text  → typed glyph by glyph with a blinking caret
   4. The camera follows the action down the page.
   5. At the end, everything is complete, we fade the canvas out and the real
      interactive page fades in underneath.
   ========================================================================== */

import type { Blueprint, BoxNode, LineNode, LineText, Step } from './blueprint';

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

/* ── plan ────────────────────────────────────────────────────────────────── */

type Planned = {
  step: import('./blueprint').Step;
  agent: number;
  start: number;
  dur: number;
  /** travel allowance before work begins */
  travel: number;
};

export type PlayOptions = {
  speed?: number;
  onProgress?: (p: number) => void;
  onDone?: () => void;
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

/* ── the engine ──────────────────────────────────────────────────────────── */

export class Swarm {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private bp: Blueprint;
  private dpr: number;

  private agents: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    name: string;
    /** screen-space rotation of the pointer arrow, follows velocity */
    angle: number;
    /** 0..1 progress of the current step's paint */
    progress: number;
    activeIndex: number;
    typing: number;
  }[] = [];

  private plan: Planned[] = [];
  private doneBoxes = new Set<number>();
  private doneLines = new Set<number>();
  private typingText = new Map<number, number>(); // text index -> chars drawn

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

  private opts: PlayOptions = {};

  /* rulers slide in at the start */
  private rulerIn = 0;

  /* intro orbit, then work, then a flock together at the end */
  private elapsed = 0;
  private readonly introMs = 850;
  private readonly outroMs = 1100;
  private outroPoint = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, bp: Blueprint) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.bp = bp;
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
    const steps = this.bp.steps;

    /* Nine lanes. Each lane is a real person working top to bottom: a lane
       never starts its next step until the current one is finished, so no box
       is ever abandoned half-dragged. Lanes run in parallel with each other. */
    const laneFree = new Array(9).fill(0); // ms
    const lastPos = new Array(9).fill(0).map(() => ({ x: this.bp.width * 0.5, y: 200 }));

    /* The stagger is what makes it look hand-made.
       Without it every landmark inside a band completes at the same instant and
       the page appears to assemble itself in rows. Each step instead gets a
       small random delay of its own, so the cursor working at the left of a
       band finishes before the one at the right. Boxes (the landmarks) get the
       widest spread; text the narrowest, because typing already staggers. */
    const spreadFor = (kind: Step['kind']) =>
      kind === 'box' ? 700 : kind === 'line' ? 480 : 420;

    for (const step of steps) {
      // pick the lane that is free soonest and is nearest the work
      let best = 0;
      let bestScore = Infinity;
      for (let a = 0; a < 9; a++) {
        const dist = Math.hypot(lastPos[a].x - step.to.x, lastPos[a].y - step.to.y);
        const score = laneFree[a] + Math.min(6000, dist * 3.2) + Math.random() * 260;
        if (score < bestScore) {
          bestScore = score;
          best = a;
        }
      }

      const dist = Math.hypot(lastPos[best].x - step.to.x, lastPos[best].y - step.to.y);
      const travel = Math.min(1.4, dist / 1100);

      // seconds this piece of work takes; bigger things take longer
      const dur = 0.34 + step.weight * 0.17 + travel * 0.35;

      // this step's own jitter, so nothing lands in lockstep
      const stagger = Math.random() * spreadFor(step.kind);

      const start = laneFree[best] + stagger;
      laneFree[best] = start + dur * 1000 + 70;
      lastPos[best] = { x: step.to.x, y: step.to.y };

      this.plan.push({ step, agent: best, start, dur, travel });
    }

    // the landmark order is also the reading order: big surfaces first within
    // a band, so the page has a skeleton before it has sentences
    this.plan.sort((a, b) => a.start - b.start);
    this.total = Math.max(...laneFree) + 900;
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
        angle: 0,
        progress: 0,
        activeIndex: -1,
        typing: 0,
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
    for (const a of this.agents) {
      a.progress = 0;
      a.activeIndex = -1;
      a.typing = 0;
    }
    this.resetAgents();
    this.camY = 0;
    this.targetCamY = 0;
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
    this.rulerIn = Math.min(1, elapsed / 700);

    /* the outro: everyone converges on the last piece of work */
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
        continue;
      }

      const active = this.plan[activeIdx];
      agent.activeIndex = activeIdx;
      const work = Math.min(1, (elapsed - active.start) / (active.dur * 1000));
      // the first 18% is the cursor travelling; work happens after it lands
      agent.progress = Math.max(0, Math.min(1, (work - 0.18) / 0.82));

      // text draws progressively, glyph by glyph; boxes and lines commit at the end
      const st = active.step;
      if (st.kind === 'text' && agent.progress >= 0) {
        const t = this.bp.texts[st.index];
        if (t) {
          const chars = Math.ceil(t.text.length * agent.progress);
          const prev = this.typingText.get(st.index) ?? 0;
          if (chars > prev) this.typingText.set(st.index, Math.min(t.text.length, chars));
          // the caret only shows on the line actually being typed
          agent.typing = agent.progress < 1 ? st.index : -1;
        }
      }

      if (agent.progress >= 0.985) {
        if (st.kind === 'box') this.doneBoxes.add(st.index);
        else if (st.kind === 'line') this.doneLines.add(st.index);
      }
    }
  }

  /** flocking + arrival */
  private steer(dt: number) {
    const inOutro = !this.reduced && this.elapsed > this.total - this.outroMs;

    const targetFor = (agentIndex: number) => {
      const agent = this.agents[agentIndex];
      if (inOutro) {
        // flock to one point, stacked so they stay readable
        return {
          x: this.outroPoint.x - (agentIndex % 3) * 15,
          y: this.outroPoint.y - Math.floor(agentIndex / 3) * 13,
        };
      }
      if (!this.reduced && this.elapsed < this.introMs) {
        // intro orbit: a slow ring around the middle of the viewport
        const t = this.elapsed / 1000;
        const a = (agentIndex / 9) * Math.PI * 2 + t * 1.5;
        const r = 150 + Math.sin(t * 2 + agentIndex) * 22;
        return {
          x: this.bp.width / 2 + Math.cos(a) * r,
          y: this.camY + this.viewH * 0.42 + Math.sin(a) * r * 0.6,
        };
      }
      if (agent.activeIndex < 0) {
        // idle: drift around the current camera band
        const t = performance.now() / 1000;
        return {
          x: this.bp.width * (0.15 + 0.7 * ((agentIndex % 3) / 2)) + Math.cos(t + agentIndex) * 90,
          y: this.camY + this.viewH * 0.5 + Math.sin(t * 0.7 + agentIndex * 2) * 120,
        };
      }
      const p = this.plan[agent.activeIndex];
      return p.step.to;
    };

    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      const target = targetFor(i);

      // arrival force
      const dx = target.x - a.x;
      const dy = target.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speedCap = 1500 + dist * 2.2;
      const gain = inOutro ? 7.5 : 4.2;
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
      fx += (cxs - a.x) * 0.06;
      fy += (cys - a.y) * 0.06;

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
    }
  }

  private camera(elapsed: number) {
    // the outro converges on the final piece of work — follow it there
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

    // follow the lowest active work, staying a band ahead
    let y = 0;
    let count = 0;
    for (const a of this.agents) {
      if (a.activeIndex >= 0) {
        y += this.plan[a.activeIndex].step.to.y;
        count++;
      }
    }
    if (count) {
      const target = Math.max(0, y / count - this.viewH * 0.42);
      this.targetCamY = Math.min(Math.max(0, this.bp.height - this.viewH), target);
    } else {
      const p = Math.min(1, elapsed / this.total);
      // idle: drift slowly down so the canvas does not sit frozen
      this.targetCamY = p * Math.max(0, this.bp.height - this.viewH);
    }
    this.easeCam();
  }

  private returning = false;

  private easeCam() {
    const maxCam = Math.max(0, this.bp.height - this.viewH);
    this.targetCamY = Math.min(maxCam, Math.max(0, this.targetCamY));

    // ease, and snap the last few pixels so the final frame is exact
    this.camY += (this.targetCamY - this.camY) * 0.055;
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

    /* rulers */
    if (!final) this.drawRulers(w, h, cam);

    const all = final || this.complete;

    /* boxes
       Culled vertically like text already was. Without this every box on a
       six-thousand-pixel page was filled on every frame whether it was on
       screen or not, which is the difference between a smooth build and a
       fan spinning up on a laptop. */
    for (const b of bp.boxes) {
      if (!all && (b.y + b.h < viewTop || b.y > viewBottom)) continue;
      const idx = this.boxIdx.get(b)!;
      if (all || this.doneBoxes.has(idx)) this.paintBox(ctx, b, 1);
      else {
        const plans = this.stepByTarget.get(`box:${idx}`);
        if (plans) {
          for (const p of plans) {
            const a = this.agents[p.agent];
            if (a.progress > 0.05 && a.progress < 1) this.paintBoxDrag(ctx, b, a.progress, a);
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
            if (a.progress > 0.1 && a.progress < 1) this.paintLine(ctx, l, a.progress);
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
      } else {
        const chars = this.typingText.get(i);
        if (chars && chars > 0) {
          const blinking =
            this.agents.some((a) => a.typing === i) &&
            Math.floor(performance.now() / 420) % 2 === 0;
          this.paintText(ctx, t, chars, blinking);
        }
      }
    }

    ctx.restore();

    /* cursors */
    if (!final) {
      const outro = Math.max(0, (this.elapsed - (this.total - this.outroMs)) / this.outroMs);
      const fade = 1 - Math.min(1, Math.max(0, (outro - 0.62) / 0.38));
      if (fade > 0.01) {
        for (const a of this.agents) {
          ctx.globalAlpha = fade;
          this.paintCursor(ctx, a.x, a.y - cam, a.color, a.angle);
          if (a.activeIndex >= 0 && outro < 0.2) {
            this.paintLabel(ctx, a.x, a.y - cam, a.name, a.color);
          }
        }
        ctx.globalAlpha = 1;
      }
    }
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

  private paintBoxDrag(
    ctx: CanvasRenderingContext2D,
    b: BoxNode,
    p: number,
    agent: { color: string }
  ) {
    // grow the rectangle from its top-left, drag-style
    const g = Math.min(1, p / 0.86);
    const w = b.w * g;
    const h = b.h * g;

    ctx.save();
    ctx.strokeStyle = agent.color;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, w, h);
    ctx.setLineDash([]);

    // corner crosshairs
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(b.x - 4, b.y + 0.5);
    ctx.lineTo(b.x + 7, b.y + 0.5);
    ctx.moveTo(b.x + 0.5, b.y - 4);
    ctx.lineTo(b.x + 0.5, b.y + 7);
    ctx.stroke();
    ctx.restore();

    // live W × H badge
    if (g > 0.02 && g < 0.995) {
      const label = `${Math.round(w)} × ${Math.round(h)}`;
      this.badge(ctx, b.x + w + 8, b.y + h - 6, label, agent.color);
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

  private paintText(
    ctx: CanvasRenderingContext2D,
    t: LineText,
    chars: number,
    caret: boolean
  ) {
    const text = chars >= t.text.length ? t.text : t.text.slice(0, chars);
    ctx.font = `${t.weight} ${t.size}px ${t.font}`;
    ctx.fillStyle = t.color;
    ctx.textBaseline = 'alphabetic';

    const baseY = t.y + t.h * 0.78;
    ctx.fillText(text, t.x, baseY);

    if (caret) {
      const wpx = ctx.measureText(text).width;
      ctx.fillStyle = t.color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(t.x + wpx + 1.5, t.y + t.h * 0.14, Math.max(1, t.size * 0.055), t.h * 0.76);
      ctx.globalAlpha = 1;
    }
  }

  private paintCursor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    angle: number
  ) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
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
    color: string
  ) {
    ctx.font = '500 10px ui-monospace, SFMono-Regular, Menlo, monospace';
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.95;
    roundRect(ctx, x, y - 14, w, 14, 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.98)';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 5, y - 7);
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
  return color;
}
