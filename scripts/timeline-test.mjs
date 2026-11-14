/**
 * The end-to-end promise: a finished page inside the budget.
 *
 * Runs the REAL pipeline (buildSite → renderDocument → snapshot → Swarm) with a
 * stubbed network and a stubbed frame clock, then reports when the page becomes
 * visible. jsdom has no layout, so the measured page is the 117-box one that
 * snapshot-test.mjs established; everything else is the shipping code.
 *
 *   node scripts/timeline-test.mjs
 *
 * This is the test that was missing. The previous rounds tested each stage and
 * then asserted a total, which is exactly how three 40-second ceilings added up
 * to 140 seconds without anything reporting a failure.
 */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { JSDOM } from 'jsdom';
import { writeFileSync } from 'node:fs';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
const nodeRAF = (cb) => setTimeout(() => cb(Date.now()), 16);
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document,
  Node: dom.window.Node, Range: dom.window.Range,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
  requestAnimationFrame: nodeRAF, cancelAnimationFrame: (h) => clearTimeout(h),
});
globalThis.window.matchMedia = () => ({ matches: false });
globalThis.window.devicePixelRatio = 1;

const b = await build({
  stdin: {
    contents: `
      export { buildSite, BUDGET_MS } from './src/lib/gemini';
      export { renderDocument } from './src/lib/render';
      export { snapshot } from './src/lib/blueprint';
      export { Swarm } from './src/lib/swarm';
      export { planAnimation } from './src/lib/timing';
      export { DEMO_SPEC } from './scripts/fixtures/sample-spec';
    `,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
});
const timeline_mjs = scratch('timeline.mjs');
writeFileSync(timeline_mjs.path, b.outputFiles[0].text);
const { buildSite, BUDGET_MS, renderDocument, Swarm, DEMO_SPEC, planAnimation } =
  await import(timeline_mjs.url);

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log(`budget ${BUDGET_MS / 1000}s\n`);
console.log('  model   visible   speed   drawing   verdict');

for (const latency of [2000, 8000, 20000, 35000, 50000]) {
  /* The real API streams, so silence for `latency` is not what a slow build
     looks like — it looks like a steady trickle of text. The wait is split
     across frames so this stays a faithful slow model rather than a dead
     socket, which the idle watchdog is entitled to kill. */
  globalThis.fetch = async () => {
    const json = JSON.stringify(DEMO_SPEC);
    const frames = 4;
    const per = Math.max(1, Math.floor(json.length / frames));
    let i = 0;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream' },
      body: {
        getReader: () => ({
          read: async () => {
            if (i === 0) await new Promise((r) => setTimeout(r, latency / frames));
            else await new Promise((r) => setTimeout(r, Math.min(7000, latency / frames)));
            if (i >= frames) return { done: true, value: undefined };
            const piece = json.slice(i * per, (i + 1) * per);
            i++;
            return {
              done: false,
              value: new TextEncoder().encode(
                `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: piece }] } }] })}\n\n`
              ),
            };
          },
        }),
      },
      json: async () => ({}),
    };
  };

  const t0 = Date.now();
  const deadline = t0 + BUDGET_MS;
  const { spec } = await buildSite('k', 'store', {}, { deadline });
  const tModel = Date.now() - t0;

  const html = renderDocument(spec);
  const frame = new JSDOM(html);

  /* the real measured page; jsdom cannot lay one out */
  const bp = { width: 1440, height: 6000, background: '#fff', ink: '#111', boxes: [], lines: [], texts: [], steps: [] };
  for (let i = 0; i < 117; i++)
    bp.boxes.push({ x: 80, y: 60 + i * 50, w: 300, h: 44, role: 'surface', radius: 4, border: 1, borderColor: '#ddd', fill: '#eee' });
  for (let i = 0; i < 61; i++)
    bp.texts.push({ x: 100, y: i * 40, w: 260, h: 16, text: 'A line of real copy here', size: 16, weight: 400, font: 'sans-serif', mono: false, color: '#111', align: 'left' });
  bp.steps = [
    ...bp.boxes.map((x, i) => ({ kind: 'box', index: i, from: { x: 0, y: 0 }, to: { x: x.x, y: x.y }, weight: 3 })),
    ...bp.texts.map((x, i) => ({ kind: 'text', index: i, from: { x: 0, y: 0 }, to: { x: x.x, y: x.y }, weight: 1.2 })),
  ];
  ok(`${latency}ms: the rendered page is not empty`, frame.window.document.body.innerHTML.length > 1000);

  const ctx = new Proxy({ measureText: (t) => ({ width: String(t).length * 8 }) },
    { get: (x, k) => (k in x ? x[k] : () => undefined), set: () => true });
  const canvas = { parentElement: { getBoundingClientRect: () => ({ width: 1400, height: 860 }) }, getContext: () => ctx, style: {} };

  const swarm = new Swarm(canvas, bp);
  // the SAME policy the screen uses — imported, not restated
  const plan = planAnimation(swarm.duration, t0, deadline);
  const speed = plan.speed;
  const cap = plan.capMs;

  /* drive the animation against a fake frame clock, exactly as the page does */
  let simNow = 0;
  let done = null;
  const realPerf = globalThis.performance;
  globalThis.performance = { now: () => simNow };
  globalThis.requestAnimationFrame = () => 0; // play() must not start a real loop
  swarm.play({ speed, hardCapMs: cap, onDone: () => (done = simNow) });
  for (let i = 0; i < 40000 && done === null; i++) { simNow += 16; swarm.tick(simNow); }
  globalThis.performance = realPerf;
  globalThis.requestAnimationFrame = nodeRAF;

  const visible = (tModel + simNow) / 1000;
  const verdict = visible <= BUDGET_MS / 1000 ? 'ok' : 'OVER';
  console.log(`  ${String(latency / 1000).padStart(5)}s   ${visible.toFixed(1).padStart(6)}s   ${speed.toFixed(1)}x   ${(simNow / 1000).toFixed(1).padStart(6)}s   ${verdict}`);

  ok(`${latency}ms: finishes inside the budget`, visible <= BUDGET_MS / 1000, `${visible.toFixed(1)}s`);
  ok(`${latency}ms: the animation actually completed`, done !== null, 'never fired onDone');
  ok(`${latency}ms: the page is complete, not half drawn`, swarm.complete);

  /* "it builds a little bit too fast": a drawing compressed into a blur is a
     defect, not a speed win. At the 3x ceiling the gestures stay watchable. */
  ok(`${latency}ms: the drawing is not compressed into a blur`, speed <= 3.001,
    `${speed.toFixed(2)}x — the ceiling is 3x`);
  ok(`${latency}ms: the drawing gets enough time to be watched`,
    simNow >= 4000, `only ${(simNow / 1000).toFixed(1)}s of drawing`);
}

console.log(fail === 0 ? '\nTIMELINE OK' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
