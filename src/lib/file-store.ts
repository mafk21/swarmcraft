/* ============================================================================
   A folder instead of a database.

   Some browsers refuse IndexedDB: a private window, "block all cookies", a
   hardened profile, a locked-down work laptop. Until now that meant the app
   worked but forgot everything the moment the tab closed — and the key could
   not even be saved, so the message got in the way of the first run.

   The browser in that situation still gives us something better than memory:
   the File System Access API. The user picks a folder once, and the app keeps
   its data there as plain JSON — readable, portable, and theirs. Not a cache,
   not a hidden blob in a profile folder: files they can open in a text editor.

   What is stored where:

     settings.json            the API key, keyed by name: {"geminiKey": {…}}
     projects/<id>.json       one file per site, the whole spec
     pages/<id>.json          extra pages belonging to a site

   Images stay in memory for the session. They are data URLs that can be
   megabytes each, and quietly copying megabytes into someone's folder is a
   bigger decision than this fallback should make on their behalf — the export
   already inlines them into the HTML file, so nothing is lost from the site.

   Everything here is written against the standard handle interface, and the
   directory is injectable (`folderApi(dir)`) so the test suite can prove the
   code works without a browser.

   ── one rule ───────────────────────────────────────────────────────────────
   This module never throws a permission prompt at the user on its own. The
   folder is chosen by a click, because `showDirectoryPicker` requires a user
   gesture and a prompt that appears unasked is indistinguishable from a bug.
   ========================================================================== */

type FileHandleLike = {
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  name: string;
};

export type DirHandleLike = {
  name: string;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandleLike>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  entries?(): AsyncIterableIterator<[string, FileHandleLike | DirHandleLike]>;
};

const SETTINGS = 'settings.json';

/** True when this browser can hand us a folder at all. */
export function folderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  );
}

/* ── the store itself ────────────────────────────────────────────────────── */

/**
 * The store interface the app's data layer speaks. The subset of idb's shape
 * that db.ts actually uses, so the two backends are interchangeable.
 */
export type StoreRow = Record<string, unknown> & { id?: string; key?: string };

export type StoreApi = {
  get(store: string, key: string): Promise<StoreRow | undefined>;
  put(store: string, row: StoreRow): Promise<string>;
  delete(store: string, key: string): Promise<void>;
  getAll(store: string): Promise<StoreRow[]>;
  getAllFromIndex(store: string, index: string, value: string): Promise<StoreRow[]>;
  count(store: string): Promise<number>;
  close(): void;
};

/** Filesystem-safe filename from an id. Ids are UUIDs, so this is nearly a
 *  no-op — but it must never be able to escape the folder. */
const safe = (s: string) =>
  s
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    /* collapse dots: ".." must not survive into a filename even as a single
       harmless segment, because the next person to read this code should be
       able to see at a glance that traversal is impossible */
    .replace(/\.{2,}/g, '_')
    .replace(/^[._]+/, '')
    .slice(0, 120) || 'unnamed';

const isFileHandle = (h: FileHandleLike | DirHandleLike): h is FileHandleLike =>
  typeof (h as FileHandleLike).getFile === 'function';

async function readJson(dir: DirHandleLike, name: string): Promise<StoreRow | null> {
  try {
    const fh = await dir.getFileHandle(name);
    const text = await (await fh.getFile()).text();
    if (!text.trim()) return null;
    return JSON.parse(text) as StoreRow;
  } catch {
    /* absent or unreadable: treated as empty, never as an error the user has
       to clear before working */
    return null;
  }
}

async function writeJson(dir: DirHandleLike, name: string, row: unknown): Promise<void> {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(JSON.stringify(row, null, 2));
  await w.close();
}

/**
 * A store backed by a folder the user picked.
 *
 * `projects` and `pages` are directories of one JSON file each; `settings` is a
 * single file; `media` is deliberately memory-only (see the header).
 */
export function folderApi(root: DirHandleLike): StoreApi {
  const dirFor = async (store: string): Promise<DirHandleLike | null> => {
    if (store === 'settings') return null;
    return root.getDirectoryHandle(store, { create: true });
  };

  /* media: names are unique per row, and the map is the session's copy */
  const memory = new Map<string, StoreRow>();

  /** settings.json is one object of name → row, so two settings coexist. */
  const readSettings = async (): Promise<Record<string, StoreRow>> => {
    const raw = await readJson(root, SETTINGS);
    if (!raw) return {};
    /* A file written by an older build, or hand-edited, might not be a map of
       rows. Anything that is not an object of objects is treated as empty
       rather than crashing the app on boot. */
    const out: Record<string, StoreRow> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = v as StoreRow;
    }
    return out;
  };

  const listRows = async (store: string): Promise<StoreRow[]> => {
    const dir = await dirFor(store);
    if (!dir) return Object.values(await readSettings());
    if (!dir.entries) return [];
    const rows: StoreRow[] = [];
    for await (const [name, handle] of dir.entries()) {
      if (!isFileHandle(handle) || !name.endsWith('.json')) continue;
      const row = await readJson(dir, name);
      if (row) rows.push(row);
    }
    return rows;
  };

  return {
    async get(store, key) {
      if (store === 'media') return memory.get(key);
      if (store === 'settings') return (await readSettings())[key];
      const dir = await dirFor(store);
      if (!dir) return undefined;
      return (await readJson(dir, `${safe(key)}.json`)) ?? undefined;
    },

    async put(store, row) {
      if (store === 'media') {
        const id = String(row.id ?? '');
        if (id) memory.set(id, row);
        return id;
      }
      if (store === 'settings') {
        const name = String(row.key ?? '');
        if (!name) throw new Error('A setting needs a key.');
        const all = await readSettings();
        all[name] = row;
        await writeJson(root, SETTINGS, all);
        return name;
      }
      const id = String(row.id ?? '');
      if (!id) throw new Error('A record needs an id before it can be saved.');
      const dir = await dirFor(store);
      if (!dir) throw new Error(`No folder for ${store}.`);
      await writeJson(dir, `${safe(id)}.json`, row);
      return id;
    },

    async delete(store, key) {
      if (store === 'media') {
        memory.delete(key);
        return;
      }
      if (store === 'settings') {
        const all = await readSettings();
        delete all[key];
        await writeJson(root, SETTINGS, all);
        return;
      }
      const dir = await dirFor(store);
      if (!dir) return;
      try {
        await dir.removeEntry(`${safe(key)}.json`);
      } catch {
        /* already gone is the outcome the caller wanted */
      }
    },

    async getAll(store) {
      if (store === 'media') return [...memory.values()];
      return listRows(store);
    },

    async getAllFromIndex(store, index, value) {
      const rows = await listRows(store);
      return rows.filter((r) => String(r[index]) === String(value));
    },

    async count(store) {
      return (await listRows(store)).length;
    },

    close() {
      /* nothing held open: every write closes its stream */
    },
  };
}
