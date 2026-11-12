import { useEffect } from 'react';
import { useApp, STEP_LABEL, STEP_ORDER } from './store';

/** the steps that appear in the rail, in order */
const RAIL = STEP_ORDER.filter((s) => s !== 'projects' && s !== 'key');
import { getApiKey, storageAvailable } from '../lib/db';
import KeyScreen from './screens/KeyScreen';
import ProjectsScreen from './screens/ProjectsScreen';
import KindScreen from './screens/KindScreen';
import BriefScreen from './screens/BriefScreen';
import SectionsScreen from './screens/SectionsScreen';
import ThemeScreen from './screens/ThemeScreen';
import BuildScreen from './screens/BuildScreen';
import ResultScreen from './screens/ResultScreen';

export default function App() {
  const { step, go, hasKey, patch } = useApp();

  useEffect(() => {
    /* Boot must never throw. Without storage the app still works for this
       session — it just cannot remember the key or keep a site afterwards — and
       the key screen says so instead of the page going blank. */
    if (!storageAvailable()) {
      patch({ storageBlocked: true });
      return;
    }
    getApiKey()
      .then((k) => {
        if (k) patch({ hasKey: true });
      })
      .catch(() => patch({ storageBlocked: true }));
  }, [patch]);

  const wide = step === 'build';
  const bare = step === 'result';
  // the step rail only applies once you are actually building something
  const showRail = step !== 'key' && step !== 'projects' && step !== 'result';

  return (
    <div className="shell">
      {!bare && (
        <header className="hdr">
          <div className="hdr-in">
            <button
              className="mark mark-btn"
              onClick={() => go(hasKey ? 'projects' : 'key')}
              title="Your sites"
            >
              <Mark />
              swarmsmith
            </button>
            {showRail && (
            <nav className="stepper">
              {RAIL.map((s) => {
                const i = RAIL.indexOf(s);
                const at = RAIL.indexOf(step as (typeof RAIL)[number]);
                const state = at < 0 ? 'todo' : i < at ? 'done' : i === at ? 'now' : 'todo';
                const enabled = state === 'done' && hasKey;
                return (
                  <button
                    key={s}
                    className="step"
                    data-state={state}
                    disabled={!enabled}
                    onClick={() => enabled && go(s)}
                  >
                    <i>{state === 'done' ? '✓' : i + 1}</i>
                    {STEP_LABEL[s]}
                  </button>
                );
              })}
            </nav>
            )}
          </div>
        </header>
      )}

      <main className={`main${wide ? ' wide' : ''}`}>
        {step === 'key' && <KeyScreen />}
        {step === 'projects' && <ProjectsScreen />}
        {step === 'kind' && <KindScreen />}
        {step === 'brief' && <BriefScreen />}
        {step === 'sections' && <SectionsScreen />}
        {step === 'theme' && <ThemeScreen />}
        {step === 'build' && <BuildScreen />}
        {step === 'result' && <ResultScreen />}
      </main>
    </div>
  );
}

/** Nine dots in a spiral — the mark. Monochrome. */
function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const a = (i / 9) * Math.PI * 2;
        const r = i === 0 ? 0 : 6.2;
        return (
          <circle
            key={i}
            cx={9 + Math.cos(a) * r}
            cy={9 + Math.sin(a) * r}
            r={i % 3 === 0 ? 1.6 : 1.1}
            fill="currentColor"
            opacity={i % 3 === 0 ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}
