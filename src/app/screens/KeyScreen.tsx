import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { getApiKey, setApiKey, clearApiKey } from '../../lib/db';
import { testKey } from '../../lib/gemini';
import { shortStamp } from '../../lib/version';

export default function KeyScreen() {
  const { next, patch, hasKey } = useApp();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const storageBlocked = useApp((s) => s.storageBlocked);
  const [savedMask, setSavedMask] = useState<string | null>(null);

  useEffect(() => {
    getApiKey()
      .then((k) => {
        if (!k) return;
        patch({ hasKey: true });
        /* Show enough of the prefix to identify the FORMAT: an `AQ.Ab…` key and
           an `AIza…` key authenticate differently, so a user staring at
           "AQ.Ab8…wBiA" cannot tell whether that is right. The prefix is the
           only part that carries a diagnosis, and it is not a secret. */
        setSavedMask(`${k.slice(0, 8)}…${k.slice(-4)}`);
        /* Boot normally sends a returning user straight past this screen (see
           App.tsx). This is the path where they arrived here deliberately, so
           the saved key is shown rather than silently navigated away from. */
      })
      .catch(() => {
        /* storage refused: the note below explains it, nothing to restore */
      });
  }, [patch, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed || busy) return;

    /* Google now issues two kinds of key and both are valid:
         · `AIza…`  — the old "Standard" key (being phased out)
         · `AQ.Ab…` — the new "Auth" key AI Studio issues by default
       The old check was a bare length test, and the screen told the user keys
       start with `AIza` — so a brand-new AQ. key looked wrong to the person
       holding it, and the app had no way to tell them otherwise. */
    if (trimmed.length < 20) {
      setMsg({ ok: false, text: 'That looks too short to be a Gemini key.' });
      return;
    }
    if (/^AQ\.$/i.test(trimmed) || trimmed.length < 30) {
      setMsg({ ok: false, text: 'That looks cut off — paste the whole key, starting AQ.Ab… or AIza…' });
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
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-sm" onClick={useSaved}>
                Use this key
              </button>
              {/* The input is already on the page, but a returning user who came
                  here to CHANGE the key should not have to infer that. */}
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => document.getElementById('k')?.focus()}
              >
                Use a different key
              </button>
            </div>
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
              placeholder="AQ.Ab… or AIza…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <p className="hint">
              Free at{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                aistudio.google.com/apikey
              </a>
              . No card needed. Google has two key formats and both work here —{' '}
              <span className="mono">AQ.Ab…</span> (what AI Studio issues now) and{' '}
              <span className="mono">AIza…</span> (the older kind).
            </p>
          </div>

          {msg && (
            <div className={msg.ok ? 'err ok' : 'err'}>
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

        {storageBlocked && (
          <div className="err">
            <div>
              <strong>This browser is blocking local storage</strong>
              The key can still be used for this session, but it will not be remembered and a
              finished site cannot be saved in the browser. A private window or a strict
              tracking-protection setting usually causes this. Exporting a finished site to a
              file still works.
            </div>
          </div>
        )}

        <p className="key-note">
          Nothing you type is stored anywhere but this machine. Sites you build live in IndexedDB
          and export as plain HTML files you own.
        </p>

        {/* Which commit is on screen. If this does not match the latest commit,
            the checkout is stale — say so before debugging anything else. */}
        <p className="tiny dim mono" style={{ margin: 0 }} data-build-stamp>
          build {shortStamp()}
        </p>
      </div>
    </div>
  );
}
