/* ============================================================================
   The deadline that does not depend on the thing it is measuring.

   Twice now the build screen counted past its own limit — 518 seconds, then
   3345 — while every timer attached to the build effect was dead. That is the
   signature of the bug: the enforcement lived INSIDE the work. An effect that
   was cancelled, unmounted or never re-run takes its watchdog with it, and then
   nothing is left to say the build has gone on too long.

   So the rule moves out here, to a module-level timer owned by nobody in
   particular. It cannot be unmounted, it cannot be cancelled by a cleanup, and
   it is not gated on any state. Any screen that starts work registers a
   deadline; if the work has not reported back by then, the deadline fails
   loudly and the app says so.

   This is deliberately not clever. It is the thing that must be true when
   everything else is wrong.
   ========================================================================== */

export type DeadlineStop = {
  /** what was running, for the message */
  label: string;
  /** how long it was given, in ms */
  allowedMs: number;
  /** how long it actually took, in ms */
  elapsedMs: number;
};

type ArmOptions = {
  label: string;
  budgetMs: number;
  /** grace on top of the budget before it is treated as wedged */
  graceMs?: number;
  onStop: (stop: DeadlineStop) => void;
};

type Handle = { stopped: boolean };

let current: Handle | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Start watching one piece of work.
 *
 * Only one deadline is ever live — a build is the only thing in this app long
 * enough to need one — so arming again replaces the previous watch rather than
 * stacking timers that can fire against stale state.
 */
export function armDeadline({ label, budgetMs, graceMs = 5_000, onStop }: ArmOptions): Handle {
  // a new build supersedes the last one
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (current) current.stopped = true;

  const handle: Handle = { stopped: false };
  current = handle;

  const startedAt = Date.now();
  const allowed = budgetMs + graceMs;

  timer = setTimeout(() => {
    if (handle.stopped) return;
    handle.stopped = true;
    current = null;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    onStop({ label, allowedMs: budgetMs, elapsedMs: Date.now() - startedAt });
  }, allowed);

  return handle;
}

/** The work finished — success or failure — so stop watching. */
export function clearDeadline(handle: Handle | null): void {
  if (!handle) return;
  handle.stopped = true;
  if (current === handle) current = null;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}

/** True when the deadline above has already fired for this run. */
export function deadlineTripped(handle: Handle | null): boolean {
  return handle ? handle.stopped : false;
}

/** Test seam: forget any armed deadline without firing it. */
export function resetDeadlineForTest(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  if (current) current.stopped = true;
  current = null;
}
