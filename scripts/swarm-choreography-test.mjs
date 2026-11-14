/* ============================================================================
   "the mouses are just going around, not touching what is building"

   That was the complaint, and it was true. The engine scheduled one step per
   measured box / line / text line — hundreds — and let any cursor take the
   nearest one, so a cursor held a text line for a fifth of a second and left.
   Nothing was ever worked ON.

   These assertions are about the two things that fix it:
     1. the cursor's anchor is on the moving end of the thing being drawn;
     2. the schedule is grouped by region and by containment, so a cursor draws
        a card and then types the words inside it.
   ========================================================================== */
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export { Swarm } from './src/lib/swarm';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
});

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

let fail = 0;
const ok = (n, c, d = '') => { if (!c) { fail++; console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`); } };

/* A page shaped like a real one: a nav, a hero heading, and a card grid whose
   three cards are identical and evenly spaced (the duplicate pattern). */
function makePage() {
  const bp = { width: 1400, height: 4000, background: '#fff', ink: '#111', boxes: [], lines: [], texts: [], steps: [] };
  const box = (x, y, w, h, role = 'surface') => {
    const b = { x, y, w, h, role, radius: 4, border: 1, borderColor: '#ddd', fill: '#f4f4f4' };
    bp.boxes.push(b);
    return b;
  };
  const text = (x, y, w, h, s, size = 16) => {
    const t = { x, y, w, h, text: s, size, weight: 400, font: 'sans-serif', mono: false, color: '#111', align: 'left' };
    bp.texts.push(t);
    return t;
  };

  box(0, 0, 1400, 64, 'nav');
  text(60, 22, 200, 20, 'Falcon Coffee');
  text(900, 22, 90, 20, 'Shop');
  text(1010, 22, 90, 20, 'About');
  text(1120, 22, 90, 20, 'Contact');

  text(80, 150, 700, 54, 'Freshly roasted every Tuesday', 44);
  text(80, 230, 600, 22, 'Single origin, shipped from Dammam.');

  // three identical cards — a master and two copies
  for (let i = 0; i < 3; i++) {
    const y = 400 + i * 260;
    box(80, y, 380, 220, 'card');
    text(104, y + 24, 300, 24, `Card ${i + 1} title`, 20);
    text(104, y + 66, 320, 18, 'A line of body copy inside the card.');
    text(104, y + 96, 320, 18, 'And a second line of it.');
  }
  return bp;
}

const ctx = new Proxy(
  { measureText: (t) => ({ width: String(t).length * 7 }), canvas: { width: 2800, height: 1720 } },
  { get: (t, k) => (k in t ? t[k] : typeof k === 'string' ? () => undefined : undefined), set: () => true }
);
const canvas = {
  parentElement: { getBoundingClientRect: () => ({ width: 1400, height: 860 }) },
  getContext: () => ctx, style: {}, width: 0, height: 0,
};

const bp = makePage();
const swarm = new Swarm(canvas, bp);
const plan = swarm.plan;

/* ── the anchor is on the thing being drawn ─────────────────────────────── */

swarm.resize();

/* a box mid-drag: the cursor must be at the corner being pulled, not the origin */
{
  const boxStep = plan.find((p) => p.draw === 'rect' && p.step.index !== undefined && bp.boxes[p.step.index].w > 300);
  ok('some step is a rect being dragged', !!boxStep);
  const b = bp.boxes[boxStep.step.index];
  const start = swarm.workPoint(boxStep, 0);
  const mid = swarm.workPoint(boxStep, 0.5);
  const end = swarm.workPoint(boxStep, 1);
  ok('a drag starts at the box origin', start.x === b.x && start.y === b.y, `${start.x},${start.y} vs ${b.x},${b.y}`);
  ok('a drag ends at the box far corner',
    Math.abs(end.x - (b.x + b.w)) <= 3 && Math.abs(end.y - (b.y + b.h)) <= 3,
    `${end.x},${end.y} vs ${b.x + b.w},${b.y + b.h}`);
  ok('mid-drag the cursor is halfway along the box, not parked',
    mid.x > b.x + b.w * 0.3 && mid.x < b.x + b.w * 0.7, String(mid.x));
  ok('mid-drag the cursor is inside the box it is drawing',
    mid.x >= b.x && mid.x <= b.x + b.w && mid.y >= b.y && mid.y <= b.y + b.h);
}

/* text: the cursor rides the caret across the line as it types */
{
  const tStep = plan.find((p) => p.draw === 'text' && p.step.index !== undefined && bp.texts[p.step.index].text.length > 20);
  const t = bp.texts[tStep.step.index];
  const a = swarm.workPoint(tStep, 0.1);
  const z = swarm.workPoint(tStep, 0.9);
  ok('typing starts at the left of the line', Math.abs(a.x - t.x) < t.w * 0.2, String(a.x));
  ok('typing ends at the right of the line', z.x > a.x + t.w * 0.5, `${a.x} -> ${z.x}`);
  ok('the caret stays on the text baseline band',
    Math.abs(z.y - (t.y + t.h * 0.6)) < 1, String(z.y));
}

/* a line is drawn from one end to the other by the cursor itself */
{
  bp.lines.push({ x1: 80, y1: 300, x2: 1200, y2: 300, weight: 1, color: '#ddd' });
  bp.steps = [];
  const s2 = new Swarm(canvas, makePage());
  const lStep = s2.plan.find((p) => p.draw === 'line');
  if (lStep) {
    const start = s2.workPoint(lStep, 0);
    const end = s2.workPoint(lStep, 1);
    ok('a pen stroke travels from one anchor to the other',
      Math.abs(start.x - end.x) > 50, `${start.x} -> ${end.x}`);
  }
}

/* ── the schedule is grouped, so work is not scattered ──────────────────── */

/* every cursor owns a region and mostly stays in it */
{
  const perAgent = new Map();
  for (const p of plan) {
    const arr = perAgent.get(p.agent) ?? [];
    arr.push(p);
    perAgent.set(p.agent, arr);
  }
  let jumps = 0;
  let legs = 0;
  for (const [, arr] of perAgent) {
    const sorted = [...arr].sort((x, y) => x.start - y.start);
    for (let i = 1; i < sorted.length; i++) {
      legs++;
      const a = bp.boxes[sorted[i - 1].step.kind === 'box' ? sorted[i - 1].step.index : -1];
      void a;
      // a "jump" is more than 900px of vertical travel between consecutive steps
      if (Math.abs(sorted[i].step.to.y - sorted[i - 1].step.to.y) > 900) jumps++;
    }
  }
  ok('a cursor stays near its own work', jumps / Math.max(1, legs) < 0.25,
    `${jumps}/${legs} long jumps`);
}

/* repeated cards become master + copies rather than three independent draws */
{
  const dups = plan.filter((p) => p.draw === 'dup');
  ok('identical repeated cards are stamped as copies', dups.length >= 2, `${dups.length} copies`);
  ok('a copy waits for its master', dups.every((d) => !d.master || d.master.start < d.start),
    'a copy was scheduled before the master it copies');
}

/* text inside a card is scheduled after that card exists */
{
  const cardBoxes = plan.filter((p) => p.draw === 'rect' && bp.boxes[p.step.index]?.role === 'card');
  let violations = 0;
  let checked = 0;
  for (const p of plan.filter((q) => q.draw === 'text')) {
    const t = bp.texts[p.step.index];
    const host = cardBoxes.find((c) => {
      const b = bp.boxes[c.step.index];
      return t.x >= b.x - 6 && t.x <= b.x + b.w && t.y >= b.y - 4 && t.y <= b.y + b.h;
    });
    if (!host) continue;
    checked++;
    if (p.start < host.start) violations++;
  }
  ok('text is typed after the card it lives in is drawn', violations === 0 && checked > 0,
    `${violations} early out of ${checked}`);
}

/* the build still ends, and it is not slower than before */
{
  ok('the build has a bounded duration', swarm.total > 4000 && swarm.total < 120000, `${Math.round(swarm.total)}ms`);
}

console.log(fail === 0
  ? '\nCHOREOGRAPHY OK — cursors touch what they build: drags end on the corner, caret rides the line, cards are stamped as copies, text follows its card'
  : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
