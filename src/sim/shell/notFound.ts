// Wuthering Tools+ — the "page not found" view's one guess: which known page a mistyped or old address meant.
// Pure (no Vue, no router): NotFoundView.vue passes the requested path and the pages it can link to.

export interface PageRef {
  path: string;
  title: string;
}

/** The catch-all route's name (main.ts). `isAppRoute` treats it as "no such page". */
export const NOT_FOUND_ROUTE = "NotFoundView";

/** letters and digits only, lower case: "/Echo-Lab/" → "echolab", "My account" → "myaccount" */
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** edit distance with adjacent swaps counted as one edit ("todya" → "today" is 1) */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2]![j - 2]! + 1);
      d[i]![j] = best;
    }
  }
  return d[a.length]![b.length]!;
}

/** how many edits a word of this length may carry and still count as a typo */
const allowance = (length: number): number => (length <= 4 ? 1 : length <= 8 ? 2 : 3);

/**
 * The page a path most likely meant: "/acount" → My account, "/echolab" → Echo Lab, "/calculator" → the calculator,
 * "/account/old-tab" → My account. Matches the page's path and its title, letters only; null when nothing is close.
 */
export function closestPage(requested: string, pages: readonly PageRef[]): PageRef | null {
  const path = requested.split(/[?#]/)[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  if (!segments.length) return null;
  const tries = [...new Set([squash(segments.join("/")), squash(segments[0]!)])].filter(Boolean);
  let best: { page: PageRef; distance: number } | null = null;
  for (const page of pages) {
    const names = [squash(page.path), squash(page.title)].filter(Boolean);
    for (const asked of tries) {
      for (const name of names) {
        const distance = editDistance(asked, name);
        if (distance > allowance(name.length)) continue;
        if (!best || distance < best.distance) best = { page, distance };
      }
    }
  }
  return best?.page ?? null;
}
