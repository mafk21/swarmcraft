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
7. **Projects** — a real list: open, rename, delete (with confirmation). Saved sites
   reopen at the workbench, and saving updates in place instead of duplicating.
8. **Result** — a workbench: live preview beside an inspector that edits every field of
   every section type, plus theme, accent, brand, nav and footer. Clicking a section in
   the preview opens its card. Add, duplicate, reorder and remove sections. Bring your own
   images (stored in IndexedDB, inlined on export). Up to six pages, exported as linked
   `index.html` + per-page files. Replay the build from the edited page.

## The Muses, actually doing things

They are no longer labels on cursors. `buildSite()` in `gemini.ts` runs a conductor:

| Muse | When | What it does |
|---|---|---|
| Calliope | first, deterministic | hero to the top, contact to the end, reports anything never produced |
| draft | — | the section composition and copy |
| slop guard | after the draft | one rewrite naming the exact banned phrases |
| Clio | model | fixes contradictions in price, name and spelling; reports the fields it touched |
| Thalia | model | rewrites copy that misses the requested register |
| Polyhymnia | last, deterministic | alt text, "click here" buttons, heading presence |

Each pass can fail without failing the build: the previous spec is kept and the report
says so. The build HUD shows them live.

## The four ideas that make it work

**1. The model cannot write CSS.**
Every object in the schema is `.strict()` — the spec, and all twenty-six nested objects
inside sections. There is no field for a style, a class, or a colour, and an unknown key
is rejected rather than silently stripped.
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

1. **The canvas has never been watched running.** There is no browser in the build
   sandbox. Every piece of the engine is unit-tested headlessly and the whole app
   typechecks and builds, but no human has seen a frame. This is the first thing to do.
2. **The demo build is the fastest way in.** Key screen → "Watch the swarm with a sample
   page". No network, no key.
3. **Muse passes cost round trips.** Clio and Thalia are two extra Gemini calls. If the
   free tier rate-limits, set `withMuses: false` in `buildSite()` and only Calliope and
   Polyhymnia (both deterministic) will run.
4. **Pages are not in the project store yet.** The workbench holds extra pages in memory;
   only the current page is written by `saveProject()`. `savePage()`/`listPages()` exist
   and are wired but the workbench does not call them yet.
5. **Section shapes are still largely shared.** Kinds now get a prompt describing their
   natural shape (see `KIND_SHAPES` in `gemini.ts`) and galleries have four
   compositions, but every kind still draws from the same thirteen section types.
6. **Images are data URLs in IndexedDB.** Fine for a handful of photographs; a gallery of
   forty at 6 MB each will crawl. Move to blobs plus `URL.createObjectURL` if it bites.
7. **No image cropping or focal point.** Portraits and gallery plates are `object-fit:
   cover` with the centre of the frame.

## Non-negotiables

- **Not an extension.** No manifest, service worker, `chrome.storage`, or store flow.
- **The model never writes CSS.** If a change would let it, the change is wrong.
- **No AI patterns.** No gradients, no glassmorphism, no emoji, no "unlock the power",
  no centred-everything hero with three identical feature cards. Both in the app chrome
  and in every generated site.
- **Facts only from the user.** If they gave no testimonials, none are invented.
- **Frontend only.** No backend. IndexedDB and the File System Access API are enough.
