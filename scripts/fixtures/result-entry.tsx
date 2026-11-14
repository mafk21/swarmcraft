/* Mounts the REAL ResultScreen with a real spec in the store, so the export
   button can be clicked the way a person clicks it. */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useApp } from '../../src/app/store';
import ResultScreen from '../../src/app/screens/ResultScreen';
import { DEMO_SPEC } from '../fixtures/sample-spec';

export { useApp, act };

export function mountResult() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  act(() => {
    useApp.setState({
      hasKey: true,
      step: 'result' as never,
      kind: 'store' as never,
      theme: DEMO_SPEC.meta.theme as never,
      accent: DEMO_SPEC.meta.accent as never,
      spec: DEMO_SPEC as never,
      saved: true,
      projectId: 'p1',
    });
  });
  act(() => {
    root.render(<StrictMode><ResultScreen /></StrictMode>);
  });
  return { el, root };
}
