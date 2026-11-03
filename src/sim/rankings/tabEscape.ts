/**
 * The way out of Riley's filter-bar Tab ring (2026-11-02 a11y audit, H1).
 *
 * His `page/table.ts` walks Tab round a ring of `[#optionSearch, …bubbles]` and calls `preventDefault`, so with no
 * filter set (a ring of the search box alone) Tab and Shift+Tab never left the box: the account bar, the team
 * cards and the nav could not be reached without a mouse (WCAG 2.1.2, no keyboard trap). The controller listens on
 * `window` in the capture phase while /rankings is mounted and, at the ring's two ends, stops his listeners from
 * seeing the press (`stopImmediatePropagation`, never `preventDefault`), so the browser moves focus on in page order.
 * Between his bubbles, and through the search hits while a search shows some, his ring works as before.
 */
export interface TabPress {
  key: string;
  shiftKey: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

/** True when this Tab press should leave Riley's ring for the browser's own focus order. `ring` is his
 *  `[search, …bubbles]` in page order, `hasHits` whether the search box is showing hits (his own Tab walks those). */
export function leavesTabRing<T>(e: TabPress, target: T | null, ring: readonly T[], hasHits: boolean): boolean {
  if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return false;
  if (!target || !ring.length) return false;
  const at = ring.indexOf(target);
  if (at < 0) return false; // outside the ring: his listener leaves it alone already (or lands body's Tab on the bar)
  if (at === 0 && hasHits) return false; // Tab walks the search hits
  if (e.shiftKey) return at === 0; // Shift+Tab from the search box goes back up the page
  return at === ring.length - 1; // Tab from the last bubble, or from a search box with no bubble after it
}
