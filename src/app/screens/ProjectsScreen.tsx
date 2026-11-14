import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../store';
import { listProjects, deleteProject, renameProject, type ProjectRow } from '../../lib/db';
import { KIND_META } from '../../lib/spec';

export default function ProjectsScreen() {
  const { patch, startNew, hasKey } = useApp();
  const [rows, setRows] = useState<ProjectRow[] | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await listProjects());
    } catch {
      // no storage: an empty list is the honest answer, not a crash
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function open(row: ProjectRow) {
    patch({
      spec: row.spec,
      projectId: row.id,
      saved: true,
      kind: row.kind ?? null,
      theme: row.spec.meta.theme,
      accent: row.spec.meta.accent,
      themeMode: 'pick',
      step: 'result',
    });
  }

  async function remove(id: string) {
    await deleteProject(id);
    setConfirming(null);
    load();
  }

  async function commitRename(id: string) {
    const name = draft.trim();
    if (name) await renameProject(id, name);
    setRenaming(null);
    load();
  }

  /* ── empty state: the first thing a new user sees ─────────────────────── */

  if (rows && rows.length === 0) {
    return (
      <div className="screen">
        <div className="empty-first">
          <p className="eyebrow">Nothing built yet</p>
          <h1>No sites yet</h1>
          <p>
            Swarmsmith builds one page at a time. Answer a few questions, choose what to include,
            then watch nine cursors build it. Everything stays in this browser.
          </p>
          <div className="row" style={{ gap: 10 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={() => (hasKey ? startNew() : patch({ step: 'key' }))}
            >
              {hasKey ? 'Build a site' : 'Add a key, then build'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── list ─────────────────────────────────────────────────────────────── */

  return (
    <div className="screen">
      <div className="head">
        <h1>Your sites</h1>
        <p>
          Saved in this browser&rsquo;s IndexedDB. Nothing here is on a server, and nothing leaves
          this machine unless you export it.
        </p>
      </div>

      <div className="bar" style={{ marginTop: 0, marginBottom: 20, paddingTop: 0, borderTop: 0 }}>
        <button className="btn btn-primary" onClick={startNew}>
          New site
        </button>
        <div className="spacer" />
        <span className="note">
          {rows === null ? 'Loading…' : `${rows.length} saved`}
        </span>
      </div>

      {rows === null && (
        <div className="busy" style={{ padding: '40px 0' }}>
          <div className="spinner" />
        </div>
      )}

      <ul className="projects">
        {(rows ?? []).map((row) => (
          <li key={row.id} className="project">
            <div className="project-main">
              {renaming === row.id ? (
                <input
                  className="input"
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitRename(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename(row.id);
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                />
              ) : (
                <button className="project-name" onClick={() => open(row)}>
                  {row.name}
                </button>
              )}
              <p className="project-meta">
                {row.kind ? `${KIND_META[row.kind]?.label ?? row.kind} · ` : ''}
                {row.spec.sections.length} sections · {row.spec.meta.theme} · edited{' '}
                {when(row.updated ?? row.created)}
              </p>
            </div>

            <div className="project-actions">
              <button className="btn btn-sm" onClick={() => open(row)}>
                Open
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setRenaming(row.id);
                  setDraft(row.name);
                }}
              >
                Rename
              </button>
              {confirming === row.id ? (
                <>
                  <button className="btn btn-sm btn-ghost" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                  <button className="btn btn-sm danger" onClick={() => remove(row.id)}>
                    Delete for good
                  </button>
                </>
              ) : (
                <button className="btn btn-sm btn-ghost" onClick={() => setConfirming(row.id)}>
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function when(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
