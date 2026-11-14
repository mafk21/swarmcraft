# Media for the README

The README already points at three files in this folder. Drop them in with these
exact names and they appear — no code change needed.

| file | what to capture | how |
|---|---|---|
| `mid-build.gif` | **The most important one.** Nine cursors mid-draw: boxes being dragged out, a headline half-typed, at least two cursors working different parts of the page. | Record a build at `1×`, trim to ~6 seconds, keep it under ~5 MB. A GIF is fine; a `.webm`/`.mp4` is smaller if you prefer — change the extension in the README. |
| `finished.png` | The finished page in the browser, full window, at 1440×900 or similar. | Plain screenshot, no annotations. |
| `inspector.png` | The workbench: preview on the left, the inspector's section cards on the right. | Screenshot with a section selected so the editing UI is visible. |

## Recording the GIF

1. `npm run dev`, build a site you actually like, and finish it.
2. Press **Replay** in the HUD, then start your screen recorder.
3. Record at `1×`. The draw is ~20 seconds at that speed; keep about six.
4. Trim so the first frame already has cursors in flight — a GIF that opens on a
   blank page loses people before the second frame.
5. Export at 1000–1200 px wide. Anything wider mostly adds bytes.

Windows: `Win + G` records, or use [ScreenToGif](https://www.screentogif.com/) which
saves GIF directly and lets you trim frames before saving.

## Rules

- Real screenshots only. A generated or mocked-up image of "what it looks like" is
  worse than no image on a project whose entire pitch is that it really does this.
- No customer names, emails or API keys in frame. Build the demo site from a brief
  you made up rather than a real client's.
