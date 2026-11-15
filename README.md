# Swarmsmith

[![tests](https://github.com/mafk21/swarm-builder/actions/workflows/test.yml/badge.svg)](https://github.com/mafk21/swarm-builder/actions/workflows/test.yml)

**Write a brief. Nine cursors draw your website. Keep the HTML.**

Swarmsmith is a website builder that runs on your machine. You describe the site
you want in plain words, it composes a page, and then — instead of a spinner — you
watch a swarm of cursors actually build it: boxes dragged out with `W × H` badges,
headlines typed with a caret, repeated cards stamped into copies. The finished page
is interactive, editable, and exports as one `index.html` file you own.

No account. No server. No browser extension. Your own Gemini key, stored in your
own browser.

<!--
  The demo GIF. `npm run shots` writes docs/media/mid-build.gif; until it is
  committed, GitHub renders the alt text rather than a broken frame. See
  docs/media/README.md.
-->
![Nine cursors drawing a coffee roastery page: a hero dragged out with a W×H badge, a headline typed behind a caret, product cards stamped into copies](docs/media/mid-build.gif)

```bash
git clone https://github.com/mafk21/swarm-builder.git && cd swarm-builder
npm install
npm run dev                    # → http://localhost:5173
```

Node 22.12 or newer. Then paste a free key from
[aistudio.google.com/apikey](https://aistudio.google.com/apikey) into the first
screen and build. The app checks the key by asking it to write something, so a key
that cannot build a page is caught before your first build, not during it.

## What you get

- **A real page, not a canvas full of talking.** The cursors do not mime building.
  The page is rendered first, measured in a hidden iframe, taken apart into boxes,
  lines and text runs, and then re-drawn from that measurement — which is why the
  text lands where the text goes and the reveal underneath is the same page.
- **Copy that only knows what you told it.** Every fact on the page comes from your
  brief or your PDF. There is a deterministic pass that removes invented
  testimonials, prices and claims.
- **You can edit everything after it is built.** Every field in the inspector is a
  real input writing to the same spec the page was rendered from.
- **Export opens in any browser.** One file, no network, no build step, no CDN.

## The one guarantee

**The model cannot write CSS.**

`SiteSpecSchema` is strict and contains no styling fields. The model fills in typed
sections and copy, then picks one of eight hand-built themes. The worst output is
*plain* — never gradients, never glassmorphism, never three identical feature cards.
That is enforced by the schema and checked by the test suite, not requested in a
prompt.

## Sixty seconds, enforced

A build is **one request to Gemini** and the page is visible **inside 80 seconds**,
usually around 30. Three independent things enforce that: a request deadline, a
component watchdog, and a module-level timer no unmount can cancel. The drawing is
sped up (never past `3×`) to fit the time left, and if the model runs long the
finished page is painted anyway. `npm test` fails if the budget creeps above 90
seconds.

## What it does not do

- **No backend, no sync, no backup.** Sites live in this browser's IndexedDB.
  Export what you want to keep.
- **Free-tier keys throttle.** Flash allows roughly 20 requests a day; the app falls
  back to Flash-Lite and explains a rate limit on screen in plain words.
- **The contact form opens your visitor's mail app.** There is no server to receive
  a message, and the app will not pretend otherwise.
- **Very long pages are drawn from a measured subset.** The camera follows the work
  and the full page appears underneath.
- **No Safari or Firefox support yet.** It needs the File System Access API for
  saving.

## Screenshots

Everything in this README is captured from a real run, never mocked:

```bash
npm run shots                 # drives your installed Chrome or Edge
npm run shots -- --headed     # watch it happen
npm run shots -- --check      # verify the plumbing without capturing
```

The tool builds the app, serves it locally, answers the single Gemini request with a
canned spec (so it costs no quota and needs no key), clicks through the real screens,
and writes the GIF and two PNGs into `docs/media/`. It never writes a placeholder: if
it cannot find a browser it says so and exits `2`. See
[docs/media/README.md](docs/media/README.md).

## Tests

```bash
npm test          # 27 suites · typecheck · build
```

Browserless: jsdom, esbuild, a stubbed network. No key, no Chromium, no secrets. Every
push runs them in [`.github/workflows/test.yml`](.github/workflows/test.yml). Most
suites exist because a specific bug shipped; the commit messages say which.

## Where to look next

- [`src/lib/spec.ts`](src/lib/spec.ts) — the contract. Everything follows from it.
- [`src/lib/blueprint.ts`](src/lib/blueprint.ts) — how a rendered page becomes drawable.
- [`src/lib/swarm.ts`](src/lib/swarm.ts) — the animation engine.
- [HANDOFF.md](HANDOFF.md) — state, decisions, known gaps.
- [docs/BUILD-PLAN.md](docs/BUILD-PLAN.md) — the product and the "no AI patterns" doctrine.
- [CONTRIBUTING.md](CONTRIBUTING.md) — how to send a change.

## Credits

The idea of a swarm of cursors building a page belongs to **Joel Califa**
([Swarm](https://califa.github.io/swarm-site/)), and was extended to rebuilding
existing pages by **Dhvanil Patel**
([Swarm Rebuild](https://github.com/DhvanilPatel/swarm-cursors)). This project takes
that language and points it at a page that does not exist yet. Read [NOTICE](NOTICE)
before reusing the animation code.

## Licence

MIT for the code here — see [LICENSE](LICENSE) and, importantly, [NOTICE](NOTICE) for
what that licence does and does not cover.
