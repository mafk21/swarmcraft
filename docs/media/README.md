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

## Rules

Real screenshots only. A mocked-up "what it looks like" on a project whose whole pitch
is that it really does this is worse than no image at all.
