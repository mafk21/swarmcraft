/* ============================================================================
   Undo, and the three ways a history goes wrong.

   Each of these is a bug that ships and is then believed to be a feature:

     · coalescing that never expires — type a headline, change a price, come
       back to the headline, and the whole session is one undo step;
     · a redo branch that survives a new edit — undo, type something, press
       redo, and the app restores a page that never existed;
     · a stack with no floor — undo at the bottom either throws or silently
       replaces the spec with undefined.

   history.ts is deliberately React-free so these can be asserted as arithmetic.
   ========================================================================== */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';

const out = scratch('history.bundle.mjs');
await build({
  entryPoints: ['src/lib/history.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: out.path,
  logLevel: 'silent',
});

const { historyOf, commit, undo, redo, canUndo, canRedo, MAX_DEPTH, COALESCE_MS, reset } = await import(out.url);

let fail = 0;
const ok = (n, c, d = '') => {
  if (!c) {
    fail++;
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  }
};

/* A spec is a tree of plain values; the tests use a tiny stand-in. */
const v = (n) => ({ n });

/* ── the floor ───────────────────────────────────────────────────────────── */

{
  const h0 = historyOf(v(1), 0);
  ok('nothing to undo at the start', !canUndo(h0) && !canRedo(h0));

  /* Undo at the bottom must be a no-op, not undefined-present. The state has to
     be identical AND the identity preserved, so a caller can skip a re-render. */
  /* Guarded: a broken undo returns undefined here, and an assertion that throws
     instead of failing reports a crash rather than the bug it was written for. */
  const h1 = undo(h0, 10);
  ok(
    'undo at the bottom does nothing',
    h1?.present?.n === 1 && h1 === h0,
    JSON.stringify(h1?.present)
  );
  /* and the same when there IS a history but the stack is exhausted */
  let drained = commit(historyOf(v(7), 0), v(8), 'a', 100);
  drained = undo(drained, 200);
  const again = undo(drained, 300);
  ok(
    'undo past the floor keeps the state',
    again?.present?.n === 7 && again === drained,
    JSON.stringify(again?.present)
  );

  /* Redo at the top must be a no-op too. */
  const h2 = redo(h0, 10);
  ok('redo at the top does nothing', h2.present.n === 1 && h2 === h0);
}

/* ── undo and redo round-trip ────────────────────────────────────────────── */

{
  let h = historyOf(v(1), 0);
  h = commit(h, v(2), 'headline', 100);
  ok('an edit moves the present', h.present.n === 2);
  ok('an edit gives you something to undo', canUndo(h));
  ok('an edit clears the future', h.future.length === 0);

  h = undo(h, 200);
  ok('undo goes back', h.present.n === 1, String(h.present.n));
  ok('undo offers redo', canRedo(h));
  ok('undo at the start again has no undo', !canUndo(h));

  h = redo(h, 300);
  ok('redo goes forward', h.present.n === 2, String(h.present.n));
  ok('redo leaves nothing to redo', !canRedo(h));
}

/* ── coalescing: one sentence, one step ─────────────────────────────────── */

{
  let h = historyOf(v(''), 0);
  let t = 1000;
  /* ten keystrokes in the same field, 80ms apart: one undo step */
  for (let i = 1; i <= 10; i++) {
    h = commit(h, v('abc'.repeat(i)), 'headline', t);
    t += 80;
  }
  ok('a typed sentence is one step', h.past.length === 1, `${h.past.length} steps`);
  h = undo(h, t + 10);
  ok('undoing a sentence removes all of it', h.present.n === '', JSON.stringify(h.present));
}

{
  /* same field, but a long pause between: two steps */
  let h = historyOf(v('a'), 0);
  h = commit(h, v('ab'), 'headline', 1000);
  h = commit(h, v('abc'), 'headline', 1000 + COALESCE_MS + 1);
  ok('a pause starts a new step', h.past.length === 2, `${h.past.length} steps`);
}

{
  /* different fields, immediately: two steps, even inside the window */
  let h = historyOf(v('a'), 0);
  h = commit(h, v('ab'), 'headline', 1000);
  h = commit(h, v('ab2'), 'sub', 1010);
  ok('switching fields starts a new step', h.past.length === 2, `${h.past.length} steps`);
}

{
  /* coming back to the first field inside the window must NOT merge with the
     edit from before the field switch — the key changed in between */
  let h = historyOf(v('a'), 0);
  h = commit(h, v('ab'), 'headline', 1000);
  h = commit(h, v('abX'), 'sub', 1010);
  h = commit(h, v('abc'), 'headline', 1020);
  ok('a field reopened inside the window is still its own step', h.past.length === 3, `${h.past.length} steps`);
}

/* ── a new edit kills the redo branch ───────────────────────────────────── */

{
  let h = historyOf(v(1), 0);
  h = commit(h, v(2), 'a', 100);
  h = undo(h, 200);
  ok('there is a branch to redo', canRedo(h));
  h = commit(h, v(3), 'b', 300);
  ok('a new edit drops the old future', !canRedo(h), `${h.future.length} future states`);
  /* and the state it dropped is genuinely unreachable */
  const back = undo(h, 400);
  ok('undo after a new edit returns the pre-edit state', back.present.n === 1, String(back.present.n));
}

/* ── the stack is bounded ───────────────────────────────────────────────── */

{
  let h = historyOf(v(0), 0);
  for (let i = 1; i <= MAX_DEPTH * 3; i++) h = commit(h, v(i), `f${i}`, i * 1000);
  ok('the past is bounded', h.past.length <= MAX_DEPTH, `${h.past.length}`);
  /* and undoing all the way still lands on a real state, not undefined */
  let steps = 0;
  while (canUndo(h)) {
    h = undo(h, 1_000_000 + steps);
    steps++;
  }
  ok('undoing to the floor is safe', h.present.n !== undefined && Number.isFinite(h.present.n), JSON.stringify(h.present));
  ok('the floor is a real state from the history', steps === MAX_DEPTH, `${steps} steps`);
}

/* ── identity: an edit that changes nothing is not a step ───────────────── */

{
  let h = historyOf(v(1), 0);
  /* editSectionField returns the SAME object when a field is set to its current
     value; that must not become an undo step the user has to press twice. */
  h = commit(h, h.present, 'headline', 100);
  ok('a no-op edit records nothing', h.past.length === 0);
}

/* ── a fresh spec from the outside clears the history ───────────────────── */

{
  let h = historyOf(v(1), 0);
  h = commit(h, v(2), 'a', 100);
  h = reset(h, v(99), 200);
  ok('opening another site clears undo', !canUndo(h) && !canRedo(h));
  ok('opening another site shows that site', h.present.n === 99);
}

/* ── undo then edit then undo again is stable ───────────────────────────── */

{
  let h = historyOf(v(1), 0);
  h = commit(h, v(2), 'a', 100);
  h = commit(h, v(3), 'b', 200);
  h = undo(h, 300);          // back to 2
  h = undo(h, 400);          // back to 1
  ok('two undos reach the original', h.present.n === 1, String(h.present.n));
  h = redo(h, 500);
  h = redo(h, 600);
  ok('two redos return to the edit', h.present.n === 3, String(h.present.n));
  ok('the stacks agree after a round trip', !canRedo(h) && h.past.length === 2, `${h.past.length}/${h.future.length}`);
}

console.log(fail ? `\nHISTORY ${fail} FAILED\n` : '\nHISTORY OK — bounded, coalesced, redoable, and never at undefined\n');
process.exit(fail ? 1 : 0);
