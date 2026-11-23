// Wuthering Tools+ — the account bar's "Main DPS / With / Without" chips over Riley's comparison table.
// Pure: no Vue, no DOM. The chips are a second face of Riley's own resonator filter, which lives in the
// URL hash (vendor/wuwa_calc/src/page/model.ts `FILTER_GROUPS`): `r=` the names a team must field,
// `x=` the names it must not, each a comma list of spaceless names (`ElectroRover`). Main DPS and With
// both write `r=` — his `teamWanted()` already reads an added leader as "the teams they lead" and an
// added support as "teams fielding them" — so the split between the two chip groups is a display
// choice: where the player put the name, else whether that resonator leads any team.

import { RARITY } from "./rileyNames";

export type ChipGroup = "main" | "with" | "without";
export type ResonatorMode = "include" | "exclude";

/** One resonator as Riley's roster fields them (built from his `TEAMS` by the controller). */
export interface RosterEntry {
  /** his resonator name ("Electro Rover", "Hsin") */
  name: string;
  /** his kit colour (hex) */
  color: string;
  /** main DPS of at least one team */
  leads: boolean;
  /** a 4★ or a Rover form (his `Tier.Free`): everyone owns them, at S6 */
  free: boolean;
}

/** What the account says about one resonator, by Riley name. */
export interface OwnedInfo {
  owned: boolean;
  sequence: number;
}

export interface PickerOption extends RosterEntry {
  owned: boolean;
  /** the account's sequence; 6 for a free resonator the account never set up */
  sequence: number | null;
  /** owned only because it is free (not set up in the calculator) */
  assumed: boolean;
  /** 0 = owned at S6, 1 = owned, 2 = not owned — the list's sections */
  section: 0 | 1 | 2;
}

/** Riley's hash spelling of a name: spaces dropped. */
export const compactName = (name: string): string => name.replace(/ /g, "");

/** The member records his `TEAMS` holds, as far as the roster needs them. */
interface TeamMemberLike {
  name: string;
  color: string;
  mainDps: boolean;
  loadout?: { resonator?: { tier?: number } };
}

/** His `Rarity.FreeS6` (rileyNames.ts `RARITY`): his `accountOf()` treats only that kind as owned-by-everyone, so this
 *  does too. */
const TIER_FREE = RARITY.FreeS6;

/** Every resonator his teams field, sorted by name. */
export function rosterOf(teams: Record<string, TeamMemberLike[]>): RosterEntry[] {
  const out = new Map<string, RosterEntry>();
  for (const members of Object.values(teams)) {
    for (const m of members) {
      const was = out.get(m.name);
      const free = m.loadout?.resonator?.tier === TIER_FREE;
      if (was) {
        was.leads ||= m.mainDps;
        was.free ||= free;
      } else out.set(m.name, { name: m.name, color: m.color, leads: m.mainDps, free });
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The hash's `r=` / `x=` lists as real names. A name in both reads as included (his `applyHash()` sets
 *  the excludes first and lets the includes overwrite). A name the roster does not know is kept as
 *  written, so a chip never silently drops a filter. Since his e7a10a9 an entry may carry a chain level
 *  ("CartethyiaS2": her at S2, model.ts `resonatorKey`); the chip is the resonator, so the level is read off. */
export function readResonatorFilters(params: URLSearchParams, roster: RosterEntry[]): { include: string[]; exclude: string[] } {
  const read = tokensOf(params, roster);
  const include = [...new Set(read("r").map(([name]) => name))];
  const exclude = [...new Set(read("x").map(([name]) => name))].filter((n) => !include.includes(n));
  return { include, exclude };
}

/** Each entry of `r=` / `x=` as [its resonator's name, the entry as written]. */
function tokensOf(params: URLSearchParams, roster: RosterEntry[]): (key: string) => [string, string][] {
  const byCompact = new Map(roster.map((r) => [compactName(r.name), r.name]));
  const nameOf = (token: string): string => {
    const known = byCompact.get(token);
    if (known) return known;
    const level = /^(.+?)S\d+$/.exec(token);
    return (level && byCompact.get(level[1]!)) ?? token;
  };
  return (key) => (params.get(key) ?? "").split(",").filter(Boolean).map((t) => [nameOf(t), t]);
}

/** The three chip groups. `intents` remembers which group the player added a name from this session. */
export function chipGroups(
  params: URLSearchParams,
  roster: RosterEntry[],
  intents: ReadonlyMap<string, ChipGroup> = new Map(),
): Record<ChipGroup, string[]> {
  const { include, exclude } = readResonatorFilters(params, roster);
  const leads = new Set(roster.filter((r) => r.leads).map((r) => r.name));
  const main: string[] = [];
  const withNames: string[] = [];
  for (const name of include) {
    const intent = intents.get(name);
    if (intent === "with" || (intent !== "main" && !leads.has(name))) withNames.push(name);
    else main.push(name);
  }
  return { main, with: withNames, without: exclude };
}

/** A copy of `params` with `name` set to include (`r=`), exclude (`x=`) or neither (`null`). */
export function withResonatorFilter(params: URLSearchParams, name: string, mode: ResonatorMode | null, roster: RosterEntry[]): URLSearchParams {
  const p = new URLSearchParams(params);
  const { include, exclude } = readResonatorFilters(params, roster);
  const inc = include.filter((n) => n !== name);
  const exc = exclude.filter((n) => n !== name);
  if (mode === "include") inc.push(name);
  if (mode === "exclude") exc.push(name);
  // the others keep their entries as written (a chain level his own chips set stays); the one changed goes in bare,
  // and the page settles it to the level the cost runs it at (controller.ts `applyHashSettled`)
  const read = tokensOf(params, roster);
  const written = new Map([...read("x"), ...read("r")].filter(([n]) => n !== name).map(([n, t]) => [n, t]));
  const write = (key: string, list: string[]): void => {
    if (list.length) p.set(key, list.map((n) => written.get(n) ?? compactName(n)).join(","));
    else p.delete(key);
  };
  write("r", inc);
  write("x", exc);
  return p;
}

/** The hash text for `params`, commas left readable the way his own `syncHash()` writes them. */
export const hashText = (params: URLSearchParams): string => params.toString().replace(/%2C/gi, ",");

/** The list a group's picker offers: leaders only for Main DPS, everyone otherwise; the account's
 *  S6 resonators first, then the rest it owns, then the ones it lacks, by name inside each. A free
 *  resonator the account never set up counts as owned at S6 (his `accountOf()` rule). */
export function pickerOptions(roster: RosterEntry[], account: ReadonlyMap<string, OwnedInfo>, group: ChipGroup): PickerOption[] {
  const pool = group === "main" ? roster.filter((r) => r.leads) : roster;
  return pool
    .map((r): PickerOption => {
      const a = account.get(r.name);
      const setUp = !!a?.owned;
      const assumed = !setUp && r.free;
      const owned = setUp || assumed;
      const sequence = setUp ? a!.sequence : assumed ? 6 : null;
      const section = owned && (sequence ?? 0) >= 6 ? 0 : owned ? 1 : 2;
      return { ...r, owned, sequence, assumed, section };
    })
    .sort((a, b) => a.section - b.section || a.name.localeCompare(b.name));
}

/** Investment tiers — his `TEAM_COSTS` minus `mine` (the bar's own "My account" button), with the hash
 *  codes `COST_CODE` writes. The empty code is his default (`s0r1`, written as no `tc=` at all). */
export const RILEY_TIERS: ReadonlyArray<{ code: string; label: string; title: string }> = [
  { code: "r0", label: "S0R0 all", title: "Limited resonators at S0 on the best standard or 4★ weapon (R1); Rover and 4★ at S6" },
  { code: "r1m", label: "S0R1 DPS · R0 supports", title: "One signature weapon at R1 per team, on the main DPS it helps most; supports on standard or 4★ weapons" },
  { code: "", label: "S0R1 all", title: "Every limited resonator on their best signature at R1 (Riley's default)" },
  { code: "s2m", label: "S2R1 DPS · R1 supports", title: "One main DPS per team at S2 on their signature; everyone else S0 on their signature at R1" },
  { code: "s3m", label: "S3R1 DPS · R1 supports", title: "One main DPS per team at S3 on their signature; everyone else S0 on their signature at R1" },
  { code: "s6m", label: "S6R1 DPS · R1 supports", title: "One main DPS per team at S6 on their signature; everyone else S0 on their signature at R1" },
  { code: "s6ms2", label: "S6R1 DPS · S2R1 supports", title: "One main DPS per team at S6 on their signature; everyone else S2 on their signature at R1" },
  { code: "s6r5m", label: "S6R5 DPS · S0R1 supports", title: "One main DPS per team at S6 with their signature at R5; everyone else S0 on their signature at R1" },
  { code: "s6r5", label: "S6R5 all", title: "Every resonator at S6 with their best weapon at R5" },
];

/** "Only teams I can import": his roster's resonators the app has no character for (`isInApp` answers by his
 *  name), sorted. Lily until the app shipped her with 3.8; empty today, and the option hides while it is. */
export function namesNotInApp(roster: RosterEntry[], isInApp: (rileyName: string) => boolean): string[] {
  return roster.filter((r) => !isInApp(r.name)).map((r) => r.name);
}

/** The chip is on when every resonator the app lacks is in his Without list (`x=`). Off with nothing to hide. */
export function importableOnly(params: URLSearchParams, roster: RosterEntry[], missing: string[]): boolean {
  if (!missing.length) return false;
  const { exclude } = readResonatorFilters(params, roster);
  return missing.every((n) => exclude.includes(n));
}

/** Whether "Only teams I can import" can change the list. At My account with "Teams I can field" on, his
 *  `teamWanted()` already drops every team with a resonator the account lacks, and the app can't hold one it has no
 *  character for, so their teams never show there and the option does nothing (it still wrote x=Lily into the link, while she was the one)
 *  — unless one of them is free (a 4★ or a Rover form: everyone owns them, at S6). */
export function importableMatters(missing: string[], roster: RosterEntry[], at: { mine: boolean; ownedOnly: boolean }): boolean {
  if (!missing.length) return false;
  if (!at.mine || !at.ownedOnly) return true;
  return missing.some((name) => roster.find((r) => r.name === name)?.free);
}

/** Turns "Only teams I can import" on (every missing resonator into `x=`, his own Without filter, so a saved view
 *  and a shared link carry it) or off (those names out of `x=`; any other Without name stays). */
export function withImportableOnly(params: URLSearchParams, roster: RosterEntry[], missing: string[], on: boolean): URLSearchParams {
  let p = new URLSearchParams(params);
  for (const name of missing) p = withResonatorFilter(p, name, on ? "exclude" : null, roster);
  return p;
}
