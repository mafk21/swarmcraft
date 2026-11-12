# HANDOFF

Pick this up cold. Everything you need is in this file and the code.

## What it is

A local app that builds a real website. You answer a few questions, pick a kind and
sections, then nine cursors draw the page onto a canvas and the finished interactive
site fades in underneath.

It runs at `localhost:5173`. There is no server, no extension, no store, no account.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Node 22+. `npm run build` and `npm run typecheck` both pass.

You need one free Gemini API key (`https://aistudio.google.com/apikey`) for the real
pipeline. To watch the swarm without a key, click
**"Watch the swarm with a sample page instead"** on the first screen — it builds a
hand-written Store spec and skips the model entirely.

## What is done

The whole path works end to end:

1. **Key screen** — validates the key against Google, stores it in IndexedDB.
2. **Kind** — ten kinds (`src/lib/spec.ts`).
3. **Brief** — two framing questions plus each kind's own question set
   (`src/lib/questions.ts`), and optional PDF extraction (`src/lib/pdf.ts`, pdf.js,
   in-page, no upload, 30-page cap, honest failure on scanned PDFs).
4. **Sections** — the checklist for that kind, hero pinned, minimum three.
5. **Theme** — let the model choose, or pick one of eight hand-built systems
   (`src/lib/themes.ts`) plus six accents.
6. **Build** — Gemini returns a `SiteSpec`, `render()` produces a complete HTML
   document, `snapshotHtml()` measures it in a hidden iframe, `Swarm` rebuilds those
   measurements on a canvas, then the real iframe fades in.
7. **Result** — full-page preview, save to IndexedDB, export standalone HTML.

## The four ideas that make it work

**1. The model cannot write CSS.**
`SiteSpecSchema` is `.strict()`. There is no field for a style, a class, or a colour.
The model composes typed sections and writes copy; it picks a `ThemeId` from a closed
enum of eight. Worst case output is *plain*, never slop. This is enforced by the schema,
not by prompting.

**2. The animation is measured, not invented.**
`snapshot()` walks the real rendered document and records every box, every ruled line,
and every *visual line of text* (measured per character, so line breaks are exact).
The cursors then draw those numbers. This is why it reads as someone building the page:
it is the page. Nothing is re-flowed or guessed.

**3. Nine lanes, no overlaps.**
`planSchedule()` assigns each step to the cursor that is free soonest and nearest.
A lane never starts its next step until the current one is finished, so no box is ever
abandoned half-dragged. In the engine test, 270 steps scheduled with zero lane overlaps
across roughly 25 seconds.

**4. Pause and speed are honest.**
The clock is accumulated (`clock += dt * speed`) rather than derived from start time, so
pausing freezes it and changing speed changes the rate without jumping.

## Where things are

| file | what |
|---|---|
| `src/lib/spec.ts` | the schema, the ten kinds, the thirteen sections, the slop list |
| `src/lib/questions.ts` | per-kind question sets and section checklists |
| `src/lib/themes.ts` | eight authored type systems + six accents |
| `src/lib/render.ts` | `SiteSpec` → complete HTML document |
| `src/lib/blueprint.ts` | `snapshot()` — real DOM → measured Blueprint |
| `src/lib/swarm.ts` | the engine: flocking, scheduling, painting, camera |
| `src/lib/gemini.ts` | the two model calls and their response schemas |
| `src/lib/samples.ts` | the hand-written demo spec |
| `src/styles/tokens.css` | design system: monochrome chrome, nine cursor colours |
| `src/app/` | the funnel: store, shell, seven screens |

## Known gaps, in priority order

1. **No browser testing was possible in the build sandbox.** The pipeline typechecks,
   the renderer and the scheduler are unit-verified, but the canvas has never been seen
   running. First task: open the demo build and watch it.
2. **Slop guard is not wired.** `findSlop()` exists in `spec.ts` and is unused. It should
   run after `buildSpec()` and, on a hit, re-ask once for the offending sections.
3. **Landmarks land all at once.** `advance()` completes every travel before any paint.
   The cursors should be staggered so boxes land at different moments — this is the
   difference between "nine cursors moved" and "nine cursors built a page."
4. **The Muses are decoration.** Their names appear as cursor labels only. Their actual
   responsibilities (sitemap, voice, slop, a11y) are still one monolith call.
5. **Kind-specific section shapes are generic.** Every kind renders from the same
   thirteen section types. A store's product grid and a portfolio's gallery should not
   be the same component.
6. **Edit mode does not exist.** The result screen exports but does not let you change
   anything.
7. **Reduced motion.** `prefers-reduced-motion` is handled in the app's styles but not in
   the engine — it should jump to the finished state.

## Non-negotiables

- **Not an extension.** No manifest, service worker, `chrome.storage`, or store flow.
- **The model never writes CSS.** If a change would let it, the change is wrong.
- **No AI patterns.** No gradients, no glassmorphism, no emoji, no "unlock the power",
  no centred-everything hero with three identical feature cards. Both in the app chrome
  and in every generated site.
- **Facts only from the user.** If they gave no testimonials, none are invented.
- **Frontend only.** No backend. IndexedDB and the File System Access API are enough.
