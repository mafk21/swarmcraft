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

Node 22.12+. `npm run build` and `npm run typecheck` both pass.

You need one free Gemini API key (`https://aistudio.google.com/apikey`) for the real
pipeline. There is no sample page and no demo mode: the app contains no built-in
content, and every page it draws comes from a brief you wrote. (A button offering one
used to be documented here; it was removed with the rest of the mock data. If you want
to see the animation without spending a request, build once and press **Replay** in the
HUD — that redraws the page you already have.)

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

## Why it took 140 seconds, and what fixes it

The brief was a finished website in 60–90 seconds. It was taking longer than two minutes,
and the layout of the fault explains why nobody caught it: every individual ceiling looked
reasonable, and nothing added them up.

**There were three model calls, not one.** A draft, then a repair round-trip if validation
failed, then a slop rewrite if any banned phrase survived — each with a 40-second ceiling
of its own. A bad draft could therefore spend 120 seconds before measuring had even begun.
The repair and the rewrite are both gone:

- *shape* — `validateSpec` repairs locally and for free: invalid sections are dropped, a
  list longer than nine is trimmed. A page that is merely imperfect is still a page.
- *wording* — the banned-phrase list, the section rules and the voice rules are all in
  `SYSTEM` before the request goes out. The slop scan afterwards **reports** what survived
  rather than spending another call to hide it.

`clio`, `thalia` and `pickTheme` are deleted. They were unreferenced, and each was a
40-second foot-gun waiting to be called again. There is now exactly one `await call(` in
the file.

**The ceilings were per stage, so they could not add up to a limit.** There is now one
`BUDGET_MS = 80_000`, started before the first request. Each call gets
`min(25s, budget left)`. The animation is inside the budget too: a real page is ~27s at 1×,
so if the model used 50s the build runs faster to still land inside 80s. Every step still
happens, just faster. The page is up inside the promise, not after it.

**A deadline that only asks is not a deadline.** Aborting the request tells the network
layer to stop, but if the implementation ignores the abort — or resolves headers and then
never finishes the body — the promise never settles. The same timer now also *rejects*,
and `call()` races the fetch, the error body and the JSON body against it. Verified with a
stub that opens headers and never writes the body: it fails at the deadline, not at forty
seconds per attempt.

**Two unbounded waits, now bounded.** `await doc.fonts.ready` had no timeout — a font that
never settled was a build that never ended; it races a 600ms timer. And the pipeline
awaited a bare `requestAnimationFrame` to let React commit, which never fires in a
background tab; it races a 250ms timer.

### The third one: 300 seconds, and it was the measurement

The model had one call. The animation was capped. And it still took five minutes, because
the thing that was slow **was also the thing that prevented the deadline from firing.**

`lineChunks()` split every text node into *one character per `getClientRects()` call*. On a
modest page that is ~2,000 synchronous layout reflows; on a real one it is far more. Every
one blocks the main thread, and **a blocked main thread cannot run the `setTimeout` that
would fire the deadline**. So the 80-second budget was correct and unreachable at the same
time. This is the lesson of the whole exercise: a timeout is only as good as the thread's
willingness to yield.

Three changes:

- **Query count scales with lines, not characters.** A segment is probed as a whole; if it
  is on one line, one query covered a thousand characters; if it straddles a break, it is
  halved. 6,000 characters went from **1,202 queries to 98**, and the demo page from 513 to
  315. Same output: 117 boxes, 61 texts.
- **The walk is bounded** at 4,000 elements, and `snapshotHtml` takes the build deadline and
  cannot outlive it.
- **One frame is yielded** before measuring, so the caller's clock gets a turn and the
  browser can finish the layout it is about to be asked about.

`scripts/measure-test.mjs` asserts the query count and fails if it ever grows with the
character count again.

### The flow the user asked for: one prompt box, then a document

Pick a kind → write the brief in one box → optionally attach a PDF → pick sections and a
theme → build.

The box *is* the brief. It is passed to the model verbatim, under a heading that tells the
model it wins over generic advice, and it is capped at 6,000 characters rather than
summarised. The per-kind questions are still there behind a disclosure for anyone who wants
precision; they are no longer a wall between the user and the build, and nothing is
required except the name and the box.

PDF text is extracted in the tab by pdf.js, capped at 30 pages and 24 MB, and sent as
`SOURCE DOCUMENT` material alongside the brief. Scans are detected and reported rather than
silently producing nothing. The file never leaves the machine; only the words go into the
request.

### The second 140 seconds: the animation ran on the wrong clock

Even with one request, a build could still sit on screen for minutes. The cause was in
`Swarm.tick`: frame deltas were clamped to 50ms and the scene clock was *accumulated* from
them. A 60Hz machine advances 16ms a frame and everything is fine. A machine whose frame
took 120ms advanced 50ms per frame — so the animation ran at roughly a quarter speed and
a 27-second build silently took **114 seconds**. Measured, in `swarm-test.mjs`: at a 250ms
frame rate the old code took 114,750ms for a 22,932ms build. That is the number the user
counted.

Frame time now affects how *smooth* the build looks and nothing else:

- `wall` is real elapsed time since `play()`, minus paused spells. `clock = wall * speed`.
  The scene is still deterministic in scene-time; the timeline is real.
- `hardCapMs` is a promise, not a request. Speed is what we *ask* for and a slow machine may
  not deliver it; the cap paints the finished page and calls `onDone` regardless. A build
  cannot exceed it whatever the frame rate.
- Boxes and lines are now culled vertically like text already was. Every box on a
  6,000-pixel page used to be filled on every frame, on screen or not.

### The policy lives in one place, and the test uses it

`src/lib/timing.ts` decides speed and cap from (animation length, time spent, deadline).
`BuildScreen` calls it. `timeline-test.mjs` **imports** it. The previous rounds restated
the rule in the test, which is how a test can pass while the product fails.

Measured end to end, real pipeline, stubbed network, frame clock driven by hand:

| model takes | speed | drawing | page visible |
|---|---|---|---|
| 2s | 1.0× | 19.8s | **22.3s** |
| 8s | 1.0× | 19.8s | **29.8s** |
| 20s | 3.0× | 5.9s | **30.9s** |
| 35s | 3.0× | 6.2s | **43.0s** |
| 50s | 3.0× | 6.0s | **46.5s** |

**Budget now:** one request, generous 55s ceiling so a slow-but-good answer is not thrown
away, and 80s for the whole build. A normal build lands around 30 seconds. `npm test`
fails if the budget is raised above 90 seconds.

The ceiling was 4× and the comfortable total 22s, which compressed a 27s drawing into
six seconds — nothing in it could be followed. A build is worth watching for longer
than it is worth finishing sooner.

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
3. **Muse passes cost round trips.** Clio and Thalia are two extra Gemini calls. There is
   a "Review passes" toggle on the theme screen that turns them off; Calliope and
   Polyhymnia are deterministic and always run.
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
