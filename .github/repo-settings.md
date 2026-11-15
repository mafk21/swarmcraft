# Repo settings

These live in the GitHub UI, not in the code. They are written here so they take
ten seconds to paste and so nobody has to invent them again.

## Description

Paste into **Settings → General → Description**, and the same box on the repo page:

```
Nine AI cursors draw your website in front of you. Runs locally, your own Gemini key, no backend. Keep the HTML.
```

## Topics

Paste into the same page, **Topics** (each is a tag, press Enter between them):

```
website-builder  generative-ai  gemini  local-first  react  typescript  canvas  no-backend  ai  design-tools
```

## Website

Leave empty until there is a public demo. A "Website" link that goes to a GitHub
README is worse than no link.

## Social preview

**Settings → General → Social preview** → upload `docs/media/story-poster.png`
(640px is enough; it is 1080×1920 so it will be cropped — use `wordmark.png` on
`#0b0b0c` if you want the uncropped version). This is what appears when someone
pastes the link into Slack, X or Discord. Untouched, it shows a grey octocat, and
a grey octocat is a link nobody clicks.

## Why these are not applied by the agent

`gh repo edit --description` and `--add-topic` both return
`403 Resource not accessible by integration`: the GitHub connection in this
session can write code and merge pull requests, but cannot change repository
settings. That is a permission, not a mistake — see the note in HANDOFF.md.
