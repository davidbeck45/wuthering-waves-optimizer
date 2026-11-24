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

/**
 * Where a Tab press in his ring goes, on the ring as the player sees it (hidden bubbles left out): `"leave"` for the
 * browser's own focus order (the ring's two ends, `leavesTabRing`), the next or previous member of `ring` to focus
 * instead of his handler, or `null` to leave the press to him (not a ring Tab, or the search box walking its hits).
 * Plus hides his resonator bubbles (the account bar shows those chips): his handler still counts them, so Tab from the
 * search box with a resonator filter set "moved" to an invisible bubble and focus stayed in the box (2026-11-23 check).
 */
export function tabRingStep<T>(e: TabPress, target: T | null, ring: readonly T[], hasHits: boolean): "leave" | T | null {
  if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey) return null;
  if (!target || !ring.length) return null;
  const at = ring.indexOf(target);
  if (at < 0) return null;
  if (at === 0 && hasHits) return null;
  if (leavesTabRing(e, target, ring, hasHits)) return "leave";
  return ring[at + (e.shiftKey ? -1 : 1)] ?? null;
}
