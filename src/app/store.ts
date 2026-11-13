/* ============================================================================
   App state. One small store, one funnel.
   ========================================================================== */

import { create } from 'zustand';
import type { SiteKind, ThemeId, SectionType, SiteSpec } from '../lib/spec';
import type { AnswerMap } from '../lib/gemini';
import type { Blueprint } from '../lib/blueprint';

export type Step =
  | 'key'
  | 'projects'
  | 'kind'
  | 'brief'
  | 'sections'
  | 'theme'
  | 'build'
  | 'result';

export const STEP_ORDER: Step[] = [
  'key',
  'projects',
  'kind',
  'brief',
  'sections',
  'theme',
  'build',
  'result',
];

export const STEP_LABEL: Record<Step, string> = {
  key: 'Connect',
  projects: 'Sites',
  kind: 'Kind',
  brief: 'Brief',
  sections: 'Sections',
  theme: 'Theme',
  build: 'Build',
  result: 'Site',
};

type S = {
  step: Step;
  hasKey: boolean;

  kind: SiteKind | null;
  answers: AnswerMap;
  chosenSections: SectionType[];

  themeMode: 'pick' | 'auto';
  theme: ThemeId | null;
  accent: string | null;

  spec: SiteSpec | null;
  blueprint: Blueprint | null;

  /** the saved project being edited, if any */
  projectId: string | null;
  /** true once this spec has been written to IndexedDB at least once */
  saved: boolean;

  error: string | null;
  /** the browser will not give us IndexedDB: work, but do not promise saving */
  storageBlocked: boolean;
  busy: boolean;
  /** set when a build is abandoned by a deadline; the build screen renders it
      from the store so a dead component cannot swallow the message */
  buildError: string | null;
  pdf: { name: string; pages: number; chars: number; text: string } | null;
  /** increments each time a build is requested; keys the build effect */
  runId: number;

  go: (s: Step) => void;
  next: () => void;
  back: () => void;
  patch: (p: Partial<S>) => void;
  setAnswer: (id: string, v: string | string[] | boolean) => void;
  reset: () => void;
  /** begin a brand new site, keeping the key and the current project list */
  startNew: () => void;
};

const initial = {
  step: 'key' as Step,
  hasKey: false,
  kind: null,
  answers: {} as AnswerMap,
  chosenSections: [] as SectionType[],
  themeMode: 'auto' as const,
  theme: null,
  accent: null,
  spec: null,
  blueprint: null,
  projectId: null,
  saved: false,
  error: null,
  storageBlocked: false,
  busy: false,
  buildError: null,
  pdf: null,
  runId: 0,
};

/* ── the two gates ──────────────────────────────────────────────────────────
   A brief is ready when it has a name and enough words to build from; a spec is
   ready when it has a hero and at least three sections. They live here, next to
   the funnel that enforces them, so a screen cannot drift from the rule. */

export const minBriefWords = 20;

export function briefReady(answers: AnswerMap): boolean {
  const name = String(answers.name ?? '').trim();
  const brief = String(answers.prompt ?? answers.description ?? '').trim();
  return name.length > 0 && brief.length > minBriefWords;
}

/** Record a build failure where the screen cannot lose it. */
export function failBuild(message: string): void {
  useApp.setState({ buildError: message });
}

export function clearBuildError(): void {
  useApp.setState({ buildError: null });
}

export const useApp = create<S>((set, get) => ({
  ...initial,

  go: (step) => set({ step, error: null }),

  next: () => {
    const i = STEP_ORDER.indexOf(get().step);

    /* Brief and sections render `null` without their inputs, which leaves the
       user on a header with an empty main area and no way forward. That happens
       if storage is blocked and a half-finished session is restored, or if a
       keyboard shortcut skips a step. Sending them back to the step that can
       actually collect the missing input is better than a blank page. */
    const st = get();
    if (st.step === 'brief' && !st.kind) return set({ step: 'kind', error: null });
    if (st.step === 'build' && !st.theme) return set({ step: 'theme', error: null });

    set({ step: STEP_ORDER[Math.min(STEP_ORDER.length - 1, i + 1)], error: null });
  },

  back: () => {
    const i = STEP_ORDER.indexOf(get().step);
    set({ step: STEP_ORDER[Math.max(0, i - 1)], error: null });
  },

  patch: (p) => set(p),

  setAnswer: (id, v) => set((s) => ({ answers: { ...s.answers, [id]: v } })),

  reset: () =>
    set({
      ...initial,
      hasKey: get().hasKey,
      step: get().hasKey ? 'projects' : 'key',
      runId: get().runId + 1,
    }),

  startNew: () =>
    set({
      ...initial,
      hasKey: get().hasKey,
      // go straight to choosing a kind; the key is already there
      step: get().hasKey ? 'kind' : 'key',
      runId: get().runId + 1,
    }),
}));
