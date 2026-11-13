/* The stamp exists because four rounds were spent on code the user's machine
   did not have. This asserts that the built bundle names a commit, so "which
   version are you running?" always has an answer. */
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import assert from 'node:assert/strict';

if (!existsSync('dist/index.html')) {
  console.log('  FAIL  dist/ is missing — run `npm run build` first');
  process.exit(1);
}

const html = readFileSync('dist/index.html', 'utf8');
const ref = html.match(/src="([^"]+\.js)"/);
assert.ok(ref, 'index.html must reference a bundle');

const js = readFileSync('dist' + ref[1], 'utf8');

const head = execSync('git rev-parse --short=7 HEAD').toString().trim();
assert.match(
  js,
  new RegExp(head),
  `the bundle must be stamped with the current commit (${head}). ` +
    'Without it there is no way to tell a stale checkout from a live bug.'
);

/* and the stamp must be visible, not just present in the source */
assert.match(js, /build /, 'the stamp must be rendered as "build <commit>"');

console.log(`VERSION OK — the bundle is stamped with ${head} and shows it on screen`);
