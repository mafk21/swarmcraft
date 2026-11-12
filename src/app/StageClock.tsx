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

const TYPICAL: Record<string, number> = {
  'Writing the page': 7,
  'Clio, checking consistency': 5,
  'Thalia, fixing the voice': 5,
  'Choosing type and colour': 3,
  'Measuring the page': 2,
};

const CEILING: Record<string, number> = {
  'Writing the page': 45,
  'Clio, checking consistency': 45,
  'Thalia, fixing the voice': 45,
  'Choosing type and colour': 45,
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
  const ceiling = CEILING[label] ?? 45;

  const overdue = secs > ceiling;
  const late = !overdue && secs > typical * 1.6;
  const pct = Math.min(100, (secs / ceiling) * 100);

  const state = overdue ? 'overdue' : late ? 'late' : 'normal';

  return (
    <div className="clock" data-state={state}>
      <div className="clock-row">
        <span className="clock-elapsed">{secs.toFixed(1)}s</span>
        <span className="clock-meta">
          {overdue
            ? `past the ${ceiling}s limit — it will fail now`
            : secs < typical
              ? `usually about ${typical}s`
              : `usually ${typical}s — this one is slower`}
        </span>
      </div>

      <div className="clock-bar">
        <i style={{ width: `${pct}%` }} />
        <span className="clock-mark" style={{ left: `${(typical / ceiling) * 100}%` }} />
      </div>

      <div className="clock-row">
        <span className="clock-meta mono">
          {ceiling}s hard limit
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
