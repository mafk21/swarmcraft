/* snapshotHtml is the only thing standing between a generated page and the
   animation. It creates an iframe, waits for it, and measures. If that wait has
   no bound, the build hangs; if the frame is not removed, every build leaks one.
   Both are testable in jsdom even though jsdom does no layout. */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import { JSDOM } from 'jsdom';
import assert from 'node:assert/strict';

const out = scratch('bp.bundle.mjs');
await build({
  entryPoints: ['src/lib/blueprint.ts'],
  bundle: true, format: 'esm', platform: 'neutral',
  outfile: out.path, logLevel: 'silent',
});

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.requestAnimationFrame = (cb) => window.setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => window.clearTimeout(id);
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });

const { snapshotHtml } = await import(out.url);

const frames = () => document.querySelectorAll('iframe').length;

/* ── 1. a normal page: resolves, returns a blueprint, leaves no frame ─────── */
const html = `<!doctype html><html><head><style>
  body{margin:0;font:16px/1.5 system-ui;color:#111;background:#fff}
  h1{font-size:40px;margin:40px} p{margin:40px}
</style></head><body><h1>Falcon Coffee</h1><p>Roasted in Dammam.</p></body></html>`;

assert.equal(frames(), 0, 'starts clean');
const bp = await snapshotHtml(html, 1200);
assert.ok(bp, 'must return a blueprint');
assert.ok(Array.isArray(bp.steps), 'blueprint must carry steps');
assert.ok(typeof bp.width === 'number' && bp.width > 0, 'must know its width');
assert.equal(frames(), 0, 'the iframe must be removed, or every build leaks one');

/* ── 2. repeated calls do not accumulate frames ──────────────────────────── */
for (let i = 0; i < 3; i++) await snapshotHtml(html, 1200);
assert.equal(frames(), 0, 'three more builds must leave nothing behind');

/* ── 3. a page whose scripts never fire still resolves by its deadline ─────
   The frame is given 1500ms to load and the build deadline is allowed to cut
   that short. With a deadline 200ms out, it must return in well under a second
   rather than sitting on the full 1500. */
const before = Date.now();
const quick = await snapshotHtml(html, 1200, Date.now() + 200);
const elapsed = Date.now() - before;
assert.ok(quick, 'a tight deadline must still produce a blueprint');
assert.ok(elapsed < 1400, `deadline must be honoured, took ${elapsed}ms`);
assert.equal(frames(), 0, 'no frame left after a deadline cut');

/* ── 4. broken content does not throw ───────────────────────────────────── */
const empty = await snapshotHtml('', 1200);
assert.ok(empty && Array.isArray(empty.steps), 'an empty document must still yield a blueprint');
assert.equal(frames(), 0);

/* ── 5. the blueprint is well-formed ────────────────────────────────────── */
assert.ok(bp.width > 0 && bp.height >= 0, 'dimensions must be numbers');
assert.ok(bp.steps.length >= 0);
for (const s of bp.steps.slice(0, 50)) {
  assert.ok(['box', 'text', 'line'].includes(s.kind), `unexpected step kind ${s.kind}`);
  if (s.kind === 'box') {
    assert.ok(['surface', 'card', 'rule', 'image', 'button', 'input', 'nav'].includes(s.role), `bad role ${s.role}`);
    assert.ok([s.x, s.y, s.w, s.h].every((n) => Number.isFinite(n)), 'box geometry must be finite numbers');
  }
  if (s.kind === 'text') {
    assert.ok(typeof s.text === 'string', 'text node must carry its string');
    assert.ok(Number.isFinite(s.size), 'text must carry a finite font size');
  }
  if (s.kind === 'line') {
    assert.ok([s.x1, s.y1, s.x2, s.y2].every((n) => Number.isFinite(n)), 'line geometry must be finite');
  }
}

/* Be precise about the limit: jsdom has no layout engine, so `snapshot()` finds
   no geometry and `steps` is empty here. What this test proves is the
   orchestration — that the iframe is created, awaited, cut short by the build
   deadline, and always removed. The measurement itself (rects, line grouping,
   the O(lines) probe) is covered by snapshot-test.mjs against hand-built rects,
   and the real end-to-end geometry needs a browser. */
assert.ok(bp.steps.length === 0, 'jsdom has no layout, so this is expected — see note below');
console.log(
  `SNAPSHOTHTML OK — iframe is awaited, cut short by the deadline (${elapsed}ms), and always removed. ` +
    'Geometry itself is not verifiable without a layout engine.'
);
