/* ============================================================================
   "This browser is blocking local storage" — the fix, tested.

   The complaint was not that the message was wrong. It was that the message was
   the end of the road: the key could not be saved, so the Save button appeared
   to do nothing, and a finished site had nowhere to go.

   The fix is a folder on disk, chosen once, written as plain JSON. These tests
   run the real store against a fake filesystem, so they prove the code works
   rather than proving a browser exists.

   What each group would catch:
     · a store that only pretends to persist (write then read back, new handle)
     · an id that could escape the folder by containing ../ 
     · settings being clobbered instead of merged
     · getAll/getAllFromIndex returning files that are not records
     · a delete that leaves the file behind
     · the app promising saving when neither backend exists
   ========================================================================== */
import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';

const out = scratch('filestore.bundle.mjs');
await build({
  entryPoints: ['src/lib/file-store.ts'],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  outfile: out.path,
  logLevel: 'silent',
});

const { folderApi, folderSupported } = await import(out.url);

let fail = 0;
const ok = (n, c, d = '') => {
  if (!c) {
    fail++;
    console.log(`  FAIL  ${n}${d ? ` — ${d}` : ''}`);
  }
};

/* ── a filesystem made of maps ─────────────────────────────────────────────
   Deliberately the same shape the browser hands us: getDirectoryHandle with
   `create`, getFileHandle with `create`, createWritable, removeEntry, entries.
   Nothing here knows about the store's internals. */
function makeDisk() {
  const files = new Map(); // path -> string
  const dirs = new Set();

  const fileHandle = (path) => ({
    name: path.split('/').pop(),
    async getFile() {
      if (!files.has(path)) {
        const e = new Error('NotFoundError');
        e.name = 'NotFoundError';
        throw e;
      }
      return { text: async () => files.get(path) };
    },
    async createWritable() {
      let buf = '';
      return {
        write: async (d) => {
          buf += d;
        },
        close: async () => {
          files.set(path, buf);
        },
      };
    },
  });

  const dirHandle = (path) => ({
    name: path.split('/').pop() || 'root',
    async getDirectoryHandle(name, opts) {
      const p = `${path}/${name}`;
      if (!dirs.has(p)) {
        if (!opts?.create) {
          const e = new Error('NotFoundError');
          e.name = 'NotFoundError';
          throw e;
        }
        dirs.add(p);
      }
      return dirHandle(p);
    },
    async getFileHandle(name, opts) {
      const p = `${path}/${name}`;
      if (!files.has(p) && !opts?.create) {
        const e = new Error('NotFoundError');
        e.name = 'NotFoundError';
        throw e;
      }
      files.set(p, files.get(p) ?? '');
      return fileHandle(p);
    },
    async removeEntry(name) {
      const p = `${path}/${name}`;
      if (!files.has(p)) {
        const e = new Error('NotFoundError');
        e.name = 'NotFoundError';
        throw e;
      }
      files.delete(p);
    },
    async *entries() {
      const prefix = `${path}/`;
      for (const [p, v] of files) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        if (rest.includes('/')) continue;
        yield [rest, fileHandle(p)];
      }
    },
  });

  return { root: dirHandle('/root'), files, dirs };
}

/* ── 1. it actually persists ─────────────────────────────────────────────── */

{
  const disk = makeDisk();
  const store = folderApi(disk.root);

  await store.put('settings', { key: 'geminiKey', value: 'AQ.Ab-fake' });
  await store.put('projects', { id: 'p1', name: 'Falcon', spec: { a: 1 } });
  await store.put('pages', { id: 'pg1', projectId: 'p1', html: '<p>x</p>' });

  /* A NEW store over the SAME folder — this is what closing the tab does. */
  const reopened = folderApi(disk.root);
  const key = await reopened.get('settings', 'geminiKey');
  ok('the key survives a reopen', key?.value === 'AQ.Ab-fake', JSON.stringify(key));

  const row = await reopened.get('projects', 'p1');
  ok('a site survives a reopen', row?.name === 'Falcon', JSON.stringify(row));

  const pages = await reopened.getAllFromIndex('pages', 'projectId', 'p1');
  ok('pages are found by their project', pages.length === 1 && pages[0].html === '<p>x</p>', String(pages.length));

  ok('a count is a count', (await reopened.count('projects')) === 1);

  /* the file is real JSON on disk, not an opaque blob */
  const raw = disk.files.get('/root/projects/p1.json');
  ok('sites are stored as readable JSON', typeof raw === 'string' && raw.includes('"name": "Falcon"'), String(raw).slice(0, 40));
}

/* ── 2. settings merge instead of clobbering ─────────────────────────────── */

{
  const disk = makeDisk();
  const store = folderApi(disk.root);
  await store.put('settings', { key: 'geminiKey', value: 'K' });
  await store.put('settings', { key: 'other', value: 'V' });
  const reopened = folderApi(disk.root);
  ok('a second setting does not erase the first', (await reopened.get('settings', 'geminiKey'))?.value === 'K');
  ok('the second setting is readable too', (await reopened.get('settings', 'other'))?.value === 'V');
}

/* ── 3. an id can never escape the folder ────────────────────────────────── */

{
  const disk = makeDisk();
  const store = folderApi(disk.root);
  await store.put('projects', { id: '../../etc/passwd', name: 'sneaky' });
  /* The invariant is not "no dots" — the sanitiser maps them to underscores.
     It is "every file written lives under the folder and under the store". */
  const outside = [...disk.files.keys()].filter((p) => !p.startsWith('/root/projects/'));
  ok('a hostile id cannot write outside the store', outside.length === 0, outside.join(' '));
  ok('no path contains a traversal', [...disk.files.keys()].every((p) => !p.includes('..')), [...disk.files.keys()].join(' '));

  /* A leading dot would make the file hidden on macOS and Linux — the work
     would be on disk and invisible, which is its own kind of data loss. */
  const hidden = [...disk.files.keys()].filter((p) => p.split('/').pop().startsWith('.'));
  ok('no record is written as a hidden file', hidden.length === 0, hidden.join(' '));
  ok('the row is still readable back', (await store.get('projects', '../../etc/passwd'))?.name === 'sneaky');
}

/* ── 4. deletes leave nothing behind ─────────────────────────────────────── */

{
  const disk = makeDisk();
  const store = folderApi(disk.root);
  await store.put('projects', { id: 'p1', name: 'a' });
  await store.delete('projects', 'p1');
  ok('a deleted site is gone from disk', !disk.files.has('/root/projects/p1.json'));
  ok('a deleted site reads as absent', (await store.get('projects', 'p1')) === undefined);
  /* deleting what is not there must not throw: the caller wanted it gone */
  await store.delete('projects', 'never-existed');
  ok('deleting a missing site is not an error', true);
}

/* ── 5. nothing but records comes back ───────────────────────────────────── */

{
  const disk = makeDisk();
  const store = folderApi(disk.root);
  await store.put('projects', { id: 'p1', name: 'a' });
  /* A stray file, and a truncated one, must not break the list. */
  disk.files.set('/root/projects/notes.txt', 'not json');
  disk.files.set('/root/projects/broken.json', '{ not json');
  const all = await store.getAll('projects');
  ok('stray and broken files are skipped, not thrown', all.length === 1 && all[0].name === 'a', JSON.stringify(all));
}

/* ── 6. media is session-only, and says so by working in memory ──────────── */

{
  const disk = makeDisk();
  const store = folderApi(disk.root);
  await store.put('media', { id: 'm1', data: 'data:image/png;base64,AAA' });
  ok('media is readable in the session', (await store.get('media', 'm1'))?.id === 'm1');
  ok('media is not written to disk', ![...disk.files.keys()].some((p) => p.includes('m1')));
}

/* ── 7. the app does not promise a folder it cannot have ─────────────────── */

{
  ok('no window means no folder picker', folderSupported() === false);
}

console.log(fail ? `\nFILESTORE ${fail} FAILED\n` : '\nFILESTORE OK — a folder that really persists, as JSON you can read\n');
process.exit(fail ? 1 : 0);
