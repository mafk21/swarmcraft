# Media for the README

The README shows three files from this folder:

| file | what it shows |
|---|---|
| `mid-build.gif` | the swarm mid-draw — boxes being dragged out, a headline half-typed, cursors on different parts of the page |
| `finished.png` | the page after the cursors finish, in the build window |
| `inspector.png` | the workbench: the live page on the left, an open section card on the right |

**They are generated, not recorded by hand.**

```bash
npm run shots                 # all three
npm run shots -- --only=ab    # just two
npm run shots -- --headed     # watch it happen in a visible window
npm run shots -- --check      # verify the plumbing, capture nothing
npm run shots -- --dev        # use a `npm run dev` you already have running
```

## What the tool does

1. Builds the app if `dist/` is missing.
2. Serves `dist/` on a random local port, with a stub at `/api/gemini` that answers
   in Google's response shape with a hand-written spec for a made-up coffee roastery.
   So the real pipeline runs — parse, validate, render, measure, swarm — and it costs
   **no quota and needs no key**.
3. Opens your installed Chrome or Edge (`CHROME_PATH` overrides the search), seeds a
   fake key into IndexedDB so setup is skipped, and clicks through the real screens:
   kind → brief → sections → theme → build.
4. Captures the GIF at 960 px wide and 7 fps for 7 seconds, then the two PNGs.

It writes `docs/media/_failure.png` and exits `1` if the app does something
unexpected, and exits `2` with the paths it tried if it cannot find a browser. It will
never write a stand-in image.

Close other Chrome windows doing heavy work first — the GIF is a realtime capture, so
a machine under load gives you fewer frames, not a wrong one.

## What to check before committing

- The GIF **opens on cursors already in flight**. A first frame of an empty canvas
  loses people before the second frame.
- It **loops** without a visible jump, and stays under about 5 MB.
- No key, email, name or customer data is legible in any frame. The demo brief is
  invented; keep it that way.
- `finished.png` shows a page you would be happy to be judged by. If the demo spec
  renders badly, fix the demo spec in `scripts/lib/shots-kit.mjs` — that is the
  finding, not a capture problem.

## If the images are not there yet

The README references `docs/media/mid-build.gif`, which does not exist until
someone runs the tool on a machine with Chrome in it. Until then GitHub shows the
image's alt text where it would be — the page still reads correctly, because the
alt text is a full sentence and the pitch is in the paragraph above it.

Capturing them is the last step before announcing the project, not a prerequisite
for publishing it.

## Rules

Real screenshots only. A mocked-up "what it looks like" on a project whose whole pitch
is that it really does this is worse than no image at all.

---

# Story cards

`npm run card` renders **1080×1920** PNGs from `scripts/lib/story-cards.mjs`, for
posting to an Instagram or WhatsApp story. It needs no browser — the card is SVG,
rasterised with `@resvg/resvg-js` — so it runs anywhere, including CI:

```bash
npm run card              # everything
npm run card -- launch    # just one
npm run card -- --check   # check fonts and names, render nothing
```

| file | size | what it says |
|---|---|---|
| `docs/media/story-launch.png` | 1080×1920 | what the thing is: the claim, a drawing of a page mid-build, three proofs, the repo URL |
| `docs/media/story-guarantee.png` | 1080×1920 | the rule: the model never writes CSS |
| `docs/media/story-poster.png` | 1080×1920 | one enormous claim, one sheet of paper being dragged, no bullet points |
| `docs/media/story-social.png` | **1280×640** | the link preview — what shows on Slack, X, WhatsApp, anywhere the repo URL is pasted. Opens with the README's own wordmark, so the link and the page it opens look like one object |

The header of the social preview is generated from `wordmarkSvg()` — the same
function the README's wordmark comes from — not redrawn. A test asserts the two
match, because a preview that disagrees with the page it opens is the kind of
mismatch nobody notices until a stranger points it out.

**The social preview is uploaded by hand and cannot be set by the API.** GitHub →
Settings → Social preview → upload `docs/media/story-social.png`. It must stay under
1 MB (it is ~77 kB) and be exactly 1280×640; a test asserts both, because GitHub
rejects the wrong size by silently doing nothing.

Two things about the fonts are worth knowing if you touch the renderer. `resvg`
ignores woff2 entirely and substitutes a system face without complaining, so the
three bundled faces are decompressed to `.ttf` first; and `wawoff2.decompress` is
not concurrency-safe, so they are decompressed one at a time. The tool now proves
the three faces render distinctly before it writes a PNG and fails if they do not,
because a card in the wrong typeface is the exact kind of wrong that gets posted.

Why a card and not a screenshot: a story is read in one second, on a phone, by
someone who did not ask for it. A screenshot of a desktop app shrinks to nothing
there. The card is a poster — one claim, one drawing, one instruction — built from
the same tokens the app uses (`src/styles/tokens.css`), the same three bundled
typefaces, and the nine real cursor colours doing the drawing.

The drawing is vector, so it stays sharp at any size. It is deliberately *not* a
mock screenshot of the product: it is an illustration of the moment, and it is
labelled as one — if you want the product itself, that is `npm run shots`.

The poster's name is read from `package.json` rather than typed into the drawing: it
said SWARMSMITH for months after the rename, and nothing caught it because a rendered
PNG is not greppable. A test now asserts the current name is in every card and the old
one is in none.

If the copy needs changing, change it in `scripts/lib/story-cards.mjs`; a test
fails on emoji and on the usual marketing words, so the card cannot slip into the
register the product is against.

---

# Logo

```bash
npm run logo            # writes everything below
npm run logo -- --check # names and outputs only
```

| file | use |
|---|---|
| `docs/media/logo.svg` | the mark, ink on transparent — dark backgrounds |
| `docs/media/logo-dark.svg` | the mark on its own tile — avatars, store listings |
| `docs/media/logo-light.svg` | ink on a light page |
| `docs/media/logo-512.png`, `logo-128.png` | raster versions of the tile |
| `docs/media/wordmark.svg`, `wordmark.png` | mark + name + what it is; the README uses the SVG |
| `public/favicon.svg` | the browser tab |

The mark is **a box that is not finished, and the cursor that is finishing it** —
one continuous stroke with the bottom-right corner missing, and one arrow in that
gap. It is the product's smallest true statement, and it is two shapes, which is
why it still reads at 16px.

What it deliberately is not: nine icons on a circle (the first attempt — the
stock AI-brand shape), a sparkle, a gradient orb, or a glyph that only works on a
dark background. `scripts/logo-test.mjs` fails on a gradient, a glow, a filled
box, a multi-path frame, or a mark that cannot be rendered in one colour.
