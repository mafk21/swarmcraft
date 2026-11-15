import { useEffect, useState } from 'react';
import { useApp } from '../store';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  chooseFolder,
  folderSupported,
} from '../../lib/db';
import { testKey, diagnose } from '../../lib/gemini';
import { rememberKeyForSession } from './BuildScreen';
import { shortStamp } from '../../lib/version';

export default function KeyScreen() {
  const { next, patch, hasKey } = useApp();
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const storageBlocked = useApp((s) => s.storageBlocked);
  const folderLabel = useApp((s) => s.folderLabel);
  const folderMode = useApp((s) => s.folderMode);
  const [savedMask, setSavedMask] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderErr, setFolderErr] = useState<string | null>(null);

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
      /* Nothing reached Google. Do not tell the user their key is wrong on the
         strength of a browser that is not allowed to read the difference
         between "refused" and "blocked" — probe, then say what was observed. */
      if (res.unreachable) {
        setMsg({ ok: false, text: 'Checking what is blocking it…' });
        const finding = await diagnose(trimmed);
        setBusy(false);
        setMsg({ ok: false, text: finding });
        return;
      }
      setMsg({ ok: false, text: res.message });
      return;
    }

    /* Saving the key is the first thing that needs a store. If IndexedDB is
       blocked and no folder has been chosen, this used to throw and the button
       did nothing at all — the user saw "this browser is blocking local storage"
       and no way past it. Now the failure is caught and said in words, and the
       way past it is the folder button below. */
    /* Whatever the store does, this tab can build with it. */
    rememberKeyForSession(trimmed);
    try {
      await setApiKey(trimmed);
      patch({ hasKey: true });
    } catch {
      setBusy(false);
      if (folderMode) {
        /* a folder is open and the write still failed: that is worth knowing */
        setMsg({ ok: false, text: 'The key works, but it could not be written to the folder. Check the folder is still there, then try again.' });
        return;
      }
      if (!folderSupported()) {
        /* no store AND no picker: carry on in memory rather than dead-ending.
           The note at the bottom of this screen says what that costs. */
        patch({ hasKey: true });
        setMsg({ ok: true, text: 'The key works, and this tab will use it. This browser will not let the app remember it — export each site when it is finished.' });
        window.setTimeout(() => next(), 1200);
        return;
      }
      setMsg({ ok: false, text: 'The key works, but there is nowhere to keep it yet. Choose a folder below and the app will save it there.' });
      return;
    }
    setMsg({ ok: true, text: 'Key works. Taking you to your sites.' });
    window.setTimeout(() => next(), 420);
  }

  /**
   * Pick a folder. Called directly from onClick with nothing awaited in front
   * of it: showDirectoryPicker needs the user's gesture and an await spends it.
   */
  async function pickFolder() {
    setFolderErr(null);
    setFolderBusy(true);
    try {
      const name = await chooseFolder();
      if (!name) {
        /* the dialog was closed — a choice, not an error */
        setFolderBusy(false);
        return;
      }
      patch({ folderMode: true, folderLabel: name });
      /* the key that failed to save a moment ago can go in now */
      if (key.trim()) {
        try {
          await setApiKey(key.trim());
        } catch {
          /* the folder write failed; the message below covers it */
        }
      }
      setMsg({ ok: true, text: `Saving to “${name}”. This browser blocks its own storage, so the app keeps its files in the folder you chose.` });
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : 'The folder could not be opened.');
    } finally {
      setFolderBusy(false);
    }
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
        <p className="eyebrow">Setup</p>
        <h1>{hasKey ? 'Your key is saved' : 'One key, then it works'}</h1>
        <p>
          Swarmcraft uses your own Google Gemini API key. It is stored in this browser&rsquo;s
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

        {storageBlocked && !folderMode && (
          <div className="err">
            <div>
              <strong>This browser is blocking its own storage</strong>
              A private window or a strict tracking-protection setting usually does this. The app
              still works — but unless it has somewhere to put things, it will forget your key and
              your sites when the tab closes.
              {folderSupported() ? (
                <>
                  {' '}
                  Give it a folder and it saves there instead, as plain JSON files you can open
                  yourself.
                </>
              ) : (
                <>
                  {' '}
                  This browser cannot hand out a folder either, so for now: keep the key somewhere
                  safe, and export each site to a file when it is finished.
                </>
              )}
            </div>
          </div>
        )}

        {storageBlocked && folderSupported() && (
          <div className="field">
            {folderMode ? (
              <p className="hint">
                Saving to <strong>{folderLabel}</strong> — settings, sites and pages, as JSON in the
                folder you picked. Images stay in this tab and travel with an exported HTML file.
              </p>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={pickFolder}
                  disabled={folderBusy}
                >
                  {folderBusy ? 'Opening…' : 'Choose a folder to save into'}
                </button>
                <p className="hint">
                  You will be asked which folder — pick an empty one, or make a new one called
                  something like <span className="mono">swarmcraft</span>. Everything stays on this
                  machine.
                </p>
              </>
            )}
            {folderErr && (
              <div className="err">
                <div>{folderErr}</div>
              </div>
            )}
          </div>
        )}

        <p className="key-note">
          Nothing you type is stored anywhere but this machine. Sites you build live in{' '}
          {folderMode ? 'the folder you chose' : 'IndexedDB'} and export as plain HTML files you
          own.
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
