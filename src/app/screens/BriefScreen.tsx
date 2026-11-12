import { useRef, useState } from 'react';
import { useApp } from '../store';
import { KIND_BRIEFS, type Question } from '../../lib/questions';
import { extractPdf, PdfError } from '../../lib/pdf';

export default function BriefScreen() {
  const { kind, answers, setAnswer, next, back, pdf, patch, error } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState<string | null>(null);

  if (!kind) return null;
  const brief = KIND_BRIEFS[kind];

  const nameOk = String(answers.name ?? '').trim().length > 0;
  const descOk = String(answers.description ?? '').trim().length > 20;

  const requiredDone = brief.questions.every(
    (q) => !('required' in q && q.required) || hasValue(answers[q.id])
  );

  const ready = nameOk && descOk && requiredDone;

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
        <h1>A few questions about the {brief.kind}</h1>
        <p>
          Short answers are fine. Everything you write here is the only material the model is
          allowed to use — it will not invent facts you did not give it.
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

          <Field
            label={brief.descriptionQ}
            hint={brief.descriptionHint}
            required
          >
            <textarea
              className="textarea"
              rows={3}
              value={String(answers.description ?? '')}
              onChange={(e) => setAnswer('description', e.target.value)}
              placeholder={brief.descriptionPlaceholder}
              maxLength={700}
            />
            <p className="hint">{String(answers.description ?? '').trim().length} / 700</p>
          </Field>

          {brief.questions.map((q) => (
            <QuestionField
              key={q.id}
              q={q}
              value={answers[q.id]}
              onChange={(v) => setAnswer(q.id, v)}
            />
          ))}

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
            <div className="panel-head">Existing document</div>
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
                    A menu, a price list, a deck, an old site exported to PDF. Text is pulled out in
                    this tab. Nothing is uploaded.
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
                You will pick which sections the page gets, then a theme. Then the swarm builds it.
                Nothing is generated until you press build.
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

function hasValue(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'boolean') return true;
  return false;
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
