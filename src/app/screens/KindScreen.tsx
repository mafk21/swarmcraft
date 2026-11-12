import { useApp } from '../store';
import { SITE_KINDS, KIND_META, type SiteKind } from '../../lib/spec';
import { defaultSections } from '../../lib/questions';

export default function KindScreen() {
  const { kind, patch, next } = useApp();

  function choose(k: SiteKind) {
    patch({
      kind: k,
      answers: {},
      // pre-tick the default sections for this kind
      chosenSections: defaultSections(k)
        .filter((s) => s.on)
        .map((s) => s.id),
    });
  }

  return (
    <div className="screen">
      <div className="head">
        <h1>What are you making?</h1>
        <p>
          This changes the questions you get, the sections on offer, and the shape of the page. A
          store is not asked what a portfolio is asked.
        </p>
      </div>

      <div className="kinds">
        {SITE_KINDS.map((k) => (
          <button
            key={k}
            className="kind"
            aria-pressed={kind === k}
            onClick={() => choose(k)}
          >
            <strong>{KIND_META[k].label}</strong>
            <span>{KIND_META[k].blurb}</span>
          </button>
        ))}
      </div>

      <div className="bar">
        <span className="note">{kind ? KIND_META[kind].label : 'Nothing selected'}</span>
        <div className="spacer" />
        <button className="btn btn-primary" disabled={!kind} onClick={next}>
          Continue
        </button>
      </div>
    </div>
  );
}
