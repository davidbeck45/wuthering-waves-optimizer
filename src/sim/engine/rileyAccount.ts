// Wuthering Tools+ — the player's account as the Riley run seam takes it (rileyRun.ts `RileyAccount`): the
// Account State's entries (sequence, weapon, rank, owned — src/sim/account/accountState.ts) and each character's
// equipped substat rolls (the "My build" spreads — src/sim/rankings/myBuilds.ts), fingerprinted. The same
// derivation the /rankings page and `sync-teams` run, from the stores in the app or an export on the CLI.
// Main thread / Node only: myBuilds resolves echoes through the calculator, which the worker never loads.
import { accountKeyOf, accountStateOf, rileyAccountEntries } from "../account/accountState";
import { buildRollsOf, rollsKey } from "../rankings/myBuilds";
import { resolveTeamBuilds } from "../teamContext/resolveTeam";
import type { RileyAccount } from "./rileyRun";

export function rileyAccountOf(
  characters: Record<string, Record<string, any>>,
  inventory: { echoes?: unknown[]; equipped?: Record<string, unknown> } = {},
  teams: Array<Record<string, any>> = [],
): RileyAccount {
  const entries = rileyAccountEntries(accountStateOf(characters ?? {}, inventory, teams ?? []));
  const builds = buildRollsOf(characters ?? {}, (inventory.echoes ?? []) as Array<Record<string, unknown>>).map((b) => ({ name: b.name, key: b.key, rolls: b.rolls }));
  // one fingerprint over every roll of every build, each kind tagged with its resonator
  const buildsKey = rollsKey(builds.flatMap((b) => b.rolls.map((r) => ({ kind: `${b.name}/${r.kind}`, value: r.value }))));
  return { key: accountKeyOf(entries), entries, builds, buildsKey };
}

/** A saved team as the account reads it: who sits where, and the build each slot pins. */
export interface PinnedTeam {
  characterIds?: Array<string | null> | null;
  buildIds?: Array<string | null> | null;
}

/** The account one saved team runs at: its members on the builds the team runs (`resolveTeamBuilds`: a slot's pin, with
 *  team buffs on also a build named after both teammates, else the active build), everyone else as the account has
 *  them. Teams, /account and /my-rankings score a saved team on those builds, so every wuwa_calc figure of that team
 *  (/energy, /endgame, /rotation, `cli er`) is asked at this account, not at `rileyAccountOf`'s active builds
 *  (2026-11-09 hunt 2, item 2: a team whose pins ran 362,854 read the active builds' 367,567 beside the pins' Energy
 *  Regen). `base` is handed back untouched when no slot runs another build, so its memo and cache entries are shared. */
export function rileyAccountForTeam(
  team: PinnedTeam | null | undefined,
  characters: Record<string, Record<string, any>>,
  inventory: { echoes?: unknown[]; equipped?: Record<string, unknown> } = {},
  teams: Array<Record<string, any>> = [],
  options: { auto?: boolean; base?: RileyAccount | null } = {},
): RileyAccount {
  const resolved = resolveTeamBuilds({ characterIds: team?.characterIds ?? [], buildIds: team?.buildIds ?? [] }, characters ?? {}, { auto: options.auto ?? true }).characters;
  if (resolved === characters && options.base) return options.base;
  return rileyAccountOf(resolved, inventory, teams);
}

/** The saved team a composition names (any order, a Rover form as the player has it): the first with those three. A
 *  composition nobody saved has none, and keeps the active builds. */
export function savedTeamOf<T extends PinnedTeam>(teams: ReadonlyArray<T> | null | undefined, characterIds: ReadonlyArray<string | null | undefined>): T | null {
  const want = characterIds.filter((id): id is string => Boolean(id)).slice().sort().join("+");
  if (!want) return null;
  return (teams ?? []).find((t) => (t?.characterIds ?? []).filter((id): id is string => Boolean(id)).slice().sort().join("+") === want) ?? null;
}
