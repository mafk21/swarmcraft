/* Mounts the REAL BuildScreen inside StrictMode — the dev-only double-mount that
   production does not do. If a build can be silently cancelled by that second
   mount, it will show up here and not in any test that mounts without it. */
import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useApp } from '../../src/app/store';
import BuildScreen from '../../src/app/screens/BuildScreen';

export { useApp, act };

export function mountBuild() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root: Root = createRoot(el);
  act(() => {
    useApp.setState({
      hasKey: true,
      step: 'build' as never,
      kind: 'store' as never,
      runId: 7,
      answers: { name: 'Falcon Coffee', prompt: 'We roast beans in Dammam and sell them across the Kingdom.' } as never,
      themeMode: 'manual' as never,
      theme: 'editorial' as never,
      chosenSections: ['hero', 'features', 'contact'] as never,
    });
  });
  act(() => {
    root.render(<StrictMode><BuildScreen /></StrictMode>);
  });
  return { el, root };
}
