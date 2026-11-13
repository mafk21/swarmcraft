/* Mounts the real App and the real screens into a jsdom container, with the
   real store. Nothing here is a stand-in for the app's own code. */
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useApp } from '../../src/app/store';
import App from '../../src/app/App';

export { useApp };
export { act };

export const STEPS = ['key', 'projects', 'kind', 'brief', 'sections', 'theme', 'build', 'result'] as const;

export function mount(ops: { step?: string; kind?: string; answers?: Record<string, unknown>; hasKey?: boolean }) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  act(() => {
    useApp.setState({
      hasKey: true,
      step: (ops.step ?? 'kind') as never,
      kind: (ops.kind ?? null) as never,
      answers: (ops.answers ?? {}) as never,
    });
  });
  act(() => {
    root.render(<App />);
  });
  return el;
}

export function unmount(el: HTMLElement) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyEl = el as any;
  if (anyEl.__root) act(() => anyEl.__root.unmount());
  el.remove();
}

export function goTo(step: string) {
  act(() => {
    useApp.getState().go(step as never);
  });
}

export function chooseKind(kind: string) {
  act(() => {
    useApp.setState({ kind: kind as never });
  });
}

/* Mount the brief screen with NO kind, then set one. This is the exact render
   sequence that breaks if any hook sits below `if (!kind) return null`: the
   first render calls one hook fewer than the second. */
export function briefThenKind() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  act(() => {
    useApp.setState({ hasKey: true, step: 'brief' as never, kind: null as never, answers: {} as never });
  });
  act(() => {
    root.render(<App />);
  });
  return { el, root };
}

export function atStep(step: string) {
  const base = {
    step,
    hasKey: true,
    kind: step === 'kind' ? null : 'store',
    answers: { name: 'Falcon Coffee', prompt: 'We roast single-origin beans in Dammam and ship them across the Kingdom within two days.' },
    theme: step === 'build' || step === 'result' ? { mode: 'light', theme: 'minimal', accent: 'clay' } : null,
    chosenSections: ['hero', 'features', 'contact'],
  };
  return base as never;
}

export const CASES = [
  {
    name: 'kind',
    setup: { step: 'kind', kind: null },
    expectText: ['Kind'],
  },
  {
    name: 'brief',
    setup: { step: 'brief', kind: 'store', answers: {} },
    expectText: ['Write the brief in your own words'],
  },
  {
    name: 'brief with answers',
    setup: {
      step: 'brief',
      kind: 'store',
      answers: { name: 'Falcon Coffee', prompt: 'We roast single-origin beans in Dammam and ship across the Kingdom.' },
    },
    expectText: ['Falcon Coffee'],
  },
  {
    name: 'sections',
    setup: { step: 'sections', kind: 'store', answers: {} },
    expectText: ['hero'],
  },
  {
    name: 'theme',
    /* the theme cards only appear once the user says who should pick */
    setup: { step: 'theme', kind: 'store', answers: {} },
    expectText: ['Let it choose', 'I’ll choose'],
  },
];
