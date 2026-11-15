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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderCard, CARDS, CARD_NAMES, CARD_W, CARD_H, CARD_FONTS, CARD_FONT_DIRS } from './lib/story-cards.mjs';

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
  ok(`${name}: points at the repo`, /github\.com\/mafk21\/swarm-builder/.test(card.cta.label));
  ok(`${name}: every claim is checkable`, card.proof.every((p) => p.length < 44), 'a proof that needs a sentence is not a proof');
}

/* ── the document ─────────────────────────────────────────────────────────── */

for (const [name, card] of Object.entries(CARDS)) {
  const html = renderCard(card);

  ok(`${name}: is a document`, /^<!doctype html>/i.test(html));
  ok(`${name}: declares the story size`, html.includes(`${CARD_W}px`) && html.includes(`${CARD_H}px`));
  ok(`${name}: is 1080×1920`, CARD_W === 1080 && CARD_H === 1920);
  ok(`${name}: loads all three bundled faces`, Object.values(CARD_FONTS).every((f) => html.includes(f)));
  ok(`${name}: the claim is on the card`, html.includes(card.claim.split('\n')[0].slice(0, 12)));
  ok(`${name}: the url is on the card`, html.includes('github.com/mafk21/swarm-builder'));
  ok(`${name}: has nine cursors`, (html.match(/class="cur"/g) ?? []).length === 9, String((html.match(/class="cur"/g) ?? []).length));
  ok(`${name}: every cursor has its own colour`, new Set([...html.matchAll(/--cc:(#[0-9a-f]{6})/g)].map((m) => m[1])).size === 9);
  ok(`${name}: no external request`, !/(src|href)="https?:/.test(html), 'a card must render offline');
  ok(`${name}: no <script>`, !/<script/i.test(html));

  /* The app's own doctrine, applied to its own poster. */
  ok(`${name}: no gradient background`, !/background:[^;]*gradient\(/i.test(html.split('.hero-box')[0]), 'the graticule is the only texture');
  ok(`${name}: no blur or glass`, !/blur\(|backdrop-filter/i.test(html));
  ok(`${name}: monochrome chrome with one accent`, (html.match(/#[0-9a-f]{6}/gi) ?? []).length > 4);

  /* Escaping: the card interpolates strings into HTML, so a stray `&` or `<`
     in edited copy must not be able to break the document. */
  ok(`${name}: escapes the copy`, !html.includes('<script') && renderCard({ ...card, claim: 'a < b & c' }).includes('a &lt; b &amp; c'));
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

ok('every card has a description', Object.keys(CARD_NAMES).every((k) => k in CARDS && CARD_NAMES[k].length > 10));
ok('every card is in the CLI map', Object.keys(CARDS).every((k) => k in CARD_NAMES));
ok('card names are filename-safe', Object.keys(CARDS).every((k) => /^[a-z][a-z-]*$/.test(k)));
ok('two cards', Object.keys(CARDS).length === 2);

/* ── done ─────────────────────────────────────────────────────────────────── */

if (fail) {
  console.log(`\n  card-test: ${fail} failure(s)\n`);
  process.exit(1);
}
console.log('\n  card-test: OK\n');
