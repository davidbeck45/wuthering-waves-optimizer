// Wuthering Tools+ — the player's account as the Riley run seam takes it (rileyRun.ts `RileyAccount`): the
// Account State's entries (sequence, weapon, rank, owned — src/sim/account/accountState.ts) and each character's
// equipped substat rolls (the "My build" spreads — src/sim/rankings/myBuilds.ts), fingerprinted. The same
// derivation the /rankings page and `sync-teams` run, from the stores in the app or an export on the CLI.
// Main thread / Node only: myBuilds resolves echoes through the calculator, which the worker never loads.
import { accountKeyOf, accountStateOf, rileyAccountEntries } from "../account/accountState";
import { buildRollsOf, rollsKey } from "../rankings/myBuilds";
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
