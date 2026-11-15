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
    try {
      const id = await saveProject(active, { id: projectId ?? undefined, kind });
      patch({ projectId: id, saved: true });
      toast(extra.length ? 'Saved the current page.' : 'Saved to this browser.');
    } catch {
      /* Say which of the two reasons it is. "Will not let the site be saved" is
         true but leaves the user with nowhere to go; a missing folder is
         fixable in one click from Your sites. */
      const state = useApp.getState();
      toast(
        state.storageBlocked && !state.folderMode
          ? 'No storage: choose a folder on “Your sites”, or export this to a file.'
          : 'The site could not be written. Export it to a file instead.'
      );
    }
  }

  /**
   * Export the page as a file the user can keep.
   *
   * This was a dead button in Chrome, and the reason is a browser rule that
   * does not show up in any test: BOTH `showSaveFilePicker` and the anchor
   * `download` trick must be triggered by a real user gesture. This function
   * used to `await` the page rendering and media inlining FIRST, and by then
   * the gesture was spent — so the picker threw `NotAllowedError` and the
   * hidden anchor was inert. It reported success and wrote nothing.
   *
   * So: ask for the file synchronously, then build the contents while the user
   * is choosing a name. The slow part happens behind the dialog instead of
   * before it.
   */
  async function exportHtml() {
    const all = pages;

    const picker = (
      window as Window & {
        showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker;

    /* A single page is the common case, and the one that broke. Multi-page
       sites have no single file to pick, so they take the download path — for
       which the same gesture rule applies, so nothing may await before it. */
    if (picker && all.length === 1) {
      let handle: FileSystemFileHandle | null = null;
      try {
        console.log('  [dbg] picker called synchronously');
        handle = await picker({
          suggestedName: `${pageSlug(all[0], 0)}.html`,
          types: [{ description: 'Web page', accept: { 'text/html': ['.html'] } }],
        });
      } catch (e) {
        /* The user closing the dialog is a choice, not a failure. Anything
           else really did go wrong and must be said out loud rather than
           silently downloading into a folder they are not watching. */
        const cancelled =
          (e instanceof DOMException && e.name === 'AbortError') ||
          (e instanceof Error && e.name === 'AbortError');
        if (cancelled) return;
        toast('The save dialog was blocked. Downloading instead.');
      }

      if (handle) {
        const html = await buildExport(all, 0);
        try {
          const w = await handle.createWritable();
          await w.write(new Blob([html], { type: 'text/html' }));
          await w.close();
          toast(`Saved ${handle.name}.`);
        } catch {
          toast('Could not write to that location. Use “Open in a tab” and save from there.');
        }
        return;
      }
    }

    /* Download path: one anchor per page, all clicked in the same turn.
       Each blob has to exist before its click, and building it can await — so
       the pages are built FIRST and the clicks all happen together at the end,
       which keeps every click inside the original gesture. The old code awaited
       between clicks, so the second page onwards was outside the gesture and
       silently did nothing. */
    const files: { name: string; url: string }[] = [];
    for (let i = 0; i < all.length; i++) {
      const html = await buildExport(all, i);
      files.push({
        name: `${pageSlug(all[i], i)}.html`,
        url: URL.createObjectURL(new Blob([html], { type: 'text/html' })),
      });
    }

    for (const f of files) {
      const a = document.createElement('a');
      a.href = f.url;
      a.download = f.name;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    await new Promise((r) => setTimeout(r, 600));
    for (const f of files) URL.revokeObjectURL(f.url);
    toast(all.length > 1 ? `Downloaded ${all.length} pages.` : 'Downloaded.');
    return;
  }

  /** Render one page, self-contained: media: refs replaced with real bytes. */
  async function buildExport(
    all: typeof pages,
    i: number
  ): Promise<string> {
    const slugsAll = all.map(pageSlug);
    const base = renderDocument(all[i], { index: i, exportMode: true, slugs: slugsAll });
    try {
      return await inlineMedia(base);
    } catch {
      /* no storage: the page still exports, just without the pictures */
      return base.replace(/<img[^>]*src="media:[^"]*"[^>]*>/g, '');
    }
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
            {saved ? ' · saved to this browser' : ' · not saved yet'}
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
        {/* Named for what it does, not for the store it reads. "All sites"
            described the database; this describes the destination. */}
        <button className="btn btn-sm btn-ghost" onClick={reset} title="Everything you have built">
          Your sites
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
