// Wuthering Tools+ Echo Lab — the "Farm next" tab's view model: the ranking order, the character filter, and the words
// for a farm target (Sonata, cost, main stat) and a blocked alternative. Pure, and no engine imports (the numbers all
// come from the worker's farmNext.ts), so the page can sort and filter without loading the engine.
import type { FarmAlternative, FarmRow, FarmTarget } from "./farmNext";
import { mainLabel, setLabel } from "./echoLabView";

export const FARM_ASSUMPTIONS = [
  "Main-stat drop odds are not modelled: no released source gives them per cost. Every figure is for an echo that drops with the main stat named.",
  "A fresh echo is a 5★ copy levelled to +25: five substat lines, five different types drawn uniformly from all thirteen (the game does not publish type odds), each at Kuro's published tier odds.",
  "Each line is scored exactly by the damage engine on that echo; five lines are added up, as the re-roll advisor does. Adding leaves out how lines multiply together (Crit Rate with Crit DMG, ATK with a DMG Bonus), so these gains run low: whole five-line echoes scored by the engine came out typically about 10 % higher on the top slots of one account, and up to about half as much again on slots with very small gains, so rows with close figures can swap places.",
  "You keep the new echo only when it beats the one there now; the Tuners and EXP of a try are spent either way, and feeding a failed try back (75 % of its EXP, 30 % of its Tuners) is not counted.",
  "The build's cost layout and set bonuses stay: the farmed echo has the slot's cost, the main slot takes another copy of the main echo, and the Sonata keeps every bonus the build has.",
  "Team figures re-score the character's strongest team you can field, as My account does; the team engine scores damage only, so Energy Regen and healing count for nothing there.",
] as const;

export type FarmSort = "team" | "own";

/** Rows best first: by team gain where there is one, then the rest by own gain (ties by key, so the order never jitters). */
export function sortFarmRows<T extends Pick<FarmRow, "key" | "expectedGain" | "team">>(rows: readonly T[], by: FarmSort = "team"): T[] {
  return [...rows].sort((a, b) => {
    if (by === "team") {
      if (a.team && !b.team) return -1;
      if (!a.team && b.team) return 1;
      if (a.team && b.team) {
        const t = b.team.expectedGain - a.team.expectedGain;
        if (t) return t;
      }
    }
    return b.expectedGain - a.expectedGain || a.key.localeCompare(b.key);
  });
}

/** A row with the team figure a later request worked out (the first pass leaves most slots pending). */
export function withTeamResult(row: FarmRow, extra: { team: FarmRow["team"]; teamNote: string | null } | null | undefined): FarmRow {
  if (!extra || row.team) return row;
  return { ...row, team: extra.team, teamNote: extra.teamNote, teamPending: false };
}

export const filterFarmRows = <T extends Pick<FarmRow, "characterId">>(rows: readonly T[], characterId: string): T[] =>
  characterId === "all" ? [...rows] : rows.filter((r) => r.characterId === characterId);

/** The characters the list has rows for, by name, with their row count. */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export function farmCharacters(rows: readonly Pick<FarmRow, "characterId" | "name">[], nameOf: (id: string) => string): Array<{ id: string; name: string; count: number }> {
  const out = new Map<string, { id: string; name: string; count: number }>();
  for (const r of rows) {
    const entry = out.get(r.characterId) ?? { id: r.characterId, name: nameOf(r.characterId) || r.name, count: 0 };
    entry.count += 1;
    out.set(r.characterId, entry);
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** "Cost 3 · Spectro DMG" */
export const targetMainText = (t: Pick<FarmTarget, "cost" | "main">): string => `Cost ${t.cost} · ${mainLabel(t.main)}`;

/** Which Sonata to farm, in words. */
export function targetSetText(t: Pick<FarmTarget, "set" | "anySet" | "adds">): string {
  if (t.anySet) return "Any Sonata: this slot is not part of a set bonus";
  const name = setLabel(t.set);
  if (t.adds.length) return `${name}: ${t.adds.map(bonusPieces).join(" and ")}`;
  return name;
}

/** "Eternal Radiance 5 Set" → "completes the 5-piece" */
const bonusPieces = (bonus: string): string => {
  const m = /(\d) Set$/.exec(bonus);
  return m ? `completes the ${m[1]}-piece` : `adds ${bonus}`;
};

/** A few of the echoes to farm for the target, by name ("Diurnus Knight, Lumiscale Construct and 2 more"). */
export function speciesText(names: readonly string[], max = 3): string {
  if (!names.length) return "";
  if (names.length <= max) return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(", ")} or ${names.length - max} more`;
}

/** Why the swap rules close an alternative, in words. */
export function blockedText(a: Pick<FarmAlternative, "blocked">): string | null {
  if (a.blocked === "er") return "would cost more Energy Regen than one roll";
  if (a.blocked === "heal") return "would lower the build's Healing Bonus";
  if (a.blocked === "set") return "would break a set bonus";
  return null;
}

/** "about 3.8 tries for one that does" */
export function triesText(tries: number | null): string {
  if (tries === null) return "no try beats it";
  if (tries <= 1.005) return "every try does";
  if (tries <= 1.05) return "almost every try does";
  return `about ${tries < 10 ? tries.toFixed(1) : Math.round(tries)} tries for one that does`;
}
