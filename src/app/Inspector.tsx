/* ============================================================================
   The inspector. Every change goes through editSectionField(), so the spec is
   schema-valid after each keystroke — a field that would break the schema keeps
   its old value rather than corrupting the site.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import type { Section, SectionType, SiteSpec, ThemeId } from '../lib/spec';
import {
  editSectionField,
  editMeta,
  moveSection,
  removeSection,
  duplicateSection,
  SECTION_LABEL,
  ACCENTS,
  THEME_IDS,
  type FieldPath,
} from '../lib/spec';
import { THEMES, ACCENT_HEX } from '../lib/themes';
import { SECTION_FIELDS, sectionSummary, type FieldSpec, type OField } from './editors';
import { newSection } from '../lib/presets';
import {
  historyOf,
  commit as commitHistory,
  undo as undoHistory,
  redo as redoHistory,
  canUndo,
  canRedo,
  reset as resetHistory,
} from '../lib/history';
import { renderDocument } from '../lib/render';
import { addMedia, getMedia } from '../lib/db';

type Tab = 'content' | 'design';

export type InspectorProps = {
  spec: SiteSpec;
  onSpec: (s: SiteSpec) => void;
  onToast: (m: string) => void;
  /** section index to expand, set by clicking the preview */
  focus?: { index: number; nonce: number } | null;
};

export default function Inspector({ spec, onSpec, onToast, focus }: InspectorProps) {
  const [tab, setTab] = useState<Tab>('content');
  const [open, setOpen] = useState<number | null>(0);

  /* ── undo ─────────────────────────────────────────────────────────────────
     One history of whole specs. The present is the spec on screen; every edit
     goes through `edit()` so there is exactly one path into it and no way to
     change the page without leaving a step behind.

     A spec arriving from outside — a build finishing, another site opened, a
     theme applied from the design tab — is a RESET, not an edit: undo must not
     walk back into a different site. */
  const [hist, setHist] = useState(() => historyOf(spec, Date.now()));
  const shown = hist.present;

  useEffect(() => {
    setHist((h) => resetHistory(h, spec, Date.now()));
  }, [spec]);

  function edit(next: SiteSpec, key: string) {
    setHist((h) => {
      const done = commitHistory(h, next, key, Date.now());
      /* the committed present is what the rest of the app must see: onSpec
         writes it back to the store, which is where the preview reads from */
      if (done !== h) onSpec(done.present);
      return done;
    });
  }

  /* Ctrl/Cmd+Z and Shift+Z, but only while the caret is inside the inspector.
     A global handler would eat undo in the key field and the brief box. */
  const rootRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (!rootRef.current?.contains(el)) return;
      /* a text field inside the inspector has its own browser undo for the
         caret; ours is for the spec, which is the thing that can be lost */
      e.preventDefault();
      if (e.shiftKey) redoNow();
      else undoNow();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function undoNow() {
    setHist((h) => {
      const back = undoHistory(h, Date.now());
      if (back !== h) {
        onSpec(back.present);
        onToast('Undone.');
      }
      return back;
    });
  }

  function redoNow() {
    setHist((h) => {
      const fwd = redoHistory(h, Date.now());
      if (fwd !== h) {
        onSpec(fwd.present);
        onToast('Redone.');
      }
      return fwd;
    });
  }

  // clicking a section in the preview opens its card
  const lastNonce = useRef<number>(-1);
  useEffect(() => {
    if (!focus || focus.nonce === lastNonce.current) return;
    lastNonce.current = focus.nonce;
    setTab('content');
    setOpen(focus.index);
  }, [focus]);

  /* ── field plumbing ──────────────────────────────────────────────────── */

  function setField(idx: number, path: FieldPath, value: unknown) {
    const { spec: next, rejected } = editSectionField(spec, idx, path, value);
    if (rejected) {
      onToast('That value is not allowed there — kept the previous one.');
      return;
    }
    edit(next, `field:${idx}:${path.join('.')}`);
  }

  function setMeta(path: FieldPath, value: unknown) {
    const { spec: next, rejected } = editMeta(spec, path, value);
    if (rejected) {
      onToast('That value is not allowed there — kept the previous one.');
      return;
    }
    edit(next, `meta:${path.join('.')}`);
  }

  function addSection(type: SectionType) {
    if (spec.sections.length >= 9) return;
    edit({ ...spec, sections: [...spec.sections, newSection(type)] }, `add:${type}`);
    setOpen(spec.sections.length);
    onToast(`Added ${SECTION_LABEL[type].toLowerCase()}.`);
  }

  const unused = (Object.keys(SECTION_FIELDS) as SectionType[]).filter(
    (t) => !shown.sections.some((s) => s.type === t) && t !== 'hero'
  );

  return (
    <aside className="inspector" ref={rootRef}>
      <div className="inspector-head">
        <strong>Edit</strong>
        <div className="undo-group">
          <button
            className="undo-btn"
            onClick={undoNow}
            disabled={!canUndo(hist)}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            className="undo-btn"
            onClick={redoNow}
            disabled={!canRedo(hist)}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            ↷
          </button>
        </div>
        <div className="tabs" role="tablist">
          <button
            className="tab"
            role="tab"
            aria-selected={tab === 'content'}
            onClick={() => setTab('content')}
          >
            Content
          </button>
          <button
            className="tab"
            role="tab"
            aria-selected={tab === 'design'}
            onClick={() => setTab('design')}
          >
            Design
          </button>
        </div>
      </div>

      <div className="inspector-body">
        {tab === 'content' ? (
          <>
            {shown.sections.map((section, idx) => (
              <SectionCard
                key={idx}
                idx={idx}
                section={section}
                isOpen={open === idx}
                onToggle={() => setOpen(open === idx ? null : idx)}
                onSet={setField}
                onMove={(delta) => edit(moveSection(spec, idx, delta), `move:${idx}:${Date.now()}`)}
                onRemove={() => {
                  const n = removeSection(spec, idx);
                  if (n) {
                    edit(n, `remove:${Date.now()}`);
                    onToast('Section removed.');
                  } else {
                    onToast('That section is structural — it stays.');
                  }
                }}
                onDuplicate={() => {
                  const n = duplicateSection(spec, idx);
                  if (n) {
                    edit(n, `dup:${Date.now()}`);
                    onToast('Section duplicated.');
                  } else {
                    onToast('Nine sections is the limit, or the hero cannot be copied.');
                  }
                }}
                last={idx === shown.sections.length - 1}
              />
            ))}

            {unused.length > 0 && spec.sections.length < 9 && (
              <div className="insp-actions">
                <span className="tiny dim">Add a section</span>
                <div className="choices">
                  {unused.map((t) => (
                    <button key={t} className="choice" onClick={() => addSection(t)}>
                      {SECTION_LABEL[t]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <DesignTab spec={spec} setMeta={setMeta} onSpec={onSpec} />
        )}
      </div>
    </aside>
  );
}

/* ── one section ─────────────────────────────────────────────────────────── */

function SectionCard({
  idx,
  section,
  isOpen,
  onToggle,
  onSet,
  onMove,
  onRemove,
  onDuplicate,
  last,
}: {
  idx: number;
  section: Section;
  isOpen: boolean;
  onToggle: () => void;
  onSet: (idx: number, path: FieldPath, v: unknown) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  last: boolean;
}) {
  const fields = SECTION_FIELDS[section.type];

  return (
    <div className="sec-card">
      <div className="sec-card-head">
        <button className="icon-btn" onClick={() => onMove(-1)} disabled={idx === 0} title="Move up">
          ↑
        </button>
        <button
          className="icon-btn"
          onClick={() => onMove(1)}
          disabled={last}
          title="Move down"
        >
          ↓
        </button>
        <strong style={{ cursor: 'pointer' }} onClick={onToggle}>
          {SECTION_LABEL[section.type]}
          <span style={{ textTransform: 'none', color: 'var(--t3)', fontWeight: 400 }}>
            {' '}
            · {sectionSummary(section)}
          </span>
        </strong>
        <button className="icon-btn" onClick={onDuplicate} title="Duplicate">
          ⧉
        </button>
        <button className="icon-btn" onClick={onRemove} title="Remove">
          ×
        </button>
        <button className="icon-btn" onClick={onToggle} title={isOpen ? 'Collapse' : 'Expand'}>
          {isOpen ? '−' : '+'}
        </button>
      </div>

      {isOpen && (
        <div className="sec-card-body">
          {fields.map((f) => (
            <FieldEditor
              key={f.key}
              field={f}
              value={(section as unknown as Record<string, unknown>)[f.key]}
              onChange={(v) => onSet(idx, [f.key], v)}
              sectionIndex={idx}
              onSetPath={onSet}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── generic field editor ────────────────────────────────────────────────── */

function FieldEditor({
  field,
  value,
  onChange,
  sectionIndex,
  onSetPath,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  sectionIndex: number;
  onSetPath: (idx: number, path: FieldPath, v: unknown) => void;
}) {
  if (field.kind === 'text') {
    return (
      <label className="edit-field">
        <span>{field.label}</span>
        <input
          className="input"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  if (field.kind === 'long') {
    return (
      <label className="edit-field">
        <span>{field.label}</span>
        <textarea
          className="textarea"
          rows={3}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
        {field.hint && <span className="tiny dim">{field.hint}</span>}
      </label>
    );
  }

  if (field.kind === 'image') {
    return (
      <ImageField
        label={field.label}
        hint={field.hint}
        value={value as { src: string; alt?: string } | undefined}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'select') {
    return (
      <label className="edit-field">
        <span>{field.label}</span>
        <select
          className="select"
          value={typeof value === 'string' ? value : field.options[0]?.value}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.kind === 'list') {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="edit-field">
        <span>
          {field.label}
          {field.hint ? ` · ${field.hint}` : ''}
        </span>
        {list.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 4 }}>
            <input
              className="input"
              value={item}
              onChange={(e) => {
                const next = [...list];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <button
              className="icon-btn"
              onClick={() => onChange(list.filter((_, k) => k !== i))}
              title="Remove"
              disabled={list.length <= 1}
            >
              ×
            </button>
          </div>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={() => onChange([...list, ''])}>
          Add a line
        </button>
      </div>
    );
  }

  /* objs and groups: array of objects, edited in place */
  if (field.kind !== 'objs' && field.kind !== 'groups') return null;
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

  return (
    <div className="edit-field">
      <span>
        {field.label}
        {field.hint ? ` · ${field.hint}` : ''}
      </span>
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            border: '1px solid var(--l2)',
            borderRadius: 'var(--r1)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'var(--s1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="tiny dim" style={{ flex: 1 }}>
              {i + 1}
            </span>
            <button
              className="icon-btn"
              title="Remove"
              onClick={() => onChange(rows.filter((_, k) => k !== i))}
            >
              ×
            </button>
          </div>
          {field.fields.map((f) => (
            <OFieldEditor
              key={f.key}
              field={f}
              value={row[f.key]}
              onChange={(v) => {
                const next = rows.map((r, k) => (k === i ? { ...r, [f.key]: v } : r));
                onSetPath(sectionIndex, [field.key], next);
              }}
            />
          ))}
        </div>
      ))}
      <button
        className="btn btn-sm btn-ghost"
        onClick={() => onChange([...rows, blankRow(field.fields)])}
      >
        Add one
      </button>
    </div>
  );
}

function OFieldEditor({
  field,
  value,
  onChange,
}: {
  field: OField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.kind === 'image') {
    return (
      <ImageField
        label={field.label}
        value={value as { src: string; alt?: string } | undefined}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'span') {
    return (
      <label className="edit-field">
        <span>{field.label}</span>
        <select
          className="select"
          value={typeof value === 'string' ? value : 'normal'}
          onChange={(e) => onChange(e.target.value === 'normal' ? undefined : e.target.value)}
        >
          <option value="normal">Normal</option>
          <option value="wide">Wide — two columns</option>
          <option value="tall">Tall — two rows</option>
        </select>
      </label>
    );
  }

  if (field.kind === 'list') {
    const list = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div className="edit-field">
        <span>{field.label}</span>
        {list.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 4 }}>
            <input
              className="input"
              value={item}
              onChange={(e) => {
                const next = [...list];
                next[i] = e.target.value;
                onChange(next);
              }}
            />
            <button
              className="icon-btn"
              onClick={() => onChange(list.filter((_, k) => k !== i))}
              disabled={list.length <= 1}
            >
              ×
            </button>
          </div>
        ))}
        <button className="btn btn-sm btn-ghost" onClick={() => onChange([...list, ''])}>
          Add a line
        </button>
      </div>
    );
  }

  if (field.kind === 'long') {
    return (
      <label className="edit-field">
        <span>{field.label}</span>
        <textarea
          className="textarea"
          rows={2}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  return (
    <label className="edit-field">
      <span>{field.label}</span>
      <input
        className="input"
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/**
 * Bring a photograph in. It is read, measured and stored in IndexedDB on this
 * machine; the spec only ever holds `media:<id>`. Nothing is uploaded.
 */
function ImageField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: { src: string; alt?: string } | undefined;
  onChange: (v: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const src = value?.src ?? '';

  useEffect(() => {
    let alive = true;
    if (!src.startsWith('media:')) {
      setPreview(null);
      return;
    }
    getMedia(src.slice(6))
      .then((row) => {
        if (alive) setPreview(row?.data ?? null);
      })
      .catch(() => {
        /* storage unavailable: show the placeholder rather than throw inside a
           component's effect, which would take the whole editor down */
        if (alive) setPreview(null);
      });
    return () => {
      alive = false;
    };
  }, [src]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const row = await addMedia(file);
      onChange({ src: `media:${row.id}`, alt: value?.alt ?? '' });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not use that file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="edit-field">
      <span>
        {label}
        {hint ? ` · ${hint}` : ''}
      </span>

      {src ? (
        <div className="img-pick">
          <div className="img-thumb">{preview && <img src={preview} alt="" />}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              className="input"
              placeholder="Describe the picture"
              value={value?.alt ?? ''}
              onChange={(e) => onChange({ src, alt: e.target.value })}
            />
            <button
              className="btn btn-sm btn-ghost"
              style={{ marginTop: 6 }}
              onClick={() => onChange(undefined)}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          className="btn btn-sm btn-ghost"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? 'Reading…' : 'Choose a picture'}
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {err && <span className="tiny dim">{err}</span>}
    </div>
  );
}

function blankRow(fields: OField[]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of fields) {
    row[f.key] = f.kind === 'list' ? [''] : '';
  }
  return row;
}

/* ── design tab ──────────────────────────────────────────────────────────── */

function DesignTab({
  spec,
  setMeta,
  onSpec,
}: {
  spec: SiteSpec;
  setMeta: (path: FieldPath, v: unknown) => void;
  onSpec: (s: SiteSpec) => void;
}) {
  return (
    <>
      <label className="edit-field">
        <span>Site title</span>
        <input
          className="input"
          value={spec.meta.title}
          onChange={(e) => setMeta(['meta', 'title'], e.target.value)}
        />
      </label>

      <label className="edit-field">
        <span>Description</span>
        <textarea
          className="textarea"
          rows={3}
          value={spec.meta.description}
          onChange={(e) => setMeta(['meta', 'description'], e.target.value)}
        />
      </label>

      <div className="edit-field">
        <span>Themes</span>
        <div className="choices">
          {(THEME_IDS as readonly ThemeId[]).map((id) => {
            const t = THEMES[id];
            const on = spec.meta.theme === id;
            return (
              <button
                key={id}
                className="choice"
                aria-pressed={on}
                onClick={() => {
                  const { spec: next, rejected } = editMeta(spec, ['meta', 'theme'], id);
                  if (!rejected) onSpec(next);
                }}
                style={{ fontFamily: t.vars['--font-display'] }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="edit-field">
        <span>Accent</span>
        <div className="color-row">
          {ACCENTS.map((a) => (
            <button
              key={a}
              className="swatch-btn"
              aria-pressed={spec.meta.accent === a}
              title={a}
              style={{ background: ACCENT_HEX[a] }}
              onClick={() => {
                const { spec: next, rejected } = editMeta(spec, ['meta', 'accent'], a);
                if (!rejected) onSpec(next);
              }}
            />
          ))}
        </div>
      </div>

      <div className="edit-field">
        <span>Live preview</span>
        <ThemeFrame spec={spec} />
      </div>

      <label className="edit-field">
        <span>Brand</span>
        <input
          className="input"
          value={spec.nav.brand}
          onChange={(e) => setMeta(['nav', 'brand'], e.target.value)}
        />
      </label>

      <div className="edit-field">
        <span>Nav links</span>
        {spec.nav.links.map((l, i) => (
          <div key={i} className="row-fields">
            <input
              className="input"
              value={l.label}
              onChange={(e) => {
                const links = spec.nav.links.map((x, k) =>
                  k === i ? { ...x, label: e.target.value } : x
                );
                setMeta(['nav', 'links'], links);
              }}
            />
            <input
              className="input"
              value={l.href}
              onChange={(e) => {
                const links = spec.nav.links.map((x, k) =>
                  k === i ? { ...x, href: e.target.value } : x
                );
                setMeta(['nav', 'links'], links);
              }}
            />
          </div>
        ))}
        {spec.nav.links.length < 6 && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() =>
              setMeta(['nav', 'links'], [...spec.nav.links, { label: 'Link', href: '#' }])
            }
          >
            Add a link
          </button>
        )}
      </div>

      <label className="edit-field">
        <span>Footer note</span>
        <input
          className="input"
          value={spec.footer.note}
          onChange={(e) => setMeta(['footer', 'note'], e.target.value)}
        />
      </label>
    </>
  );
}

/** A small iframe showing the theme actually applied to the page. */
function ThemeFrame({ spec }: { spec: SiteSpec }) {
  return (
    <iframe
      className="mini-iframe"
      srcDoc={renderDocument(spec, { capture: true })}
      title="Theme preview"
      sandbox=""
    />
  );
}
