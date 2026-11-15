/* ============================================================================
   Undo for the inspector.

   Typing in a field edits the spec on every keystroke. There was no way back:
   one stray paste over the headline and it was gone, and the only recovery was
   to close the tab and lose everything else too. That is the difference between
   a toy and a tool.

   The shape of the problem decides the design:

     · keystrokes are cheap and continuous — 40 of them is one sentence, so they
       must not be 40 undo steps. Commits are coalesced when they belong to the
       same field and arrive close together.
     · the spec is small and immutable — every edit builds a new object — so a
       history of whole specs costs a few hundred kB at worst, with no diffing
       and no possibility of a half-restored state.
     · a redone-away future must not survive a new edit, or the user can undo
       into a state that never existed.

   ── why this is its own module ────────────────────────────────────────────
   So it can be tested without rendering React. The rules above are the kind
   that rot silently: a coalescing window that never expires, a redo stack that
   survives a new edit, an undo that goes nowhere at the bottom of the stack.
   ========================================================================== */

export type History<T> = {
  /** the spec to show and edit */
  present: T;
  /** the stack of states you can go back to, oldest first */
  past: T[];
  /** the stack of states you can go forward to, newest first */
  future: T[];
  /** when the last commit happened, and what field it was for */
  at: number;
  key: string;
};

export const MAX_DEPTH = 40;
/** how long two edits to the same field stay one undo step */
export const COALESCE_MS = 600;

export function historyOf<T>(initial: T, now = 0): History<T> {
  return { present: initial, past: [], future: [], at: now, key: '' };
}

/**
 * Record an edit.
 *
 * `key` identifies the field being edited: two edits with the same key inside
 * the coalescing window become one step, so a typed sentence undoes as one.
 * Different fields always start a new step — jumping the caret from the
 * headline to the subhead should not merge the two.
 */
export function commit<T>(h: History<T>, next: T, key: string, now: number): History<T> {
  if (Object.is(next, h.present)) return h;

  const continues = key === h.key && now - h.at < COALESCE_MS;
  const past = continues ? h.past : [...h.past, h.present].slice(-MAX_DEPTH);

  return {
    present: next,
    past,
    /* a new edit kills the redo branch: the old future is no longer reachable
       from here, and offering it would restore a state that never existed */
    future: [],
    at: now,
    key,
  };
}

/** Go back one step. Returns the same history when there is nothing to undo. */
export function undo<T>(h: History<T>, now: number): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return {
    present: previous,
    past: h.past.slice(0, -1),
    future: [h.present, ...h.future].slice(0, MAX_DEPTH),
    at: now,
    /* the key is cleared so the first edit after an undo starts a new step
       instead of coalescing into the state that was just undone */
    key: '',
  };
}

/** Go forward one step, back to where undo took you from. */
export function redo<T>(h: History<T>, now: number): History<T> {
  if (h.future.length === 0) return h;
  const next = h.future[0];
  return {
    present: next,
    past: [...h.past, h.present].slice(-MAX_DEPTH),
    future: h.future.slice(1),
    at: now,
    key: '',
  };
}

export const canUndo = <T>(h: History<T>) => h.past.length > 0;
export const canRedo = <T>(h: History<T>) => h.future.length > 0;

/**
 * Start a fresh history from a spec that arrived from somewhere else — a build,
 * a project opened from the list, a theme change. Otherwise undo would walk
 * backwards into a different site.
 */
export function reset<T>(h: History<T>, next: T, now: number): History<T> {
  if (Object.is(next, h.present) && h.past.length === 0 && h.future.length === 0) return h;
  return { present: next, past: [], future: [], at: now, key: '' };
}
