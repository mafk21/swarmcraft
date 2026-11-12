/* ============================================================================
   Storage. IndexedDB, nothing leaves the machine.
   ========================================================================== */

import { openDB, type IDBPDatabase } from 'idb';
import type { SiteSpec, SiteKind } from './spec';

const DB_NAME = 'swarmsmith';
const DB_VERSION = 2;

export type ProjectRow = {
  id: string;
  name: string;
  kind: SiteKind | null;
  created: number;
  updated: number;
  spec: SiteSpec;
};

export type MediaRow = {
  id: string;
  name: string;
  type: string;
  /** data URL; IndexedDB handles blobs but data URLs survive structured clone
      and export without a second read */
  data: string;
  width: number;
  height: number;
  bytes: number;
  created: number;
};

export type PageRow = {
  id: string;
  projectId: string;
  title: string;
  /** anchor id, used in hrefs */
  slug: string;
  spec: SiteSpec;
  created: number;
};

type Schema = {
  settings: { key: string; value: unknown };
  projects: ProjectRow;
  media: MediaRow;
  pages: PageRow;
};

let dbp: Promise<IDBPDatabase<Schema>> | null = null;

function db() {
  if (!dbp) {
    dbp = openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains('settings'))
          d.createObjectStore('settings', { keyPath: 'key' });
        if (!d.objectStoreNames.contains('projects')) {
          const store = d.createObjectStore('projects', { keyPath: 'id' });
          store.createIndex('updated', 'updated');
        }
        if (!d.objectStoreNames.contains('media')) d.createObjectStore('media', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('pages')) {
          const store = d.createObjectStore('pages', { keyPath: 'id' });
          store.createIndex('projectId', 'projectId');
        }
      },
    });
  }
  return dbp;
}

/* ── api key ─────────────────────────────────────────────────────────────── */

export async function getApiKey(): Promise<string | null> {
  const d = await db();
  const row = await d.get('settings', 'geminiKey');
  return typeof row?.value === 'string' ? row.value : null;
}

export async function setApiKey(key: string) {
  const d = await db();
  await d.put('settings', { key: 'geminiKey', value: key.trim() });
}

export async function clearApiKey() {
  const d = await db();
  await d.delete('settings', 'geminiKey');
}

/* ── projects ────────────────────────────────────────────────────────────── */

/**
 * Save a spec. Pass an existing id to update in place — that is what keeps one
 * project as one project instead of piling up duplicates every time you save.
 */
export async function saveProject(
  spec: SiteSpec,
  opts: { id?: string; kind?: SiteKind | null } = {}
): Promise<string> {
  const d = await db();
  const id = opts.id ?? crypto.randomUUID();

  const existing = opts.id ? await d.get('projects', opts.id) : undefined;

  const row: ProjectRow = {
    id,
    name: spec.meta.title,
    kind: opts.kind ?? existing?.kind ?? null,
    created: existing?.created ?? Date.now(),
    updated: Date.now(),
    spec,
  };

  await d.put('projects', row);
  return id;
}

export async function getProject(id: string): Promise<ProjectRow | undefined> {
  const d = await db();
  return d.get('projects', id);
}

export async function listProjects(): Promise<ProjectRow[]> {
  const d = await db();
  const all = await d.getAll('projects');
  // newest activity first; fall back to created for rows from before `updated`
  return all.sort((a, b) => (b.updated ?? b.created) - (a.updated ?? a.created));
}

export async function renameProject(id: string, name: string) {
  const d = await db();
  const row = await d.get('projects', id);
  if (!row) return;
  await d.put('projects', { ...row, name, updated: Date.now() });
}

export async function deleteProject(id: string) {
  const d = await db();
  await d.delete('projects', id);
}

export async function countProjects(): Promise<number> {
  const d = await db();
  return d.count('projects');
}

/* ── media ───────────────────────────────────────────────────────────────── */

const MAX_MEDIA_BYTES = 6 * 1024 * 1024;

export async function addMedia(file: File): Promise<MediaRow> {
  if (!file.type.startsWith('image/')) {
    throw new Error('That is not an image.');
  }
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error('Images need to be under 6 MB. Try resizing it first.');
  }

  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that file.'));
    r.readAsDataURL(file);
  });

  // measure, so layouts can reserve the right box before the image decodes
  const { width, height } = await new Promise<{ width: number; height: number }>(
    (resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 0, height: 0 });
      img.src = data;
    }
  );

  const row: MediaRow = {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type,
    data,
    width,
    height,
    bytes: file.size,
    created: Date.now(),
  };

  const d = await db();
  await d.put('media', row);
  return row;
}

export async function listMedia(): Promise<MediaRow[]> {
  const d = await db();
  const all = await d.getAll('media');
  return all.sort((a, b) => b.created - a.created);
}

export async function getMedia(id: string): Promise<MediaRow | undefined> {
  const d = await db();
  return d.get('media', id);
}

export async function deleteMedia(id: string) {
  const d = await db();
  await d.delete('media', id);
}

/**
 * Swap every `media:<id>` reference in a document for the real data URL.
 * Used on export so the HTML file is self-contained and works offline.
 */
export async function inlineMedia(html: string): Promise<string> {
  const ids = [...new Set([...html.matchAll(/media:([a-z0-9-]+)/gi)].map((m) => m[1]))];
  if (ids.length === 0) return html;

  const d = await db();
  const rows = await Promise.all(ids.map((id) => d.get('media', id)));

  let out = html;
  rows.forEach((row, i) => {
    if (!row) {
      // the file is gone: strip the reference rather than shipping a dead link
      out = out.split(`media:${ids[i]}`).join('');
      return;
    }
    out = out.split(`media:${ids[i]}`).join(row.data);
  });
  return out;
}

/* ── pages ───────────────────────────────────────────────────────────────── */

export async function savePage(page: Omit<PageRow, 'id' | 'created'> & { id?: string }) {
  const d = await db();
  const id = page.id ?? crypto.randomUUID();
  const existing = page.id ? await d.get('pages', page.id) : undefined;
  await d.put('pages', {
    ...page,
    id,
    created: existing?.created ?? Date.now(),
  });
  return id;
}

export async function listPages(projectId: string): Promise<PageRow[]> {
  const d = await db();
  const all = await d.getAllFromIndex('pages', 'projectId', projectId);
  return all.sort((a, b) => a.created - b.created);
}

export async function deletePage(id: string) {
  const d = await db();
  await d.delete('pages', id);
}
