# Handoff — read this first

**Last updated:** 2026-11-12
**Branch:** `arena/9820dc5e-swarm-builder`
**State:** 🔴 **PLANNING ONLY — zero application code exists.**

If you are picking this project up cold, this file tells you what it is, what
was decided, what was *not* decided, and exactly where to start.

---

## 60-second summary

We are building **swarmsmith**: a **locally-run desktop web app** that generates
a real website from a short interview, and then **builds it on screen with a
swarm of animated design-tool cursors** — crosshair-dragged boxes, typed headlines, ruler
guides, option-dragged cards.

The visual language is borrowed from **Swarm Rebuild** (a viral Oct-2026 browser
extension by Dhvanil Patel, motion design by Joel Califa). That product is a
*visual trick*: it snapshots a page that already exists and has cursors
*re-enact* building it. Nothing is generated.

**Ours is real.** Gemini writes the site, we render it in a hidden iframe,
snapshot the real DOM, then the cursors rebuild *that* — and the result is a
working site you can edit and export.

> The one-line thesis: **Swarm Rebuild re-enacts building a page that already
> exists. Ours builds a page that didn't exist five seconds ago, written by
> Gemini, and actually runs.**

---

## Repository contents

| File | What it is |
|---|---|
| `README.md` | Entry point, links |
| **`docs/BUILD-PLAN.md`** | **The plan. Read this second.** |
| `docs/chrome-extension-field-guide.md` | Platform research — mostly **historical now**: written when this was an extension. Still useful for browser-API notes |
| `HANDOFF.md` | This file — state, decisions, where to start |

That's all. No `package.json`, no `src/`, no build tooling.

---

## Decisions locked (do not re-litigate)

| # | Decision | Rationale |
|---|---|---|
| 1 | **A locally-run web app.** NOT an extension. | User's explicit correction. `npm run dev` → `localhost`, or a packaged desktop build later. See plan §4.4 |
| 2 | **Frontend first.** No backend, ever, for v1 | User's explicit instruction. Everything runs locally |
| 3 | **One free Gemini API key**, entered by the user on first run | Never bundled. Stored in **IndexedDB** |
| 4 | **The model never writes CSS** | It returns a JSON `SiteSpec` only. All styling comes from 8 hand-written theme token files. This is how "no AI patterns" is *guaranteed* rather than requested |
| 5 | **Render → snapshot → rebuild** | Gemini spec → hidden iframe → DOM snapshot → cursors rebuild it → hand off live. Never animate the spec directly or the animation could lie |
| 6 | **Zero browser permissions, zero manifests** | Nothing to request, nothing to review. Chrome extension is **not** the delivery mechanism |
| 7 | **PDF only** for documents in v1, parsed locally with pdf.js | User's choice. No upload, so no privacy question |
| 8 | **Nine Muses** = nine named agent personas | Calliope plans; Erato reads docs; Euterpe writes copy; Urania does pricing/menus; Melpomene is the slop guard; Polyhymnia does a11y; Terpsichore does interaction; Thalia handles voice; Clio enforces consistency |

## The Quiet Doctrine (non-negotiable)

**The app:** no ✦ sparkles, no purple→blue gradients, no glow, no glassmorphism,
no emoji icons, no chat bubbles, no "Assistant" persona, no "✨ Generating…",
no typing-dots. It must look like a **design tool** — neutral greys, one accent,
1px borders, 4px radii, a visible grid, plain verbs (*Continue*, *Build*, *Export*).

**Generated sites:** no gradient blobs, no three-emoji feature cards, no
"Unlock the power of…", no lorem ipsum, no stock hero copy. Enforced
structurally (§6 of the plan) plus Melpomene's veto pass.

---

## ⚠️ Still unresolved — ask the user before Phase 0

1. **Name.** `swarmsmith` is a working title only.
2. **Sound on by default?** The reference has procedural audio; recommendation was *on* with a one-click mute.
3. **Cursor labels.** Muse names on cursors vs. neutral labels (*Builder 1*). Recommendation was Muse names.

None of these block Phase 0 scaffolding.

---

## Where to start

The plan defines 8 phases. **Two viable entry points** — the user was offered
both and had not chosen when this handoff was written:

### Option A — Phase 0 (breadth first)
Scaffold Vite + TypeScript + React, build the tool design system, and produce all
seven funnel screens as **clickable static HTML** with hardcoded data.
→ You see the whole funnel fast. Risk: you may discover late that the animation
doesn't land.

### Option B — Phase 1 first (risk first) ← *recommended*
Build only the **swarm engine** against a **hand-written hardcoded page**: intro
orbit, crosshair drag with live size badge, character-by-character typing with a
caret, pen-tool borders, ruler guides with snapping, ⌥-drag duplicates, media
sweeps, outro flock to the mouse. Plus the HUD (Tour · 1×/2×/3× · sound · replay ·
stop).
→ Answers the only question that can kill this project, in ~3 days, before
anything else is invested.

**Do not start Phase 2+ until the cursors feel genuinely good.** That is the
whole product's first impression, and it is the one thing a plan cannot prove.

---

## How the swarm pipeline works (the part that's easy to get wrong)

```
intake answers
   → Gemini returns a SiteSpec (JSON, sections + content, ZERO styling)   [Zod]
   → renderer builds real DOM in a HIDDEN iframe with the chosen theme
   → snapshotter walks that real DOM → Blueprint {rects, textRuns, lines, media, groups}
   → canvas blanks; cursors rebuild from the Blueprint
   → "Go live" fades to the real, interactive iframe
```

**Why snapshot a real render?** Because the cursors must rebuild something that
actually exists. If we animated the spec directly and rendered separately, the
two could disagree — and we'd have rebuilt the original product's dishonesty.

**Why choreography is tractable:** we author the 13 section components, so we
already know the hero headline is a typed text run and pricing tiers are
⌥-dragged duplicates. Choreography is *authored*, not inferred.

### Motion-credit note
The choreography concept is **Joel Califa's**; **Dhvanil Patel** adapted it into
an extension. Those repos are **unlicensed** — do not copy their code. Build our
own engine from the publicly described vocabulary, and credit both in the app's
About screen. This is a legal and reputational requirement, not a nicety.

---

## Non-negotiables for any future implementer

- ❌ No model-authored CSS — a test should fail if `SiteSpec` ever contains a `styles` field.
- ❌ No bundled API key. Ever.
- ❌ Not an extension — do not re-introduce a manifest, service worker, or store flow.
- ❌ No sparkles / gradients / emoji icons anywhere in the UI.
- ✅ Export must work offline with zero external requests.
- ✅ `Replay` must rebuild from the cached Blueprint and cost zero tokens — it is
  also the "prove it's real" feature.
- ✅ Reduced-motion support and full keyboard navigation.

---

## Full history

| Commit | What |
|---|---|
| `89ce93c` | Initial commit (skeleton) |
| `c7cee7f` | Rewrite build plan: swarm-rebuild visual language driving a real generated site |

> Earlier planning iterations (a page-*analyzer* product, and a Muse-agent
> chat tool) were superseded. If you find fragments of those ideas anywhere,
> they are **not** the current direction.
