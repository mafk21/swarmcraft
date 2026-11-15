/* ============================================================================
   Extra pages — the ones after home.

   A SiteSpec is ONE page. A project's `spec` is always the home page, and
   every page after it used to live in ResultScreen's React state, which meant
   it was in memory only: close the tab, reopen the site from "Your sites", and
   the pages you made were gone while the home page came back. The tab even
   said "N pages" while you were looking at one of them.

   So they are stored now, in the `pages` store, one row per page, ordered by
   `order` rather than by creation time — creation order is not page order once
   a page has been inserted or removed, and a nav must not silently renumber.

   Nothing here writes styles. A page is a SiteSpec like any other, so the same
   rule holds: the model composes sections, the renderer decides how they look.
   ========================================================================== */

import { listPages, savePage, deletePage, type PageRow } from './db';
import { newPage, validateSpec, wireNav, type SiteSpec } from './spec';

/* Nav wiring is pure spec logic and lives in spec.ts, next to the `page:N`
   resolver it has to agree with. Re-exported so the app has one import for
   everything about pages after home. */
export { wireNav };

/** The pages of a project, home first. Missing rows are simply not pages. */
export async function loadPages(projectId: string): Promise<SiteSpec[]> {
  let rows: PageRow[] = [];
  try {
    rows = await listPages(projectId);
  } catch {
    /* no storage: the caller gets just the home page, which still works */
    return [];
  }

  return rows
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.created - b.created)
    /* A row written by an older build, or edited by hand in the folder, must
       still be renderable. If it is not a page any more it is dropped rather
       than rendered half-formed. */
    .map((r) => validateSpec(r.spec))
    .filter((v): v is { ok: true; spec: SiteSpec; repairs: string[] } => v.ok)
    .map((v) => v.spec);
}

/**
 * Make the stored extra pages match what the workbench is showing.
 *
 * Called on every change (add, remove, edit, save). It is a diff, not a
 * rewrite: unchanged pages keep their row and their id, so a page's identity
 * survives an unrelated edit — which is what keeps a `page:2` link pointing at
 * the same page rather than at whatever slid into slot 2.
 */
export async function savePages(projectId: string, extras: SiteSpec[]): Promise<void> {
  const rows = await listPages(projectId);
  const keep = new Set<string>();

  for (let i = 0; i < extras.length; i++) {
    const order = i + 1; // 0 is the home page, which lives on the project row
    /* Match by title first, so re-ordering the site does not swap two pages'
       identities; fall back to the slot for a page that was renamed. */
    const match =
      rows.find((r) => r.title === extras[i].meta.title) ??
      rows.find((r) => (r.order ?? 0) === order);
    const id = await savePage({
      ...(match ? { id: match.id } : {}),
      projectId,
      title: extras[i].meta.title,
      slug: extras[i].meta.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || `page-${order + 1}`,
      order,
      spec: extras[i],
    });
    keep.add(id);
  }

  /* Anything left over was removed while the site was open. It is deleted here
     rather than left behind, so reopening the site does not resurrect a page
     the user deleted. */
  for (const r of rows) {
    if (!keep.has(r.id)) await deletePage(r.id);
  }
}

/**
 * A page the user added by hand, in the same voice as the home page.
 * Thin wrapper so ResultScreen does not need to know how pages are stored.
 */
export function blankPage(home: SiteSpec, title: string): SiteSpec {
  return newPage(home, title);
}
