// Wuthering Tools+ — Roster value (Riley's Value page) opened on the player's own roster: which resonators his page
// ticks as owned, and who decides when the account and the ticks disagree. DOM-free (unit-tested in ownedSet.test.ts).
//
// The rule, in plain words:
//  1. The account's set: every resonator of his roster the account owns (accountState's `owned`), plus the ones his
//     engine counts as everyone's (`Rarity.FreeS6`: the 4-stars and the Rover forms; solver.ts `accountOf`). Nothing
//     else: his "free" 5-stars (Jianxin, Encore, Lingyang…) and Verina are ticked only when the account has them.
//  2. Nothing set up in the calculator (no resonator owned) → plus touches nothing: his own default stands.
//  3. His page keeps the ticks in localStorage `wuwa.owned.v1`. Plus remembers the set it last wrote there
//     (`wtplus:rosterValue.applied`). While the ticks still equal that set, they follow the account (a new character
//     set up is ticked on the next open). Once they differ (the player ticked or unticked by hand), plus leaves them
//     alone and says so, with a button that puts the account's set back.
//  4. His "Reset Account" still does what he wrote (his free resonators and Verina, his key removed); the next open
//     reads as "never set" and the account's set comes back (rule 3, first case).

/** Riley's `Rarity` const enum (engine/stats.ts), the number the loadout carries; rankings/rileyNames.ts has the rest. */
export const RARITY_FREE_S6 = 1;

export interface RosterMember {
  /** His resonator name ("Havoc Rover", "Sanhua"). */
  name: string;
  /** `loadout.resonator.tier`, his `Rarity`. */
  rarity: number;
}

/** The account's set over his roster, sorted; null when the account owns nothing (rule 2). */
export function accountOwnedSet(roster: RosterMember[], entries: Record<string, { owned: boolean }>): string[] | null {
  if (!Object.values(entries).some((e) => e.owned)) return null;
  const out = new Set<string>();
  for (const m of roster) if (entries[m.name]?.owned || m.rarity === RARITY_FREE_S6) out.add(m.name);
  return [...out].sort();
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((n) => s.has(n));
};

export type OwnedSource =
  /** plus wrote the account's set (first open, or the ticks were still the account's last one) */
  | { kind: "account"; owned: string[]; added: string[]; removed: string[] }
  /** the ticks differ from what plus last wrote: the player's own, left as they are */
  | { kind: "hand"; owned: string[]; differ: number }
  /** no account: his default (or his saved ticks) stand */
  | { kind: "none" };

/**
 * What to do on open. `saved` is `wuwa.owned.v1` (null when absent), `applied` what plus last wrote there (null when
 * never), `account` the account's set (null with no account). `write` is the list to store in `wuwa.owned.v1` (and as
 * `applied`), or null to leave his key alone.
 */
export function decideOwned(
  account: string[] | null, saved: string[] | null, applied: string[] | null,
): { source: OwnedSource; write: string[] | null } {
  if (!account) return { source: { kind: "none" }, write: null };
  const follow = saved === null || (applied !== null && sameSet(saved, applied));
  if (follow) {
    const before = applied ?? saved ?? [];
    const was = new Set(before);
    const now = new Set(account);
    const added = saved === null ? [] : account.filter((n) => !was.has(n));
    const removed = saved === null ? [] : before.filter((n) => !now.has(n));
    return { source: { kind: "account", owned: account, added, removed }, write: account };
  }
  const now = new Set(account);
  const mine = new Set(saved);
  const differ = account.filter((n) => !mine.has(n)).length + saved!.filter((n) => !now.has(n)).length;
  if (differ === 0) return { source: { kind: "account", owned: account, added: [], removed: [] }, write: account };
  return { source: { kind: "hand", owned: saved!, differ }, write: null };
}

/** The line over the table, in the app's voice. */
export function ownedLine(source: OwnedSource, count: number): string {
  if (source.kind === "none") {
    return "Riley's default roster is ticked (the free resonators and Verina): set up your resonators in the calculator and this page ticks your own.";
  }
  if (source.kind === "hand") {
    return `Your own ticks: ${count} resonators, ${source.differ} different from your account.`;
  }
  const moved = [
    source.added.length ? `added ${source.added.join(", ")}` : "",
    source.removed.length ? `removed ${source.removed.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  return `Ticked from your account: ${count} resonators${moved ? ` (your account changed: ${moved})` : ""}. Change a tick to try a pull.`;
}

/** His roster as ownedSet.ts reads it: every resonator of his teams, with its Rarity. */
export function rosterOf(teams: Record<string, Array<{ name: string; loadout: { resonator: { tier: number } } }>>): RosterMember[] {
  const seen = new Map<string, number>();
  for (const members of Object.values(teams)) for (const m of members) seen.set(m.name, m.loadout.resonator.tier);
  return [...seen].map(([name, rarity]) => ({ name, rarity }));
}
