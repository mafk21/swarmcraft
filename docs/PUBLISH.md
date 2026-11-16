# Publishing swarmcraft

**Live URL: https://swarmcraft.vercel.app**

That deployment exists and finished building (`READY`). It was built from
`main` at `65193a6`, i.e. the version with the `diagnose()` fix. There is
nothing left to deploy.

What remains is **one permission switch**, because a new Vercel project is
private by default: strangers get a Vercel login page instead of the app.

---

## The one thing you have to click (2 min)

1. Open <https://vercel.com/helpyou/swarmcraft/settings/deployment-protection>
2. Under **Vercel Authentication**, set it to **Standard Protection** — or to
   **Disabled**, if "Standard" still asks for a login on the production domain.
   Vercel's "Standard" lets anyone view production but keeps preview URLs
   private; "Disabled" makes everything public.
3. Open <https://swarmcraft.vercel.app> in a private window. If the app loads
   with no Vercel login, it is public.

Why I cannot do it from here: the Vercel connector exposes projects,
deployments, domains and env vars, but not deployment-protection settings. It
is a dashboard toggle, not an API call I have.

---

## Where it is, and how it updates

| Thing | Value |
|---|---|
| Public URL | https://swarmcraft.vercel.app |
| Team alias | https://swarmcraft-helpyou.vercel.app |
| This build only | https://swarmcraft-m3c2x095q-helpyou.vercel.app |
| Vercel project | `swarmcraft` (`prj_oa9VOIoCENts6phFnU573TzRchWh`), team `helpyou` |
| Repo | https://github.com/mafk21/swarmcraft (public) |
| Production branch | `main` |

Every push to `main` redeploys automatically. To ship the two open pull
requests:

```bash
gh pr merge 47 --merge      # import-cycle fix + wordmark social card
```

(PR #48 already landed on `main`, so it is in the live build.)

To redeploy without a push: <https://vercel.com/helpyou/swarmcraft> → the
**Deployments** tab → the latest one → **⋯ → Redeploy**.

---

## Settings that are already correct

- Framework preset **Vite** — auto-detected, output `dist/`, 2.3 MB static.
- Build `npm run build`, install `npm ci`, Node 26.x.
- **No environment variables.** swarmcraft has no backend; each visitor types
  their own Gemini key into the app and it is stored in their browser only.
  Nothing secret is on the server, and the key never travels anywhere except
  Google.
- Production deployment has alias `swarmcraft.vercel.app`, verified.

---

## Two real caveats

1. **File and folder pickers need a top-level tab.** Chromium throws a
   `SecurityError` if `showSaveFilePicker` / `showDirectoryPicker` are called
   inside a cross-origin iframe. Opened normally — a tab, a bookmark, a link —
   everything works. If you ever embed swarmcraft in another site, the export
   and folder buttons will fail there. Same limit exists on `localhost`, so
   this is not a deployment fault.
2. **It is a static site, so "folder mode" writes to the visitor's own disk.**
   There is no server that stores generated sites. Past builds persist in the
   visitor's browser (IndexedDB), not on Vercel. That is the design: no
   account, no server, no data leaving the machine.

---

## Alternatives, if you ever want to leave Vercel

Same `dist/` folder works on any static host:

- **Netlify** — <https://app.netlify.com/drop>, drag `dist/` in. ~30 s, no
  account needed to see it work.
- **Cloudflare Pages** — connect the GitHub repo, build `npm run build`,
  output `dist`. Unlimited bandwidth on the free tier.
- **GitHub Pages** — needs `base: '/swarmcraft/'` in `vite.config.ts` because
  it serves from a subpath, so it is the one option that needs a code change.

Vercel is the best of these here: the repo is already connected, redeploys are
automatic, and the free tier covers this comfortably.

---

## Custom domain

1. Buy a domain (Namecheap, Cloudflare, Porkbun — ~$10/yr).
2. <https://vercel.com/helpyou/swarmcraft/settings/domains> → **Add**.
3. Vercel shows the DNS records; copy them into the registrar's DNS page.
4. Wait for the certificate (usually under 10 minutes).
