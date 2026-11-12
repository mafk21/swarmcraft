import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { getApiKey } from '../../lib/db';
import { buildSite, GeminiError, type MuseReport } from '../../lib/gemini';
import { renderDocument } from '../../lib/render';
import { snapshotHtml } from '../../lib/blueprint';
import { Swarm } from '../../lib/swarm';
import { StageClock } from '../StageClock';
import { THEMES } from '../../lib/themes';

/** The width the preview stage will really be, so measurements match the reveal. */
function stageWidth() {
  return Math.max(480, Math.min(1920, window.innerWidth));
}

type Phase = 'writing' | 'choosing-theme' | 'measuring' | 'building' | 'done' | 'failed';

export default function BuildScreen() {
  const {
    kind,
    answers,
    chosenSections,
    themeMode,
    theme,
    accent,
    pdf,
    demo,
    runId,
    patch,
    go,
    next,
  } = useApp();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swarmRef = useRef<Swarm | null>(null);

  const [phase, setPhase] = useState<Phase>('writing');
  const [note, setNote] = useState('Reading what you wrote');
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [themeInfo, setThemeInfo] = useState<string | null>(null);
  const [guardNotes, setGuardNotes] = useState<string[]>([]);
  const [muses, setMuses] = useState<MuseReport[]>([]);

  const [html, setHtml] = useState<string>('');
  // which run has already been executed — StrictMode would otherwise fire the
  // whole pipeline (and pay for two Gemini calls) in development
  const ranFor = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* ── the whole pipeline, once ─────────────────────────────────────────── */
  useEffect(() => {
    if (ranFor.current === runId) return;
    ranFor.current = runId;

    let cancelled = false;
    const ctl = new AbortController();
    abortRef.current = ctl;

    (async () => {
      try {
        /* ── demo: skip the model entirely, use the hand-written spec ── */
        if (demo) {
          const spec = useApp.getState().spec;
          if (!spec) throw new Error('No sample was loaded.');

          const html = renderDocument(spec);
          setHtml(html);

          setPhase('measuring');
          setNote('Measuring the page');
          const bp = await snapshotHtml(html, stageWidth());
          if (cancelled) return;
          patch({ blueprint: bp });

          setPhase('building');
          setNote('Building');
          const canvas = canvasRef.current;
          if (!canvas) return;
          const swarm = new Swarm(canvas, bp);
          swarmRef.current = swarm;
          swarm.resize();
          const onR = () => swarm.resize();
          window.addEventListener('resize', onR);

          requestAnimationFrame(() => {
            swarm.play({
              speed: 1,
              onProgress: (p) => setProgress(p),
              onDone: () => {
                setPhase('done');
                setNote('Done');
                setTimeout(() => {
                  if (!cancelled) setLive(true);
                }, 420);
              },
            });
          });

          return () => window.removeEventListener('resize', onR);
        }

        const key = await getApiKey();
        if (!key) throw new Error('No API key saved. Go back and add one.');
        if (!kind) throw new Error('No site kind chosen.');

        setNote('Writing the page');
        const enriched = {
          ...answers,
          __sections: chosenSections,
          ...(pdf ? { __source: pdf.text } : {}),
        };

        const register = String(answers.tone ?? '');
        const { spec, repairs } = await buildSite(key, kind, enriched, {
          register,
          wanted: chosenSections,
          onMuse: (r) => setMuses((m) => [...m, r]),
          onStage: (label) => setNote(label),
          signal: ctl.signal,
        });
        if (repairs.length) setGuardNotes(repairs);
        if (cancelled) return;

        /* theme
           Auto mode used to make a SECOND model call just to pick a theme, even
           though the main response schema already asks the model for one. It
           picked it while writing the page, with the copy in front of it. So
           there is nothing to wait for: use what came back. */
        let finalSpec = spec;
        if (themeMode === 'auto') {
          const chosen = THEMES[spec.meta.theme];
          setThemeInfo(
            `${chosen?.label ?? spec.meta.theme}${
              spec.meta.themeReason ? ` — ${spec.meta.themeReason}` : ''
            }`
          );
        } else if (theme && accent) {
          finalSpec = {
            ...spec,
            meta: { ...spec.meta, theme, accent: accent as typeof spec.meta.accent },
          };
        }

        patch({ spec: finalSpec });

        /* render the real document */
        const html = renderDocument(finalSpec);
        setHtml(html);
        // let React commit the iframe before we start measuring/animating
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
        if (cancelled) return;

        /* measure it, offscreen */
        setPhase('measuring');
        setNote('Measuring the page');
        const bp = await snapshotHtml(html, stageWidth());
        if (cancelled) return;
        patch({ blueprint: bp });

        /* build */
        setPhase('building');
        setNote('Building');
        const canvas = canvasRef.current;
        if (!canvas) return;

        const swarm = new Swarm(canvas, bp);
        swarmRef.current = swarm;
        swarm.resize();

        const onResize = () => swarm.resize();
        window.addEventListener('resize', onResize);

        // let one frame paint the blank page before the swarm starts
        requestAnimationFrame(() => {
          swarm.play({
            speed: 1,
            onProgress: (p) => setProgress(p),
            onDone: () => {
              setPhase('done');
              setNote('Done');
              // reveal the real, interactive page underneath
              setTimeout(() => {
                if (!cancelled) setLive(true);
              }, 420);
            },
          });
        });

        return () => window.removeEventListener('resize', onResize);
      } catch (e) {
        if (cancelled) return;
        setPhase('failed');
        setErr(
          e instanceof GeminiError
            ? e.status === 408
              ? e.message
              : `Google said: ${e.message}`
            : e instanceof Error
              ? e.message
              : 'Something went wrong.'
        );
      }
    })();

    return () => {
      cancelled = true;
      ctl.abort();
      swarmRef.current?.stop();
      swarmRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  /* ── controls ─────────────────────────────────────────────────────────── */

  function togglePause() {
    const s = swarmRef.current;
    if (!s) return;
    if (paused) s.resume();
    else s.pause();
    setPaused(!paused);
  }

  function changeSpeed(v: number) {
    setSpeed(v);
    swarmRef.current?.setSpeed(v);
  }

  function skip() {
    const s = swarmRef.current;
    if (!s) return;
    s.stop();
    s.finishAll();
    setProgress(1);
    setPhase('done');
    setPaused(false);
    setLive(true);
  }

  function replay() {
    setLive(false);
    setProgress(0);
    setPaused(false);
    setPhase('building');
    requestAnimationFrame(() => {
      const s = swarmRef.current;
      if (!s) return;
      s.play({
        speed,
        onProgress: (p) => setProgress(p),
        onDone: () => {
          setPhase('done');
          setTimeout(() => setLive(true), 420);
        },
      });
    });
  }

  function showLive() {
    setLive(true);
    setPhase('done');
    swarmRef.current?.stop();
  }

  /* ── render ───────────────────────────────────────────────────────────── */

  if (phase === 'failed') {
    return (
      <div className="screen" style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }} className="stack">
          <h1 style={{ fontSize: '1.375rem', margin: 0, letterSpacing: '-0.02em' }}>
            It stopped before it started
          </h1>
          <div className="err">
            <div>
              <strong>Nothing was built</strong>
              {err}
            </div>
          </div>
          <p className="tiny dim" style={{ lineHeight: 1.6 }}>
            If this was a rate limit, waiting sixty seconds is usually enough. The free tier
            allows a handful of requests per minute.
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={() => go('theme')}>
              Try again
            </button>
            <button className="btn btn-ghost" onClick={() => go('brief')}>
              Change the brief
            </button>
            <button className="btn btn-ghost" onClick={() => go('key')}>
              Check the key
            </button>
          </div>
        </div>
      </div>
    );
  }

  const working = phase !== 'done';
  const statusText =
    phase === 'writing'
      ? 'composing'
      : phase === 'choosing-theme'
        ? 'choosing type'
        : phase === 'measuring'
          ? 'measuring the page'
          : phase === 'building'
            ? 'nine cursors, one page'
            : 'built';

  return (
    <div className="screen">
      <div className="build-wrap">
        <div className="rail">
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>

        <canvas ref={canvasRef} className="build-canvas" />
        <iframe
          className={`build-frame${live ? ' live' : ''}`}
          srcDoc={html}
          title="Built site"
          sandbox="allow-same-origin"
        />

        {/* the real page must exist before we can reveal it */}
        

        <div className="hud">
          <button onClick={showLive} aria-pressed={live}>
            {live ? 'Canvas' : 'Page'}
          </button>
          <button onClick={replay} aria-pressed={phase === 'building'}>
            Replay
          </button>
          <div className="div" />
          {[1, 2, 3].map((v) => (
            <button key={v} aria-pressed={speed === v} onClick={() => changeSpeed(v)}>
              {v}×
            </button>
          ))}
          <div className="div" />
          <button onClick={togglePause} aria-pressed={paused}>
            {paused ? 'Resume' : 'Pause'}
          </button>
          <div className="div" />
          <button className="go" onClick={skip} disabled={!working && live}>
            {phase === 'done' ? 'Continue' : 'Skip'}
          </button>
        </div>

        {/* status line while the model is working */}
        {muses.length > 0 && phase !== 'done' && (
          <div
            style={{
              position: 'absolute',
              left: 20,
              top: 16,
              zIndex: 5,
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--t2)',
              background: 'rgba(12,13,15,0.82)',
              padding: '8px 10px',
              borderRadius: 4,
              border: '1px solid var(--l2)',
              maxWidth: 300,
            }}
          >
            {muses.map((m, i) => (
              <div key={i}>
                <span style={{ color: 'var(--t0)' }}>{m.muse}</span> · {m.role} ·{' '}
                {m.changed ? m.notes.slice(0, 1).join('') : 'ok'}
              </div>
            ))}
          </div>
        )}

        {(phase === 'writing' || phase === 'choosing-theme' || phase === 'measuring') && (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <p className="clock-label" style={{ margin: 0 }}>
              {note}
            </p>
            <StageClock
              label={note}
              running
              onCancel={() => {
                abortRef.current?.abort();
                setPhase('failed');
                setErr('Stopped. Nothing was built.');
              }}
            />
          </div>
        )}

        {guardNotes.length > 0 && phase === 'done' && (
          <div
            className="mono tiny"
            style={{
              position: 'absolute',
              left: 20,
              bottom: themeInfo ? 64 : 22,
              maxWidth: 340,
              color: 'var(--t2)',
              background: 'rgba(255,255,255,0.9)',
              padding: '7px 10px',
              borderRadius: 4,
              border: '1px solid var(--l2)',
              lineHeight: 1.5,
              zIndex: 5,
            }}
          >
            guard: {guardNotes.join(' · ')}
          </div>
        )}

        {themeInfo && phase === 'done' && (
          <div
            className="mono tiny"
            style={{
              position: 'absolute',
              left: 20,
              bottom: 22,
              maxWidth: 340,
              color: 'var(--t2)',
              background: 'rgba(255,255,255,0.9)',
              padding: '7px 10px',
              borderRadius: 4,
              border: '1px solid var(--l2)',
              lineHeight: 1.5,
              zIndex: 5,
            }}
          >
            {themeInfo}
          </div>
        )}

        <div
          className="mono tiny dim"
          style={{
            position: 'absolute',
            right: 20,
            top: 16,
            zIndex: 5,
            letterSpacing: '0.06em',
          }}
        >
          {statusText.toUpperCase()}
        </div>
      </div>

      {phase === 'done' && live && (
        <div className="result-bar">
          <div className="title">
            {useApp.getState().spec?.meta.title}
            <span>{useApp.getState().spec?.meta.description}</span>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={replay}>
            Replay the build
          </button>
          <button className="btn btn-sm btn-primary" onClick={next}>
            Finish
          </button>
        </div>
      )}
    </div>
  );
}
