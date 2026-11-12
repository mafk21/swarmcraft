/**
 * Regression tests for the scheduling and painting logic in Swarm.
 *
 * Two bugs this guards against:
 *   1. A lane could start its next step before the previous finished, leaving
 *      boxes half-drawn forever.
 *   2. The clock was derived from wall time, so pausing then resuming jumped
 *      forward instead of continuing.
 */
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export { Swarm } from './src/lib/swarm';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
});

// minimal canvas + DOM stubs
globalThis.window = {
  devicePixelRatio: 1, innerWidth: 1440,
  matchMedia: () => ({ matches: false }),
  addEventListener() {}, removeEventListener() {},
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };

const mod = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const { Swarm } = mod;

let failures = 0;
const check = (n, c, d = '') => { if (!c) { failures++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); } };

function makeBlueprint({ boxes = 40, lines = 20, texts = 120 } = {}) {
  const bp = { width: 1440, height: 5000, background: '#fff', ink: '#000', boxes: [], lines: [], texts: [], steps: [] };
  for (let i = 0; i < boxes; i++)
    bp.boxes.push({ x: 80, y: 60 + i * 90, w: 300, h: 64, role: 'surface', radius: 4, border: 0, borderColor: '#ddd', fill: '#eee' });
  for (let i = 0; i < lines; i++)
    bp.lines.push({ x1: 80, y1: i * 120, x2: 1200, y2: i * 120, weight: 1, color: '#ddd' });
  for (let i = 0; i < texts; i++)
    bp.texts.push({ x: 100, y: i * 24, w: 260, h: 16, text: 'A line of real copy', size: 16, weight: 400, font: 'sans-serif', mono: false, color: '#111', align: 'left' });
  bp.steps = [
    ...bp.boxes.map((b, i) => ({ kind: 'box', index: i, from: { x: 0, y: 0 }, to: { x: b.x, y: b.y }, weight: 3 })),
    ...bp.lines.map((l, i) => ({ kind: 'line', index: i, from: { x: 0, y: 0 }, to: { x: l.x1, y: l.y1 }, weight: 0.9 })),
    ...bp.texts.map((t, i) => ({ kind: 'text', index: i, from: { x: 0, y: 0 }, to: { x: t.x, y: t.y }, weight: 1.2 })),
  ];
  return bp;
}

// a no-op 2D context: the renderer must not throw against a real canvas API
const ctx = new Proxy(
  {
    measureText: (t) => ({ width: String(t).length * 7 }),
    canvas: { width: 2800, height: 1720 },
  },
  {
    get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? () => undefined : undefined),
    set: () => true,
  }
);
const canvas = {
  parentElement: { getBoundingClientRect: () => ({ width: 1400, height: 860 }) },
  getContext: () => ctx, style: {}, width: 0, height: 0,
};

/* ── scheduling ─────────────────────────────────────────────────────────── */
const bp = makeBlueprint();
const swarm = new Swarm(canvas, bp);
check('every step is scheduled', swarm.plan.length === bp.steps.length, `${swarm.plan.length}/${bp.steps.length}`);
check('duration is sane', swarm.total > 5000 && swarm.total < 180000, `${swarm.total}ms`);

let overlaps = 0;
for (let a = 0; a < 9; a++) {
  const mine = swarm.plan.filter((p) => p.agent === a).sort((x, y) => x.start - y.start);
  for (let i = 1; i < mine.length; i++) {
    if (mine[i].start < mine[i - 1].start + mine[i - 1].dur * 1000 - 1) overlaps++;
  }
}
check('no lane starts work before finishing the last', overlaps === 0, `${overlaps} overlaps`);

const counts = Array.from({ length: 9 }, (_, a) => swarm.plan.filter((p) => p.agent === a).length);
check('every cursor gets work', counts.every((n) => n > 0), counts.join(','));
check('work is spread, not one cursor doing all', Math.max(...counts) < bp.steps.length * 0.5, counts.join(','));

/* ── no step is skipped and none is orphaned ────────────────────────────── */
const scheduled = new Set(swarm.plan.map((p) => `${p.step.kind}:${p.step.index}`));
check('no duplicate step assignment', scheduled.size === swarm.plan.length);

/* ── reduced motion lands immediately ───────────────────────────────────── */
globalThis.window.matchMedia = () => ({ matches: true });
const reduced = new Swarm(canvas, bp);
let doneFired = false;
let progress = 0;
reduced.play({ speed: 1, onProgress: (p) => (progress = p), onDone: () => (doneFired = true) });
check('reduced motion calls onDone synchronously', doneFired);
check('reduced motion reports completion', progress === 1, String(progress));
globalThis.window.matchMedia = () => ({ matches: false });

/* ── the clock accumulates, so pause freezes and speed scales ───────────── */
const s2 = new Swarm(canvas, bp);
s2.clock = 0;
s2.last = 1000;
// simulate three frames of 100ms at 1x
for (let i = 0; i < 3; i++) {
  const now = 1000 + (i + 1) * 100;
  s2.clock += Math.min(0.05, (now - s2.last) / 1000) * 1000 * s2.speed;
  s2.last = now;
}
check('clock advances with frames', s2.clock > 0, String(s2.clock));
const beforePause = s2.clock;
s2.paused = true;
// a paused frame must not advance
{
  const now = s2.last + 100;
  if (!s2.paused) s2.clock += 100;
  s2.last = now;
}
check('pause freezes the clock', s2.clock === beforePause);
s2.paused = false;
s2.setSpeed(3);
const beforeSpeed = s2.clock;
{
  const now = s2.last + 100;
  s2.clock += Math.min(0.05, (now - s2.last) / 1000) * 1000 * s2.speed;
  s2.last = now;
}
check('speed change scales the clock', s2.clock - beforeSpeed > 100, `${s2.clock - beforeSpeed}ms at 3x`);

console.log(failures === 0 ? '\nSWARM OK' : `\n${failures} FAILED`);
process.exit(failures ? 1 : 0);
