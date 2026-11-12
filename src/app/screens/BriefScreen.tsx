import { useRef, useState } from 'react';
import { useApp } from '../store';
import { KIND_BRIEFS, type Question } from '../../lib/questions';
import { extractPdf, PdfError } from '../../lib/pdf';

/**
 * What to type, not what to sell.
 *
 * These used to be miniature sample businesses ("I sell stoneware from a
 * workshop in Dammam"), which is the mock data the app is not supposed to
 * contain — and worse, someone could leave one in and build a page about a
 * pottery that does not exist. They now say what a good brief contains.
 */
const PROMPT_PLACEHOLDER: Record<string, string> = {
  store: 'What you sell, roughly how many things and at what prices, how someone orders, and where you ship. Name the pieces, not the adjectives.',
  restaurant: 'What kind of place, when you are open, what is on the menu, and how someone books a table.',
  portfolio: 'What you make, who you make it for, how many projects you want shown, and how someone should reach you.',
  landing: 'The one thing the page is for, what happens when someone takes that action, and the strongest fact you have to support it.',
  saas: 'What the product does, who it is for, your plans and prices, and how someone signs up.',
  agency: 'The services, who they are for, and the work you can point to by name.',
  blog: 'What you write about, roughly how many posts, and anything a reader should know up front.',
  event: 'What the event is, when and where, who is speaking, and how someone gets a ticket.',
  docs: 'What the documentation covers, who reads it, and the main sections you want.',
  custom: 'What you want built, who it is for, what should be on it, and how someone should get in touch.',
};

export default function BriefScreen() {
  const { kind, answers, setAnswer, next, back, pdf, patch, error } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);

  if (!kind) return null;
  const brief = KIND_BRIEFS[kind];

  /* The flow the user asked for: name it, describe it in one box, optionally
     attach a document. The per-kind questions are still here, behind a
     disclosure — useful when someone wants to be precise, never a wall of
     fields standing between them and the build. */
  const [showDetail, setShowDetail] = useState(false);

  const name = String(answers.name ?? '').trim();
  const nameOk = name.length > 0;

  /* This one box is the brief. It is what the model reads as the description,
     so there is still exactly one request and one place the user's own words
     live — nothing is copied, merged or summarised first. */
  const extra = String(answers.prompt ?? '');
  const descOk = extra.trim().length > 20;
  const ready = nameOk && descOk;

  async function onFile(f: File | undefined) {
    if (!f) return;
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setPdfErr('That is not a PDF.');
      return;
    }
    setPdfBusy(true);
    setPdfErr(null);
    try {
      const ex = await extractPdf(f);
      patch({ pdf: { name: ex.name, pages: ex.pages, chars: ex.chars, text: ex.text } });
    } catch (e) {
      setPdfErr(e instanceof PdfError ? e.message : 'Could not read that file.');
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="screen">
      <div className="head">
        <h1>What should the {brief.kind === 'custom' ? 'site' : brief.kind} say?</h1>
        <p>
          Write the brief in your own words. If you have a menu, a price list, a deck or an old
          site as a PDF, add it on the right and its text is used too. Everything you give here
          is the only material the model may use — it will not invent facts you did not give it.
        </p>
      </div>

      <div className="two">
        <div className="stack" style={{ gap: 22 }}>
          <Field label={brief.nameQ} hint={brief.nameHint} required>
            <input
              className="input"
              value={String(answers.name ?? '')}
              onChange={(e) => setAnswer('name', e.target.value)}
              placeholder="Two to four words"
              maxLength={70}
            />
          </Field>

          {/* the box the user asked for: their whole brief, in their words */}
          <Field
            label={`Describe the ${brief.kind} you want`}
            hint="This is the brief. Write it the way you would explain it to a designer — what it is, who it is for, what it sells or says, what should be on it. Everything here is used; nothing is invented beyond it."
            required
          >
            <textarea
              className="textarea prompt-box"
              rows={10}
              value={extra}
              onChange={(e) => {
                setAnswer('prompt', e.target.value);
                // the model reads `description`; keep the two the same thing
                setAnswer('description', e.target.value);
              }}
              placeholder={PROMPT_PLACEHOLDER[brief.kind] ?? 'What is it, who is it for, and what should be on the page?'}
              maxLength={6000}
            />
            <p className="hint">{extra.trim().length} / 6000 · {extra.trim().split(/\s+/).filter(Boolean).length} words</p>
          </Field>

          <div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowDetail((v) => !v)}
              aria-expanded={showDetail}
            >
              {showDetail ? 'Hide the detailed questions' : 'Answer a few detailed questions instead (optional)'}
            </button>
          </div>

          {showDetail && (
            <div className="stack" style={{ gap: 22 }}>
              <p className="tiny dim" style={{ margin: 0, lineHeight: 1.6 }}>
                These are optional. Anything you leave blank is left out rather than filled in
                with a guess.
              </p>
              {brief.questions.map((q) => (
                <QuestionField
                  key={q.id}
                  q={q}
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                />
              ))}
            </div>
          )}

          {error && (
            <div className="err">
              <div>
                <strong>That did not work</strong>
                {error}
              </div>
            </div>
          )}
        </div>

        <aside className="stack">
          <div className="panel">
            <div className="panel-head">Add a document (optional)</div>
            <div className="panel-body stack">
              {pdf ? (
                <div className="pdf-done">
                  <span className="truncate">{pdf.name}</span>
                  <span className="dim">· {pdf.pages}p</span>
                  <button onClick={() => patch({ pdf: null })}>remove</button>
                </div>
              ) : (
                <>
                  <div
                    className={`drop${over ? ' over' : ''}`}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(true);
                    }}
                    onDragLeave={() => setOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setOver(false);
                      onFile(e.dataTransfer.files[0]);
                    }}
                  >
                    {pdfBusy ? (
                      'Reading…'
                    ) : (
                      <>
                        <strong>Drop a PDF</strong> or click to choose one
                      </>
                    )}
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    onChange={(e) => onFile(e.target.files?.[0])}
                  />
                  <p className="hint" style={{ margin: 0 }}>
                    PDF for now. A menu, a price list, a deck, an old site exported to PDF. The text
                    is pulled out in this tab by pdf.js — the file never leaves your machine and is
                    never sent to Google as a file. Only the extracted words go into the brief.
                  </p>
                </>
              )}

              {pdfErr && <p className="hint" style={{ color: 'var(--t0)' }}>{pdfErr}</p>}
              {pdf && (
                <p className="hint" style={{ margin: 0 }}>
                  {pdf.chars.toLocaleString()} characters of real text will be used as source
                  material.
                </p>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">What happens next</div>
            <div className="panel-body">
              <p className="tiny dim" style={{ margin: 0, lineHeight: 1.65 }}>
                Then you pick which sections the page gets and a theme, and the swarm builds it.
                Nothing is generated, and no key is spent, until you press build.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <div className="bar">
        <button className="btn btn-ghost" onClick={back}>
          Back
        </button>
        <div className="spacer" />
        <span className="note">
          {ready ? 'Ready' : 'Fill the required answers to continue'}
        </span>
        <button className="btn btn-primary" disabled={!ready} onClick={next}>
          Continue
        </button>
      </div>
    </div>
  );
}

/* ── field primitives ────────────────────────────────────────────────────── */

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>
        {label} {required && <span className="req">required</span>}
      </label>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </div>
  );
}

function QuestionField({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: string | string[] | boolean | undefined;
  onChange: (v: string | string[] | boolean) => void;
}) {
  if (q.kind === 'text') {
    return (
      <Field label={q.label} hint={q.hint} required={q.required}>
        <input
          className="input"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          maxLength={q.max ?? 300}
        />
      </Field>
    );
  }

  if (q.kind === 'long') {
    return (
      <Field label={q.label} hint={q.hint}>
        <textarea
          className="textarea"
          rows={4}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          maxLength={1200}
        />
      </Field>
    );
  }

  if (q.kind === 'choice') {
    return (
      <Field label={q.label} required={q.required}>
        <div className="choices">
          {q.options.map((o) => (
            <button
              key={o}
              className="choice"
              aria-pressed={value === o}
              onClick={() => onChange(o)}
              type="button"
            >
              {o}
            </button>
          ))}
        </div>
      </Field>
    );
  }

  if (q.kind === 'multi') {
    const picked = (value as string[] | undefined) ?? [];
    return (
      <Field label={q.label} hint={q.hint}>
        <div className="choices">
          {q.options.map((o) => (
            <button
              key={o.id}
              className="choice"
              aria-pressed={picked.includes(o.id)}
              type="button"
              onClick={() =>
                onChange(
                  picked.includes(o.id) ? picked.filter((x) => x !== o.id) : [...picked, o.id]
                )
              }
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>
    );
  }

  if (q.kind !== 'toggle') return null;

  return (
    <label className="toggle-row">
      <input
        type="checkbox"
        checked={value === undefined ? !!q.default : !!value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div>
        <strong>{q.label}</strong>
        {q.hint && <p>{q.hint}</p>}
      </div>
    </label>
  );
}
