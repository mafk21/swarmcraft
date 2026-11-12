import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { getApiKey, setApiKey, clearApiKey } from '../../lib/db';
import { testKey } from '../../lib/gemini';
import { DEMO_SPEC } from '../../lib/samples';

export default function KeyScreen() {
  const { next, patch, hasKey } = useApp();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savedMask, setSavedMask] = useState<string | null>(null);

  useEffect(() => {
    getApiKey().then((k) => {
      if (k) {
        patch({ hasKey: true });
        setSavedMask(`${k.slice(0, 6)}…${k.slice(-4)}`);
      }
    });
  }, [patch]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed || busy) return;

    if (trimmed.length < 20) {
      setMsg({ ok: false, text: 'That looks too short to be a Gemini key.' });
      return;
    }

    setBusy(true);
    setMsg(null);

    const res = await testKey(trimmed);
    setBusy(false);

    if (!res.ok) {
      setMsg({ ok: false, text: res.message });
      return;
    }

    await setApiKey(trimmed);
    patch({ hasKey: true });
    setMsg({ ok: true, text: 'Key works. Taking you to your sites.' });
    window.setTimeout(() => next(), 420);
  }

  function useSaved() {
    patch({ hasKey: true });
    next();
  }

  async function forget() {
    await clearApiKey();
    patch({ hasKey: false });
    setSavedMask(null);
    setMsg({ ok: true, text: 'Key removed from this browser.' });
  }

  function demo() {
    patch({
      kind: 'store',
      answers: { name: DEMO_SPEC.nav.brand, description: DEMO_SPEC.meta.description },
      chosenSections: DEMO_SPEC.sections.map((s) => s.type),
      themeMode: 'pick',
      theme: DEMO_SPEC.meta.theme,
      accent: DEMO_SPEC.meta.accent,
      spec: DEMO_SPEC,
      demo: true,
      projectId: null,
      saved: false,
      runId: useApp.getState().runId + 1,
      step: 'build',
    });
  }

  return (
    <div className="screen">
      <div className="keypad">
        <h1>{hasKey ? 'Your key is saved' : 'One key, then it works'}</h1>
        <p>
          Swarmsmith uses your own Google Gemini API key. It is stored in this browser&rsquo;s
          IndexedDB and sent only to Google, from this tab. There is no server in between, because
          there is no server at all.
        </p>

        {hasKey && savedMask && (
          <div className="saved-key">
            <div>
              <strong>Saved key</strong>
              <span className="mono">{savedMask}</span>
            </div>
            <button className="btn btn-sm" onClick={useSaved}>
              Continue
            </button>
          </div>
        )}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="k">{hasKey ? 'Replace the key' : 'Gemini API key'}</label>
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
              . No card needed. Keys start with <span className="mono">AIza</span>.
            </p>
          </div>

          {msg && (
            <div className="err">
              <div>
                <strong>{msg.ok ? 'Done' : 'That key did not work'}</strong>
                {msg.text}
              </div>
            </div>
          )}

          <button className="btn btn-primary btn-lg" disabled={!key.trim() || busy}>
            {busy ? 'Checking with Google…' : 'Save and continue'}
          </button>

          {hasKey && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={forget}>
              Forget the saved key
            </button>
          )}
        </form>

        <div className="key-split">
          <span>or</span>
        </div>

        <button type="button" className="btn btn-ghost" onClick={demo}>
          Watch the swarm with a sample page
        </button>
        <p className="hint" style={{ marginTop: 8, textAlign: 'center' }}>
          No key needed. Builds a hand-written pottery shop and skips the model.
        </p>

        <p className="key-note">
          Nothing you type is stored anywhere but this machine. Sites you build live in IndexedDB
          and export as plain HTML files you own.
        </p>
      </div>
    </div>
  );
}
