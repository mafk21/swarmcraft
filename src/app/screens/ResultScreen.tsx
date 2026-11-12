import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { renderDocument } from '../../lib/render';
import { saveProject, inlineMedia } from '../../lib/db';
import {
  findSlop,
  newPage,
  pageSlug,
  siteTitle,
  type SiteSpec,
} from '../../lib/spec';
import Inspector from '../Inspector';

export default function ResultScreen() {
  const { spec, patch, reset, startNew, projectId, saved, kind } = useApp();
  const [note, setNote] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ index: number; nonce: number } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);

  /* pages live beside the spec; page 0 is what `spec` holds */
  const [extra, setExtra] = useState<SiteSpec[]>([]);
  const [current, setCurrent] = useState(0);

  const pages = useMemo(() => (spec ? [spec, ...extra] : []), [spec, extra]);
  const active = pages[current] ?? spec;

  const html = useMemo(
    () => (active ? renderDocument(active, { index: current }) : ''),
    [active, current]
  );
  const slop = useMemo(() => (active ? findSlop(active) : []), [active]);

  /* ── keep the preview in sync with edits ──────────────────────────────── */

  useEffect(() => {
    const f = frameRef.current;
    if (!f || !html) return;
    // srcDoc replaces the document; do it imperatively so scroll position of
    // the app itself is not disturbed on every keystroke
    f.srcdoc = html;
  }, [html]);

  /* ── click a section in the preview to edit it ────────────────────────── */

  const onFrameLoad = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    doc.body.style.cursor = 'default';
    doc.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('[data-sec]');
      // let real links work
      const link = (e.target as HTMLElement).closest('a');
      if (link) return;
      if (!el) return;
      e.preventDefault();
      const idx = Number(el.getAttribute('data-sec'));
      if (Number.isFinite(idx)) setFocus({ index: idx, nonce: Date.now() });
    });
  }, []);

  function toast(m: string) {
    setNote(m);
    window.setTimeout(() => setNote((n) => (n === m ? null : n)), 2400);
  }

  if (!spec || !active) {
    return (
      <div className="busy">
        <p>Nothing was built yet.</p>
        <button className="btn btn-primary" onClick={startNew}>
          Start a site
        </button>
      </div>
    );
  }

  /* ── editing ──────────────────────────────────────────────────────────── */

  function setActive(next: SiteSpec) {
    if (current === 0) {
      patch({ spec: next, saved: false });
    } else {
      setExtra((xs) => xs.map((x, i) => (i === current - 1 ? next : x)));
    }
  }

  function addPage() {
    const title = window.prompt('What is this page called?', 'About');
    if (!title) return;
    const page = newPage(active, title.trim());
    setExtra((xs) => [...xs, page]);
    setCurrent(pages.length);
    toast(`Added "${title.trim()}".`);
  }

  function removePage(i: number) {
    if (i === 0) return toast('The home page stays.');
    setExtra((xs) => xs.filter((_, k) => k !== i - 1));
    setCurrent(0);
    toast('Page removed.');
  }

  /* ── saving and export ────────────────────────────────────────────────── */

  async function save() {
    const id = await saveProject(active, { id: projectId ?? undefined, kind });
    patch({ projectId: id, saved: true });
    toast(extra.length ? 'Saved the current page.' : 'Saved to this browser.');
  }

  async function exportHtml() {
    const all = pages;

    // self-contained: swap media:<id> for the real bytes
    const files = await Promise.all(
      all.map(async (p, i) => {
        const withMedia = await inlineMedia(
          renderDocument(p, { index: i, exportMode: true, slugs: all.map(pageSlug) })
        );
        return { name: `${pageSlug(p, i)}.html`, html: withMedia };
      })
    );

    const single = files.length === 1;

    const picker = (
      window as Window & {
        showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker;

    if (picker && single) {
      try {
        const handle = await picker({
          suggestedName: files[0].name,
          types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }],
        });
        const w = await handle.createWritable();
        await w.write(new Blob([files[0].html], { type: 'text/html' }));
        await w.close();
        return;
      } catch {
        return;
      }
    }

    // several pages, or no File System Access: download each file
    for (const f of files) {
      const url = URL.createObjectURL(new Blob([f.html], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = f.name;
      a.click();
      await new Promise((r) => setTimeout(r, 260));
      URL.revokeObjectURL(url);
    }
    toast(files.length > 1 ? `Downloaded ${files.length} pages.` : 'Downloaded.');
  }

  function openTab() {
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  function rebuild() {
    patch({ spec, runId: useApp.getState().runId + 1, blueprint: null, step: 'build' });
  }

  return (
    <div>
      <div className="result-bar">
        <div className="title">
          {siteTitle({ pages, current })}
          <span>
            {pages.length} page{pages.length === 1 ? '' : 's'} · {active.sections.length} sections ·{' '}
            {active.meta.theme}
            {saved ? ' · saved' : ' · not saved'}
          </span>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={rebuild}>
          Replay build
        </button>
        <button className="btn btn-sm btn-ghost" onClick={openTab}>
          Open in a tab
        </button>
        <button className="btn btn-sm" onClick={save}>
          {saved ? 'Save changes' : 'Save'}
        </button>
        <button className="btn btn-sm btn-primary" onClick={exportHtml}>
          Export HTML
        </button>
        <button className="btn btn-sm btn-ghost" onClick={startNew}>
          New site
        </button>
        <button className="btn btn-sm btn-ghost" onClick={reset}>
          All sites
        </button>
      </div>

      <div className="page-tabs">
        {pages.map((p, i) => (
          <div key={i} className={`page-tab${i === current ? ' on' : ''}`}>
            <button onClick={() => setCurrent(i)}>{p.meta.title}</button>
            {i > 0 && (
              <button className="page-x" title="Remove page" onClick={() => removePage(i)}>
                ×
              </button>
            )}
          </div>
        ))}
        {pages.length < 6 && (
          <button className="page-add" onClick={addPage} title="Add a page">
            + Page
          </button>
        )}
      </div>

      {slop.length > 0 && (
        <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--l2)' }}>
          <div className="warn-line">
            <div>
              <strong>{slop.length} phrase{slop.length === 1 ? '' : 's'} to look at.</strong>{' '}
              {[...new Set(slop.map((f) => f.phrase))].slice(0, 4).join(', ')}
              {slop.length > 4 ? '…' : ''} — nothing is blocking; edit them if they bother you.
            </div>
          </div>
        </div>
      )}

      <div className="bench">
        <div className="bench-stage">
          <iframe
            ref={frameRef}
            title={active.meta.title}
            onLoad={onFrameLoad}
            sandbox="allow-same-origin"
          />
        </div>
        <Inspector
          spec={active}
          onSpec={setActive}
          onToast={toast}
          focus={focus}
        />
      </div>

      {note && <div className="toast">{note}</div>}
    </div>
  );
}
