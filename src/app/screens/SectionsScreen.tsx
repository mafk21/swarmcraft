import { useApp } from '../store';
import { KIND_BRIEFS } from '../../lib/questions';
import { SECTION_LABEL, type SectionType } from '../../lib/spec';

export default function SectionsScreen() {
  const { kind, chosenSections, patch, next, back } = useApp();
  if (!kind) return null;

  const brief = KIND_BRIEFS[kind];

  function toggle(id: SectionType) {
    patch({
      chosenSections: chosenSections.includes(id)
        ? chosenSections.filter((x) => x !== id)
        : [...chosenSections, id],
    });
  }

  const ok = chosenSections.includes('hero') && chosenSections.length >= 3;

  return (
    <div className="screen">
      <div className="head">
        <h1>What goes on the page?</h1>
        <p>
          These are the sections this kind of site usually needs. Untick what you do not want.
          The order is decided when it is built, top to bottom, the way a reader meets it.
        </p>
      </div>

      <div className="stack" style={{ gap: 8, maxWidth: 720 }}>
        {brief.sections.map((s) => {
          const on = chosenSections.includes(s.id);
          const pinned = s.id === 'hero';
          return (
            <label
              key={s.id}
              className="toggle-row"
              style={{
                opacity: pinned ? 0.75 : 1,
                cursor: pinned ? 'default' : 'pointer',
                borderColor: on ? 'var(--l3)' : undefined,
              }}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={pinned}
                onChange={() => toggle(s.id)}
              />
              <div style={{ flex: 1 }}>
                <strong>
                  {s.label}
                  <span className="dim" style={{ fontWeight: 400 }}>
                    {' '}
                    · {SECTION_LABEL[s.id]}
                  </span>
                </strong>
                <p>{s.why}</p>
              </div>
              {pinned && <span className="tiny dim">always</span>}
            </label>
          );
        })}
      </div>

      <div className="bar">
        <button className="btn btn-ghost" onClick={back}>
          Back
        </button>
        <div className="spacer" />
        <span className="note">
          {chosenSections.length} selected{ok ? '' : ' — pick at least three, including a hero'}
        </span>
        <button className="btn btn-primary" disabled={!ok} onClick={next}>
          Continue
        </button>
      </div>
    </div>
  );
}
