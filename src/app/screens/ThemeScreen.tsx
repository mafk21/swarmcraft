import { useApp } from '../store';
import { THEME_LIST, ACCENT_HEX, THEMES } from '../../lib/themes';
import { ACCENTS } from '../../lib/spec';
import { KIND_BRIEFS } from '../../lib/questions';

export default function ThemeScreen() {
  const { kind, themeMode, theme, accent, patch, back } = useApp();
  if (!kind) return null;

  const suggested = KIND_BRIEFS[kind].themes;
  const ready = themeMode === 'auto' || (theme !== null && accent !== null);

  return (
    <div className="screen">
      <div className="head">
        <h1>Type and colour</h1>
        <p>
          These are hand-built systems, not generated styles. The model never writes CSS — at most
          it picks one of these and tells you why. That is the guarantee that the page cannot come
          out looking like a language model made it.
        </p>
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          className="choice"
          aria-pressed={themeMode === 'auto'}
          onClick={() => patch({ themeMode: 'auto' })}
        >
          Let it choose
        </button>
        <button
          className="choice"
          aria-pressed={themeMode === 'pick'}
          onClick={() => patch({ themeMode: 'pick' })}
        >
          I&rsquo;ll choose
        </button>
        <span className="tiny dim" style={{ alignSelf: 'center', marginLeft: 4 }}>
          {themeMode === 'auto'
            ? 'The theme is picked after the content is written, so it can match the subject.'
            : `Suggested for a ${kind}: ${suggested
                .map((t) => THEMES[t].label)
                .join(', ')}`}
        </span>
      </div>

      {themeMode === 'pick' && (
        <>
          <div className="themes">
            {THEME_LIST.map((t) => (
              <button
                key={t.id}
                className="theme-card"
                aria-pressed={theme === t.id}
                onClick={() => patch({ theme: t.id, accent: accent ?? 'slate' })}
              >
                <ThemePreview id={t.id} accent={accent ?? 'slate'} />
                <div className="theme-meta">
                  <strong>{t.label}</strong>
                  <span>{t.character}</span>
                </div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 28 }}>
            <p className="field-label" style={{ marginBottom: 10 }}>
              Accent
            </p>
            <div className="choices">
              {ACCENTS.map((a) => (
                <button
                  key={a}
                  className="choice"
                  aria-pressed={accent === a}
                  onClick={() => patch({ accent: a })}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: ACCENT_HEX[a],
                      display: 'inline-block',
                      border: '1px solid rgba(0,0,0,0.12)',
                    }}
                  />
                  {a}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="bar">
        <button className="btn btn-ghost" onClick={back}>
          Back
        </button>
        <div className="spacer" />
        <span className="note">
          One model call, then it builds in front of you. About a minute end to end.
        </span>
        <button
          className="btn btn-primary"
          disabled={!ready}
          onClick={() =>
            patch({ runId: useApp.getState().runId + 1, spec: null, blueprint: null, step: 'build' })
          }
        >
          Build my page
        </button>
      </div>
    </div>
  );
}

/** A miniature of the theme, drawn with its own type and colour. */
function ThemePreview({ id, accent }: { id: string; accent: string }) {
  const t = THEMES[id as keyof typeof THEMES];
  const accentHex = ACCENT_HEX[accent as keyof typeof ACCENT_HEX];

  return (
    <div
      className="theme-prev"
      style={{
        background: t.vars['--surface'],
        color: t.vars['--ink'],
        fontFamily: t.vars['--font-display'],
        borderBottomColor: t.vars['--rule'],
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: Number(t.vars['--f-display']),
          letterSpacing: t.vars['--ls-display'],
          lineHeight: t.vars['--lh-display'],
        }}
      >
        Headline here
      </div>
      <div
        style={{
          fontSize: 9,
          color: t.vars['--ink-2'],
          fontFamily: t.vars['--font-body'],
          letterSpacing: 0,
          lineHeight: 1.4,
        }}
      >
        Body copy at reading size, one measure wide.
      </div>
      <div
        style={{
          width: 46,
          height: 13,
          background: accentHex,
          borderRadius: t.vars['--radius'],
          marginTop: 3,
        }}
      />
    </div>
  );
}
