<div align="center">

<img src="docs/media/wordmark.svg" alt="Swarmsmith — website builder" height="72">

**Write a brief. Nine cursors draw your website. Keep the HTML.**

[![tests](https://github.com/mafk21/swarm-builder/actions/workflows/test.yml/badge.svg)](https://github.com/mafk21/swarm-builder/actions/workflows/test.yml)
[![MIT](https://img.shields.io/badge/licence-MIT-111)](LICENSE)
[![node](https://img.shields.io/badge/node-22.12%2B-111)](package.json)
[![no backend](https://img.shields.io/badge/backend-none-111)](#what-it-does-not-do)
[![no css from the model](https://img.shields.io/badge/model%20writes-CSS%3F%20never-111)](#the-one-guarantee)

</div>

---

A spinner is a lie you watch for thirty seconds. This is the same thirty seconds,
with nine cursors on it: a crosshair drags out a box and a `W × H` badge tracks the
mouse, a headline gets typed a character at a time behind a blinking caret, three
product cards are stamped into copies with red spacing marks, a pen draws the rules.
Then the cursors scatter and the page they built fades in underneath — interactive,
editable, and yours.

<!-- `npm run shots` writes docs/media/mid-build.gif. Until it is committed, GitHub
     renders the alt text instead of a broken frame. See docs/media/README.md. -->
![Nine cursors drawing a coffee roastery page: a hero dragged out with a W×H badge, a headline typed behind a caret, product cards stamped into copies](docs/media/mid-build.gif)

## Quick start

Clone to running in about two minutes. You need **Node 22.12 or newer**
(`node -v`) and **Chrome** or **Edge**. Nothing else — no database, no Docker, no
account.

**1 · Get the code and start it**

```bash
git clone https://github.com/mafk21/swarm-builder.git
cd swarm-builder
npm install
npm run dev
```

Copy-paste the whole block; it runs top to bottom. The dev server prints its address:

```
  ➜  Local:   http://localhost:5173/
```

Open that in your browser. Leave the terminal running — it is the server.

**2 · Paste a free key**

Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API
key** → copy it → paste it into the first screen of the app. No card, no billing.

The app tests the key by asking it to write a sentence, so a key that cannot build a
page is refused there and then rather than thirty seconds into your first build. It is
stored in your browser's IndexedDB and sent to Google and nowhere else. You can
replace or forget it later from the same screen.

**3 · Build something**

Pick a kind → write the brief → tick your sections → choose type and colour → **Build
my page**. The page saves itself into **Your sites**; open it to edit, or **Export
HTML** for one file you own.

<details>
<summary><b>On Windows, or if something does not start</b></summary>

The same commands work in PowerShell, Command Prompt or Git Bash.

- **`npm` is not recognised** — install Node 22.12+ from [nodejs.org](https://nodejs.org)
  and open a new terminal. `node -v` should print `v22.12.0` or higher.
- **Port 5173 is already in use** — something else is running. Stop it, or start on
  another port: `npm run dev -- --port 3000`.
- **The page loads but a build fails immediately** — the key was rejected. Open the
  setup screen, replace it, and try again. Google's free tier also throttles: the app
  says so on screen when that is the cause.
- **`npm install` fails on a font package** — three `@fontsource` packages are
  dependencies and must install; a corporate proxy blocking npm is the usual reason.
  The tests do not need them.
- **Something else is broken** — `npm run doctor` prints what this build expects.
  [Issues](https://github.com/mafk21/swarm-builder/issues) are open.

</details>

---

## The trick

The cursors are not a cartoon about building. Here is the actual order of events:

```
  your brief
      │
      ▼
  one request to Gemini ──▶ a SiteSpec: typed sections, copy, a theme id
      │                     (no colours, no sizes, no classes — the schema has
      ▼                      no field for them, so it cannot invent any)
  renderDocument() ──────▶ a real, complete HTML page
      │
      ▼
  hidden iframe ─────────▶ the browser lays it out for real
      │
      ▼
  blueprint ─────────────▶ every box, line and text run, with the pixel it sits on
      │
      ▼
  the swarm ─────────────▶ draws those boxes where they really are, types that
                            text where it really goes, stamps those cards where
                            they really land
      │
      ▼
  the same page fades in underneath. It was there the whole time.
```

Which is why the text lands where the text goes. It is not an animation of a page —
it is the page's own geometry, re-enacted.

---

## What you get

|  |  |
|---|---|
| **A page, not a promise** | Rendered, measured, drawn, then handed over as a real document you can click. |
| **Copy that only knows what you said** | Every fact comes from your brief or your PDF. A deterministic pass strips invented testimonials, prices and claims before you ever see them. |
| **An editor that means it** | Every field in the inspector is a real input writing back to the same spec the page was rendered from. |
| **One file you own** | Export opens in any browser. No CDN, no runtime, no build step, no account. |
| **Ten kinds, thirteen sections, eight type systems** | A shop is not asked what a portfolio is asked. The themes are hand-built, so the worst result is *plain* — never slop. |

---

## The one guarantee

> **The model never writes CSS.**

`SiteSpecSchema` is `.strict()` and has no field for a colour, a size, a class or a
style. The model fills in typed sections, writes copy, and picks one of eight
hand-built themes. Anything it invents outside that shape is stripped by the
validator and reported.

The worst output of this program is **plain**. It cannot be gradients, glassmorphism,
three identical feature cards, or "unlock the power of". That is not a prompt
instruction that might be ignored; it is a type with no place to put the slop, and
`npm test` fails if the shape is loosened.

---

## Eighty seconds, enforced three ways

One request. A hard wall. The drawing is compressed to fit whatever time the model
leaves — never past `3×` — and if the model runs long, the finished page is painted
anyway. Three independent things enforce it: a request deadline, a component
watchdog, and a module-level timer no unmount can cancel.

| model takes | draws at | page visible |
|---|---|---|
| 2s | 1.0× | **22s** |
| 8s | 1.0× | **30s** |
| 20s | 3.0× | **31s** |
| 50s | 3.0× | **47s** |

`npm test` fails if the budget is raised above 90 seconds.

---

## What it does not do

- **No backend.** Sites live in this browser's IndexedDB. Nothing syncs, nothing is
  backed up. Export what you want to keep.
- **No CSS from the model** — see above. This is a feature; it is also a limit.
- **No Safari or Firefox.** Saving needs the File System Access API.
- **No pretending about the contact form.** It opens your visitor's mail app,
  because there is no server to receive a message.
- **Free-tier keys throttle.** Flash gives roughly 20 requests a day; the app falls
  back to Flash-Lite and says so on screen, in plain words, including when it resets.
- **Very long pages** are drawn from a measured subset. The camera follows the work
  and the full page appears underneath.

---

## Tests

```
npm test          # 27 suites · typecheck · build — jsdom, esbuild, stubbed network
```

No key, no Chromium, no secrets. Every push runs them. Most suites exist because a
specific bug shipped: a build that displayed for 518 seconds, an export button that
made no file, a first build that always "failed", cursors that orbited the page
without ever touching what they built.

<details>
<summary><b>Every image in this README is generated, not mocked</b></summary>

```bash
npm run shots                 # the in-app screenshots, via the Chrome you already have
npm run card                  # 1080×1920 story cards and the poster
npm run logo                  # the mark, the wordmark, the favicon
npm run shots -- --check      # verify the plumbing, capture nothing
```

Each one is real output from a script in this repo, committed as-is. Nothing
here was drawn in an image editor, and nothing is a placeholder.

It builds the app, serves it locally, answers the single Gemini request with a canned
spec (no key, no quota), clicks through the real screens and writes the GIF and two
PNGs into `docs/media/`. If it cannot find a browser it says so and exits `2` — it
never writes a placeholder.

There is also a **story card** — a 1080×1920 poster, for posting rather than
screen-recording:

```bash
npm run card                  # docs/media/story-launch.png + story-guarantee.png
npm run card -- --check       # fonts and names only, renders nothing
```

Details in [docs/media/README.md](docs/media/README.md).

</details>

---

## Where to look

| file | what it is |
|---|---|
| [`src/lib/spec.ts`](src/lib/spec.ts) | **Start here.** The contract everything else follows from. |
| [`src/lib/blueprint.ts`](src/lib/blueprint.ts) | A rendered page, taken apart into something drawable. |
| [`src/lib/swarm.ts`](src/lib/swarm.ts) | The engine: regions, drags, typing, copies, flocking, camera. |
| [`src/lib/gemini.ts`](src/lib/gemini.ts) | The model calls, the fallback ladder, the deadline. |
| [HANDOFF.md](HANDOFF.md) | State, decisions, known gaps. |
| [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) | The product, and the "no AI patterns" doctrine. |
| [CONTRIBUTING.md](CONTRIBUTING.md) | The one rule that cannot be broken, and how to send a change. |

---

<div align="center">

**The idea of a swarm of cursors building a page is Joel Califa's**
([Swarm](https://califa.github.io/swarm-site/)),
extended to rebuilding existing pages by
[Dhvanil Patel](https://github.com/DhvanilPatel/swarm-cursors).
This project points it at a page that does not exist yet.

<sub>MIT for the code · [LICENSE](LICENSE) · [NOTICE](NOTICE) explains what the licence does and does not cover</sub>

</div>
