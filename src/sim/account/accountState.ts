// Wuthering Tools+ — the Account State: one derived snapshot of the player's account that every
// account-first feature reads (the `mine` cost on /rankings, the CLI's `state`, my-rankings' card).
// Pure: the character store, the inventory and the teams in; nothing else is consulted. Built from
// the export file on the CLI and from the Pinia stores in the app — the same function either way.
//
// Rules (2026-09-14):
//   sequence   = the highest enabled SequenceNode<N> (NOT the count of enabled chain toggles — a node's
//                sub-toggles would count twice; the CLI once printed Aemeath at "S10")
//   refinement = weapons[weapon].refinement, 1 when unset
//   owned      = the character has a weapon equipped (the bar my-rankings and Riley's loadouts set);
//                a character opened in the calculator but never armed is "not set up", not owned
import { rileyNameOf } from "../rankings/castMapper";
import { nodeOf, refinementOf, sequenceOf } from "../myRankings/rankRoster";

export { nodeOf, refinementOf, sequenceOf };

export interface AccountBuild {
  id: string | null;
  name: string;
  /** echo ids or inline echo names in slot order (null for an empty slot) */
  echoes: Array<string | null>;
}

export interface AccountCharacter {
  /** app character key */
  key: string;
  /** wuwa_calc resonator name */
  rileyName: string;
  owned: boolean;
  sequence: number;
  weapon: string | null;
  refinement: number;
  /** the build the calculator runs (activeBuildId, else the first) */
  build: AccountBuild | null;
  builds: AccountBuild[];
  rotations: number;
}

export interface AccountTeam {
  id: string | null;
  name: string;
  characterIds: Array<string | null>;
  actions: number;
  /** every member set up (armed) */
  fieldable: boolean;
}

export interface AccountState {
  characters: Record<string, AccountCharacter>;
  teams: AccountTeam[];
  echoes: { total: number; equipped: number };
  summary: { characters: number; owned: number; s6: number; teams: number; teamsFieldable: number; rotations: number };
}

/** wuwa_calc's `AccountEntry` (vendor/wuwa_calc plus branch, solver.ts setAccountState) */
export interface RileyAccountEntry {
  sequence: number;
  weapon: string | null;
  refine: number;
  owned: boolean;
}

const buildOf = (b: Record<string, any> | undefined): AccountBuild | null => {
  if (!b) return null;
  const slots = (b.echoes ?? {}) as Record<string, Record<string, unknown>>;
  const echoes = [0, 1, 2, 3, 4].map((i) => {
    const slot = slots[String(i)];
    const id = slot?.echoId;
    if (typeof id === "string" && id) return id;
    const inline = slot?.echo;
    return typeof inline === "string" && inline ? inline : null;
  });
  return { id: b.id ?? null, name: String(b.name ?? ""), echoes };
};

export function accountCharacterOf(key: string, data: Record<string, any> | undefined): AccountCharacter {
  const builds = ((data?.builds ?? []) as Array<Record<string, any>>).map((b) => buildOf(b)!).filter(Boolean);
  const active = builds.find((b) => b.id && b.id === data?.activeBuildId) ?? builds[0] ?? null;
  const weapon: string | null = data?.weapon ? String(data.weapon) : null;
  return {
    key,
    rileyName: rileyNameOf(key),
    owned: Boolean(weapon),
    sequence: sequenceOf(data),
    weapon,
    refinement: refinementOf(data),
    build: active,
    builds,
    rotations: ((data?.rotations ?? []) as unknown[]).length,
  };
}

export function accountStateOf(
  characters: Record<string, Record<string, any>>,
  inventory: { echoes?: unknown[]; equipped?: Record<string, unknown> } = {},
  teams: Array<Record<string, any>> = [],
): AccountState {
  const out: Record<string, AccountCharacter> = {};
  for (const [key, data] of Object.entries(characters ?? {})) out[key] = accountCharacterOf(key, data);
  const accountTeams: AccountTeam[] = (teams ?? []).map((t) => {
    const ids = ((t.characterIds ?? []) as Array<string | null>).slice(0, 3);
    while (ids.length < 3) ids.push(null);
    return {
      id: t.id ?? null,
      name: String(t.name ?? ""),
      characterIds: ids,
      actions: ((t.actions ?? []) as unknown[]).length,
      fieldable: ids.every((id) => id && out[id]?.owned),
    };
  });
  const list = Object.values(out);
  return {
    characters: out,
    teams: accountTeams,
    echoes: { total: (inventory.echoes ?? []).length, equipped: Object.keys(inventory.equipped ?? {}).length },
    summary: {
      characters: list.length,
      owned: list.filter((c) => c.owned).length,
      s6: list.filter((c) => c.owned && c.sequence >= 6).length,
      teams: accountTeams.length,
      teamsFieldable: accountTeams.filter((t) => t.fieldable).length,
      rotations: list.reduce((n, c) => n + c.rotations, 0),
    },
  };
}

/** The account as Riley's solver takes it, keyed by his resonator names. Only characters with a
 *  weapon count as owned; everyone else is registered as not owned so `mine` runs them as s0r1 and
 *  "Teams I can field" hides their teams. */
export function rileyAccountEntries(state: AccountState): Record<string, RileyAccountEntry> {
  const out: Record<string, RileyAccountEntry> = {};
  for (const c of Object.values(state.characters)) {
    out[c.rileyName] = { sequence: c.sequence, weapon: c.weapon, refine: c.refinement, owned: c.owned };
  }
  return out;
}

/** A short stable key for the registered entries (djb2), so a changed account gets fresh rows. */
export function accountKeyOf(entries: Record<string, RileyAccountEntry>): string {
  const text = Object.keys(entries)
    .sort()
    .map((n) => `${n}:${entries[n]!.owned ? 1 : 0}:${entries[n]!.sequence}:${entries[n]!.weapon ?? ""}:${entries[n]!.refine}`)
    .join("|");
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Riley's `r=` hash names: a resonator name with its spaces dropped. */
export const rileyCompactName = (rileyName: string): string => rileyName.replace(/ /g, "");

/** `/rankings` at the account's own state, filtered to teams containing these characters. */
export function rankingsMineHash(characterKeys: string[] = []): string {
  const names = characterKeys.map((k) => rileyCompactName(rileyNameOf(k))).filter(Boolean);
  return `#tc=mine${names.length ? `&r=${names.map(encodeURIComponent).join(",")}` : ""}`;
}
