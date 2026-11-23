// Wuthering Tools+ — the player's saved teams with a character, as pairs of teammates for the calculator's Team Buffs
// card (RealTeamBuffsCard.vue; batch 5, lane check-panel).
//
// The card offers them as one-tap choices when no teammates are picked, and, when the panel names a pair that is not
// the pair of any saved team with this character, under its first line ("You saved a team with Mornye and Lucilla"):
// a panel that names other teammates than the team the player plays fills the calculator and the echo optimizer with
// the wrong buffs, and nothing else on the screen says so. Pure; no Vue.

export interface SavedPair {
  id: string;
  name: string;
  mates: [string, string];
}

interface TeamLike {
  id: string;
  name?: string;
  characterIds?: Array<string | null | undefined>;
}

const pairKey = (mates: readonly string[]): string => [...mates].sort().join("+");

/** Every saved team with `characterId` and two other members, one per pair of teammates, in the saved order. */
export function savedTeamPairs(teams: readonly TeamLike[] | null | undefined, characterId: string): SavedPair[] {
  const seen = new Set<string>();
  const out: SavedPair[] = [];
  for (const team of teams ?? []) {
    const ids = team.characterIds ?? [];
    if (!ids.includes(characterId)) continue;
    const mates = ids.filter((id): id is string => Boolean(id) && id !== characterId);
    if (mates.length !== 2 || mates[0] === mates[1]) continue;
    const key = pairKey(mates);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: team.id, name: team.name ?? "", mates: [mates[0], mates[1]] });
  }
  return out;
}

/** The saved pairs to name beside a panel that picks `pair`: none when `pair` is the pair of one of them (either order),
 *  else every saved pair, at most `limit`. */
export function otherSavedPairs(
  teams: readonly TeamLike[] | null | undefined,
  characterId: string,
  pair: readonly [string, string],
  limit = Number.POSITIVE_INFINITY,
): SavedPair[] {
  const all = savedTeamPairs(teams, characterId);
  const picked = pairKey(pair);
  if (all.some((p) => pairKey(p.mates) === picked)) return [];
  return all.slice(0, limit);
}

/** The line under the card's first one when the panel's pair is none of the player's saved teams with this character. */
export function savedPairsLine(pairs: readonly SavedPair[], characterName: string, nameOf: (id: string) => string): string {
  if (!pairs.length) return "";
  if (pairs.length === 1) {
    const [a, b] = pairs[0].mates;
    return `You saved a team of ${characterName} with ${nameOf(a)} and ${nameOf(b)}: tap it to use their real buffs instead.`;
  }
  return `You saved ${pairs.length} other teams with ${characterName}: tap one to use its teammates' real buffs instead.`;
}
