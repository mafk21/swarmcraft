import { useState } from 'react';
import { useApp } from '../store';
import { getApiKey, setApiKey, clearApiKey } from '../../lib/db';
import { testKey } from '../../lib/gemini';
import { DEMO_SPEC } from '../../lib/samples';

export default function KeyScreen() {
  const { next, patch, hasKey, answers } = useApp();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim() || busy) return;
    setBusy(true);
    setMsg(null);

    const res = await testKey(key.trim());
    if (!res.ok) {
      setMsg({ ok: false, text: res.message });
      setBusy(false);
      return;
    }

    await setApiKey(key.trim());
    patch({ hasKey: true });
    setBusy(false);
    next();
  }

  async function skipIfStored() {
    const k = await getApiKey();
    if (k) {
      patch({ hasKey: true });
      next();
    }
  }

  function demo() {
    patch({
      kind: 'store',
      answers: {
        ...answers,
        name: DEMO_SPEC.nav.brand,
        description: DEMO_SPEC.meta.description,
      },
      chosenSections: DEMO_SPEC.sections.map((s) => s.type),
      themeMode: 'pick',
      theme: DEMO_SPEC.meta.theme,
      accent: DEMO_SPEC.meta.accent,
      spec: DEMO_SPEC,
      demo: true,
      step: 'build',
    });
  }

  async function forget() {
    await clearApiKey();
    patch({ hasKey: false });
    setMsg({ ok: true, text: 'Key removed.' });
  }

  return (
    <div className="screen">
      <div className="keypad">
        <h1>{hasKey ? 'Connect a model' : 'One key, then it works'}</h1>
        <p>
          Swarmsmith uses your own Google Gemini API key. It is stored in this browser&rsquo;s
          IndexedDB and sent only to Google, from this tab. There is no server in between, because
          there is no server at all.
        </p>

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="k">Gemini API key</label>
            <input
              id="k"
              className="input mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="AIza…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <p className="hint">
              Free at{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                aistudio.google.com/apikey
              </a>
              . No card needed.
            </p>
          </div>

          {msg && (
            <div className="err">
              <div>
                <strong>{msg.ok ? 'Done' : 'That key was rejected'}</strong>
                {msg.text}
              </div>
            </div>
          )}

          <button className="btn btn-primary btn-lg" disabled={!key.trim() || busy}>
            {busy ? 'Checking…' : 'Save and continue'}
          </button>

          {hasKey && (
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={skipIfStored}>
                Use the saved key
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={forget}>
                Forget saved key
              </button>
            </div>
          )}
        </form>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 4 }}
          onClick={demo}
        >
          Watch the swarm with a sample page instead
        </button>

        <p className="key-note">
          Nothing you type is stored anywhere but this machine. Sites you build live in IndexedDB
          and export as plain files.
        </p>
      </div>
    </div>
  );
}
