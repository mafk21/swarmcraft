/* ============================================================================
   The deadline that does not depend on the thing it is measuring.

   The build screen counted past its own limit three times — 518, 3345, then
   ~5000 seconds — while every timer attached to the build effect was dead.
   The signature is always the same: the enforcement lives INSIDE the work, so
   an effect that was cancelled, unmounted or never re-run takes its watchdog
   with it, and nothing is left to say the build has gone on too long.

   So the rule lives out here: a module-level timer that no component cleanup
   can clear and no unmount can take away.

   ── one handle, one timer ──────────────────────────────────────────────────
   The first version kept a single module-global timer and let `armDeadline`
   replace it. That is a trap I walked into myself: React StrictMode mounts,
   tears down and mounts again, so the second mount armed the deadline and the
   first mount's teardown immediately cleared it — disarming the very net that
   existed to catch this. Each handle now owns its timer, and clearing a handle
   touches nothing else.
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

export type Handle = {
  stopped: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

/**
 * Start watching one piece of work.
 *
 * The timer belongs to the handle. Nothing outside can clear it by accident,
 * and arming a second deadline never touches the first.
 */
export function armDeadline({ label, budgetMs, graceMs = 5_000, onStop }: ArmOptions): Handle {
  const handle: Handle = { stopped: false, timer: null };
  const startedAt = Date.now();

  handle.timer = setTimeout(() => {
    if (handle.stopped) return;
    handle.stopped = true;
    handle.timer = null;
    onStop({ label, allowedMs: budgetMs, elapsedMs: Date.now() - startedAt });
  }, budgetMs + graceMs);

  return handle;
}

/** The work finished — success or failure — so stop watching. Idempotent. */
export function clearDeadline(handle: Handle | null): void {
  if (!handle) return;
  handle.stopped = true;
  if (handle.timer !== null) {
    clearTimeout(handle.timer);
    handle.timer = null;
  }
}

/** True when this deadline has already fired. */
export function deadlineTripped(handle: Handle | null): boolean {
  return handle ? handle.stopped : false;
}
