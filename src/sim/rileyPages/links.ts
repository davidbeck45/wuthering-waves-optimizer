// Wuthering Tools+ — Riley's Tier List and Value pages inside the app (controller.ts): where his links go.

/** His links are relative to his own pages: a team (`./team#…`) or the comparison page (`./#…`) opens /rankings. */
export function rankingsTargetOf(href: string): string | null {
  const m = /^\.\/(team)?(#.*)?$/.exec(href);
  if (!m) return null;
  return `/rankings${m[2] ?? ""}`;
}
