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

   Images are written as real files too: media/<id>.<ext>, one file per picture,
   with the row that describes them in media/index.json. That was the last thing
   the folder lost — a site reopened the next morning kept its text and had empty
   picture boxes — and a folder the user already chose for their work is exactly
   where their pictures belong.

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

  /* ── media ────────────────────────────────────────────────────────────────
     A picture is a data URL in a row. Written as JSON alone it would bloat
     index.json by megabytes per upload, so the bytes go in their own file and
     the index keeps the metadata. `data` is re-attached on read, so the rest of
     the app never learns the difference. */

  const MEDIA_DIR = 'media';
  const MEDIA_INDEX = 'index.json';

  /** The extension for a mime type, defaulting to png rather than guessing. */
  const extOf = (type: string) => {
    const m = /^image\/(png|jpeg|jpg|webp|gif|svg\+xml|avif)$/i.exec(type || '');
    if (!m) return 'png';
    const t = m[1].toLowerCase();
    return t === 'jpeg' ? 'jpg' : t === 'svg+xml' ? 'svg' : t;
  };

  const readMediaIndex = async (): Promise<Record<string, StoreRow>> => {
    try {
      const dir = await root.getDirectoryHandle(MEDIA_DIR, { create: true });
      const raw = await readJson(dir, MEDIA_INDEX);
      if (!raw) return {};
      const out: Record<string, StoreRow> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = v as StoreRow;
      }
      return out;
    } catch {
      return {};
    }
  };

  /**
   * Read a picture back, putting `data` on the row.
   *
   * A row whose file has been deleted from the folder keeps its metadata and
   * loses `data`. The app then renders the drawn placeholder it already draws
   * for a missing picture, which is honest — better than a broken image and
   * better than pretending the upload worked.
   */
  const hydrate = async (dir: DirHandleLike, row: StoreRow): Promise<StoreRow> => {
    const file = String(row.file ?? '');
    if (!file) return row;
    try {
      const fh = await dir.getFileHandle(file);
      const text = await (await fh.getFile()).text();
      return text ? { ...row, data: text } : row;
    } catch {
      return row;
    }
  };

  /** settings.json is one object of name → row, so two settings coexist. */
  const readSettings = async (): Promise<Record<string, StoreRow>> => {
    const raw = await readJson(root, SETTINGS);
    if (!raw) return {};
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
      if (store === 'media') {
        const index = await readMediaIndex();
        const row = index[key];
        if (!row) return undefined;
        const dir = await root.getDirectoryHandle(MEDIA_DIR, { create: true });
        return hydrate(dir, row);
      }
      if (store === 'settings') return (await readSettings())[key];
      const dir = await dirFor(store);
      if (!dir) return undefined;
      return (await readJson(dir, `${safe(key)}.json`)) ?? undefined;
    },

    async put(store, row) {
      if (store === 'media') {
        const id = String(row.id ?? '');
        if (!id) throw new Error('A picture needs an id.');
        const dir = await root.getDirectoryHandle(MEDIA_DIR, { create: true });
        const data = String(row.data ?? '');
        const file = `${safe(id)}.${extOf(String(row.type ?? ''))}`;

        /* base64 in one text write: FileSystemWritableFileStream accepts text,
           and a data URL is already text. No binary conversion, no dependency. */
        if (data) {
          const fh = await dir.getFileHandle(file, { create: true });
          const w = await fh.createWritable();
          await w.write(data);
          await w.close();
        }

        /* the index keeps everything EXCEPT the bytes */
        const index = await readMediaIndex();
        const { data: _omit, ...meta } = row;
        index[id] = { ...meta, id, file };
        await writeJson(dir, MEDIA_INDEX, index);
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
        const index = await readMediaIndex();
        const row = index[key];
        const dir = await root.getDirectoryHandle(MEDIA_DIR, { create: true });
        if (row?.file) {
          try {
            await dir.removeEntry(String(row.file));
          } catch {
            /* the file was already gone: the outcome the caller wanted */
          }
        }
        delete index[key];
        await writeJson(dir, MEDIA_INDEX, index);
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
      if (store === 'media') {
        const index = await readMediaIndex();
        const dir = await root.getDirectoryHandle(MEDIA_DIR, { create: true });
        const rows = await Promise.all(Object.values(index).map((r) => hydrate(dir, r)));
        return rows;
      }
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
