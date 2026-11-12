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
import { JSDOM } from 'jsdom';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
      export { DEMO_SPEC } from './src/lib/samples';
    `,
    resolveDir: process.cwd(), loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'error',
});
writeFileSync('.tmp/timeline.mjs', b.outputFiles[0].text);
const { buildSite, BUDGET_MS, renderDocument, Swarm, DEMO_SPEC, planAnimation } =
  await import(pathToFileURL(resolve('.tmp/timeline.mjs')).href);

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
};

console.log(`budget ${BUDGET_MS / 1000}s\n`);
console.log('  model   visible   speed   drawing   verdict');

for (const latency of [2000, 8000, 20000, 35000, 50000]) {
  globalThis.fetch = async () => {
    await new Promise((r) => setTimeout(r, latency));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(DEMO_SPEC) }] } }] }) };
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
}

console.log(fail === 0 ? '\nTIMELINE OK' : `\n${fail} FAILED`);
process.exit(fail ? 1 : 0);
