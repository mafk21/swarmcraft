/* "Which version am I running, and is anything stale?"

   Run this when something behaves in a way the latest commit says it cannot.
   It answers the question before any debugging starts. */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const run = (c) => {
  try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return ''; }
};

const say = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

console.log('\nswarmcraft doctor\n');

const head = run('git rev-parse --short=7 HEAD');
const branch = run('git rev-parse --abbrev-ref HEAD');
say('commit', head || 'not a git checkout');
say('branch', branch || '?');

const dirty = run('git status --porcelain');
say('working tree', dirty ? `DIRTY (${dirty.split('\n').length} file(s))` : 'clean');
if (dirty) {
  console.log('    Local changes can block `git pull` and mean you are running');
  console.log('    something that is not in any commit.');
}

const behind = run('git rev-list --count HEAD..@{u}');
if (behind === '') console.log('  upstream              (no upstream set — cannot compare)');
else if (behind === '0') say('vs origin', 'up to date');
else {
  say('vs origin', `${behind} commit(s) BEHIND — this is the bug`);
  console.log('    You are not running the latest code. Fix this first:');
  console.log('      git stash push -u -- package-lock.json');
  console.log('      git pull --ff-only');
  console.log('      npm install');
}

say('node', process.version);

/* the features that most often turn out to be missing */
const has = (path, needle) => {
  if (!existsSync(path)) return false;
  try { return readFileSync(path, 'utf8').includes(needle); } catch { return false; }
};
const nets = [
  ['deadline.ts', has('src/lib/deadline.ts', 'armDeadline')],
  ['clock overrun', has('src/app/StageClock.tsx', 'onOverrun')],
  ['strictmode fix', has('src/app/screens/BuildScreen.tsx', 'ranFor.current = null')],
  ['store buildError', has('src/app/store.ts', 'buildError')],
];
console.log('\n  safety nets present:');
for (const [name, ok] of nets) console.log(`    ${ok ? 'yes' : 'NO '}  ${name}`);

const allThere = nets.every(([, ok]) => ok);
console.log(
  allThere
    ? '\n  All deadline protections are present.\n'
    : '\n  MISSING protections — your checkout predates the hang fixes.\n  Run `git pull --ff-only` and `npm install`, then restart `npm run dev`.\n'
);
