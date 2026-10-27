// Wuthering Tools+ — /weapons' selector chooser: "which option of this selector should THIS account take?"
//
// Weapon pools (the Standard Weapon Convene list) are read straight off the weapon-value run (weaponValue.ts): for
// every set-up character of the weapon's type, the standard 5★ option at R1 — or, for a character already wearing it,
// the next refinement (a dupe). Nothing is scored twice. Team uplift = the best team gain among them (this app's
// engine, the character's strongest fieldable team); own gain where no team figure exists.
//
// Resonator pools run on Riley's engine at the player's account (the fork's `mine` Team Cost, through the Wave-0 seam:
// rileyClient in the browser, rileyHeadless on Node) — the only engine that plays whole teams for a resonator the
// account does not own:
//   new        an unowned candidate is registered `{ owned, S0, weapon: STANDARD_PICK, R1 }`. `mine` would otherwise
//              run them with the signature at R1 (`accountWeapon` returns index 0 for a resonator without a weapon),
//              which overstates a selector pick; a weapon name no loadout lists makes `accountWeapon` fall back to
//              `standardWeapon(l)` — the loadout's best non-signature weapon (Riley lists it right after the
//              signatures), reported back as `weaponApproximated`.
//   owned      an owned candidate below S6 is registered one sequence up (their weapon as worn).
//   uplift     for every main DPS the candidate's teams serve: the best `mine` team DPS with the candidate (as above)
//              against the best `mine` team DPS that main DPS can field today; the largest rise. DPS, never mixed with
//              this app's damage.
//   new teams  compositions the candidate makes fieldable (every other member owned — a 4★ or Rover always is),
//              with their best DPS.
//   dupe       an owned, set-up candidate's next sequence on this app's engine — the same S+1 /account's plan scores
//              (withNextSequence on the best rotation + the plan's team scorer).
// Released content only: a candidate or team member the app does not list (`notInApp`, Lily) is never registered or
// solved. Pure / async: the engine arrives through `SelectorRiley`.
import { accountKeyOf, type RileyAccountEntry } from "../account/accountState";
import { createTeamScorer, slicer } from "../account/investPlan";
import { characterMeta, weaponMeta } from "../display/names";
import { RANKING_ENEMY, isSetUp, scoreRotation, sequenceOf, withNextSequence, type RosterRanking } from "../myRankings/rankRoster";
import { rileyNameOf } from "../rankings/rileyNames";
import type { MineSolve, RileyAccount, RileyTeamInfo } from "../engine/rileyRun";
import type { CharacterWeaponValue, ValueOption, WeaponValueResult } from "./weaponValue";

/** A weapon name no wuwa_calc loadout lists: `accountWeapon` then runs `standardWeapon(l)` (see the header). */
export const STANDARD_PICK = "wtplus-standard-pick";

/* ---------------------------------------------------------------------------------------- weapon pools */

export interface WeaponUse {
  characterId: string;
  /** `swap`: a new copy at R1; `dupe`: they wear it, one refinement up; `maxed`: they wear it at R5 */
  kind: "swap" | "dupe" | "maxed";
  option: ValueOption | null;
  /** team gain where there is one, else own (what the list ranks on) */
  value: number | null;
  scope: "team" | "own";
}

export interface WeaponPickRow {
  key: string;
  /** registry bucket */
  type: string | null;
  status: "ok" | "no-wielder" | "not-in-app" | "pending";
  /** the use that gains most */
  best: WeaponUse | null;
  /** every set-up character of the type, best first */
  uses: WeaponUse[];
  /** worn on the account (the app has no weapon inventory: the copies its characters wear) */
  wornBy: string[];
  /** the best dupe among its wearers (R+1), null when nobody wears it below R5 */
  dupe: WeaponUse | null;
  /** the largest gain on someone's own rotation (a healer's damage can jump while their team barely moves) */
  bestOwn: { characterId: string; gain: number } | null;
}

const useValue = (o: ValueOption | null): { value: number | null; scope: "team" | "own" } =>
  !o ? { value: null, scope: "own" } : o.team ? { value: o.team.gain, scope: "team" } : { value: o.gain, scope: "own" };

/** Order: team figures before own-only ones, then by value, then the key (deterministic). */
function byUse(a: WeaponUse, b: WeaponUse): number {
  if (a.scope !== b.scope && a.value != null && b.value != null) return a.scope === "team" ? -1 : 1;
  return (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.characterId.localeCompare(b.characterId);
}

/** Rank a weapon pool for the account from a finished (or partial) weapon-value run. */
export function rankWeaponPool(items: readonly string[], value: Pick<WeaponValueResult, "rows"> | null, characters: Record<string, any>): WeaponPickRow[] {
  const rows: CharacterWeaponValue[] = value?.rows ?? [];
  const out: WeaponPickRow[] = items.map((key) => {
    const meta = weaponMeta(key);
    const wornBy = Object.keys(characters ?? {}).filter((id) => characters[id]?.weapon === key).sort();
    if (!meta) return { key, type: null, status: "not-in-app", best: null, uses: [], wornBy, dupe: null, bestOwn: null };
    const uses: WeaponUse[] = [];
    for (const row of rows) {
      if (row.weaponType !== meta.type || row.status !== "ok") continue;
      if (row.current.weaponKey === key) {
        if (row.current.refinement >= 5) uses.push({ characterId: row.id, kind: "maxed", option: null, value: null, scope: "own" });
        else uses.push({ characterId: row.id, kind: "dupe", option: row.refine, ...useValue(row.refine) });
      } else {
        const option = row.standard.find((o) => o.weaponKey === key) ?? null;
        if (option) uses.push({ characterId: row.id, kind: "swap", option, ...useValue(option) });
      }
    }
    uses.sort(byUse);
    const scored = uses.filter((u) => u.value != null);
    const dupes = uses.filter((u) => u.kind === "dupe" && u.value != null);
    let bestOwn: WeaponPickRow["bestOwn"] = null;
    for (const u of uses) if (u.option && (!bestOwn || u.option.gain > bestOwn.gain)) bestOwn = { characterId: u.characterId, gain: u.option.gain };
    return {
      bestOwn,
      key,
      type: meta.type,
      status: !value ? "pending" : scored.length ? "ok" : "no-wielder",
      best: scored[0] ?? null,
      uses,
      wornBy,
      dupe: dupes[0] ?? null,
    };
  });
  return out.sort((a, b) => {
    if (!a.best || !b.best) return (a.best ? -1 : b.best ? 1 : 0) || a.key.localeCompare(b.key);
    return byUse(a.best, b.best) || a.key.localeCompare(b.key);
  });
}

/* ------------------------------------------------------------------------------------- resonator pools */

/** What the selector needs of the Riley seam (rileyClient / rileyHeadless, adapted by the caller). */
export interface SelectorRiley {
  /** the wuwa_calc commit (cache keys) */
  commit: string;
  /** the player's account as registered for `mine` (`rileyAccountOf`) */
  account: RileyAccount;
  teams: RileyTeamInfo[];
  /** app keys the app has not released */
  blocked: string[];
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  solve(teamKeys: string[], account: RileyAccount, onProgress?: (done: number, total: number) => void): Promise<MineSolve[]>;
}

export interface TeamRef {
  /** app keys, Riley's slot order */
  team: string[];
  teamKey: string;
  dps: number;
}

export interface ResonatorPickRow {
  key: string;
  /** `owned`: on the account below S6; `maxed`: S6 (or a 4★ / Rover, which wuwa_calc always runs at S6); `new`: not
   *  owned (or in the app's data without a weapon); `not-in-app`: not released here; `no-teams`: wuwa_calc has no
   *  team with them; `error`: the engine refused */
  status: "owned" | "maxed" | "new" | "not-in-app" | "no-teams" | "error";
  /** a weapon equipped in the app (the app engine can score them) */
  setUp: boolean;
  sequence: number | null;
  /** this app's engine: their next sequence (owned and set up only) */
  dupe: { from: string; to: string; own: number | null; team: number | null; teamName: string | null; note: string | null } | null;
  /** wuwa_calc DPS: the largest rise of some main DPS's best team */
  uplift: { gain: number; mainDps: string; with: TeamRef; base: TeamRef } | null;
  /** wuwa_calc: teams only this pick makes fieldable (unowned candidates) */
  newTeams: { count: number; best: TeamRef | null; top: TeamRef[] } | null;
  /** how wuwa_calc ran the candidate on their best team */
  ran: { weapon: string; refinement: number; sequence: number; approximated: boolean } | null;
  note: string | null;
}

export interface ResonatorPoolInput {
  items: readonly string[];
  characters: Record<string, any>;
  echoes: any[];
  teams: any[];
  /** the roster ranking for the same data (the dupe's best rotation and teams) */
  ranking: Pick<RosterRanking, "characters" | "teams"> | null;
  autoTeamBuffs?: boolean;
}

export interface SelectorProgress {
  done: number;
  total: number;
  label: string;
}

export interface ResonatorPoolOptions {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (p: SelectorProgress) => void;
  signal?: { cancelled: boolean } | AbortSignal;
  yieldToUi?: boolean;
}

const isCancelled = (s: ResonatorPoolOptions["signal"]): boolean => (!s ? false : "aborted" in s ? s.aborted : s.cancelled);
/** a 4★ or a Rover form: wuwa_calc runs them at S6 for everyone (`accountOf`'s `Tier.Free` rule) */
const isFree = (appKey: string): boolean => /^rover/i.test(appKey) || characterMeta(appKey)?.rarity === 4;
const compositionOf = (t: RileyTeamInfo): string => t.members.map((m) => m.appKey).sort().join("+");

/**
 * The account `mine` should run for one candidate: one sequence up for an owned resonator below S6 (`dupe`), or —
 * for one the account lacks — owned at S0 on the loadout's best non-signature weapon at R1 (`new`, `STANDARD_PICK`).
 * Null for a maxed one (S6, or a 4★ / Rover). The key is re-fingerprinted so his row keys never mix accounts.
 */
export function candidateAccount(base: RileyAccount, appKey: string): { kind: "dupe" | "new"; account: RileyAccount } | null {
  const name = rileyNameOf(appKey);
  const entry: RileyAccountEntry | undefined = base.entries[name];
  const owned = !!entry?.owned || isFree(appKey);
  const sequence = entry?.owned ? entry.sequence : isFree(appKey) ? 6 : 0;
  if (owned && sequence >= 6) return null;
  const next: RileyAccountEntry = owned && entry ? { ...entry, sequence: entry.sequence + 1 } : { owned: true, sequence: 0, weapon: STANDARD_PICK, refine: 1 };
  const entries = { ...base.entries, [name]: next };
  return { kind: owned ? "dupe" : "new", account: { ...base, entries, key: accountKeyOf(entries) } };
}

/** Rank a resonator pool for the account (see the header). Candidates come back in rank order: uplift, then new
 *  teams' best DPS, then dupe team gain, then name. */
export async function rankResonatorPool(input: ResonatorPoolInput, riley: SelectorRiley, options: ResonatorPoolOptions = {}): Promise<ResonatorPickRow[]> {
  const pause = slicer(options.yieldToUi !== false);
  const base = riley.account;
  const blocked = new Set(riley.blocked);
  const owns = (name: string, appKey: string): boolean => !!base.entries[name]?.owned || isFree(appKey);
  const usable = riley.teams.filter((t) => t.members.length === 3 && t.members.every((m) => !blocked.has(m.appKey)));
  const listed = new Set(Object.keys(input.characters ?? {}));

  interface Plan {
    key: string;
    row: ResonatorPickRow;
    hypo: RileyAccount | null;
    teams: RileyTeamInfo[];
  }
  const plans: Plan[] = [];
  for (const key of input.items) {
    const row: ResonatorPickRow = { key, status: "new", setUp: isSetUp(input.characters?.[key]), sequence: null, dupe: null, uplift: null, newTeams: null, ran: null, note: null };
    const meta = characterMeta(key);
    if (!meta || blocked.has(key)) {
      plans.push({ key, row: { ...row, status: "not-in-app", note: "not released in this app" }, hypo: null, teams: [] });
      continue;
    }
    const name = rileyNameOf(key);
    const entry: RileyAccountEntry | undefined = base.entries[name];
    row.sequence = entry?.owned ? entry.sequence : isFree(key) ? 6 : null;
    const teams = usable.filter((t) => t.members.some((m) => m.name === name) && t.members.every((m) => m.name === name || owns(m.name, m.appKey)));
    const plan = candidateAccount(base, key);
    let hypo: RileyAccount | null = plan?.account ?? null;
    row.status = !plan ? "maxed" : plan.kind === "dupe" ? "owned" : "new";
    if (plan?.kind === "new" && listed.has(key) && !row.setUp) row.note = "in your data without a weapon: counted as not owned, at S0";
    if (!usable.some((t) => t.members.some((m) => m.name === name))) {
      row.status = row.status === "maxed" ? "maxed" : "no-teams";
      row.note = "wuwa_calc has no team with them";
      hypo = null;
    }
    plans.push({ key, row, hypo, teams: hypo ? teams : [] });
  }

  // one batch at the account as it is (every main DPS a candidate's teams serve: all the teams they can field), then
  // one batch per candidate at their hypothetical account — few account switches, every base solve shared
  const mainOf = (t: RileyTeamInfo): string | null => t.members.find((m) => m.mainDps)?.name ?? null;
  const mains = new Set<string>();
  for (const p of plans) for (const t of p.teams) { const md = mainOf(t); if (md) mains.add(md); }
  const baseTeams = usable.filter((t) => { const md = mainOf(t); return md && mains.has(md) && t.members.every((m) => owns(m.name, m.appKey)); });
  const total = baseTeams.length + plans.reduce((n, p) => n + p.teams.length, 0);
  let done = 0;
  const progress = (label: string): void => options.onProgress?.({ done, total, label });

  const solvedBase = new Map<string, MineSolve>();
  if (baseTeams.length && !isCancelled(options.signal)) {
    progress("your teams as they are");
    const res = await riley.solve(baseTeams.map((t) => t.key), base, (d) => { options.onProgress?.({ done: done + d, total, label: "your teams as they are" }); });
    res.forEach((s) => solvedBase.set(s.teamKey, s));
    done += baseTeams.length;
  }
  const bestBase = new Map<string, TeamRef>();
  for (const t of baseTeams) {
    const s = solvedBase.get(t.key);
    const md = mainOf(t);
    if (!md || !s?.best || !s.fieldable) continue;
    const cur = bestBase.get(md);
    if (!cur || s.best.total > cur.dps) bestBase.set(md, { team: s.appKeys, teamKey: t.key, dps: s.best.total });
  }

  const scorer = input.ranking ? await createTeamScorer(input.characters, input.echoes, input.teams, input.ranking.teams, { autoTeamBuffs: input.autoTeamBuffs ?? true, enemy: RANKING_ENEMY }) : null;

  for (const p of plans) {
    if (isCancelled(options.signal)) break;
    const row = p.row;
    const name = rileyNameOf(p.key);
    // this app's engine: the next sequence of an owned, set-up candidate (the /account plan's own figure)
    if (row.status === "owned" && row.setUp && input.ranking && scorer) row.dupe = await dupeOf(p.key);
    if (!p.hypo || !p.teams.length) {
      if (p.hypo && !p.teams.length) row.note ??= "no wuwa_calc team with them that the rest of your account can field";
      continue;
    }
    progress(p.key);
    let solved: MineSolve[];
    try {
      solved = await riley.solve(p.teams.map((t) => t.key), p.hypo, (d) => options.onProgress?.({ done: done + d, total, label: p.key }));
    } catch (err) {
      if (isCancelled(options.signal)) break;
      row.status = "error";
      row.note = err instanceof Error ? err.message : String(err);
      done += p.teams.length;
      continue;
    }
    done += p.teams.length;
    const ok = solved.filter((s) => s.status === "ok" && s.best && s.fieldable);
    const ref = (s: MineSolve): TeamRef => ({ team: s.appKeys, teamKey: s.teamKey, dps: s.best!.total });
    // uplift: per main DPS, the best team with the candidate against the best one today
    const withBest = new Map<string, MineSolve>();
    for (const s of ok) {
      const md = s.best!.members.find((m) => m.mainDps)?.name;
      if (!md) continue;
      const cur = withBest.get(md);
      if (!cur || s.best!.total > cur.best!.total) withBest.set(md, s);
    }
    for (const [md, s] of withBest) {
      const was = bestBase.get(md);
      if (!was || was.dps <= 0) continue;
      const gain = Math.max(s.best!.total, was.dps) / was.dps - 1;
      if (!row.uplift || gain > row.uplift.gain || (gain === row.uplift.gain && s.best!.total > row.uplift.with.dps)) {
        const mainKey = s.appKeys[s.names.indexOf(md)] ?? md;
        row.uplift = { gain, mainDps: mainKey, with: ref(s), base: was };
      }
    }
    if (row.status === "new") {
      const byComposition = new Map<string, MineSolve>();
      for (const s of ok) {
        const team = p.teams.find((t) => t.key === s.teamKey);
        const c = team ? compositionOf(team) : s.appKeys.slice().sort().join("+");
        const cur = byComposition.get(c);
        if (!cur || s.best!.total > cur.best!.total) byComposition.set(c, s);
      }
      const top = [...byComposition.values()].sort((a, b) => b.best!.total - a.best!.total).map(ref);
      row.newTeams = { count: byComposition.size, best: top[0] ?? null, top: top.slice(0, 3) };
      if (!ok.length) row.note ??= "wuwa_calc finds no build for their teams at S0 on this account";
    }
    const bestRun = [...ok].sort((a, b) => b.best!.total - a.best!.total)[0];
    const me = bestRun?.best?.members.find((m) => m.name === name);
    if (me) row.ran = { weapon: me.weapon, refinement: me.refinement, sequence: me.sequence, approximated: me.weaponApproximated };
    await pause();
  }

  const rows = plans.map((p) => p.row);
  const score = (r: ResonatorPickRow): number[] => [r.uplift?.gain ?? -1, r.newTeams?.best?.dps ?? -1, r.dupe?.team ?? r.dupe?.own ?? -1];
  return rows.sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sb[i]! - sa[i]!;
    return a.key.localeCompare(b.key);
  });

  async function dupeOf(id: string): Promise<ResonatorPickRow["dupe"]> {
    const rank = input.ranking!.characters.find((c) => c.id === id);
    const data = input.characters[id];
    const seq = sequenceOf(data);
    const from = `S${seq}`;
    const to = `S${seq + 1}`;
    if (!rank?.bestRotation) return { from, to, own: null, team: null, teamName: null, note: "no rotation this build can score" };
    try {
      const next = await withNextSequence(id, data, seq);
      if (!next) return { from, to, own: null, team: null, teamName: null, note: `the kit lists no ${to} node` };
      const baseDmg = (await scoreRotation(rank.bestRotation, id, input.characters, RANKING_ENEMY, input.echoes)).avgDamage;
      const hypo = { ...input.characters, [id]: next };
      const dmg = (await scoreRotation(rank.bestRotation, id, hypo, RANKING_ENEMY, input.echoes)).avgDamage;
      const ctx = await scorer!.teamFor(id);
      const block = ctx ? await scorer!.buildBlock(ctx, id) : null;
      const { team, note } = await scorer!.impact(ctx, block, hypo, input.echoes);
      await pause();
      return { from, to, own: baseDmg > 0 ? dmg / baseDmg - 1 : null, team: team?.gain ?? null, teamName: team?.teamName ?? null, note };
    } catch (err) {
      return { from, to, own: null, team: null, teamName: null, note: err instanceof Error ? err.message : String(err) };
    }
  }
}
