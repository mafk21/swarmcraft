import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../store';
import {
  listProjects,
  deleteProject,
  renameProject,
  folderSupported,
  chooseFolder,
  type ProjectRow,
} from '../../lib/db';
import { KIND_META } from '../../lib/spec';
import { loadPages } from '../../lib/pages';

export default function ProjectsScreen() {
  const { patch, startNew, hasKey } = useApp();
  const storageBlocked = useApp((s) => s.storageBlocked);
  const folderMode = useApp((s) => s.folderMode);
  const folderLabel = useApp((s) => s.folderLabel);
  const [folderErr, setFolderErr] = useState<string | null>(null);
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
  }, [load, folderMode]);

  /**
   * The "your sites live in a folder" path, reachable from this screen too —
   * not only from Setup. Someone who dismissed the notice on first run should
   * not have to go back through the key screen to fix it.
   */
  async function pickFolder() {
    setFolderErr(null);
    try {
      const name = await chooseFolder();
      if (!name) return;
      patch({ folderMode: true, folderLabel: name });
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : 'The folder could not be opened.');
    }
  }

  async function open(row: ProjectRow) {
    const extra = await loadPages(row.id);
    patch({
      spec: row.spec,
      pages: extra,
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
            Swarmcraft builds one page at a time. Answer a few questions, choose what to include,
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

          {/* Without a store, this list will never fill up. Say so here rather
              than letting the user build something and watch it vanish. */}
          {storageBlocked && !folderMode && (
            <div className="err" style={{ textAlign: 'left', marginTop: 18 }}>
              <div>
                <strong>This browser is blocking its own storage</strong>
                {folderSupported() ? (
                  <>
                    {' '}
                    Nothing you build will be kept. Choose a folder and the app will save your key
                    and your sites there instead, as plain JSON files.
                  </>
                ) : (
                  <>
                    {' '}
                    Nothing you build will be kept, and this browser will not hand out a folder
                    either. Export each finished site to a file — that always works.
                  </>
                )}
              </div>
              {folderSupported() && (
                <button className="btn btn-sm btn-primary" onClick={pickFolder} style={{ marginTop: 10 }}>
                  Choose a folder
                </button>
              )}
              {folderErr && <div style={{ marginTop: 8 }}>{folderErr}</div>}
            </div>
          )}

          {folderMode && (
            <p className="tiny dim" style={{ marginTop: 14 }}>
              Saving to <strong>{folderLabel}</strong> — settings, sites and pages as JSON files in
              the folder you chose.
            </p>
          )}
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
          {rows === null
            ? 'Loading…'
            : `${rows.length} saved${folderMode ? ` in ${folderLabel}` : ' in this browser'}`}
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
