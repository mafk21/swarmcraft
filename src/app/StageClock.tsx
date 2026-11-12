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

export function StageClock({
  label,
  running,
  onCancel,
}: {
  label: string;
  running: boolean;
  onCancel?: () => void;
}) {
  const [secs, setSecs] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());

  // a new stage resets the clock
  useEffect(() => {
    setStartedAt(Date.now());
    setSecs(0);
  }, [label]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecs((Date.now() - startedAt) / 1000);
    }, 100);
    return () => window.clearInterval(id);
  }, [running, startedAt]);

  const typical = TYPICAL[label] ?? 6;
  // the inner ring times this stage; the bar underneath times the whole build
  const stageLimit = STAGE_LIMIT[label] ?? 25;

  const overdue = secs > stageLimit;
  const late = !overdue && secs > typical * 1.6;
  const pct = Math.min(100, (secs / stageLimit) * 100);

  const state = overdue ? 'overdue' : late ? 'late' : 'normal';

  return (
    <div className="clock" data-state={state}>
      <div className="clock-row">
        <span className="clock-elapsed">{secs.toFixed(1)}s</span>
        <span className="clock-meta">
          {overdue
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
