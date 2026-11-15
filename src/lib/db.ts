/* ============================================================================
   Storage. IndexedDB, nothing leaves the machine.
   ========================================================================== */

import { openDB, type IDBPDatabase } from 'idb';
import type { SiteSpec, SiteKind } from './spec';
import { folderApi, folderSupported, type DirHandleLike, type StoreApi } from './file-store';

/* The product was called swarmsmith until it was published. Anyone who ran it
   under that name has their key and their sites in a database with the old name,
   so the first open copies them across before the new database is used for real.
   Cheap now, and the alternative is a user opening the app to find every site
   they built gone. */
const DB_NAME = 'swarmcraft';
const LEGACY_DB_NAME = 'swarmsmith';
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

/**
 * Thrown when the browser will not give us storage at all — private windows,
 * blocked third-party storage, a hardened profile.
 *
 * Callers catch it and carry on without saving rather than dying. Before this,
 * `indexedDB.open` was called on boot with no guard: on such a browser the app
 * threw before it rendered and the user got a white screen with no explanation.
 */
export class StorageUnavailable extends Error {
  constructor() {
    super('This browser is not allowing local storage, so nothing can be saved.');
    this.name = 'StorageUnavailable';
  }
}

export function storageAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/* ── the folder fallback ────────────────────────────────────────────────────
   When IndexedDB is refused, the app does not give up on saving: it asks the
   user for a folder and keeps its data there as JSON. `fileStore` holds that
   backend once it is chosen; every function below speaks to `store()` and does
   not know or care which one is answering.
   ──────────────────────────────────────────────────────────────────────── */

let fileStore: StoreApi | null = null;
let fileStoreName: string | null = null;

/** Is a folder in use instead of IndexedDB? */
export const usingFolder = (): boolean => fileStore !== null;
/** The folder's name, for the UI to say out loud. */
export const folderName = (): string | null => fileStoreName;

/** Can this browser offer a folder at all? */
export { folderSupported };

/**
 * Adopt a folder as the store.
 *
 * Called from a click, because `showDirectoryPicker` needs a gesture. Existing
 * IndexedDB data is copied in first, so switching does not lose the sites the
 * user already has — the same courtesy the database rename got.
 */
export async function useFolder(dir: DirHandleLike): Promise<void> {
  const api = folderApi(dir);
  await copyAcross(api);
  fileStore = api;
  fileStoreName = dir.name || 'the chosen folder';
}

/** Stop using the folder (the files stay where they are). */
export function forgetFolder(): void {
  fileStore?.close();
  fileStore = null;
  fileStoreName = null;
}

/**
 * Copy whatever IndexedDB has into the folder, once.
 *
 * Best-effort in every direction: if IndexedDB is unavailable there is nothing
 * to copy, and if one record fails to write the rest still land. Nothing is
 * deleted from IndexedDB — switching stores must never be able to destroy the
 * only copy of someone's work.
 */
async function copyAcross(target: StoreApi): Promise<void> {
  if (!storageAvailable()) return;
  try {
    const from = await openDB<Schema>(DB_NAME, DB_VERSION);
    if (!from.objectStoreNames.contains('settings')) {
      from.close();
      return;
    }
    const settings = await from.getAll('settings');
    for (const row of settings) await target.put('settings', row as never);
    for (const storeName of ['projects', 'pages'] as const) {
      const rows = await from.getAll(storeName);
      for (const row of rows) await target.put(storeName, row as never);
    }
    from.close();
  } catch {
    /* nothing to copy, or the copy failed: the folder still works */
  }
}

/**
 * Copy a database written by the old name into the new one, once.
 *
 * `indexedDB.databases()` is not in every browser, so this is best-effort: when
 * it is missing, or the old database does not exist, it does nothing and the app
 * starts with the new one empty. It never deletes the old database — a rename
 * should not be able to destroy the only copy of someone's work.
 */
async function migrateLegacyDb(): Promise<void> {
  try {
    const list = await indexedDB.databases?.();
    if (!list?.some((d) => d.name === LEGACY_DB_NAME)) return;

    const marker = `${LEGACY_DB_NAME}:migrated`;
    if (localStorage.getItem(marker)) return;

    const legacy = await new Promise<IDBDatabase>((ok, no) => {
      const req = indexedDB.open(LEGACY_DB_NAME);
      req.onsuccess = () => ok(req.result);
      req.onerror = () => no(req.error);
    });

    const target = await openDB<Schema>(DB_NAME, DB_VERSION);
    for (const name of Array.from(legacy.objectStoreNames) as (keyof Schema)[]) {
      if (!target.objectStoreNames.contains(name)) continue;
      const rows = await new Promise<unknown[]>((ok, no) => {
        const req = legacy.transaction(name, 'readonly').objectStore(name).getAll();
        req.onsuccess = () => ok(req.result);
        req.onerror = () => no(req.error);
      });
      /* `put`, not `add`: if a row already exists in the new database it wins,
         because it is the one this version of the app has been writing to. */
      for (const row of rows) await target.put(name, row as never);
    }
    legacy.close();
    target.close();
    localStorage.setItem(marker, '1');
  } catch {
    /* No migration is better than a broken boot. The new database stands. */
  }
}

/**
 * The store in use: the folder if one has been chosen, IndexedDB otherwise.
 *
 * Both answer to the same handful of calls, so every function below is written
 * once. The IndexedDB path opens lazily and keeps its connection; the folder
 * path opens no streams at all (each write opens and closes its own).
 */
function store(): Promise<StoreApi | IDBPDatabase<Schema>> {
  if (fileStore) return Promise.resolve(fileStore);
  if (!storageAvailable()) return Promise.reject(new StorageUnavailable());
  return db();
}

function db() {
  if (!storageAvailable()) return Promise.reject(new StorageUnavailable());
  if (!dbp) {
    dbp = (async () => {
      await migrateLegacyDb();
      return openDB<Schema>(DB_NAME, DB_VERSION, {
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
    })();
    // a failed open must not poison every later call
    dbp.catch(() => {
      dbp = null;
    });
  }
  return dbp;
}

/* ── api key ─────────────────────────────────────────────────────────────── */

export async function getApiKey(): Promise<string | null> {
  const d = await store();
  const row = await d.get('settings', 'geminiKey');
  return typeof row?.value === 'string' ? row.value : null;
}

export async function setApiKey(key: string) {
  const d = await store();
  await d.put('settings', { key: 'geminiKey', value: key.trim() });
}

export async function clearApiKey() {
  const d = await store();
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
  const d = await store();
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
  const d = await store();
  return d.get('projects', id);
}

export async function listProjects(): Promise<ProjectRow[]> {
  const d = await store();
  const all = await d.getAll('projects');
  // newest activity first; fall back to created for rows from before `updated`
  return all.sort((a, b) => (b.updated ?? b.created) - (a.updated ?? a.created));
}

export async function renameProject(id: string, name: string) {
  const d = await store();
  const row = await d.get('projects', id);
  if (!row) return;
  await d.put('projects', { ...row, name, updated: Date.now() });
}

export async function deleteProject(id: string) {
  const d = await store();
  await d.delete('projects', id);
}

export async function countProjects(): Promise<number> {
  const d = await store();
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

  const d = await store();
  await d.put('media', row);
  return row;
}

export async function listMedia(): Promise<MediaRow[]> {
  const d = await store();
  const all = await d.getAll('media');
  return all.sort((a, b) => b.created - a.created);
}

export async function getMedia(id: string): Promise<MediaRow | undefined> {
  const d = await store();
  return d.get('media', id);
}

export async function deleteMedia(id: string) {
  const d = await store();
  await d.delete('media', id);
}

/**
 * Swap every `media:<id>` reference in a document for the real data URL.
 * Used on export so the HTML file is self-contained and works offline.
 */
export async function inlineMedia(html: string): Promise<string> {
  const ids = [...new Set([...html.matchAll(/media:([a-z0-9-]+)/gi)].map((m) => m[1]))];
  if (ids.length === 0) return html;

  const d = await store();
  const rows = await Promise.all(ids.map((id) => d.get('media', id)));

  let out = html;
  rows.forEach((row, i) => {
    const token = `media:${ids[i]}`;
    if (!row) {
      /* The file is gone. Removing just the token leaves `src=""`, which makes
         the browser request the page itself as an image — a broken icon and a
         pointless request. Drop the whole tag and put the drawn placeholder
         back, which is what the page would have rendered had the image never
         existed. */
      out = out.replace(
        new RegExp(`<img[^>]*src=["']${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`, 'g'),
        ''
      );
      out = out.replace(/<div class="([^"]*?) has-img">\s*<\/div>/g, '<div class="$1" aria-hidden="true"></div>');
      return;
    }
    out = out.split(token).join(row.data);
  });
  return out;
}

/* ── pages ───────────────────────────────────────────────────────────────── */

export async function savePage(page: Omit<PageRow, 'id' | 'created'> & { id?: string }) {
  const d = await store();
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
  const d = await store();
  const all = await d.getAllFromIndex('pages', 'projectId', projectId);
  return all.sort((a, b) => a.created - b.created);
}

export async function deletePage(id: string) {
  const d = await store();
  await d.delete('pages', id);
}

/* ── picking the folder ──────────────────────────────────────────────────── */

/**
 * Ask the user for a folder and adopt it.
 *
 * MUST be called straight from a click handler with no `await` in front of it:
 * `showDirectoryPicker` requires transient user activation, and awaiting first
 * spends it — the same trap that made the export button inert. Returns null
 * when the user closed the dialog, which is a choice, not a failure.
 */
export async function chooseFolder(): Promise<string | null> {
  const picker = (
    window as unknown as {
      showDirectoryPicker?: (o?: unknown) => Promise<DirHandleLike>;
    }
  ).showDirectoryPicker;
  if (!picker) throw new Error('This browser cannot give the app a folder.');

  let dir: DirHandleLike;
  try {
    dir = await picker({ id: 'swarmcraft', mode: 'readwrite' });
  } catch (e) {
    const cancelled =
      (e instanceof DOMException && e.name === 'AbortError') ||
      (e instanceof Error && e.name === 'AbortError');
    if (cancelled) return null;
    throw new Error(
      'The browser would not open a folder. If this is a work device, the file picker may be blocked by policy.'
    );
  }

  await useFolder(dir);
  return folderName();
}
