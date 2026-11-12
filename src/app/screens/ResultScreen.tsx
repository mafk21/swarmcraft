import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { renderDocument } from '../../lib/render';
import { saveProject } from '../../lib/db';

export default function ResultScreen() {
  const { spec, reset } = useApp();
  const [note, setNote] = useState<string | null>(null);

  const html = useMemo(() => (spec ? renderDocument(spec) : ''), [spec]);

  if (!spec) {
    return (
      <div className="busy">
        <p>Nothing was built yet.</p>
        <button className="btn btn-primary" onClick={reset}>
          Start over
        </button>
      </div>
    );
  }

  async function save() {
    if (!spec) return;
    await saveProject(spec);
    setNote('Saved to this browser.');
    setTimeout(() => setNote(null), 2600);
  }

  async function exportHtml() {
    if (!spec) return;
    const blob = new Blob([html], { type: 'text/html' });

    // File System Access where available, download otherwise
    const picker = (
      window as Window & {
        showSaveFilePicker?: (o: unknown) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker;

    if (picker) {
      try {
        const handle = await picker({
          suggestedName: `${slug(spec.meta.title)}.html`,
          types: [{ description: 'HTML', accept: { 'text/html': ['.html'] } }],
        });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return;
      } catch {
        /* user cancelled — fall through to nothing */
        return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug(spec.meta.title)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNote('Downloaded.');
    setTimeout(() => setNote(null), 2600);
  }

  function openTab() {
    const blob = new Blob([html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  }

  return (
    <div>
      <div className="result-bar">
        <div className="title">
          {spec.meta.title}
          <span>
            {spec.sections.length} sections · {spec.meta.theme}
            {spec.meta.themeReason ? ` · ${spec.meta.themeReason}` : ''}
          </span>
        </div>
        {note && <span className="tiny dim">{note}</span>}
        <button className="btn btn-sm btn-ghost" onClick={openTab}>
          Open in a tab
        </button>
        <button className="btn btn-sm btn-ghost" onClick={save}>
          Save
        </button>
        <button className="btn btn-sm btn-primary" onClick={exportHtml}>
          Export HTML
        </button>
        <button className="btn btn-sm btn-ghost" onClick={reset}>
          New site
        </button>
      </div>

      <div className="result-stage">
        <iframe srcDoc={html} title={spec.meta.title} />
      </div>
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
