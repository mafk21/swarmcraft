# swarmsmith — Build Plan

**Status:** planning · **Date:** 2026-11-12 · **Build order:** frontend first
**Platform:** Chrome extension (MV3) running as a full-tab local app
**AI:** one free Gemini API key · **Output:** a real website

---

## 1. What this is

> **You answer seven questions. A swarm of design-tool cursors builds you a real website, live, on screen. Then you export it.**

### The honesty thesis

**Swarm Rebuild** (Dhvanil Patel, Oct 2026 — ~2.6k stars, ~9k users) is a visual effect. It snapshots a page that already exists, hides it, and has animated cursors *re-enact* building it. Nothing is generated. It sends no network requests. There is an entire genre of TikToks and a Medium essay debunking it: *"That viral '100s of AI agents' video isn't AI."*

We take **the exact same visual language** — named multiplayer cursors, crosshair-dragged boxes with live size badges, character-by-character typing with a caret, pen-tool borders, ruler guides with snapping, ⌥-drag duplicates, the intro orbit, the outro flock to your mouse — and point it at **a site that did not exist five seconds ago, which Gemini actually wrote, and which actually renders.**

The animation stops being a trick and becomes a **reveal of real work**. Same viral look. Nothing to debunk. That is the product.

### The three things a viewer must believe

1. **The cursors are building something real.** (They are — the blueprint comes from a genuine generated page.)
2. **The result is theirs.** (They chose the kind of site, answered questions about their business, picked a theme.)
3. **It's not a chatbot.** (It's a design tool with a queue.)

---

## 2. The reference, decoded

Every element below is specified for implementation. This is the full vocabulary we're adopting.

| Element | Reference behaviour | Ours |
|---|---|---|
| **Cursors** | Colourful, named, multiplayer-style (Figma/Miro) | Same. Each cursor = one Muse, named and coloured from the roster. |
| **Intro** | Swarm clusters around the site's favicon, circling like a school of fish, each facing its swim direction | Swarm clusters around the **blank canvas centre**, then peels off one at a time |
| **Boxes** | Crosshair-drag with a live `W × H` badge | Same. Section containers are drawn, not faded. |
| **Text** | Typed character-by-character, blinking caret, uneven pace, occasional pauses | Same. Never a fade. |
| **Borders** | Pen tool, endpoint to endpoint | Same. Dividers and rules. |
| **Guides** | Ruler dragged from the edge; text **snaps** onto it | Same. Used when laying out the grid. |
| **Duplicates** | ⌥-drag a card/row into place, then retype | Same. This is how repeated cards appear. |
| **Media** | Images sweep in | Same, with a placeholder fill first |
| **Outro** | Cursors flock to your mouse pointer | Same |
| **HUD** | Floating bar: Tour · 1×/2×/3× · sound · Go live · Replay · collapsible nub | Same, plus **Export** |
| **Sound** | Procedural: airy swell on dissolve, arpeggio on fan-out, soft chord on completion | Same, on by default, mute persists |
| **Feel** | Page dissolves to blank, then a design session happens in front of you | Same — but the canvas is *becoming* your site |

### What we deliberately change

| Reference | Ours | Why |
|---|---|---|
| Re-enacts an existing page | Builds a **generated** page | The whole point |
| Ends with "Go live" revealing the page that was always there | Ends with **the real, interactive site** swapped in | Ours is the deliverable |
| No export | **Download a working site** | Ours is a tool |
| Cursor agents are anonymous | Cursors are **named Muses** with roles visible in the HUD | Ties the theatre to real work |

> **Motion credit.** The choreography is Joel Califa's design, adapted by Patel. We build our *own* engine from the vocabulary, not by copying their code (the repos are unlicensed). Where we ship the look, we credit Califa and Patel in the About screen. This matters both legally and ethically — and it's also good positioning: "inspired by, but real."

---

## 3. The Quiet Doctrine (no AI patterns) — binding

Two separate rule sets. Both are non-negotiable, and both are enforced by architecture, not by prompt.

### 3.1 The app itself

| Banned | Because |
|---|---|
| ✦ sparkles, star glyphs, "magic" icons | The universal AI tell |
| Purple→blue gradients, glow, glassmorphism | AI-slop palette |
| Emoji as icons | Toy-like |
| Chat bubbles, avatars, "Assistant" persona | This is not a chatbot |
| "✨ Generating…", "Thinking…", "Magic happens" | Vague, mystical |
| Typing-cursor dots, streamed text that wobbles as it fills | Reads as a chat app |
| "I'd be happy to help" | An assistant voice |
| Arbitrary shapes, floating blobs, mesh gradients | Decoration substituting for hierarchy |

**Required instead:** a **design tool**. Neutral greys, one accent, real typographic hierarchy, dense information, monospace for technical values, hard 1px borders, 4px radii, a visible grid. Linear, predictable, plain verbs: *Continue*, *Build*, *Export*. The app should look like something you'd use to do work.

### 3.2 The sites it generates — enforced structurally

**The model never writes CSS.** It cannot produce AI-slop pages because it cannot produce *styling* at all.

```
Gemini output  →  a JSON site spec (sections + typed content fields)
Theme system   →  all visual design (curated token files)
Renderer       →  section library components
Result         →  a page whose worst case is "plain", never "slop"
```

Banned in generated output, by construction: gradient blobs, three-emoji feature cards, "Unlock the power of…", lorem ipsum, stock hero copy, centred-everything, five accent colours, animated gradient text.

Enforced by a **slop guard** (Melpomene, §7) that rejects generic copy and demands specifics: real numbers, real names, the user's actual words from the intake.

---

## 4. Architecture

### 4.1 The core pipeline — this is the insight

The reference rebuilds an **existing** page. Ours has no page yet. So:

```
  intake answers
        │
        ▼
  ┌──────────────────┐
  │ 1. Gemini writes │  JSON site spec — sections + content, ZERO styling
  │    the site spec │  validated with Zod
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 2. Render it     │  hidden iframe, real DOM, chosen theme applied
  │    offscreen     │  (it genuinely renders — this is not a mock)
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 3. Snapshot →    │  walk the DOM → blueprint
  │    blueprint     │  { rects, textRuns, lines, media, groups }
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 4. Hide it,      │  canvas goes blank
  │    swarm builds  │  cursors rebuild from the blueprint, live
  └────────┬─────────┘
           ▼
  ┌──────────────────┐
  │ 5. Hand off      │  fade to the real, interactive iframe
  │                  │  → preview · edit · export
  └──────────────────┘
```

**Why snapshot a real render instead of animating the spec directly?** Because the cursors must rebuild *what actually exists*. If we animated the spec and then rendered separately, the two could disagree — and we'd have rebuilt the reference's dishonesty. Snapshotting the real iframe guarantees the swarm is building the true page, down to the last pixel and line break.

### 4.2 The blueprint

What the snapshotter extracts from the rendered iframe:

```ts
type Blueprint = {
  size: { w: number; h: number }
  layers: Layer[]          // in paint order, top-down
}

type Layer =
  | { kind: 'rect';  box: Box; fill?: string; stroke?: string; radius: number; parent?: Id }
  | { kind: 'text';  box: Box; runs: TextRun[]; style: TextStyle; parent?: Id }
  | { kind: 'line';  from: Pt; to: Pt; width: number; color: string }
  | { kind: 'media'; box: Box; src: string; fit: 'cover' | 'contain' }
  | { kind: 'group'; box: Box; children: Id[] }   // repeated-card clusters
```

Choreography rules derived from it:

| Blueprint feature | Cursor behaviour |
|---|---|
| `rect` container | Crosshair-drag with live `W × H` badge, then fill sweep |
| `text` run | Typed char-by-char with caret; paragraph = one cursor, lines revealed top-down |
| `line` | Pen tool, endpoint to endpoint |
| grid of `rect`s with equal spacing | Ruler guides dragged in, then **snap** |
| repeated `group` (3+ similar) | First built by hand, rest **⌥-dragged** and retyped |
| `media` | Placeholder box, then sweep reveal |

### 4.3 Runtime shape

```
┌──────────────── Full-tab app (chrome-extension://<id>/app.html) ────────────────┐
│  Funnel views:  Key → Kind → Questions → Features → Docs → Theme → Build        │
│  Build view:    offscreen iframe (hidden)  +  canvas  +  cursor swarm + HUD     │
│  Result view:   live iframe, export controls                                    │
│                                                                                 │
│  Modules:  spec.js · theme.js · render.js · snapshot.js · swarm.js · export.js  │
└───────────┬─────────────────────────────────────────────────────────────────────┘
            │ fetch (SSE)
   ┌────────▼─────────────────────┐
   │  Gemini API                  │
   │  generativelanguage…/v1beta  │
   └──────────────────────────────┘

   chrome.storage.local — key, settings, intake, generated sites
   File System Access API — export to a local folder
```

### 4.4 Why an extension, running as a full tab

You want it to *be* an extension. But a wizard with a canvas, a PDF drop and an export needs room, and an MV3 **side panel** or **popup** is (a) too narrow, (b) killed on click-away in the popup's case, and (c) subject to service-worker eviction if work lives there.

**Resolution:** the extension opens `app.html` as a **full tab** on first run and from the toolbar icon. You get extension distribution and identity, with a full-page app surface. All state lives in the tab and in `chrome.storage.local`; the service worker only opens the tab.

Permissions stay tiny: `storage`, `activeTab`, `scripting`. **No `<all_urls>`** — nothing to review-flag, nothing to scare the user.

---

## 5. The funnel

Seven steps. Each is a full screens-worth of spec: layout, states, copy, rules.

### 5.1 First run — Gemini key

```
┌──────────────────────────────────────────────────────────────┐
│  swarmsmith                                                  │
│                                                              │
│  Connect Gemini                                              │
│  Swarmsmith runs entirely on your machine. It needs one      │
│  Gemini API key to write your site. Nothing is sent         │
│  anywhere else.                                              │
│                                                              │
│  API key                                                     │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ••••••••••••••••••••••••••••••                 [ eye ] │  │
│  └────────────────────────────────────────────────────────┘  │
│  Get a free key → aistudio.google.com/apikey                 │
│                                                              │
│  ┌──────────────┐   ✓ Connected · 214 ms · gemini-2.x-flash  │
│  │ Test & save  │                                            │
│  └──────────────┘                                            │
│                                                              │
│  Your key is stored locally in this browser profile. It is  │
│  never bundled, logged, or sent to us — there is no "us".    │
└──────────────────────────────────────────────────────────────┘
```

- Key stored in `chrome.storage.local` under `swarmsmith.key`, never in the bundle, never logged.
- "Test & save" makes one cheap call; reports latency and the resolved model name.
- Failure states: invalid key · quota exhausted · network · unsupported model. Each with its own message, not a generic error.
- The trust paragraph is not decoration — it's the single biggest objection to a local app holding a key. Address it on screen one.

### 5.2 What are you building?

A grid of kinds. This choice **rewires the entire rest of the funnel**.

```
  What are you building?

  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │ Store   │ │Landing  │ │Portfolio│ │  Blog   │
  │         │ │  page   │ │         │ │         │
  └─────────┘ └─────────┘ └─────────┘ └─────────┘
  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │Restaurant│ │   SaaS  │ │  Agency │ │  Event  │
  └─────────┘ └─────────┘ └─────────┘ └─────────┘
  ┌─────────┐ ┌─────────┐
  │  Docs   │ │  Custom │
  └─────────┘ └─────────┘
```

Ten kinds. Each kind defines: its question set (§5.3), its feature list (§5.4), its default section order, and which themes pair well.

### 5.3 Questions — driven by kind

This is the requirement you were explicit about: **a store's questions are not a portfolio's questions.**

| Kind | Questions asked |
|---|---|
| **Store** | What do you sell? · How many products at launch? · Prices in what currency? · Do you need cart/checkout or a catalogue only? · Shipping regions? · Returns policy? |
| **Landing page** | What's the one action a visitor should take? · Who is it for? · What's the single strongest proof point? · Is there an existing product/URL? · Launch date? |
| **Portfolio** | Your name/discipline? · Best 3–6 projects — titles and one line each · Are you available for work? · Contact method? · Do you want a case-study layout or a gallery? |
| **Blog** | Topic and audience? · Posting cadence? · Do you want categories or tags? · Author bio? · Newsletter signup? |
| **Restaurant** | Cuisine · Location(s) · Hours · Do you need a menu section? · Reservations — phone, form, or none? · Price band? |
| **SaaS** | What does it do, in one sentence for a non-technical buyer? · Who's the buyer? · Pricing model (per seat / usage / flat)? · Is there a free tier? · Key integrations? |
| **Agency** | Services offered? · Industries served? · Team size and named leads? · Case-study depth? · Contact route? |
| **Event** | Event name, date, venue? · Agenda or schedule? · Ticket tiers and prices? · Speakers? · Registration link? |
| **Docs** | Product name? · Audience (developer / end user)? · Top 5 pages needed? · Version? · Search needed? |
| **Custom** | What is it? · Who is it for? · What are the 3–5 things it must contain? |

**Rules:** 3–6 questions, always, never a wall. Every question is a single input — text, short text, single-select, or multi-select. No rich text. Sensible defaults pre-filled where the answer is guessable. A "skip — you decide" affordance on anything not structural.

### 5.4 What should it include?

The content checklist, filtered by kind and by the answers already given.

```
  What should your store include?

  ☑ Product grid          ☑ Pricing
  ☑ About                ☐ Testimonials
  ☑ Contact form         ☐ FAQ
  ☐ Newsletter signup    ☐ Blog teaser
  ☑ Shipping & returns   ☐ Instagram feed

  Suggested for a store · 5 selected
```

- Each kind has a recommended set, pre-checked. The user adjusts.
- Multi-select chips with a count. No drag-reordering in v1 — order comes from the kind's default section template, refined by Melpomene.
- This maps directly onto the **section library** (§6.2) — checking "Pricing" means the `pricing` section renders with real tiers from the spec.

### 5.5 Docs — optional, PDF first

```
  Do you have documents about this?

  [ Drop a PDF here ]        or   [ Browse… ]

  ┌────────────────────────────────────────────┐
  │ ▤ menu-2026.pdf        412 KB        ×     │
  │ ✓ Read · 14 pages · 8,204 characters       │
  └────────────────────────────────────────────┘

  What we use it for: product names and prices, your own wording,
  and any facts we'd otherwise have to invent.
  Max 10 MB per file. Text-based PDFs only — scans aren't readable.
```

- **PDF only in v1**, as you specified. Drag-drop and browse.
- Parsed **entirely locally** — `pdf.js` runs in the tab, no upload. This is both a privacy win and a "no backend" win.
- Extracted text is chunked and summarised by Erato (§7) into a compact fact sheet, which is then available to every other Muse. The raw text never goes into every prompt (token discipline).
- Failures are named specifically: encrypted · scanned/image-only · too large · corrupt · zero extractable text.
- Optional. Skipping is a first-class choice, not a degraded path.

### 5.6 Theme

```
  Theme

  ● Let Gemini match one to your answers     (recommended)
  ○ Choose one myself

  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
  │ Editorial│ │  Studio │ │  Retail │ │  Nordic │
  │ ▔▔▔▔▔▔  │ │ ▔▔▔▔▔▔  │ │ ▔▔▔▔▔▔  │ │ ▔▔▔▔▔▔  │
  ├─────────┤ ├─────────┤ ├─────────┤ ├─────────┤
  │ Brutalist│ │  Warm   │ │ Terminal│ │ Minimal │
  └─────────┘ └─────────┘ └─────────┘ └─────────┘

  Accent   ●  ●  ●  ●  ●  ●    or  [ Gemini picks ]
```

- **Gemini never writes CSS.** It selects a theme id + an accent from a closed enum (§6.3). That's the guarantee against slop.
- Eight curated themes, each a real typographic system — not colour swatches on the same layout.
- When "let Gemini match" is on, the theme is chosen from the kind + answers + voice, and shown as a one-line reason: *"Editorial suits a restaurant with a long menu and a story."* Justification, not vibes.
- Live mini-preview tile per theme, rendered from the real theme tokens.

### 5.7 Build

```
  Ready

  Store · 5 sections · Editorial theme · 1 document

  ┌───────────────────────────────┐
  │  Build my page                │
  └───────────────────────────────┘

  ~20 seconds · 4 Muses · about 9,000 tokens
```

Then → **the build canvas** (§7.4).

---

## 6. The site system — where "no AI patterns" is enforced

### 6.1 The content contract

Gemini returns a single JSON object. Zod-validated. Anything that fails is repaired, not rendered.

```ts
type SiteSpec = {
  meta:    { title: string; description: string; theme: ThemeId; accent: AccentId }
  nav:     { brand: string; links: { label: string; href: string }[] }
  sections: Section[]     // ordered, max 9
  footer:  { columns: { heading: string; links: string[] }[]; legal: string }
}

type Section =
  | { type: 'hero';        eyebrow?: string; headline: string; sub: string; cta: { label: string; href: string }; media?: string }
  | { type: 'features';    heading: string; items: { title: string; body: string }[] }        // 3–6
  | { type: 'pricing';     heading: string; tiers: { name: string; price: string; period?: string; features: string[]; cta: string; featured?: boolean }[] }
  | { type: 'products';    heading: string; items: { name: string; price: string; note?: string; image?: string }[] }
  | { type: 'testimonials';heading: string; items: { quote: string; author: string; role?: string }[] }
  | { type: 'faq';         heading: string; items: { q: string; a: string }[] }
  | { type: 'about';       heading: string; body: string[]; image?: string }
  | { type: 'menu';        heading: string; groups: { name: string; items: { name: string; price: string; note?: string }[] }[] }
  | { type: 'gallery';     heading?: string; items: { title: string; caption?: string }[] }
  | { type: 'stats';       items: { value: string; label: string }[] }                        // 3–4
  | { type: 'cta';         heading: string; sub?: string; action: { label: string; href: string } }
  | { type: 'contact';     heading: string; email?: string; phone?: string; address?: string; form: boolean }
  | { type: 'schedule';    heading: string; days: { day: string; items: { time: string; title: string }[] }[] }
```

Thirteen section types. The model **composes** and **fills**. It never invents layout. That's the whole trick: the network's job is *content and selection*, and every visual decision is already made by someone with taste.

### 6.2 The section library

Each section type is a hand-built component with **two** renderings:

1. `render(spec, theme)` → real DOM (goes in the hidden iframe)
2. `choreograph(dom, theme)` → blueprint hints (what to drag, what to type, where the guides go)

That second one is why this is tractable: because *we wrote the components*, we already know that the hero headline is a typed text run and the pricing tiers are ⌥-dragged duplicates. The choreography is authored, not inferred.

### 6.3 The theme system

Eight themes, each a token file. No theme is generated.

```css
/* example: Editorial */
--font-display: "Instrument Serif", Georgia, serif;   /* system fallbacks only */
--font-body:    "Inter", system-ui, sans-serif;
--scale:        1.25;      /* minor third */
--measure:      62ch;
--space:        4px base, 1.5 ratio;
--radius:       2px;
--border:       1px solid;
--motion:       180ms ease-out;
```

| Theme | Character | Pairs with |
|---|---|---|
| **Editorial** | Serif display, generous measure, hairline rules | Restaurant, Portfolio, Blog |
| **Studio** | Tight grotesque, high contrast, big type | Agency, Portfolio |
| **Retail** | Brisk, dense grid, product-first | Store |
| **Nordic** | Light, airy, muted, lots of space | SaaS, Minimal |
| **Brutalist** | Monospace, hard borders, no radius | Portfolio, Event |
| **Warm** | Rounded, soft, human | Restaurant, Store |
| **Terminal** | Mono throughout, dark, technical | Docs, SaaS |
| **Minimal** | Everything stripped to hierarchy | Landing, SaaS |

**Fonts ship with the package** (or fall back to system stacks). No remote font loading — CSP-safe, offline-safe, and it keeps generated sites fast.

### 6.4 The renderer

Plain, semantic HTML + one theme stylesheet. No framework in the output.

- Output is a **single self-contained `index.html`** with inlined CSS and (if no assets) no external requests.
- Images are generated **placeholders** — abstract, theme-tinted SVG patterns produced locally. No stock photos, no external image URLs, nothing to break later.
- Semantic landmarks (`header`, `nav`, `main`, `section`, `footer`), real heading order, `alt` on everything, focus-visible rings — because Polyhymnia checks it.

---

## 7. The swarm

### 7.1 Roster, recast for building

| Muse | Job in the funnel | Output |
|---|---|---|
| **Calliope** | Sitemap and section order | the ordered `sections[]` |
| **Thalia** | Voice — reads answers + docs, fixes tone | a voice brief string |
| **Euterpe** | All copy — headlines, body, microcopy | every text field |
| **Urania** | Structured data — pricing tiers, menus, feature matrices | every array-of-objects field |
| **Melpomene** | Slop guard — rejects generic copy, demands specifics | pass/rewrite verdict per section |
| **Polyhymnia** | Accessibility and semantics | landmark/heading/contrast fixes |
| **Terpsichore** | Interaction detail — link targets, form fields, nav anchors | behaviour spec |
| **Erato** | Document extraction | a compact fact sheet from the PDF |
| **Clio** | Continuity — keeps names, numbers, currency consistent across sections | a consistency diff |

Calliope runs first and dispatches. The rest run in a scoped fan-out. Melpomene runs **last** and has veto power: she returns a rewrite demand and the offending section is regenerated once. If it fails twice, she falls back to the plainest acceptable copy rather than shipping a cliché.

### 7.2 The anti-slop rules (Melpomene's brief)

Concrete, checkable, and enforced in code where possible:

**Reject** — "Unlock the power of…", "Elevate your…", "Seamlessly integrate", "In today's fast-paced world", "Take it to the next level", "We're passionate about", "A game-changer", any sentence with no noun that refers to this specific business, any number not present in the intake, any testimonial not traceable to the uploaded doc.

**Require** — at least one concrete fact per section (a price, a place, a name, a duration); the user's own phrasing reused where they gave it; sentence length variety; no more than one exclamation mark in the entire site; heading ≠ subheading restated.

**Structural guarantees** — max one accent colour; no section may be centred text on a gradient; every list has 3+ items or is cut.

### 7.3 Live presence — Muses as cursors

Each Muse that participates owns **one cursor** on the canvas, coloured and labelled — the reference look, earned.

- Name tag renders next to the cursor (`Calliope`, `Euterpe`, `Urania`…), exactly like a multiplayer tool.
- Section-level tasks are claimed by the Muse responsible: Euterpe draws and types the hero; Urania crosshair-drags the pricing grid and ⌥-duplicates the tiers; Polyhymnia sweeps for contrast; Melpomene occasionally **drags a guide in and snaps text**, which reads on camera as review/pull-into-line.
- Every cursor position, task and layer is driven by **one `requestAnimationFrame` loop**. No `setTimeout` chains, no layout thrash.

### 7.4 The build view

```
┌──────────────────────────────────────────────────────────────────────┐
│  Store · Editorial                              ● Building  00:14    │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌────────────┐  ← crosshair-dragging a hero container              │
│   │  ▢ 1280×480│                                                     │
│   └────────────┘                                                     │
│                                                                      │
│        ◤ Euterpe        typing "Slow-cooked, since 1998"             │
│                                                                      │
│                  ◤ Urania          ⌥-drag  ×3                        │
│                                                                      │
│   ◤ Polyhymnia                                                       │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  ▶ Tour   1× 2× 3×   ♪ Sound   ⏸ Pause   ⤢ Replay    ✕ Stop         │
└──────────────────────────────────────────────────────────────────────┘
```

- Canvas is the site's real aspect; the page scrolls with the swarm, as in the reference.
- **Tour** auto-scrolls at the swarm's pace — the recording mode.
- **Speed** 1× / 2× / 3×.
- **Pause** freezes mid-typing and holds the caret.
- **Replay** rebuilds from the same blueprint (no new generation, no tokens).
- **Stop** bails to the finished site.
- On completion the cursors flock to the pointer, the HUD shows the section count and elapsed time, and **Go live** swaps to the interactive iframe.

### 7.5 What the user can do after

- **Preview** — real, scrollable, interactive.
- **Edit** — click a section, edit text inline, re-render that section only.
- **Rebuild** — replay the choreography (free, offline, no tokens).
- **Re-theme** — swap theme, re-render, replay.
- **Export** — §8.

---

## 8. Export

| Format | What it produces |
|---|---|
| **Single file** | `index.html`, CSS inlined, images as inline SVG — double-click and it works |
| **Folder** | `index.html` + `styles.css` + `assets/` — drop on Netlify/Vercel/GitHub Pages |
| **Zip** | the folder, zipped, via `File System Access API` |
| **Copy** | the HTML to clipboard |

All via the File System Access API — a real "Save to folder…" dialog, no server, no download-folder litter.

---

## 9. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Build | **WXT** | Vite-based, fast HMR, generates the MV3 manifest |
| Language | **TypeScript** strict | `SiteSpec` is the contract; types enforce it |
| UI | **React 19** | Funnel views are ordinary React. **The canvas is not React** — it's an imperative rAF engine |
| Styling | **CSS custom properties** | A tool-like design system in ~400 lines of tokens |
| State | **Zustand** | Small, no provider tree, fine with streaming |
| Validation | **Zod** | Every model response and every blueprint crosses a trust boundary |
| PDF | **pdf.js** | Runs entirely in the tab |
| Markdown | none needed | Output is structured spec, not prose |
| Tests | **Vitest** + **Playwright** | Unit for spec/choreography, e2e for the build |
| Export | **File System Access API** | Real folder writes, no server |

**Rejected:** any component library (fights the tool aesthetic), Tailwind (tokens are clearer), canvas rendering for the swarm (we need real DOM text for crisp typing and *real* snapshotting).

### Module map

```
src/
  app/
    App.tsx                 funnel router
    views/                  Key, Kind, Questions, Features, Docs, Theme, Build, Result
    components/             fields, chips, stepper, hud
    tokens.css              the tool design system
  lib/
    gemini.ts               the only network file: stream() + generateJSON()
    spec.ts                 Zod SiteSpec + repair pass
    muses.ts                nine personas: prompts, tool allowlists, colour
    orchestrator.ts         plan → dispatch → collect → meld → guard
    theme/                  8 token files + selector
    sections/               13 components: render() + choreograph()
    render.ts               spec → iframe DOM
    snapshot.ts             DOM → Blueprint
    swarm/
      engine.ts             agents, task graph, rAF loop
      cursors.ts            cursor art, name tags, flocking
      tasks.ts              drag · type · pen · guide · duplicate · sweep
      audio.ts              procedural Web Audio
    export.ts               single file · folder · zip
  content/                  pdf extraction (runs in-tab)
```

---

## 10. Build phases

Each phase ends in something demonstrable. **The swarm build is proven at Phase 3, before most of the funnel exists** — because if the animation doesn't land, nothing else matters.

### Phase 0 — Groundwork (1 day)
- Scaffold WXT + TS + React. Extension opens `app.html`.
- Tool design system (`tokens.css`): greys, one accent, type scale, 1px borders, 4px radii, grid.
- Icon set (~24 glyphs, stroke, no emoji).
- Static HTML for all seven funnel screens with hardcoded data.
- **Demo:** click through the entire funnel, no logic.

### Phase 1 — The swarm engine (3 days) ← the risk, taken first
- `swarm/engine.ts`, `cursors.ts`, `tasks.ts`, `audio.ts`.
- **Hand-write one blueprint** (a hero + 3 cards + footer) and make the swarm build it beautifully: intro orbit, crosshair drags with size badges, typed text with caret, pen lines, ruler guides with snapping, ⌥-duplicates, media sweeps, flock outro.
- HUD: Tour, 1×/2×/3×, sound, replay, stop.
- **Demo:** a mesmerising build of a hardcoded page. This is the "wow" — and the honest place to find out whether we can execute it.

### Phase 2 — Render → snapshot → rebuild, for real (2 days)
- `sections/` library with all 13 types and 3 themes.
- `render.ts` → hidden iframe.
- `snapshot.ts` → real `Blueprint` from the real DOM.
- Wire the shared choreography: `render → snapshot → build → hand off`.
- **Demo:** a real, hand-written `SiteSpec` renders, gets snapshotted, and is rebuilt by the swarm, then handed back interactive. No AI yet.

### Phase 3 — Gemini writes the site (2 days)
- Key setup, `gemini.ts`, `spec.ts` + Zod + repair.
- One kind (Store) end-to-end: questions → spec → build.
- **Demo:** answer five store questions → get a real store, built by cursors.

### Phase 4 — The Muses (3 days)
- Nine personas, orchestrator, fan-out, Melpomene's slop guard with veto and one retry.
- Consistency pass (Clio), a11y pass (Polyhymnia).
- All eight themes + Gemini theme selection with a stated reason.
- **Demo:** the full swarm, visibly assigned, producing copy that doesn't read like AI.

### Phase 5 — All ten kinds (2 days)
- Question sets, feature lists, section defaults per kind.
- **Demo:** build a portfolio and a restaurant; the questions visibly differ.

### Phase 6 — Documents (1.5 days)
- pdf.js in-tab, Erato's fact sheet, error taxonomy.
- **Demo:** upload a menu PDF → real items and prices appear in the built site.

### Phase 7 — Result, edit, export (2 days)
- Live preview, inline section editing, re-theme + replay, all four export paths.
- **Demo:** build → tweak the headline → switch theme → export a folder that opens locally.

### Phase 8 — Polish + ship (2 days)
- Orchestration review: motion timing, audio mix, reduced-motion, keyboard.
- Playwright: full funnel, build completion, export, replay, reduced motion.
- Privacy policy, screenshots (1280×800), single-purpose statement, store listing.
- **Demo:** installable build.

**Total ≈ 18.5 working days.** Phase 1 is placed early and deliberately: **the swarm engine is the product's entire first impression, and the only part of this plan that could genuinely fail.** Everything after it is ordinary work.

### Critical path

```
P0 ──► P1 (swarm) ──► P2 (render/snapshot) ──► P3 (Gemini) ──► P4 (muses)
                                            └──► P5 (kinds) ──► P6 (docs)
                                                                  └──► P7 ──► P8
```

---

## 11. Risks

| Risk | Odds | Impact | Mitigation |
|---|---|---|---|
| **The choreography doesn't feel as good as the reference** | Medium | Fatal — it's the product | Phase 1 is dedicated to it alone, before anything else. Build the engine by hand on a hardcoded page and iterate until it's genuinely satisfying |
| **Snapshot of a generated page produces a messy blueprint** | Medium | Broken visuals | Because *we* author the section components, choreography is authored too, not inferred. Snapshot only needs to recover what we already know |
| **Free-tier quota makes the demo stutter** | High | Bad live demo | Serialise Muse calls, cap at 4, cache generated specs, and offer **Replay** which costs zero tokens |
| **Copy still reads like AI despite the guard** | Medium | Kills the "real" claim | Melpomene's veto + one retry + concrete-fact requirement; and we surface *her* rejections in a debug panel so we can tune |
| **18 days is optimistic** | High | Slipped launch | Phases 0–3 (~8 days) already produce a real store from real questions. Everything after is kind coverage and polish |
| **Motion-credit / licensing** | Low | Reputational | Our own engine, built from publicly described choreography; credit Califa & Patel in About |
| **Generated sites feel generic across kinds** | Medium | Product looks samey | 8 distinct themes × 13 section types × per-kind defaults; Melpomene requires per-kind specifics |
| **PDF parsing fails on real-world files** | Medium | Broken promise | Text-only in v1, explicit error taxonomy, in-tab so no upload/privacy question |

### The two I'd actually lose sleep over

1. **Whether we can make the cursors feel as *crafted* as Califa's.** His motion design is the reason the thing went viral. Undershooting gives a cheap knockoff; overshooting (too many cursors, too fast) gives chaos. Mitigation: one dedicated phase, three cursor speeds, and an explicit animation budget — *one cursor acts at a time per region*, which is what makes the reference readable.
2. **The two-layer honesty.** A viewer will ask "is this real?" The answer must be immediately demonstrable: **Replay** rebuilds without calling Gemini, and the exported folder immediately works. Truth that a sceptic can verify in ten seconds is the whole marketing strategy.

---

## 12. Definition of done for v1

A stranger can, with no instructions:

1. Load the extension; it opens a full tab.
2. Paste a free Gemini key; "Test & save" turns green with a latency figure.
3. Choose **Store**, answer five questions, tick Pricing and Contact, skip docs.
4. Let the theme be chosen for them, with a stated reason.
5. Press **Build my page** and watch named cursors crosshair-drag, type, snap guides to, and ⌥-duplicate their way to a real store.
6. Press **Go live** and scroll the actual site.
7. Edit the headline inline, switch theme, and **Replay** the build for free.
8. Export a folder, open `index.html` locally, and have it work.

Non-negotiable:

- No sparkles, no gradients, no emoji icons, no chat bubbles, anywhere.
- No model-authored CSS — asserted by a test that fails if `spec.ts` output contains a `styles` field.
- Export works offline, with no external requests.
- Playwright green: full funnel, build completion, replay, export, reduced motion.
- Manifest permissions: `storage`, `activeTab`, `scripting`. Nothing else.

---

## 13. Open questions

1. **Name.** `swarmsmith` is the working title. Final?
2. **Sound.** On by default with a persistable mute (matching the reference), or off by default? My recommendation: **on**, because the audio is a large part of why the reference videos land — and the mute is one click.
3. **The nine Muses as the cursor labels?** This is the one place the roster becomes visible to a user. Alternative: neutral names (*Builder 1–9*), or no labels. My recommendation: keep the Muses — named cursors are literally what makes the reference look like a design tool.

All three can be answered while Phase 0 runs.

---

## Appendix — supporting research

- [`chrome-extension-field-guide.md`](./chrome-extension-field-guide.md) — MV3 lifecycle, permissions, messaging, security, packaging, store review.
- Reference product: **Swarm Rebuild** (`DhvanilPatel/swarm-cursors`), motion design by **Joel Califa** (`califa/swarm-site`).
- Gemini API: `POST /v1beta/models/{model}:generateContent` and `:streamGenerateContent?alt=sse`.
