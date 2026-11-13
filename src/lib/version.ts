/* ============================================================================
   Which build am I running?

   Four rounds of this were spent fixing code the user's machine did not have:
   the checkout sat at an older commit, `git pull` refused over a local
   package-lock change, and the dev server happily served the old tree while
   both of us talked about the new one. Nothing in the app could say which
   version it was.

   So the commit is stamped in at build time and printed on screen. If the
   answer to "which version?" is not visible, the conversation is unanchored.
   ========================================================================== */

/** The commit this bundle was built from, injected by vite.config.ts. */
export const BUILD_STAMP: string =
  typeof __BUILD_STAMP__ === 'string' && __BUILD_STAMP__ ? __BUILD_STAMP__ : 'dev';

/** Short form for the UI: "a7cd33a" or "a7cd33a+dirty". */
export function shortStamp(): string {
  return BUILD_STAMP.replace(/^.*@/, '').slice(0, 40) || 'dev';
}
