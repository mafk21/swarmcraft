# swarmsmith

A local app that builds you a real website.

You answer a few questions, choose the kind of site and which sections it gets, then
nine cursors draw the page in front of you — crosshair-dragged boxes with live W×H
badges, typed headlines with a caret, ruled lines, ruler guides — and the finished
interactive site fades in underneath. Then you export it.

It runs on your machine at `localhost:5173`. No account, no server, no extension. Your
own Gemini key, stored in your own browser.

```bash
npm install
npm run dev
```

Node 22+. `npm run build` and `npm run typecheck` pass.

## How to read this repo

1. **[HANDOFF.md](HANDOFF.md)** — start here. State, decisions, known gaps. **Read first.**
2. **[Build Plan](docs/BUILD-PLAN.md)** — the product, the reference we decoded, the
   "no AI patterns" doctrine, the render → snapshot → rebuild architecture.
3. **[`src/lib/spec.ts`](src/lib/spec.ts)** — the contract. Read this before the rest of
   the code; everything follows from it.
4. **[`src/lib/blueprint.ts`](src/lib/blueprint.ts)** and
   **[`src/lib/swarm.ts`](src/lib/swarm.ts)** — how the animation is real rather than
   decorative.

## The one guarantee

The model cannot write CSS. `SiteSpecSchema` is strict and has no styling fields. The
model composes typed sections and writes copy, then picks one of eight hand-built themes.
The worst possible output is plain, never slop.

## The two-line thesis

Swarm Rebuild re-enacts building a page that already exists. This builds a page that did
not exist five seconds ago, and it actually runs.

## Status

🟢 **Runs.** The full funnel works: key → kind → brief (with optional PDF) → sections →
theme → build → result. Export is a standalone HTML file. No key? The first screen has a
demo build that skips the model.

The reference research is in [docs/chrome-extension-field-guide.md](docs/chrome-extension-field-guide.md) —
historical, from when this started life as an extension idea. Kept for browser-API
reference only.
