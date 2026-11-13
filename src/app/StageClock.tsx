/* ============================================================================
   A clock that tells the truth.

   Three numbers, none of them invented:
     elapsed  — measured
     typical  — an estimate, labelled as one, from previous runs
     ceiling  — the hard timeout, after which it WILL fail and say so

   The bar fills against the ceiling and changes colour as it approaches, so
   "nearly done" and "this has gone wrong" look different.
   ========================================================================== */

import { useEffect, useState } from 'react';

import { BUDGET_MS } from '../lib/gemini';

/**
 * One budget for the whole build, shared by every stage.
 *
 * It used to be a ceiling per stage: 40 for writing, 40 for choosing a theme,
 * 40 for the rewrite. Each looked reasonable on its own and together they
 * allowed two minutes of silence, which is exactly what the user got. The
 * deadline now lives in gemini.ts and the stages draw from what is left, so
 * there is a single honest number to show.
 */
const BUDGET_S = Math.round(BUDGET_MS / 1000);

/** When each stage is normally done, counted from the start of the build. */
const TYPICAL: Record<string, number> = {
  'Writing the page': 14,
  'Choosing type and colour': 1,
  'Measuring the page': 3,
};

const STAGE_LIMIT: Record<string, number> = {
  'Writing the page': 25,
  'Choosing type and colour': 5,
  'Measuring the page': 8,
};

/** How far past the whole-build budget the clock waits before it pulls the plug. */
const OVERRUN_GRACE_S = 5;

export function StageClock({
  label,
  running,
  onCancel,
  onOverrun,
}: {
  label: string;
  running: boolean;
  onCancel?: () => void;
  /** fired ONCE when this stage runs past the entire build budget */
  onOverrun?: (o: { label: string; elapsedMs: number; allowedMs: number }) => void;
}) {
  const [secs, setSecs] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  // a new stage resets the clock
  useEffect(() => {
    setStartedAt(Date.now());
    setSecs(0);
  }, [label]);

  /* This interval is the one timer in the build screen we have PROVED is alive
     when everything else is dead: the user's copy counted to 3345 seconds on it
     while every timer attached to the build effect had been cancelled. So the
     hard stop lives here too.

     When a stage overruns the whole build budget (not just its own estimate),
     the clock fires once and tells the screen to stop. That happens from this
     interval rather than from the build's own effect, because the effect is the
     thing that keeps going wrong. */
  useEffect(() => {
    if (!running) return;
    let fired = false;
    const id = window.setInterval(() => {
      /* Defensive: a timer that can throw is a timer that stops, and this one
         is the last net. If the callback below fails, the clock must keep
         ticking and keep counting, so nothing here is allowed to escape. */
      try {
        const elapsed = (Date.now() - startedAt) / 1000;
        setSecs(elapsed);

        if (!fired && elapsed > BUDGET_S + OVERRUN_GRACE_S) {
          fired = true;
          onOverrun?.({
            label,
            elapsedMs: elapsed * 1000,
            allowedMs: BUDGET_S * 1000,
          });
        }
      } catch {
        /* never let this interval die */
      }
    }, 100);
    return () => window.clearInterval(id);
    // onOverrun is a stable callback from the parent; re-running on it would
    // restart the clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, startedAt, label]);

  const typical = TYPICAL[label] ?? 6;
  // the inner ring times this stage; the bar underneath times the whole build
  const stageLimit = STAGE_LIMIT[label] ?? 25;

  /* A stage limit is a hint, but running past the WHOLE build budget is not a
     hint — it means the build is already over and everything after this is
     dead time. The clock said "past the 25s limit" politely for five minutes
     while the user waited, which is the app lying about its own state. Past
     the budget the bar is pinned full and the wording changes to the truth. */
  const overBudget = secs > BUDGET_S;
  const overdue = secs > stageLimit;
  const late = !overdue && secs > typical * 1.6;
  const pct = overBudget ? 100 : Math.min(100, (secs / stageLimit) * 100);

  const state = overBudget ? 'overdue' : overdue ? 'overdue' : late ? 'late' : 'normal';

  return (
    <div className="clock" data-state={state}>
      <div className="clock-row">
        <span className="clock-elapsed">{secs.toFixed(1)}s</span>
        <span className="clock-meta">
          {overBudget
            ? `past the ${BUDGET_S}s limit for the whole build`
            : overdue
              ? `past the ${stageLimit}s limit for this step`
              : secs < typical
                ? `usually about ${typical}s`
                : `usually ${typical}s — this one is slower`}
        </span>
      </div>

      <div className="clock-bar">
        <i style={{ width: `${pct}%` }} />
        <span className="clock-mark" style={{ left: `${Math.min(100, (typical / stageLimit) * 100)}%` }} />
      </div>

      <div className="clock-row">
        <span className="clock-meta mono">
          {stageLimit}s for this step · {BUDGET_S}s for the whole build
        </span>
        {onCancel && (
          <button className="clock-cancel" onClick={onCancel}>
            Stop waiting
          </button>
        )}
      </div>
    </div>
  );
}
