import { useEffect, useRef, useState } from 'react';
import { useApp, failBuild } from '../store';
import { getApiKey, saveProject } from '../../lib/db';
import { buildSite, GeminiError, BUDGET_MS, type MuseReport } from '../../lib/gemini';
import { renderDocument } from '../../lib/render';
import { snapshotHtml } from '../../lib/blueprint';
import { Swarm, summariseBlueprint, type BlueprintSummary } from '../../lib/swarm';
import { BuildSound } from '../../lib/audio';
import { StageClock } from '../StageClock';
import { armDeadline, clearDeadline } from '../../lib/deadline';
import { THEMES } from '../../lib/themes';
import { SECTION_LABEL } from '../../lib/spec';
import { planAnimation } from '../../lib/timing';

/** The width the preview stage will really be, so measurements match the reveal. */
function stageWidth() {
  return Math.max(480, Math.min(1920, window.innerWidth));
}

type Phase = 'writing' | 'choosing-theme' | 'measuring' | 'building' | 'done' | 'failed';

/**
 * The last line of defence.
 *
 * Every stage below is supposed to end by its own deadline, and each one has a
 * timer to make sure it does. But the user's copy hung for 518 seconds with the
 * clock politely counting past an 80-second budget: whatever the cause, a build
 * that can display 8.5 minutes has no business calling itself bounded.
 *
 * This does not trust any promise, any abort signal or any timer above it. It
 * simply says: this run has BUDGET_MS plus a small grace to produce something,
 * and if it has not, the build fails and says so. It is deliberately blunt — it
 * is the one thing that must hold when everything else is wrong.
 */
const HARD_STOP_GRACE_MS = 5_000;

/**
 * Give a step a hard stop against the shared deadline.
 *
 * Measuring is local and normally takes under a second, but it renders a whole
 * document in a hidden iframe — that is still work that can wedge, and when it
 * did there was nothing above it to call time. Now it either returns or the
 * build says it ran out of time.
 */
function raceDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  const left = Math.max(0, deadline - Date.now());
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new GeminiError(
              'The build ran out of time while measuring the page. Try fewer sections.',
              408
            )
          ),
        left
      )
    ),
  ]);
}

export default function BuildScreen() {
  const {
    kind,
    answers,
    chosenSections,
    themeMode,
    theme,
    accent,
    pdf,
    runId,
    patch,
    go,
    next,
    buildError,
  } = useApp();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const swarmRef = useRef<Swarm | null>(null);
  /* The reel this build is modelled on has sound: a key click per glyph, a
     press for every mouse-down, and a glass-piano note when a piece lands. It
     is synthesized here, never loaded. Off by default, because an app that
     makes noise the first time you open it is a bad guest — the HUD says
     "Sound" until you ask for it. */
  const soundRef = useRef<BuildSound | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [soundLocked, setSoundLocked] = useState(false);

  const [phase, setPhase] = useState<Phase>('writing');
  const [note, setNote] = useState('Reading what you wrote');
  const [progress, setProgress] = useState(0);
  /** what the measured page actually contains, for the HUD */
  const [summary, setSummary] = useState<BlueprintSummary | null>(null);
  /** which section the cursors are inside right now */
  const [workingOn, setWorkingOn] = useState<number | null>(null);
  /** how many pieces have landed, and how many there are to land */
  const [landed, setLanded] = useState(0);
  const landedTotal = summary ? summary.boxes + summary.lines + summary.texts : 0;
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
    /* a new run is not the old run's failure */
    failBuild('', runId);

    let cancelled = false;
    const ctl = new AbortController();
    abortRef.current = ctl;

    /* Third net, and the only one that does not live inside React.
       It is a module-level timer that no cleanup can clear and no unmount can
       take away. If it fires, the build is over whether or not the effect is
       still breathing. */
    const failHard = (label: string, elapsedMs: number) => {
      ctl.abort();
      setPhase('failed');
      setNote('Stopped');
      setErr(
        `The build was still on "${label}" after ${Math.round(
          elapsedMs / 1000
        )}s, against a ${Math.round(BUDGET_MS / 1000)}s limit, so it was stopped. ` +
          'Nothing was saved. If this happens with a working key, tell me — it means something is hanging outside the request itself.'
      );
    };

    const stopWatching = armDeadline({
      label: 'the build',
      budgetMs: BUDGET_MS,
      onStop: ({ label, elapsedMs }) => {
        /* Through the store as well as through local state: if this component
           has been torn down and rebuilt, its own setState goes nowhere, but a
           store write still reaches the screen that is on the page. */
        /* Scoped to this run: a deadline that outlives its build must not be
           able to fail the next one, or a finished one. */
        failBuild(
          `The build was still on "${label}" after ${Math.round(
            elapsedMs / 1000
          )}s, against a ${Math.round(BUDGET_MS / 1000)}s limit, so it was stopped. ` +
            'Nothing was saved. If this happens with a working key, tell me — it means something is hanging outside the request itself.',
          runId
        );
        failHard(label, elapsedMs);
      },
    });

    /* The last line of defence, and it lives out here so the cleanup above can
       reach it. `done` is set by every exit of the pipeline — success, failure,
       cancel — and the watchdog only fires on a run that genuinely went quiet.
       Deliberately independent of every promise and timer below: it is the one
       thing that must hold when they are all wrong. */
    let done = false;
    const watchdog = window.setTimeout(() => {
      if (done) return;
      done = true;
      ctl.abort();
      setPhase('failed');
      setNote('Stopped');
      setErr(
        `The build passed its ${Math.round(
          BUDGET_MS / 1000
        )}-second limit without finishing, so it was stopped. Nothing was saved. ` +
          'This is usually the free tier rate limit; waiting a minute and trying again normally clears it.'
      );
    }, BUDGET_MS + HARD_STOP_GRACE_MS);

    (async () => {
      try {
        let key: string | null = null;
        try {
          key = await getApiKey();
        } catch {
          throw new Error(
            'This browser is blocking local storage, so the saved key cannot be read. Paste it again on the Connect screen.'
          );
        }
        if (!key) throw new Error('No API key saved. Go back and add one.');
        if (!kind) throw new Error('No site kind chosen.');

        /* One deadline for everything from here on. The model gets what is
           left of it, the animation gets the rest, and nothing gets an
           unbounded wait of its own. */
        const startedAt = Date.now();
        const deadline = startedAt + BUDGET_MS;

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
          deadline,
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
        /* capture: the swarm is about to take this DOM apart and redraw it with
           cursors. Scroll reveals must stand still for that, or the blueprint
           measures positions the page then animates away from. */
        const html = renderDocument(finalSpec, { capture: true });
        /* dev/test hook: from here on the page document exists, which is what
           decides whether there is anything worth saving */
        (globalThis as Record<string, unknown>).__PIPE__ = { rendered: true };
        setHtml(html);
        // Let React commit the iframe before measuring. `requestAnimationFrame`
        // alone is a trap: in a background tab it never fires, so the pipeline
        // would wait for a frame that never comes. Race it against a timer.
        await new Promise<void>((r) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            r();
          };
          requestAnimationFrame(() => setTimeout(done, 0));
          setTimeout(done, 250);
        });
        if (cancelled) return;

        /* measure it, offscreen */
        setPhase('measuring');
        setNote('Measuring the page');
        const bp = await raceDeadline(snapshotHtml(html, stageWidth(), deadline), deadline);
        if (cancelled) return;
        patch({ blueprint: bp });

        /* Name the sections from the spec, in the order they were built, so the
           HUD can say "Products" instead of "Section 2". If the counts disagree
           the labels simply do not apply and summariseBlueprint falls back to
           numbers rather than naming the wrong thing. */
        const labels: Record<number, string> = {};
        finalSpec.sections.forEach((sec, i) => {
          labels[i] = SECTION_LABEL[sec.type];
        });
        setSummary(summariseBlueprint(bp, labels));
        setLanded(0);

        /* Keep it now, and not a line earlier.
           A build used to be saved the instant the model answered — before the
           page was rendered or measured — so a build that then failed to
           produce a document was still written to "Your sites", and the user
           saw the site it had just told them it could not build. It is not
           saved after the animation either: the page is the artefact, the
           animation is only how you watch it arrive, and a tab closed halfway
           through the drawing should not cost you the site.
           Failure here is not fatal: the page still renders and the result
           screen offers export. */
        let kept = false;
        const keep = async () => {
          /* StrictMode runs the pipeline twice in development. The build is
             the same artefact both times, so it is written once. */
          if (kept || cancelled) return;
          kept = true;
          try {
            const id = await saveProject(finalSpec, { kind });
            if (!cancelled) patch({ projectId: id, saved: true });
          } catch {
            /* storage refused: the result screen offers export instead */
          }
        };
        void keep();

        /* build */
        setPhase('building');
        setNote('Building');
        const canvas = canvasRef.current;
        if (!canvas) return;

        const swarm = new Swarm(canvas, bp, soundRef.current ?? undefined);
        swarmRef.current = swarm;
        swarm.resize();

        const onResize = () => swarm.resize();
        window.addEventListener('resize', onResize);

        // let one frame paint the blank page before the swarm starts
        /* The animation is part of the budget, not a bonus on the end of it.
           A real page is ~27s of drawing at 1x. If the model used 50s we ask
           for a faster speed so it lands inside 80s — but speed alone is only a
           request: a slow machine drops frames and falls behind whatever we ask
           for. hardCapMs is the promise, and it paints the finished page and
           hands over the moment the budget runs out. */
        /* Two things to balance: a fast build must not be padded out to half a
           minute, and a slow one must compress to keep the promise. The policy
           lives in timing.ts so this screen and the timeline test agree. */
        const plan = planAnimation(swarm.duration, startedAt, deadline);
        const buildSpeed = plan.speed;
        setSpeed(buildSpeed);

        /* Control passes to the animation here, which enforces its own
           `hardCapMs`. The watchdog's job was to get us to this point; leaving
           it armed would fire in the middle of a legitimate slow draw.

           The module-level deadline is cleared here too, and this is the line
           that was missing: it is armed for the whole build, and on a build
           that SUCCEEDED nobody ever disarmed it. It fired ninety seconds
           later, straight onto the finished page, with "the build was still on
           the build". That is why the first build of every session failed and
           the second — whose deadline had not yet expired — worked. */
        done = true;
        window.clearTimeout(watchdog);
        clearDeadline(stopWatching);
        requestAnimationFrame(() => {
          swarm.play({
            speed: buildSpeed,
            hardCapMs: plan.capMs,
            onProgress: (p) => setProgress(p),
            onLand: () => setLanded((n) => n + 1),
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

        /* The engine knows which section its cursors are inside; React has to
           ask. Four times a second is enough for a caption and costs nothing. */
        const watch = window.setInterval(() => {
          if (cancelled) return;
          setWorkingOn(swarm.workingSection);
        }, 250);

        return () => {
          window.removeEventListener('resize', onResize);
          window.clearInterval(watch);
        };
      } catch (e) {
        done = true;
        window.clearTimeout(watchdog);
        clearDeadline(stopWatching);
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
      done = true;
      window.clearTimeout(watchdog);
      clearDeadline(stopWatching);
      ctl.abort();
      /* Clear THIS run's deadline on teardown.
         The old note here said not to, because a StrictMode teardown on the
         throwaway first mount appeared to disarm the net. That was true when
         the deadline was one module-level handle that a second arm could not
         distinguish from the first — the first mount's cleanup killed the
         second mount's timer. Handles are per-arm now, so clearing our own
         takes nothing away from anyone else's. What it actually fixes is a
         leak: a run that returns early at a `cancelled` check (which is what a
         StrictMode teardown causes) left its deadline armed forever, and it
         fired minutes later onto a page that was already finished. */
      /* Release the guard on teardown.
         `ranFor` exists so a re-render cannot start a second build for the same
         run. But React 18 StrictMode mounts, tears down and mounts again in
         development — which is how the app is run here, via `npm run dev`. The
         teardown cancelled the first attempt, and leaving ranFor set meant the
         second mount returned immediately: no request, no failure, no watchdog.
         The screen sat on "Writing the page" with the clock counting, which is
         exactly the 518 seconds the user saw. Releasing it lets the remount run
         the pipeline again; the first attempt is inert because `cancelled` is
         true. */
      if (ranFor.current === runId) ranFor.current = null;
      swarmRef.current?.stop();
      swarmRef.current = null;
      soundRef.current?.dispose();
      soundRef.current = null;
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

  /**
   * Browsers hold audio until a gesture. We ask on the first click and, if the
   * context is still suspended, say so in the button instead of pretending.
   */
  async function toggleSound() {
    if (soundOn) {
      soundRef.current?.setMuted(true);
      setSoundOn(false);
      return;
    }
    if (!soundRef.current) soundRef.current = new BuildSound();
    const ok = await soundRef.current.start();
    soundRef.current.setMuted(!ok);
    setSoundOn(ok);
    setSoundLocked(!ok);
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
    /* Skipping is the user saying "I have seen enough — keep it". The page is
       real, so refusing to save it would be the surprising choice. */
    const spec = useApp.getState().spec;
    if (spec && !useApp.getState().saved) {
      void saveProject(spec, { kind }).then(
        (id) => patch({ projectId: id, saved: true }),
        () => undefined
      );
    }
  }

  function replay() {
    setLive(false);
    setProgress(0);
    setPaused(false);
    /* A replay draws the SAME page, so the measured figures still hold — but
       the landing counter and the caption described the last run and would
       otherwise start again from where they stopped. */
    setLanded(0);
    setWorkingOn(null);
    setPhase('building');
    requestAnimationFrame(() => {
      const s = swarmRef.current;
      if (!s) return;
      s.play({
        speed,
        // a replay is not the paid build; it still may not trap the user
        hardCapMs: 45_000,
        onProgress: (p) => setProgress(p),
        onLand: () => setLanded((n) => n + 1),
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

  /* A failure can arrive through local state (the normal path) or through the
     store (when the deadline fired against a component that no longer exists).
     Either one must put the same screen up. */
  const fatal = (buildError || null) ?? (phase === 'failed' ? err : null);

  if (fatal) {
    return (
      <div className="screen" style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }} className="stack">
          <h1 style={{ fontSize: '1.375rem', margin: 0, letterSpacing: '-0.02em' }}>
            It stopped before it started
          </h1>
          <div className="err">
            <div>
              <strong>Nothing was built</strong>
              {fatal}
            </div>
          </div>
          <p className="tiny dim" style={{ lineHeight: 1.6 }}>
            {fatal?.startsWith('The build ran out of time') ||
            fatal?.includes('did not finish') ||
            fatal?.includes('was still on')
              ? 'Google was still writing when the 80-second limit ran out. The free tier is a handful of requests per minute, so waiting a minute usually clears it. Try again — nothing was charged for a page that never arrived.'
              : fatal?.includes('no model') || fatal?.includes('no longer available')
                ? 'Your key is fine — Google has retired the model name this app asked for. That is a bug here, not a problem with your key, and retrying will not fix it. Check for an update.'
                : 'A build is one request and has 80 seconds to land. If the key is fine, waiting a minute and trying again is usually enough.'}
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

        {/* What is being drawn, measured — not claimed.
            Every figure here comes from the blueprint: the page was rendered,
            measured, and these are its real counts. The caption names the
            section the swarm is actually inside right now. */}
        {summary && phase !== 'done' && (
          <div className="build-stats">
            <span className="stat">
              <b>{summary.sections.length}</b> sections
            </span>
            <span className="stat">
              <b>{summary.boxes}</b> boxes
            </span>
            <span className="stat">
              <b>{summary.lines}</b> rules
            </span>
            <span className="stat">
              <b>{summary.chars.toLocaleString()}</b> characters
            </span>
            {landedTotal > 0 && (
              <span className="stat">
                <b>{Math.min(landed, landedTotal)}</b>/{landedTotal} landed
              </span>
            )}
            {workingOn !== null && summary.sections.some((s) => s.index === workingOn) && (
              <span className="stat stat-live">
                <i />
                {summary.sections.find((s) => s.index === workingOn)?.name}
              </span>
            )}
          </div>
        )}

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
          <button onClick={toggleSound} aria-pressed={soundOn}>
            {soundLocked ? 'Tap for sound' : soundOn ? 'Sound on' : 'Sound'}
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
              /* The clock's own interval calling time. It is here because the
                 build effect's timers have twice been cancelled while this
                 interval kept running, counting honestly to 3345 seconds
                 against an 80-second budget. When the thing that is measuring
                 is demonstrably alive and the thing being measured is not, the
                 measuring thing should intervene. */
              onOverrun={({ label, elapsedMs }) => {
                const message =
                  `The build was still on "${label}" after ${Math.round(
                    elapsedMs / 1000
                  )}s, against a ${Math.round(
                    BUDGET_MS / 1000
                  )}s limit, so it was stopped. Nothing was saved. ` +
                  'If this happens with a working key, tell me — it means something is hanging outside the request itself.';
                abortRef.current?.abort();
                setPhase('failed');
                setNote('Stopped');
                setErr(message);
                failBuild(message);
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
