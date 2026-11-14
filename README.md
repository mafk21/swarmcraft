# swarmsmith

**Describe a website. Watch nine cursors build it. Keep the file.**

A local app that builds you a real, working website. Pick what kind of site it is,
write the brief in one box (optionally attach a PDF and its text is used too),
choose the sections and a type system — then nine cursors draw the page in front of
you: crosshair-dragged boxes with live `W × H` badges, headlines typed with a caret,
ruled lines, ruler guides, repeated cards stamped out as copies. The finished
interactive site fades in underneath, and you export it as plain HTML you own.

A build is **one request to Gemini** and the page is visible **inside 80 seconds**,
usually in about 30. That limit is enforced in three independent places, not hoped
for — see [the budget](#the-build-budget).

It runs on your machine at `localhost:5173`. No account, no server, no extension,
no telemetry. Your own Gemini key, stored in your own browser.

<!--
  Media: drop these three files into docs/media/ and they appear here.
  See docs/media/README.md for exactly what to record.
-->
![The swarm drawing a page](docs/media/mid-build.gif)

| | |
|---|---|
| ![The finished page](docs/media/finished.png) | ![Editing it in the inspector](docs/media/inspector.png) |

```bash
npm install
npm run dev          # http://localhost:5173
```

Node 22.12+.

## Try it in two minutes

1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
   No card. Both key formats work (`AQ.Ab…`, which AI Studio issues now, and `AIza…`).
2. Paste it on the first screen. It is validated against Google and stored in
   IndexedDB — it never leaves this machine except to Google.
3. Pick a kind, write the brief, tick your sections, pick a theme.
4. Watch the build. It has pause, `1×`/`2×`/`3×`, replay, and sound.
5. The site is already in **Your sites**. Open it to edit every field, or export it
   as a standalone `index.html`.

## The one guarantee

**The model cannot write CSS.** `SiteSpecSchema` is strict and has no styling fields.
The model composes typed sections and writes copy, then picks one of eight hand-built
themes. The worst possible output is *plain* — never slop. That is enforced by the
schema, not by asking nicely in a prompt.

## How it works

```
brief ──▶ Gemini ──▶ SiteSpec ──▶ renderDocument() ──▶ a real HTML page
                                        │
                                        ▼
                              snapshotHtml(): measure the
                              real DOM in a hidden iframe
                                        │
                                        ▼
                     Blueprint (boxes, lines, every visual line
                     of text, and where each one actually sits)
                                        │
                                        ▼
                        Swarm draws it on a canvas, then the
                        live page fades in underneath
```

The animation is not a cartoon of building. It is the browser's own layout,
measured and then re-drawn — which is why the text lands where the text goes.

## How to read this repo

1. **[`src/lib/spec.ts`](src/lib/spec.ts)** — the contract. Read this first;
   everything follows from it.
2. **[`src/lib/blueprint.ts`](src/lib/blueprint.ts)** — how a rendered document is
   taken apart into something drawable.
3. **[`src/lib/swarm.ts`](src/lib/swarm.ts)** — the engine: regions, drags, typing,
   copies, flocking.
4. **[HANDOFF.md](HANDOFF.md)** — state, decisions, known gaps, the build budget.
5. **[docs/BUILD-PLAN.md](docs/BUILD-PLAN.md)** — the product, the reference we
   decoded, the "no AI patterns" doctrine.

## Tests

```bash
npm test
```

26 suites, browserless — jsdom, esbuild and a stubbed network. No API key, no
Chromium, no secrets. They run on every push and pull request in
[`.github/workflows/test.yml`](.github/workflows/test.yml).

The suite is not decoration; several suites exist because a specific bug shipped:

| suite | the bug it exists for |
|---|---|
| `budget-test`, `timeline-test` | a build could display for 518 seconds |
| `lastresort-test` | the request timed out and the screen kept counting |
| `watchdog-test` | a hung build never stopped itself |
| `first-run-test` | the first build of a session always "failed", and the failed one appeared in your history |
| `history-test` | built sites were never saved, so "Your sites" was always empty |
| `download-test` | the export button produced no file |
| `motion-test` | generated pages had zero animation |
| `contact-test` | a phone number rendered as dead text and the contact form threw messages away |
| `swarm-choreography-test` | the cursors orbited the page without ever touching what they built |
| `gemini-test` | invented testimonials attributed to customers who do not exist |

## The build budget

One request. 80 seconds for the whole build, enforced by a request deadline, a
component watchdog, and a module-level timer that no unmount can take away. The
drawing is compressed to fit the remaining time (never past `3×`), and a hard cap
paints the finished page and hands over. `npm test` fails if the budget is raised
above 90 seconds.

| model takes | speed | drawing | page visible |
|---|---|---|---|
| 2s | 1.0× | 19.8s | **22.3s** |
| 8s | 1.0× | 19.8s | **29.8s** |
| 20s | 3.0× | 5.9s | **30.9s** |
| 50s | 3.0× | 6.0s | **46.5s** |

## Known limits

- **Free tier only.** Flash allows ~20 requests a day; the ladder falls back to
  Flash-Lite (500/day) so a build usually still lands. A rate limit is explained on
  screen in plain words, including when it resets.
- **No backend, by design.** Everything is IndexedDB + the File System Access API.
  Nothing syncs, nothing is backed up. Export what you want to keep.
- **The contact form sends by mail.** There is no server to receive a message, so the
  form opens the visitor's mail app with the message filled in rather than pretending.
- **Very long pages** are drawn from a measured subset; the camera follows the work.
- **The animation engine is an adaptation.** See [NOTICE](NOTICE).

## Credits

The idea of a swarm of cursors building a page belongs to **Joel Califa**
([Swarm](https://califa.github.io/swarm-site/)), and was brought to any-page
rebuilds by **Dhvanil Patel** ([Swarm Rebuild](https://github.com/DhvanilPatel/swarm-cursors)).
This project takes that language and points it at a page that does not exist yet.
Read [NOTICE](NOTICE) before reusing the animation code.

## License

MIT for the code in this repository — see [LICENSE](LICENSE) and, importantly,
[NOTICE](NOTICE) for what the license does and does not cover.
