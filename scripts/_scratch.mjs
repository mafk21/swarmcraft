/**
 * A scratch directory for the tests' bundled modules.
 *
 * Each test bundles the real source with esbuild and imports the result, which
 * has to live on disk so bare imports like `zod` resolve. It used to be written
 * to `.tmp/`, a directory that is gitignored — so on a fresh clone the very
 * first `npm test` crashed with ENOENT instead of running. The tests must not
 * depend on a scratch directory that may not exist.
 */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../.test-scratch', import.meta.url));

export function scratch(name) {
  mkdirSync(root, { recursive: true });
  const file = join(root, name);
  return {
    path: file,
    url: pathToFileURL(file).href,
  };
}

export function cleanScratch() {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    /* nothing to clean */
  }
}
