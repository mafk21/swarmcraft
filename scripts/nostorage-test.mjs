import { build } from 'esbuild';
import { scratch } from './_scratch.mjs';
import assert from 'node:assert/strict';

const out = scratch("nostorage.bundle.mjs");
await build({
  entryPoints: ['src/lib/db.ts'],
  bundle: true, format: 'esm', platform: 'neutral', outfile: out.path, logLevel: 'silent',
});

/* storage is genuinely absent in this node process: no indexedDB, no localStorage */
const db = await import(out.url);
assert.equal(db.storageAvailable(), false, 'storage should read as unavailable');

for (const fn of ['getApiKey', 'getMedia', 'listProjects', 'listMedia', 'inlineMedia']) {
  const arg = fn === 'getMedia' ? 'abc' : fn === 'inlineMedia' ? '<img src="media:abc">' : undefined;
  await assert.rejects(
    () => db[fn](arg),
    (e) => {
      assert.ok(e instanceof Error, `${fn} must reject with an Error, got ${typeof e}`);
      return true;
    },
    `${fn} must reject (not throw synchronously) so callers can catch it`
  );
}

/* saveProject must reject too, not resolve silently */
await assert.rejects(() => db.saveProject({ meta: {}, sections: [] }), Error);

/* and the guarded call sites: the exact code the screens run */
async function safeGetKey() {
  let key = null;
  try { key = await db.getApiKey(); } catch { throw new Error('blocked key'); }
  return key;
}
await assert.rejects(() => safeGetKey(), /blocked key/);

/* export fallback: a page still renders, and the whole <img> goes, not just src */
const html = db.inlineMedia ? '<p>a</p><img src="media:abc" alt="x"><p>b</p>' : '';
const stripped = html.replace(/<img[^>]*src="media:[^"]*"[^>]*>/g, '');
assert.equal(stripped, '<p>a</p><p>b</p>', 'export fallback must drop the whole tag');
assert.ok(!/src=""/.test(stripped), 'must never leave an empty src');

console.log('NOSTORAGE OK — every storage call rejects cleanly and the export fallback drops whole tags');
