// Wuthering Tools+ — the energy check's engine side: measure a composition (three app characters) with Riley's engine at
// the player's own account, through whichever seam front door is handed in — `rileyClient()` in the browser (the solver
// worker), `rileyHeadless()` on the CLI and in tests. Every loadout variant of the composition his list has is solved at
// `mine`, the best one is run traced, and the run is reduced to `TeamEnergy` (energyNeed.ts). Teams his list doesn't
// have, teams with an unreleased member and teams with no build at the account's state come back as `notMeasured`
// with a reason — never a fallback formula (the community outro rule is licence-encumbered; a guess is worse than
// "not measured"). Also: the "have" per team slot (the build the team really runs) and the account-wide summaries.
import type { MineSolve, RileyAccount, RileyPick, RileyTeamInfo, RunLite } from "../engine/rileyRun";
import { bestOf } from "../engine/rileyRun";
import { allCharactersList } from "../../characters/characters";
import { rileyNameOf } from "../rankings/castMapper";
import { resolveTeamCharacters } from "../teamContext/resolveTeam";
import { menuEnergyRegen } from "./energyHave";
import { checkOf, compositionKey, OVERCAP_FLAG, overcapWeight, teamEnergyOf, type EnergyCheck, type MemberEnergy, type TeamEnergy } from "./energyNeed";


/** What the energy check needs of the Riley seam — both `rileyClient()` and `rileyHeadless()` fit through `engineOf…`. */
/* eslint-disable no-unused-vars -- the parameters of an interface's method types */
export interface EnergyEngine {
  commit: string;
  teamKeysFor(characterIds: Array<string | null>): Promise<string[]>;
  solveMine(teamKeys: string[]): Promise<MineSolve[]>;
  tracedRun(teamKey: string, picks: RileyPick[]): Promise<RunLite>;
}
/* eslint-enable no-unused-vars */

export type NotMeasuredReason = "incomplete" | "notRiley" | "notInApp" | "noBuild" | "error";

export type TeamMeasure =
  | { status: "ok"; energy: TeamEnergy }
  | { status: "notMeasured"; reason: NotMeasuredReason; message: string; notInApp?: string[] };

/** User-facing words for a reason (the chip's tooltip, the CLI). */
export const NOT_MEASURED_TEXT: Record<NotMeasuredReason, string> = {
  incomplete: "a team needs three members",
  notRiley: "not one of wuwa_calc's current compositions",
  notInApp: "has a character this app has not released yet",
  noBuild: "wuwa_calc's loop for it needs a higher sequence than your account has",
  error: "wuwa_calc could not run it",
};

/** Measure one composition: solve every variant at `mine`, trace the best, reduce it. Never throws for a team the
 *  engine refuses (a `notMeasured` comes back); rejects only when the engine itself fails (worker died, aborted). */
export async function measureComposition(engine: EnergyEngine, characterIds: ReadonlyArray<string | null | undefined>): Promise<TeamMeasure> {
  const ids = characterIds.filter((id): id is string => Boolean(id));
  if (ids.length !== 3) return { status: "notMeasured", reason: "incomplete", message: NOT_MEASURED_TEXT.incomplete };
  const keys = await engine.teamKeysFor(ids);
  if (!keys.length) return { status: "notMeasured", reason: "notRiley", message: NOT_MEASURED_TEXT.notRiley };
  return measureKeys(engine, keys);
}

/** Measure his keys of one composition (the scan already has them grouped). */
export async function measureKeys(engine: EnergyEngine, keys: string[]): Promise<TeamMeasure> {
  const solves = await engine.solveMine(keys);
  const best = bestOf(solves);
  if (!best?.best) {
    const hidden = solves.find((s) => s.reason === "notInApp");
    if (hidden) return { status: "notMeasured", reason: "notInApp", message: hidden.message ?? NOT_MEASURED_TEXT.notInApp, notInApp: hidden.notInApp };
    if (solves.length && solves.every((s) => s.reason === "noBuild")) return { status: "notMeasured", reason: "noBuild", message: NOT_MEASURED_TEXT.noBuild };
    const why = solves.find((s) => s.message)?.message;
    return { status: "notMeasured", reason: "error", message: why ? `${NOT_MEASURED_TEXT.error}: ${why}` : NOT_MEASURED_TEXT.error };
  }
  const run = await engine.tracedRun(best.teamKey, best.best.picks);
  return { status: "ok", energy: teamEnergyOf(run, keys.length) };
}

/* ------------------------------------------------------------------------------------------- have per slot */

export interface SlotHave {
  characterId: string;
  /** the character screen's ER of the build this team runs (%), null when the character is not set up */
  have: number | null;
  /** that build's name when it is not the character's active build (a pin, or a build named after the teammates) */
  buildName: string | null;
}

/** The ER each member of a saved team has, on the build the team really runs: `resolveTeamCharacters` picks it the
 *  way the team editor does (a pin, a build named after both teammates, else the active one — `auto` off: pins only). */
export async function teamHaves(team: { characterIds: Array<string | null>; buildIds?: Array<string | null> }, characters: Record<string, any>, inventoryEchoes: any[], options: { auto?: boolean } = {}): Promise<SlotHave[]> {
  const ids = (team.characterIds ?? []).filter((id): id is string => Boolean(id));
  let resolved: Record<string, any> = characters;
  const names = new Map<string, string | null>();
  try {
    const resolution = await resolveTeamCharacters({ ...team, actions: [] } as any, characters, inventoryEchoes, { auto: options.auto ?? true });
    resolved = resolution.characters;
    for (const s of resolution.slots) {
      const active = characters?.[s.characterId]?.activeBuildId ?? null;
      names.set(s.characterId, s.buildId && s.buildId !== active ? (s.buildName ?? null) : null);
    }
  } catch {
    /* an unresolvable team keeps the active builds */
  }
  const out: SlotHave[] = [];
  for (const id of ids) out.push({ characterId: id, have: await menuEnergyRegen(id, resolved, inventoryEchoes).catch(() => null), buildName: names.get(id) ?? null });
  return out;
}

/* --------------------------------------------------------------------------------------------- reading */

/** The app key a member of his run stands for in a team of the app: the team's own id where it names the same resonator
 *  (both Rover genders are his one form), his `appKeyOf` otherwise. */
export function memberIdOf(m: Pick<MemberEnergy, "name" | "appKey">, characterIds: ReadonlyArray<string | null> = []): string {
  return characterIds.find((id): id is string => id != null && (id === m.appKey || rileyNameOf(id) === m.name)) ?? m.appKey;
}

/** One member of a measured team joined with the ER their build has. */
export interface MemberCheck extends EnergyCheck {
  /** the app key in the team asked about (a Rover form as the player has it) */
  characterId: string;
  member: MemberEnergy;
  buildName: string | null;
}

/** Each member's check, in the team's own slot order when `characterIds` is given. `haves` per slot (`teamHaves`) or
 *  by character id (active builds). */
export function memberChecks(energy: TeamEnergy, haves: ReadonlyArray<SlotHave> | Record<string, number | null>, characterIds: ReadonlyArray<string | null> = []): MemberCheck[] {
  const find = (key: string): SlotHave | null => {
    if (Array.isArray(haves)) return (haves as SlotHave[]).find((h) => h.characterId === key) ?? null;
    const map = haves as Record<string, number | null>;
    return key in map ? { characterId: key, have: map[key] ?? null, buildName: null } : null;
  };
  const checks = energy.members.map((m) => {
    const characterId = memberIdOf(m, characterIds);
    const slot = find(characterId);
    return { ...checkOf(m.need, slot?.have ?? null), characterId, member: m, buildName: slot?.buildName ?? null };
  });
  const order = (id: string): number => {
    const i = characterIds.indexOf(id);
    return i < 0 ? 99 : i;
  };
  return characterIds.length ? checks.sort((a, b) => order(a.characterId) - order(b.characterId)) : checks;
}

export interface CharacterFloor {
  characterId: string;
  /** the highest need among the teams given (%), and the team that sets it */
  need: number;
  team: { id: string; name: string; characterIds: string[] };
  setBy: MemberEnergy["setBy"];
  /** every team's need for this character, high to low */
  all: Array<{ id: string; name: string; need: number | null }>;
}

/** Per character, the worst need across the measured teams — the ER floor their weights respect. Characters with no
 *  energy gate in any of their teams get none. */
export function characterFloors(teams: Array<{ id: string; name: string; characterIds: Array<string | null>; energy: TeamEnergy | null }>): Map<string, CharacterFloor> {
  const all = new Map<string, CharacterFloor["all"]>();
  const best = new Map<string, Omit<CharacterFloor, "all">>();
  for (const t of teams) {
    for (const m of t.energy?.members ?? []) {
      const id = memberIdOf(m, t.characterIds);
      const list = all.get(id) ?? [];
      list.push({ id: t.id, name: t.name, need: m.need });
      all.set(id, list);
      const held = best.get(id);
      if (m.need != null && (!held || m.need > held.need)) {
        best.set(id, { characterId: id, need: m.need, setBy: m.setBy, team: { id: t.id, name: t.name, characterIds: t.characterIds.filter((id): id is string => Boolean(id)) } });
      }
    }
  }
  const out = new Map<string, CharacterFloor>();
  for (const [key, floor] of best) out.set(key, { ...floor, all: (all.get(key) ?? []).sort((a, b) => (b.need ?? -1) - (a.need ?? -1)) });
  return out;
}

export interface EnergySummary {
  teams: number;
  measured: number;
  members: number;
  short: number;
  tight: number;
  ok: number;
  noGate: number;
  /** distinct characters short in at least one team, and overcapping crit on a real part of a team's damage
   *  (`overcapWeight` ≥ OVERCAP_FLAG) */
  shortCharacters: string[];
  overcapCharacters: string[];
}

/** The account-wide count the /account tile and the page header read: "2 characters short on ER · 1 overcapping crit". */
export function energySummary(teams: Array<{ checks: MemberCheck[] | null }>): EnergySummary {
  const s: EnergySummary = { teams: teams.length, measured: 0, members: 0, short: 0, tight: 0, ok: 0, noGate: 0, shortCharacters: [], overcapCharacters: [] };
  const short = new Set<string>();
  const over = new Set<string>();
  for (const t of teams) {
    if (!t.checks) continue;
    s.measured += 1;
    for (const c of t.checks) {
      s.members += 1;
      if (c.status === "short") (s.short += 1, short.add(c.characterId));
      else if (c.status === "tight") s.tight += 1;
      else if (c.status === "ok") s.ok += 1;
      else if (c.status === "noGate") s.noGate += 1;
      if (overcapWeight(c.member) >= OVERCAP_FLAG) over.add(c.characterId);
    }
  }
  s.shortCharacters = [...short].sort();
  s.overcapCharacters = [...over].sort();
  return s;
}

/* ------------------------------------------------------------------------------------------------ scan */

/** A 4-star or a Rover form: free for every account (the fork's `Tier.Free` runs them S6 throughout). */
export const isFreeCharacter = (appKey: string): boolean =>
  appKey.startsWith("Rover") || allCharactersList.some((c) => c.key === appKey && Number(c.rarity) === 4);

export interface ScanCandidate {
  key: string;
  characterIds: string[];
  /** his keys of this composition */
  teamKeys: string[];
}

/** His team list grouped by composition, keeping the ones whose every member the account can field: owned in the
 *  Account State, or free for everyone (`free(appKey)`: a 4-star, a Rover form — the fork's `Tier.Free`). Teams with
 *  a member the app has not released (`blocked`) are left out. The fork re-checks after the solve (`fieldable`). */
// eslint-disable-next-line no-unused-vars -- the parameters of a function type
export function scanCandidates(teams: RileyTeamInfo[], account: Pick<RileyAccount, "entries"> | null, blocked: readonly string[], free: (appKey: string) => boolean): ScanCandidate[] {
  const owned = (name: string, appKey: string): boolean => Boolean(account?.entries?.[name]?.owned) || free(appKey);
  const groups = new Map<string, ScanCandidate>();
  for (const t of teams) {
    if (t.members.length !== 3) continue;
    if (t.members.some((m) => blocked.includes(m.appKey) || !owned(m.name, m.appKey))) continue;
    const ids = t.members.map((m) => m.appKey);
    const key = compositionKey(ids);
    const g = groups.get(key);
    if (g) g.teamKeys.push(t.key);
    else groups.set(key, { key, characterIds: ids, teamKeys: [t.key] });
  }
  return [...groups.values()];
}
