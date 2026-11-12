# swarm-builder

A local app that builds you a real website — with a swarm of design-tool cursors
doing the building, live on screen. Runs on your machine. No extension, no
account, no server.

You answer a few questions, pick what you're making, and the cursors assemble
it in front of you: crosshair-dragged boxes, typed headlines, ruler guides,
option-dragged cards. Then it's a working site you can edit and export.

## Read in this order

1. **[HANDOFF.md](HANDOFF.md)** — current state, locked decisions, and where to start. **Read first.**
2. **[Build Plan](docs/BUILD-PLAN.md)** — the product, the decoded reference, the "no AI patterns" doctrine, the render → snapshot → rebuild architecture, all seven funnel screens, the Muse roster, 8 phases, risks.
3. **[Chrome Extensions Field Guide](docs/chrome-extension-field-guide.md)** — earlier platform research, now mostly historical (this started life as an extension idea). Kept for browser-API reference.

## The one-line thesis

Swarm Rebuild re-enacts building a page that already exists. Ours builds a page
that didn't exist five seconds ago, written by Gemini, and actually runs.

## Status

🔴 **Planning only.** No application code yet, deliberately. Frontend first;
no backend. See [HANDOFF.md](HANDOFF.md) for the recommended first phase.
