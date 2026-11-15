/* ============================================================================
   How long the build is allowed to take, and how the animation fits inside it.

   This lives in its own module so the screen and the tests share one policy.
   When the rule lived inline in the component, the test could only re-state it
   — and a test that restates the code proves nothing about the code.
   ========================================================================== */

/** Reveal and cross-fade after the last cursor stops. */
export const TAIL_MS = 1200;

/**
 * When a build should be finished, if nothing has gone wrong.
 *
 * The brief was 60–90 seconds and the hard limit is 80, but aiming at the limit
 * is wrong: a page that arrives in two seconds should not make anyone watch a
 * 30-second animation to reach a number. Aiming at ~22s means a typical build
 * lands there, and a slow one is compressed to fit rather than the fast one
 * being padded to match.
 */
export const COMFORTABLE_TOTAL_MS = 30_000;

/**
 * Never slower than designed, never a blur — and now genuinely the second one.
 *
 * Three, not four. At 4x a 27s drawing is compressed into seven seconds and
 * nothing in it can be followed; the user's own words were that it "builds a
 * little bit too fast". Three keeps the same page inside the 80s budget with
 * room to spare (27s / 3 = 9s of drawing plus the model's time) while leaving
 * every gesture long enough to see.
 */
export const MAX_SPEED = 3;

export type AnimationPlan = {
  /** playback multiplier handed to Swarm */
  speed: number;
  /** hard stop, in ms of real time, for the drawing itself */
  capMs: number;
  /** how long the drawing is expected to take, in ms of real time */
  expectedMs: number;
};

/**
 * Fit the animation into whatever is left of the build budget.
 *
 * `swarmMs` is how long the animation would take at 1x. The result is always a
 * promise the clock can keep: the drawing either finishes inside `capMs` or the
 * cap paints the finished page and hands over.
 */
export function planAnimation(
  swarmMs: number,
  startedAt: number,
  deadline: number,
  now = Date.now()
): AnimationPlan {
  const spent = now - startedAt;
  const left = Math.max(0, deadline - now);

  /* A fast build should not be padded out to half a minute: aim for a
     comfortable total, but never ask for a longer draw than the budget allows. */
  const want = Math.max(1500, COMFORTABLE_TOTAL_MS - spent);
  const room = Math.max(400, Math.min(want, left - TAIL_MS));

  const speed = Math.max(1, Math.min(MAX_SPEED, swarmMs / room));
  return {
    speed,
    capMs: Math.max(400, left - TAIL_MS),
    expectedMs: swarmMs / speed,
  };
}

/* ── the progress rail ───────────────────────────────────────────────────────
   Two real scales, one bar.

   The rail used to show `progress`, which is 0 for the whole time the model is
   writing — most of most builds — and then jumps. The alternative everyone
   reaches for is a bar that fills on a timer regardless of what is happening,
   which is a spinner wearing a progress bar's clothes. These two functions are
   the honest version, and they live here so the screen and rail-test.mjs are
   provably talking about the same arithmetic.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * How much of the build budget has been spent waiting for the model.
 *
 * The request either answers or it doesn't; there is no percentage of a network
 * call. This is the one true thing available while it runs: the clock.
 */
export function writeShare(elapsedMs: number, budgetMs: number): number {
  if (!Number.isFinite(budgetMs) || budgetMs <= 0) return 0;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(1, elapsedMs / budgetMs);
}

/**
 * How much of the page has been drawn, measured by area.
 *
 * The swarm works down the page, so "the sections at or above the one being
 * worked on" is a real answer rather than a guess. Shares come from the
 * blueprint, so a tall hero moves the bar more than a thin footer — which is
 * what a person watching would expect.
 */
export function drawShare(
  sections: { index: number; share: number }[],
  workingOn: number | null,
  progress: number
): number {
  if (!sections.length) return 0;
  const total = sections.reduce((n, s) => n + Math.max(0, s.share), 0);
  if (!(total > 0)) return 0;

  /* Finished is finished: rounding in the measured shares must not leave the
     rail a pixel short on a completed build. */
  if (progress >= 0.999) return 1;

  /* No cursor is in a section yet — before the work starts. Claim nothing. */
  if (workingOn === null) return progress > 0.98 ? 1 : 0;

  const done = sections
    .filter((s) => s.index <= workingOn)
    .reduce((n, s) => n + Math.max(0, s.share), 0);
  return Math.min(1, done / total);
}
