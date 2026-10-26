// Wuthering Tools+ — what the /my-rankings tables show per row, kept out of the components so it is testable:
// the one "best upgrade" per character, the sort orders, identical team rows folded together, and each team
// member's share of the damage in the team editor's colours. Pure.
import type { CharacterRank, InvestmentDelta, TeamRank } from "./rankRoster";
import { palette } from "../../utils/chartColors";

export interface Upgrade extends InvestmentDelta {
  kind: "sequence" | "refine";
}

export interface UpgradeView {
  /** the larger of the next-sequence and R5 estimates; null when neither was estimated (or both are maxed) */
  best: Upgrade | null;
  /** the other estimate, for a second line */
  other: Upgrade | null;
  /** S6 with the weapon at R5: nothing left to unlock */
  maxed: boolean;
}

/** The next sequence node or R5, whichever the estimate says is worth more on the character's best rotation. */
export function upgradeOf(c: Pick<CharacterRank, "sequence" | "refinement" | "nextSequence" | "refineFive">): UpgradeView {
  const list: Upgrade[] = [];
  if (c.nextSequence) list.push({ ...c.nextSequence, kind: "sequence" });
  if (c.refineFive) list.push({ ...c.refineFive, kind: "refine" });
  list.sort((a, b) => b.gain - a.gain);
  return { best: list[0] ?? null, other: list[1] ?? null, maxed: c.sequence >= 6 && c.refinement >= 5 };
}

export type SortKey = "damage" | "upgrade" | "name";
export type SortDir = "asc" | "desc";

/** the direction a column sorts in on its first click */
export const DEFAULT_DIR: Record<SortKey, SortDir> = { damage: "desc", upgrade: "desc", name: "asc" };

const damageOf = (c: CharacterRank): number => c.best?.avgDamage ?? -1;
/** a maxed character sorts below every estimate, and one with no estimate below that */
const upgradeKey = (c: CharacterRank): number => {
  const u = upgradeOf(c);
  return u.best ? u.best.gain : u.maxed ? -1 : -2;
};

/** A sorted copy; ties fall back to damage (desc) so the order never jitters. */
export function sortCharacters(list: CharacterRank[], key: SortKey, dir: SortDir): CharacterRank[] {
  const sign = dir === "asc" ? 1 : -1;
  const primary = (a: CharacterRank, b: CharacterRank): number => {
    if (key === "name") return a.name.localeCompare(b.name);
    if (key === "upgrade") return upgradeKey(a) - upgradeKey(b);
    return damageOf(a) - damageOf(b);
  };
  return [...list].sort((a, b) => sign * primary(a, b) || damageOf(b) - damageOf(a) || a.id.localeCompare(b.id));
}

/** Damage rank (1 = highest best rotation) by character id, whatever the table is sorted by. */
export function damageRanks(list: CharacterRank[]): Map<string, number> {
  return new Map(sortCharacters(list, "damage", "desc").map((c, i) => [c.id, i + 1]));
}

export interface TeamRow extends TeamRank {
  /** other candidates with the same three members and the same damage (a saved team and the stock preset it came from) */
  duplicates: TeamRank[];
}

const SOURCE_ORDER: Record<TeamRank["source"], number> = { yours: 0, curated: 1, wuwa_calc: 2 };

/** Fold rows with the same members and the same damage (to the unit) into one, preferring your own team. Order kept. */
export function dedupeTeams(teams: TeamRank[]): TeamRow[] {
  const groups = new Map<string, TeamRank[]>();
  const order: string[] = [];
  for (const t of teams) {
    const key = `${[...t.characterIds].sort().join("+")}|${Math.round(t.avgDamage)}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(t);
  }
  return order.map((key) => {
    const group = [...groups.get(key)!].sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]);
    const [head, ...duplicates] = group;
    return { ...head, duplicates };
  });
}

export interface MemberShare {
  id: string;
  value: number;
  /** 0..1 of the team total */
  share: number;
  color: string;
}

/** Each member's share of the team's damage, largest first, coloured like the team editor's damage bar
 *  (TeamRotationDamageBar.vue: the chart palette in contribution order). */
export function memberShares(t: Pick<TeamRank, "characterIds" | "perSlot">): MemberShare[] {
  const entries = t.characterIds.map((id, i) => ({ id, value: Math.max(0, t.perSlot[i] ?? 0) }));
  const total = entries.reduce((n, e) => n + e.value, 0);
  return entries
    .sort((a, b) => b.value - a.value)
    .map((e, i) => ({ ...e, share: total > 0 ? e.value / total : 0, color: palette[i % palette.length] }));
}
