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
  busy: boolean;
  pdf: { name: string; pages: number; chars: number; text: string } | null;
  demo: boolean;
  /** run Clio + Thalia as well as the draft (three calls instead of one) */
  reviewPasses: boolean;
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
  busy: false,
  pdf: null,
  demo: false,
  reviewPasses: true,
  runId: 0,
};

export const useApp = create<S>((set, get) => ({
  ...initial,

  go: (step) => set({ step, error: null }),

  next: () => {
    const i = STEP_ORDER.indexOf(get().step);
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
