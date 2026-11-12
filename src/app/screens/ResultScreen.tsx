import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { renderDocument } from '../../lib/render';
import { saveProject } from '../../lib/db';
import { findSlop } from '../../lib/spec';
import Inspector from '../Inspector';

export default function ResultScreen() {
  const { spec, patch, reset, startNew, projectId, saved, kind } = useApp();
  const [note, setNote] = useState<string | null>(null);

  const html = useMemo(() => (spec ? renderDocument(spec) : ''), [spec]);
  const slop = useMemo(() => (spec ? findSlop(spec) : []), [spec]);

  if (!spec) {
    return (
      <div className="busy">
        <p>Nothing was built yet.</p>
        <button className="btn btn-primary" onClick={startNew}>
          Start a site
        </button>
      </div>
    );
  }

  function toast(m: string) {
    setNote(m);
    window.setTimeout(() => setNote((n) => (n === m ? null : n)), 2400);
  }

  async function save() {
    if (!spec) return;
    const id = await saveProject(spec, { id: projectId ?? undefined, kind });
    patch({ projectId: id, saved: true });
    toast('Saved to this browser.');
  }

  async function exportHtml() {
    if (!spec) return;
    const blob = new Blob([html], { type: 'text/html' });
    const name = `${slug(spec.meta.title)}.html`;

    // File System Access where available, download otherwise
    const picker = (
      window as Window & {
        showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker;

    if (picker) {
      try {
        const handle = await picker({
          suggestedName: name,
          types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }],
        });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return;
      } catch {
        /* cancelled */
        return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Downloaded.');
  }

  function openTab() {
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  function rebuild() {
    if (!spec) return;
    // a rebuild re-measures the CURRENT html, so edits show up in the animation
    patch({ spec, runId: useApp.getState().runId + 1, blueprint: null, step: 'build' });
  }

  return (
    <div>
      <div className="result-bar">
        <div className="title">
          {spec.meta.title}
          <span>
            {spec.sections.length} sections · {spec.meta.theme}
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

      {slop.length > 0 && (
        <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--l2)' }}>
          <div className="warn-line">
            <div>
              <strong>{slop.length} phrase{slop.length === 1 ? '' : 's'} to look at.</strong>{' '}
              {[...new Set(slop.map((f) => f.phrase))].slice(0, 4).join(', ')}
              {slop.length > 4 ? '…' : ''} — these read like generic marketing copy. Nothing is
              blocking; edit them if they bother you.
            </div>
          </div>
        </div>
      )}

      <div className="bench">
        <div className="bench-stage">
          <iframe srcDoc={html} title={spec.meta.title} />
        </div>
        <Inspector
          spec={spec}
          onSpec={(next) => patch({ spec: next, saved: false })}
          onToast={toast}
        />
      </div>

      {note && <div className="toast">{note}</div>}
    </div>
  );
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'site'
  );
}
