/* ============================================================================
   App state. One small store, one funnel.
   ========================================================================== */

import { create } from 'zustand';
import type { SiteKind, ThemeId, SectionType, SiteSpec } from '../lib/spec';
import type { AnswerMap } from '../lib/gemini';
import type { Blueprint } from '../lib/blueprint';

export type Step =
  | 'key'
  | 'kind'
  | 'brief'
  | 'sections'
  | 'theme'
  | 'build'
  | 'result';

export const STEP_ORDER: Step[] = ['key', 'kind', 'brief', 'sections', 'theme', 'build', 'result'];

export const STEP_LABEL: Record<Step, string> = {
  key: 'Connect',
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

  error: string | null;
  busy: boolean;
  pdf: { name: string; pages: number; chars: number; text: string } | null;
  demo: boolean;

  go: (s: Step) => void;
  next: () => void;
  back: () => void;
  patch: (p: Partial<S>) => void;
  setAnswer: (id: string, v: string | string[] | boolean) => void;
  reset: () => void;
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
  error: null,
  busy: false,
  pdf: null,
  demo: false,
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

  setAnswer: (id, v) =>
    set((s) => ({ answers: { ...s.answers, [id]: v } })),

  reset: () => set({ ...initial }),
}));
