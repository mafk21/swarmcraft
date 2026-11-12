import { useRef, useState } from 'react';
import { useApp } from '../store';
import { KIND_BRIEFS, type Question } from '../../lib/questions';
import { extractPdf, PdfError } from '../../lib/pdf';

/** A starting point for each kind, so an empty box is not a blank stare. */
const PROMPT_PLACEHOLDER: Record<string, string> = {
  store: 'I sell hand-thrown stoneware from a workshop in Dammam. About 12 pieces, priced SAR 80–300, one-off bowls and mugs. People order by WhatsApp and I ship across the Gulf in 2–3 days. I want a page that shows the pieces and makes it obvious how to buy one.',
  restaurant: 'A small mezze restaurant on the coast road. Lunch and dinner, closed Mondays. Menu changes weekly with whatever the boats bring in. I want the menu, the hours, and a way to book a table for six or more.',
  portfolio: 'I design printed matter — catalogues, wayfinding, the occasional poster. Six years of work, mostly museums and small publishers. I want the projects shown properly and one clear way to email me.',
  landing: 'A one-page site for a tool that migrates warehouse systems. The pitch is: no downtime, the old system stays live until cutover. I want one action — book a 30-minute call.',
  saas: 'A scheduling tool for clinics. Three plans. I want the pricing, what it does, and a signup.',
  agency: 'A four-person studio doing brand and web work. I want the services, three case studies, and a contact form.',
  blog: 'I write about food history. I want a list of posts and an about page.',
  event: 'A one-day conference in Riyadh in March. Eight speakers. I want the schedule, the speakers and a ticket link.',
  docs: 'Reference docs for an internal API. I want it navigable and plain.',
  custom: 'Tell me what you want built and who it is for.',
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
