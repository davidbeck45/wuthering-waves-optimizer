// Wuthering Tools+: which saved /rankings view (RankingsAccountBar.vue, `wtplus:rankings:views`) the page is showing.

/** The hash parameters that name resonators, which Riley's e7a10a9 suffixed with a chain level (`r=CartethyiaS6`). */
const RESONATOR_PARAMS = new Set(["r", "x"]);

/** A hash's parameters in a fixed order, without a team page's own (`team=`, `t=`): his `syncHash()` writes them in
 *  his own order, so a view saved from the bar still reads as the current one once his page has rewritten the URL. */
export function canonHash(h: string): string {
  const p = [...new URLSearchParams(h.replace(/^#/, ""))].filter(([k]) => k !== "team" && k !== "t");
  return p.sort(([a], [b]) => a.localeCompare(b) || 0).map(([k, v]) => `${k}=${v}`).join("&");
}

/**
 * Whether the page at `now` is the saved view `saved`. A view saved before his level filters reads `r=Cartethyia`; the
 * page settles that to the tier's level (`r=CartethyiaS6` at S6R5) as it opens it, so a resonator saved without a
 * level matches that resonator at any level (the tier, `tc=`, is compared as it is). Everything else must be equal.
 */
export function viewMatches(saved: string, now: string): boolean {
  const a = canonHash(saved), b = canonHash(now);
  if (a === b) return true;
  const pa = a ? a.split("&") : [], pb = b ? b.split("&") : [];
  if (pa.length !== pb.length) return false;
  return pa.every((kv, i) => {
    if (kv === pb[i]) return true;
    const [ka, va = ""] = kv.split("="), [kb, vb = ""] = pb[i]!.split("=");
    if (ka !== kb || !RESONATOR_PARAMS.has(ka!)) return false;
    const names = va.split(","), levels = vb.split(",");
    return names.length === levels.length && names.every((n, j) => n === levels[j] || (!/S\d$/.test(n) && new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}S\\d$`).test(levels[j]!)));
  });
}
