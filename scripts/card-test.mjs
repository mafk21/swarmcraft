/**
 * The story cards, checked without a browser.
 *
 *   node scripts/card-test.mjs
 *
 * Rendering a 1080×1920 PNG needs Chrome. Everything the card *is* — its copy,
 * its layout rules, its fonts, the server that feeds it — does not. Those are
 * checked here, because a card that goes out on someone's Instagram is the most
 * public thing this repo produces and the easiest to get subtly wrong.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';


/* The repo this card advertises, taken from package.json's repository field.
   It used to be written as a literal here AND in story-cards.mjs, so the rename
   to swarmcraft broke four assertions and would have been missed entirely if the
   literals had agreed with each other and disagreed with the repo. One source. */
const REPO = (() => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const url = String(pkg.repository?.url ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
  const m = url.match(/github\.com\/([^/]+\/[^/]+)/);
  return m ? `github.com/${m[1]}` : 'github.com/mafk21/swarmcraft';
})();
import {
  renderCardSvg,
  wrap,
  measure,
  CARDS,
  CARD_NAMES,
  CARD_RENDERERS,
  CARD_W,
  CARD_H,
  SOCIAL_W,
  SOCIAL_H,
  BRAND,
  CARD_FONTS,
  CARD_FONT_DIRS,
} from './lib/story-cards.mjs';
import { wordmarkSvg } from './lib/logo.mjs';

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (!cond) {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

/* ── the copy rules ───────────────────────────────────────────────────────── */

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
const BANNED = ['unlock', 'supercharge', 'revolutionary', 'game-changing', 'seamless', 'effortless', 'empower', 'leverage', 'cutting-edge', 'blazing', '10x', 'magic'];

for (const [name, card] of Object.entries(CARDS)) {
  const text = [card.eyebrow, card.claim, card.sub, card.cta.label, card.cta.note, card.kicker, ...card.proof].join(' ');
  ok(`${name}: no emoji`, !EMOJI.test(text), text.match(EMOJI)?.[0]);
  const slop = BANNED.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
  ok(`${name}: no marketing words`, slop.length === 0, slop.join(', '));
  ok(`${name}: has a claim`, card.claim.trim().length > 8);
  ok(`${name}: claim is at most two lines`, card.claim.split('\n').length <= 2);
  ok(`${name}: has three proofs`, card.proof.length === 3, String(card.proof.length));
  ok(`${name}: points at the repo`, card.cta.label.includes(REPO));
  ok(`${name}: every claim is checkable`, card.proof.every((p) => p.length < 44), 'a proof that needs a sentence is not a proof');
}

/* ── the document ─────────────────────────────────────────────────────────── */

for (const [name, card] of Object.entries(CARDS)) {
  const svg = renderCardSvg(card);

  ok(`${name}: is an svg`, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg));
  ok(`${name}: is 1080×1920`, CARD_W === 1080 && CARD_H === 1920 && svg.includes(`width="${CARD_W}" height="${CARD_H}"`));
  ok(`${name}: names the three bundled families`, ['Instrument Serif', 'Instrument Sans', 'JetBrains Mono'].every((f) => svg.includes(`font-family="${f}"`)));
  ok(`${name}: the claim is on the card`, svg.includes(card.claim.split('\n')[0].split(' ')[0]));
  ok(`${name}: the url is on the card`, svg.includes(REPO));
  ok(`${name}: nine cursors`, (svg.match(/<path d="M3 2 L3 19/g) ?? []).length === 9, String((svg.match(/<path d="M3 2 L3 19/g) ?? []).length));
  ok(`${name}: every cursor has its own colour`, new Set([...svg.matchAll(/fill="(#[0-9a-f]{6})" stroke="#0b0b0c"/g)].map((m) => m[1])).size === 9);
  ok(`${name}: no external request`, !/href="https?:|xlink:href/.test(svg), 'a card must render offline');
  ok(`${name}: no script`, !/<script/i.test(svg));
  ok(`${name}: no raster image`, !/<image/i.test(svg), 'the drawing must stay vector');

  /* The app's own doctrine, applied to its own poster. */
  /* The word appears in the guarantee card's own copy ("never gradients"), so
     this looks for the markup, not the letters. */
  ok(`${name}: no gradient paint`, !/<(linear|radial)Gradient|url\(#[^)]*[Gg]radient/.test(svg), 'the graticule is the only texture');
  ok(`${name}: no filter or blur`, !/<filter|feGaussian/i.test(svg));
  ok(`${name}: no pure black or pure white`, !svg.includes('fill="#000000"') && !svg.includes('fill="#ffffff"'));

  /* Escaping: copy is interpolated, so a stray `&` or `<` in edited words must
     not be able to break the document. */
  ok(`${name}: escapes the copy`, renderCardSvg({ ...card, sub: 'a < b & c' }).includes('a &lt; b &amp; c'));

  /* A card whose text runs off the right edge is a card that gets posted with
     half a sentence. Wrapping is testable without a renderer. */
  ok(`${name}: sub wraps inside the column`, wrap(card.sub, 31, 872, 'sans').every((l) => measure(l, 31, 'sans') <= 872));
  ok(`${name}: claim wraps inside the column`, card.claim.split('\n').every((l) => measure(l, 88, 'serif') <= 900), String(Math.round(measure(card.claim.split('\n')[0], 88, 'serif'))));
}

/* ── the name, everywhere it is drawn ──────────────────────────────────────
   The poster said SWARMSMITH for months after the rename. Nothing caught it,
   because a rendered picture is not greppable and nobody re-reads a finished
   asset. So the name is read from package.json and asserted in every SVG, and
   the old one is asserted to be nowhere. */
{
  const all = ['launch', 'guarantee', 'poster', 'social'].map((n) => [n, CARD_RENDERERS[n]()]);
  ok('the brand comes from package.json', BRAND === REPO.split('/').pop().toUpperCase(), BRAND);
  for (const [name, svg] of all) {
    ok(`${name}: does not say the old name`, !/swarmsmith/i.test(svg), 'a renamed product is being drawn under its old name');
  }
  ok('the poster says the current name', CARD_RENDERERS.poster().includes(`>${BRAND}<`));
}

/* ── the social preview ──────────────────────────────────────────────────────
   GitHub shows this on every link to the repo, and it is uploaded by hand, so
   the two things that can silently be wrong are the aspect ratio and the file
   size. Both are checkable here. */
{
  const svg = CARD_RENDERERS.social();
  ok('social: is 1280×640', SOCIAL_W === 1280 && SOCIAL_H === 640 && svg.includes('width="1280" height="640"'));
  ok('social: has the url', svg.includes(REPO));
  ok('social: names the three families', ['Instrument Serif', 'Instrument Sans', 'JetBrains Mono'].every((f) => svg.includes(`font-family="${f}"`)));
  ok('social: four cursors are on the sheet', (svg.match(/<path d="M3 2 L3 19/g) ?? []).length === 4, String((svg.match(/<path d="M3 2 L3 19/g) ?? []).length));

  /* The header is the README's wordmark, not a redrawing of it. If the two ever
     disagree, a link and the page it opens stop looking like one object — so
     the name, the rule and the words come from wordmarkSvg itself, and this
     asserts the pieces are present the way the README shows them. */
  for (const part of ['>Swarmcraft</text>', 'WEBSITE BUILDER']) {
    ok(`social: the header carries "${part}"`, svg.includes(part));
  }
  ok('social: the header is the wordmark, not a hand copy', svg.includes(wordmarkSvg({ height: 86 }).match(/<text[^>]*>Swarmcraft<\/text>/)[0]));
  ok('social: no external request', !/href="https?:|xlink:href/.test(svg));
  ok('social: no gradient', !/<(linear|radial)Gradient|url\(#[^)]*[Gg]radient/.test(svg));
  ok('social: nothing runs off the right edge', !/<text[^>]*x="(1[3-9]\d\d|\d{5,})"/.test(svg));

  const png = new URL('../docs/media/story-social.png', import.meta.url);
  if (existsSync(png)) {
    const bytes = statSync(png).size;
    /* GitHub's limit for this asset is 1 MB; it refuses quietly by doing nothing. */
    ok('social: under GitHub\'s 1 MB limit', bytes < 1024 * 1024, `${Math.round(bytes / 1024)} kB`);
    ok('social: is a png', readFileSync(png).subarray(1, 4).toString('latin1') === 'PNG');
  } else {
    console.log('  note  docs/media/story-social.png has not been rendered (npm run card -- social)');
  }
}

/* ── the fonts are really there ───────────────────────────────────────────── */

const NM = join(process.cwd(), 'node_modules');
for (const [key, file] of Object.entries(CARD_FONTS)) {
  const path = join(NM, CARD_FONT_DIRS[key], file);
  if (!existsSync(path)) {
    console.log(`  note  ${file} is not installed (run npm install) — the tool exits 2 on this`);
    continue;
  }
  const head = readFileSync(path).subarray(0, 4).toString('latin1');
  ok(`${key}: is a woff2 file`, head === 'wOF2', head);
}

/* ── the names the CLI accepts ────────────────────────────────────────────── */

ok('every renderable name has a description', Object.keys(CARD_NAMES).every((k) => CARD_NAMES[k].length > 10));
ok('every copy card is in the CLI map', Object.keys(CARDS).every((k) => k in CARD_NAMES));
ok('every renderable name has a renderer', Object.keys(CARD_NAMES).every((k) => typeof CARD_RENDERERS[k] === 'function'));
ok('the poster has its own composition', CARD_RENDERERS.poster().includes('Your website'));
ok('card names are filename-safe', Object.keys(CARDS).every((k) => /^[a-z][a-z-]*$/.test(k)));
ok('two copy cards and a poster', Object.keys(CARDS).length === 2 && 'poster' in CARD_NAMES);

/* wrap() is what keeps text on the card; it has to be right on its own. */
ok('wrap keeps every line inside the width', wrap('the quick brown fox jumps over the lazy dog again and again', 30, 300, 'sans').every((l) => measure(l, 30, 'sans') <= 300));
ok('wrap never loses a word', wrap('alpha beta gamma', 30, 1000, 'sans').join(' ') === 'alpha beta gamma');
ok('wrap breaks a single over-long word rather than overflowing', wrap('averyveryverylongwordthatcannotfit', 40, 60, 'sans').length >= 1);
ok('wrap of empty text yields one empty line', wrap('', 30, 300).length === 1);
ok('measure grows with size', measure('abc', 20) < measure('abc', 40));


/* ── the card cannot disagree with the repo it advertises ──────────────────
   Two things shipped wrong and survived a full green suite, because a card is a
   PNG and nothing was reading it: the URL said swarm-builder for two commits
   after the rename, and "27 test suites" stayed 27 while the suite grew.

   The count is derived from package.json now, and this asserts the derived value
   reaches the artwork — otherwise suiteCount() could return 0 and the card would
   say "0 test suites" with exactly the same confidence. */
{
  const expected = (String(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts?.test ?? '')
    .match(/node scripts\/[a-z-]+-test\.mjs/g) ?? []).length;

  for (const name of ['story-launch', 'story-guarantee']) {
    const svg = readFileSync(new URL(`../docs/media/${name}.svg`, import.meta.url), 'utf8');
    ok(`${name}: no stale repo url`, !svg.includes('swarm-builder'));
    ok(`${name}: names the real repo`, svg.includes(REPO));
    /* Only the cards that quote a count are held to it. Asserting every card
       carries one would force a figure onto the launch poster that it does not
       have and does not need. */
    if (svg.includes('test suites')) {
      ok(`${name}: quotes the real suite count`, svg.includes(`${expected} test suites`), `expected ${expected}`);
    }
  }

  /* The guarantee card's sub-line said the spec has "no field for a colour, a
     size or a class" while the drawing beside it names className and css. A
     poster that contradicts its own picture is worse than a plain one. */
  const g = readFileSync(new URL('../docs/media/story-guarantee.svg', import.meta.url), 'utf8');
  ok('guarantee: does not deny that styling fields exist', !/no field for a colour/i.test(g));
}

/* ── done ─────────────────────────────────────────────────────────────────── */

if (fail) {
  console.log(`\n  card-test: ${fail} failure(s)\n`);
  process.exit(1);
}
console.log('\n  card-test: OK\n');
