// Wuthering Tools+ — the Riley run seam (Wave 0, 2026-10-26): Riley31415/wuwa_calc's team run at the player's own
// account (the fork's `mine` Team Cost), as plain serialisable data. Three batch-2 features read it — the energy
// check, the rotation view, the ToA clear check — and none of them touches his engine directly.
//
//   registerAccount(E, account)          the `mine` tier: sequences / weapons / ranks + "My build" substat spreads
//   solveMine(E, teamKeys, opts)         the best `mine` row per team key (his picks, DPS, per-member gear)
//   tracedRun(E, teamKey, picks, opts)   `runTeam(…, true)` on those picks → RunLite (rows, hits, energy needs)
//
// Pure over the engine modules handed in (`RileyEngine`): the solver worker passes its `@skittle/*` imports
// (rileyWorker.ts), Node passes the fork's sources loaded through a file URL (rileyNode.ts) — the same functions,
// so the same RunLite. `toRunLite` is the ONE place that reads his run/snapshot fields: a layout change on his
// side touches this file only. No Vue, no stores, no DOM, nothing that pulls the app's character registry into
// the worker — the release guard arrives as data (`blocked`, built on the main thread by `blockedKeysOf`).
import type { RileyAccountEntry } from "../account/accountState";
import { appKeyOf } from "../rankings/castMapper";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The engine modules the seam calls into — `any`: vue-tsc never sees Riley's sources (skittle-modules.d.ts). */
export interface RileyEngine {
  /** solve/solver.ts */
  solver: any;
  /** solve/teamrun.ts */
  teamrun: any;
  /** engine/stats.ts (Stat, Scaling, CAST_NAME, the units) */
  stats: any;
  /** page/model.ts (TEAMS, rowFromKey, detailFor) */
  model: any;
  /** shared/substats.ts (customSubstats) */
  substats: any;
  /** the wuwa_calc commit these modules came from (engineCommit.ts in the browser, git on Node) */
  commit: string;
  /** the modules an enemy profile is built from (the ToA clear check, src/sim/endgame/effects.ts): the fork's
   *  shared/profile.ts and the gear vocabulary its floor effects are written in. Optional — only `fightCurve`
   *  under a profile needs them. */
  floor?: RileyFloorModules;
}

/** engine/gear.ts, engine/context.ts, shared/status.ts, shared/unison.ts and the fork's shared/profile.ts */
export interface RileyFloorModules {
  gear: any;
  context: any;
  status: any;
  unison: any;
  profile: any;
}

/** The substat spread every row wears (his `SUBS_MODES`): ChemX32, his High Invest, or the player's equipped
 *  echoes where the app has them (ChemX32 where it doesn't). */
export type SubsMode = "standard" | "high" | "mine";
export const SUBS_MODES: readonly SubsMode[] = ["standard", "high", "mine"];
/** The seam runs the account's own state, its echoes included — pass `subs: "standard"` for Riley's spread. */
export const DEFAULT_SUBS: SubsMode = "mine";

/** The player's account as his solver takes it — plain data, built from the stores or an export by
 *  `rileyAccountOf` (rileyAccount.ts) and posted to the worker with every request. */
export interface RileyAccount {
  /** `accountKeyOf(entries)` — tells one account from the next in his row keys */
  key: string;
  /** by Riley's resonator name (`rileyAccountEntries`) */
  entries: Record<string, RileyAccountEntry>;
  /** each character's equipped substat rolls ("My build", `buildRollsOf`) */
  builds: Array<{ name: string; key: string; rolls: Array<{ kind: string; value: number }> }>;
  /** one fingerprint over every build's rolls */
  buildsKey: string;
}

/** One member's pick as indices into their loadout (his `Pick`, every flag spelled out). */
export interface RileyPick {
  weapon: number;
  echo: number;
  mainstat: number;
  sequence: number;
  refine: number;
  matrix: boolean;
  highSubs: boolean;
  mySubs: boolean;
}

export interface RunOptions {
  account?: RileyAccount | null;
  subs?: SubsMode;
  /** app keys the app has not released (`blockedKeysOf`): a team with one is skipped / refused. Both front doors
   *  (`rileyClient`, `rileyHeadless`) always pass it; a caller of these functions directly must too. */
  blocked?: readonly string[];
}

/** One member as a solve or a run wore them. Energy in his units (×100: 12500 = a 125-energy bar). */
export interface RunMember {
  /** Riley's resonator name */
  name: string;
  /** this app's character key (`appKeyOf`) */
  appKey: string;
  mainDps: boolean;
  /** the account holds them (a 4-star or Rover form always counts); everyone else runs `s0r1` under `mine` */
  owned: boolean;
  sequence: number;
  /** weapon base name, no rank */
  weapon: string;
  refinement: number;
  /** `mine` ran a stand-in: the weapon the player wears is not on this loadout's list */
  weaponApproximated: boolean;
  matrix: boolean;
  /** his echo label: the set(s), plus the main echo where another pick shares the sonata */
  echo: string;
  sets: string[];
  mainEcho: string;
  /** main-stat layout, e.g. "43311 CD ATK Electro atk atk" */
  mainStats: string;
  /** the substat spread worn: "ChemX32 - ATK Basic", "High Invest - …", "My build" */
  spread: string;
  subs: SubsMode;
  /** ER rolls in the spread tier worn; null on the player's own spread (no tiers there) */
  erRolls: number | null;
  /** Liberation cost, ×100 (0: no energy gate) */
  maxEnergy: number;
  /** the kit's own ER floor in % (Shorekeeper 240), 0 where none */
  minEr: number;
  minCritRate: number;
  /** their `bySlot` DPS, and its share of the team's */
  dps: number;
  share: number;
  pick: RileyPick;
}

/** What `solveMine` hands back per team key. */
export interface MineSolve {
  teamKey: string;
  /** Riley's names and the app's keys, slot order */
  names: string[];
  appKeys: string[];
  status: "ok" | "skipped";
  /** why a team was skipped: a member the app has not released, no build at the account's state (a rotation
   *  that needs a higher sequence), a key his team list no longer has, or the solver refusing it */
  reason?: "notInApp" | "noBuild" | "unknownTeam" | "error";
  message?: string;
  /** the unreleased members, app keys */
  notInApp?: string[];
  /** every member owned by the account */
  fieldable: boolean;
  best: {
    /** his row key (team key + per-member combo keys) — what `model.rowFromKey` / a `#team=` link reads */
    rowKey: string;
    picks: RileyPick[];
    /** team DPS (damage per second since his 7bcbb24 — compare with the app's DPS only) */
    total: number;
    /** DPS per report slot: each member, plus "Tune Break" */
    bySlot: Record<string, number>;
    seconds: number;
    members: RunMember[];
  } | null;
}

/** A held buff on a row: index into `RunLite.buffs`, frames it had left (0: no duration). */
export type HeldRef = [buff: number, left: number];

/** One report line of the traced run (his `ChainGroup`, read off `.snap`; field-summary lines dropped). */
export interface RunRow {
  /** member index into `RunLite.members`, -1 for none */
  member: number;
  /** report slot index into `RunLite.slots` where it is not the member's own (a Tune Break row reports
   *  under "Tune Break"): read `row.slot ?? row.member` */
  slot?: number;
  /** the cast's own name (`snap.action.name`) */
  action: string;
  /** the line's label where it differs — a group's name, "Name x3" for a folded repeat */
  label?: string;
  /** his cast kind (`CAST_NAME`: Basic, Heavy, Skill, Liberation, Intro, Outro, Echo, Tune Break, …); null for a status tick */
  cast: string | null;
  /** the press's cancel tag ("swap cancel", "jump cancel", "off field" …) where it has one */
  tag?: string;
  /** rotation index: 0 the opener, 1–3 the loops */
  section: number;
  /** fight clock at the cast, in frames (60 per second), and frames the press charged the clock */
  frame: number;
  frames: number;
  /** its owner was the resonator on field */
  active: boolean;
  /** queued by something else / a follow-up that fired during a group / the Outro that closes a loop */
  triggered?: true;
  spill?: true;
  endsLoop?: true;
  /** the owner's energy and concerto once the press is in, as his Energy column shows them (×100) */
  energy: number;
  concerto: number;
  /** the line's damage (its folded casts summed) */
  avg: number;
  /** crit as the damage formula read it (a dot / tune hit reads only Negative-Status-scoped crit), %,
   *  damage-weighted over the line's folded casts; absent where nothing on the line can crit */
  critRate?: number;
  critDmg?: number;
  /** the part of `avg` dealt at a Crit Rate of 100 % or more — what a crit-overcap share sums */
  critOver?: number;
  /** buffs held once the press resolved: the owner's own, team-wide, and debuffs on the enemy */
  held: { local: HeldRef[]; global: HeldRef[]; enemy: HeldRef[] };
}

/** One member's energy as his Energy Regen label reads it (`detailFor(run).needs`, page/model.ts), verbatim:
 *  `bar` the constant ER their spends ask for (null where none asks), the kit's `minEr`, the `constant` ER
 *  the build wears, and what they banked into the spend that asked most (×100). Need = max(bar ?? 0, minEr). */
export interface EnergyNeedLite {
  bar: number | null;
  minEr: number;
  constant: number;
  gen: { hit: number; flat: number; spend: number; shared: Array<[string, number]> } | null;
}

export const RUN_LITE_VERSION = 1;

/** A traced team run as plain data — JSON round-trippable, deterministic for one engine commit + account + picks. */
export interface RunLite {
  v: typeof RUN_LITE_VERSION;
  teamKey: string;
  rowKey: string;
  engine: { commit: string; cost: "mine"; account: string; builds: string; subs: SubsMode };
  units: { energy: number; concerto: number; fps: number };
  /** team DPS (the four rotations' damage over their time), DPS per report slot */
  total: number;
  bySlot: Record<string, number>;
  /** the fight: opener + 3 loops (~100 s; nothing lands after it — a kill time past it is an extrapolation) */
  seconds: number;
  sectionSeconds: number[];
  /** damage per rotation */
  sectionTotals: number[];
  members: RunMember[];
  /** report slots: the members in order, then anything else that dealt damage ("Tune Break") */
  slots: string[];
  /** the held-buff table rows index into: [name (with "xN" where it stacks), whose kit it came from] */
  buffs: Array<[name: string, source: string]>;
  rows: RunRow[];
  /** every hit that counted, in landing order: [frame, slot index, member index, damage] — a cumulative damage
   *  curve and a kill time read these; Σ damage × fps / frames = `total` */
  hits: Array<[at: number, slot: number, member: number, avg: number]>;
  /** per member name */
  needs: Record<string, EnergyNeedLite>;
}

/** Why `tracedRun` refused: same vocabulary as `MineSolve.reason`. */
export type RunError = Error & { reason: NonNullable<MineSolve["reason"]> | "stalePicks"; notInApp?: string[] };
const runError = (reason: RunError["reason"], message: string, extra: Partial<RunError> = {}): RunError =>
  Object.assign(new Error(message), { reason }, extra) as RunError;

/** One team of his list as plain data — what the client keeps to map a saved team onto his keys. */
export interface RileyTeamInfo {
  key: string;
  /** `free`: a 4-star or Rover form (his `Tier.Free`) — owned by every account under `mine` (solver.ts `accountOf`);
   *  added for the rotation view (src/sim/rotation/): `hue` the kit's own colour (his `resonator.color`, what
   *  `RESONATOR_HUE` maps), `loadout` his `LoadoutDef.id` (what a /rankings team code names — rotation/teamCode.ts) */
  members: Array<{ name: string; appKey: string; mainDps: boolean; free?: boolean; hue?: string; loadout?: number }>;
}

/* -------------------------------------------------------------------------------------------- helpers */

const r2 = (x: number): number => Math.round(x * 100) / 100;
const r4 = (x: number): number => Math.round(x * 10000) / 10000;
const FPS = 60;

export const normPick = (p: any): RileyPick => ({
  weapon: Number(p.weapon),
  echo: Number(p.echo),
  mainstat: Number(p.mainstat),
  sequence: Number(p.sequence),
  refine: Number(p.refine),
  matrix: !!p.matrix,
  highSubs: !!p.highSubs,
  mySubs: !!p.mySubs,
});

const pickId = (p: RileyPick): string =>
  `${p.weapon}.${p.echo}.${p.mainstat}.s${p.sequence}.r${p.refine}${p.matrix ? "m" : ""}${p.highSubs ? "h" : ""}${p.mySubs ? "u" : ""}`;

/** The memo key of a solve (`op: "solve"`, one team's best row) or a traced run (`op: "trace"`, `picks` null =
 *  on the best row): engine commit + account (+ its builds) + spread + team key + picks. Team keys are slots in
 *  his list, so a new commit must never read an old entry. Also what a consumer's own persisted cache keys on. */
export function memoKey(parts: { op: "solve" | "trace"; commit: string; account?: RileyAccount | null; subs?: SubsMode; teamKey: string; picks?: RileyPick[] | null }): string {
  const a = parts.account;
  const picks = parts.op === "solve" ? "" : parts.picks ? parts.picks.map(pickId).join(",") : "best";
  return [parts.op, parts.commit, a?.key ?? "-", a?.buildsKey ?? "-", parts.subs ?? DEFAULT_SUBS, parts.teamKey, picks].join("|");
}

/** The solver's filters for `mine` in one spread: his defaults, nothing compared. */
export const mineFilters = (E: RileyEngine, subs: SubsMode): any => ({ ...E.solver.defaultFilters(), cost: "mine", subs });

/* ------------------------------------------------------------------------------------------- account */

/** What each engine instance was last told (his account / My-build registries are module state). */
const REGISTERED = new WeakMap<object, { sig: string; names: Set<string> }>();

/** Register the player's account on these engine modules: `setAccountState` (the `mine` cost) and every
 *  "My build" spread (`setMySubstat` + `customSubstats`), clearing builds that went away. Idempotent per
 *  account key + builds key. Null clears everything (`mine` then runs everyone at `s0r1`). */
export function registerAccount(E: RileyEngine, account: RileyAccount | null): void {
  const sig = account ? `${account.key}|${account.buildsKey}` : "";
  const held = REGISTERED.get(E.solver);
  if (held && held.sig === sig) return;
  E.solver.setAccountState(account?.entries ?? null, account?.key ?? "");
  const next = new Set((account?.builds ?? []).filter((b) => b.rolls.length).map((b) => b.name));
  for (const name of held?.names ?? []) if (!next.has(name)) E.solver.setMySubstat(name, null);
  for (const b of account?.builds ?? []) {
    if (b.rolls.length) E.solver.setMySubstat(b.name, E.substats.customSubstats("My build", b.rolls), b.key);
  }
  REGISTERED.set(E.solver, { sig, names: next });
}

/* --------------------------------------------------------------------------------------------- teams */

/** His team list as plain data (the client's map from a saved team to his keys). */
export function listTeams(E: RileyEngine): RileyTeamInfo[] {
  // his `Tier` is a const enum: the runtime object where the build kept it, else Free = 2
  const FREE = E.stats.Tier?.Free ?? 2;
  return Object.entries(E.model.TEAMS as Record<string, any[]>).map(([key, members]) => ({
    key,
    members: members.map((m) => ({
      name: String(m.name),
      appKey: appKeyOf(m.name),
      mainDps: !!m.mainDps,
      ...(m.loadout?.resonator?.tier === FREE ? { free: true } : {}),
      hue: String(m.loadout?.resonator?.color ?? ""),
      loadout: Number(m.loadout?.id ?? 0),
    })),
  }));
}

/** The app keys among his resonators that the app has not released — `notInApp` is importFromRankings.ts's
 *  guard, handed in so this module never imports the app's character registry (that would drag every kit
 *  into the worker). Lily, as of 7bcbb24. */
export function blockedKeysOf(teams: RileyTeamInfo[], notInApp: (keys: string[]) => string[]): string[] {
  return notInApp([...new Set(teams.flatMap((t) => t.members.map((m) => m.appKey)))]).sort();
}

/** The best of several solves (a composition's loadout variants): the highest DPS among the solved ones. */
export function bestOf(solves: MineSolve[]): MineSolve | null {
  let best: MineSolve | null = null;
  for (const s of solves) if (s.best && (!best || s.best.total > best.best!.total)) best = s;
  return best;
}

/* ---------------------------------------------------------------------------------------- the reading */

/** One member as a combo dresses them — the gear fields of `RunMember`. */
function memberOf(E: RileyEngine, members: any[], combos: any[], picks: RileyPick[], erRolls: number[], i: number, bySlot: Map<string, number>, total: number): RunMember {
  const S = E.solver;
  const m = members[i];
  const c = combos[i];
  const l = m.loadout;
  const mySubs = !!c.mySubs;
  const tiers: Array<{ rolls: number }> = (c.highSubs ? l.highSubstat : l.substat).tiers;
  const worn = mySubs ? null : c.highSubs && !l.resonator.maxEnergy ? 0 : (tiers.find((t) => t.rolls >= erRolls[i]!) ?? tiers[tiers.length - 1]!).rolls;
  const dps = bySlot.get(m.name) ?? 0;
  return {
    name: String(m.name),
    appKey: appKeyOf(m.name),
    mainDps: !!m.mainDps,
    owned: !!S.accountOf(m)?.owned,
    sequence: Number(c.sequence),
    weapon: String(S.weaponBase(c.weapon)),
    refinement: Number(c.weapon.refinement),
    weaponApproximated: !!S.weaponApproximated(m),
    matrix: c.matrix != null,
    echo: String(S.echoLabel(l, c.echo)),
    sets: (c.echo.sets as any[]).map((g) => String(g.name)),
    mainEcho: String(c.echo.mainslot.name),
    mainStats: String(c.mainstat.name),
    spread: mySubs ? "My build" : String(l.spread(c.highSubs, erRolls[i], false).name),
    subs: mySubs ? "mine" : c.highSubs ? "high" : "standard",
    erRolls: worn,
    maxEnergy: Number(l.resonator.maxEnergy ?? 0),
    minEr: Number(l.minEr ?? 0),
    minCritRate: Number(l.minCritRate ?? 0),
    dps: r2(dps),
    share: total > 0 ? r4(dps / total) : 0,
    pick: picks[i]!,
  };
}

/** Crit Rate / Crit DMG (%) as damage.ts's `damageFactors` reads them off one snapshot; null where the hit
 *  cannot crit (a marker or a Fixed hit). A dot or tune hit reads only its Negative-Status-scoped crit — the
 *  plain `stats[CritRate]` already holds that scoped part (context.ts `writeSplits`), so the two never add. */
function critOf(St: any, snap: any): [number, number] | null {
  const sc = snap.action?.scaling;
  if (sc == null || sc === St.Scaling.Fixed) return null;
  if (sc === St.Scaling.Dot || sc === St.Scaling.Tune) return [snap.subtypeCritRate ?? 0, snap.subtypeCritDmg ? snap.subtypeCritDmg : 100];
  return [snap.stats[St.Stat.CritRate] ?? 0, snap.stats[St.Stat.CritDmg] ?? 0];
}

/** The live traced `TeamRun` as a RunLite. The only function that reads his run, line and snapshot fields. */
export function toRunLite(E: RileyEngine, run: any, meta: { picks: RileyPick[]; account: RileyAccount | null; subs: SubsMode }): RunLite {
  const { teamrun: R, stats: St, model: M } = E;
  if (!run?.rotationLines || !run.state) throw new Error("toRunLite: the run is not traced (runTeam(…, true))");
  const members: any[] = run.members;
  const combos: any[] = run.combo;
  const names: string[] = members.map((m) => String(m.name));
  const bySlot: Map<string, number> = run.bySlot;
  const total = Number(run.total);
  const erRolls: number[] = R.erRollsFor(run.teamKey, members, combos);
  const detail = M.detailFor(run);

  const slots = [...names];
  const slotOf = (name: string): number => {
    let i = slots.indexOf(name);
    if (i < 0) i = slots.push(name) - 1;
    return i;
  };
  for (const name of bySlot.keys()) slotOf(name);

  const buffs: Array<[string, string]> = [];
  const buffIndex = new Map<string, number>();
  const refs = (held: Array<{ name: string; source: string; left: number }> | undefined): HeldRef[] =>
    (held ?? []).map((h) => {
      const id = `${h.name}\u0000${h.source}`;
      let i = buffIndex.get(id);
      if (i === undefined) {
        i = buffs.push([String(h.name), String(h.source)]) - 1;
        buffIndex.set(id, i);
      }
      return [i, Math.round(Number(h.left) || 0)];
    });

  const rows: RunRow[] = [];
  for (const line of (run.rotationLines as any[][]).flat()) {
    // a field window's summary line stands for hits that are lines of their own: display-only, never counted
    if (line.aggregate) continue;
    const s = line.snap;
    let weight = 0, crw = 0, cdw = 0, over = 0;
    let first: [number, number] | null = null;
    for (const part of R.hitsOf(line) as any[]) {
      const crit = critOf(St, part);
      if (!crit) continue;
      first ??= crit;
      const a = Number(part.avg) || 0;
      weight += a;
      crw += crit[0] * a;
      cdw += crit[1] * a;
      if (crit[0] >= 100) over += a;
    }
    const row: RunRow = {
      member: names.indexOf(s.member),
      action: String(s.action.name),
      cast: St.CAST_NAME[s.action.cast] ?? null,
      section: Number(s.section ?? 0),
      frame: Number(s.frame),
      frames: Number(s.frames),
      active: !!s.active,
      energy: Math.round(s.shownAfter?.[0] ?? s.energy ?? 0),
      concerto: Math.round(s.shownAfter?.[1] ?? s.concerto ?? 0),
      avg: Math.round(Number(line.avg) || 0),
      held: { local: refs(s.heldLocal), global: refs(s.heldGlobal), enemy: refs(s.heldEnemy) },
    };
    const slot = slotOf(String(s.slot ?? s.member));
    if (slot !== row.member) row.slot = slot;
    if (line.id !== s.action.name) row.label = String(line.id);
    if (s.tag) row.tag = String(s.tag);
    if (s.triggered) row.triggered = true;
    if (line.spill) row.spill = true;
    if (s.endsLoop) row.endsLoop = true;
    if (first) {
      // a line that dealt nothing reads its first critable cast's crit
      row.critRate = r2(weight > 0 ? crw / weight : first[0]);
      row.critDmg = r2(weight > 0 ? cdw / weight : first[1]);
      row.critOver = Math.round(over);
    }
    rows.push(row);
  }

  // every hit runTeam counted: it files hits by rotation and drops what lands after the fight's last frame
  const frames = Math.round(Number(run.seconds) * FPS);
  const hits: RunLite["hits"] = [];
  for (const h of run.state.hits as any[]) {
    if (h.at > frames) continue;
    hits.push([Number(h.at), slotOf(String(h.slot)), names.indexOf(h.member), Math.round(Number(h.avg) || 0)]);
  }

  const needs: Record<string, EnergyNeedLite> = {};
  for (const [name, n] of detail.needs as Map<string, any>) {
    needs[name] = {
      bar: n.bar ?? null,
      minEr: Number(n.minEr ?? 0),
      constant: Number(n.constant ?? 0),
      gen: n.gen ? { hit: n.gen.hit, flat: n.gen.flat, spend: n.gen.spend, shared: (n.gen.shared as Array<[string, number]>).map(([who, v]) => [who, v]) } : null,
    };
  }

  return {
    v: RUN_LITE_VERSION,
    teamKey: String(run.teamKey),
    rowKey: `${run.teamKey}-${combos.map((c) => c.key).join("-")}`,
    engine: { commit: E.commit, cost: "mine", account: meta.account?.key ?? "", builds: meta.account?.buildsKey ?? "", subs: meta.subs },
    units: { energy: Number(St.ENERGY_UNIT ?? 100), concerto: Number(St.CONCERTO_UNIT ?? 100), fps: FPS },
    total: r2(total),
    bySlot: Object.fromEntries([...bySlot].map(([k, v]) => [k, r2(v)])),
    seconds: r4(Number(run.seconds)),
    sectionSeconds: (run.sectionSeconds as number[]).map(r4),
    sectionTotals: (run.sectionTotals as number[]).map((x) => Math.round(x)),
    members: members.map((_, i) => memberOf(E, members, combos, meta.picks, erRolls, i, bySlot, total)),
    slots,
    buffs,
    rows,
    hits,
    needs,
  };
}

/** A run's cumulative damage over the fight — what a kill time reads (the ToA clear check). Small where a RunLite
 *  is 55–230 KB: no rows, no buffs, one point per frame a hit landed on. */
export interface FightCurve {
  teamKey: string;
  rowKey: string;
  commit: string;
  /** team DPS over the fight (opener + 3 loops) */
  total: number;
  /** the fight's length; nothing lands after it — a kill past it is an extrapolation */
  seconds: number;
  sectionSeconds: number[];
  sectionTotals: number[];
  /** [frame (60 per second), damage dealt up to and including that frame], frames ascending */
  points: Array<[frame: number, cumulative: number]>;
}

/** A finished run (traced or not) as its damage curve. Reads the same fields `toRunLite` does — the hits
 *  runTeam counted, dropped past the fight's last frame — and nothing else. */
export function toFightCurve(E: RileyEngine, run: any): FightCurve {
  if (!run?.state) throw new Error("toFightCurve: the run kept no fight state");
  const frames = Math.round(Number(run.seconds) * FPS);
  const byFrame = new Map<number, number>();
  for (const h of run.state.hits as any[]) {
    if (h.at > frames) continue;
    const at = Number(h.at);
    byFrame.set(at, (byFrame.get(at) ?? 0) + (Number(h.avg) || 0));
  }
  const points: Array<[number, number]> = [];
  let sum = 0;
  for (const at of [...byFrame.keys()].sort((a, b) => a - b)) {
    sum += byFrame.get(at)!;
    points.push([at, Math.round(sum)]);
  }
  const combos: any[] = run.combo;
  return {
    teamKey: String(run.teamKey),
    rowKey: `${run.teamKey}-${combos.map((c) => c.key).join("-")}`,
    commit: E.commit,
    total: r2(Number(run.total)),
    seconds: r4(Number(run.seconds)),
    sectionSeconds: (run.sectionSeconds as number[]).map(r4),
    sectionTotals: (run.sectionTotals as number[]).map((x) => Math.round(x)),
    points,
  };
}

/** A RunRow's held buffs in the documented `{ name, source, left }` shape. */
export function heldOf(run: Pick<RunLite, "buffs">, row: RunRow, kind: keyof RunRow["held"]): Array<{ name: string; source: string; left: number }> {
  return row.held[kind].map(([i, left]) => ({ name: run.buffs[i]![0], source: run.buffs[i]![1], left }));
}

/* --------------------------------------------------------------------------------------- solve, trace */

function teamOf(E: RileyEngine, teamKey: string): any[] | null {
  const members = (E.model.TEAMS as Record<string, any[]>)[teamKey];
  return Array.isArray(members) ? members : null;
}

/** The members `blocked` names, app keys. */
const hiddenOf = (appKeys: string[], blocked: readonly string[] | undefined): string[] => (blocked?.length ? [...new Set(appKeys.filter((k) => blocked.includes(k)))] : []);

/** Picks → his combos, checked the way a `#team=` row key is (`model.rowFromKey`): every index on the
 *  loadout's lists, the echo pick legal in this team, a "My build" pick only while that build is registered. */
function combosOf(E: RileyEngine, teamKey: string, members: any[], picks: RileyPick[]): any[] {
  const stale = (): RunError => runError("stalePicks", `${teamKey}: these picks no longer fit the team at wuwa_calc ${E.commit} — solve it again`);
  if (picks.length !== members.length) throw stale();
  const combos = picks.map((p, i) => {
    const l = members[i].loadout;
    if (!l.refinements[p.weapon]?.[p.refine] || !l.echoLoadouts[p.echo] || !l.mainstats[p.mainstat]) throw stale();
    return E.solver.comboOf(l, p);
  });
  const row = E.model.rowFromKey(`${teamKey}-${combos.map((c) => c.key).join("-")}`);
  if (!row) throw stale();
  return row.combo;
}

/** The best `mine` row per team key, in the order asked. Teams with a member the app has not released, with
 *  no build at the account's state, or that his list no longer has are reported as skipped, never thrown.
 *  `onProgress(done, total)` after each team. */
export function solveMine(E: RileyEngine, teamKeys: string[], opts: RunOptions & { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean } = {}): MineSolve[] {
  registerAccount(E, opts.account ?? null);
  const out: MineSolve[] = [];
  for (const key of teamKeys) {
    if (opts.isCancelled?.()) break;
    out.push(solveOne(E, key, opts));
    opts.onProgress?.(out.length, teamKeys.length);
  }
  return out;
}

/** One team's solve — the unit `solveMine` and the worker's cancellable loop walk. */
export function solveOne(E: RileyEngine, teamKey: string, opts: RunOptions = {}): MineSolve {
  const S = E.solver;
  const R = E.teamrun;
  registerAccount(E, opts.account ?? null);
  const members = teamOf(E, teamKey);
  if (!members) return { teamKey, names: [], appKeys: [], status: "skipped", reason: "unknownTeam", message: `wuwa_calc ${E.commit} has no team ${teamKey}`, fieldable: false, best: null };
  const names = members.map((m) => String(m.name));
  const appKeys = names.map(appKeyOf);
  const fieldable = members.every((m) => !!S.accountOf(m)?.owned);
  const base = { teamKey, names, appKeys, fieldable };
  const hidden = hiddenOf(appKeys, opts.blocked);
  if (hidden.length) {
    return { ...base, status: "skipped", reason: "notInApp", notInApp: hidden, message: `${hidden.join(" and ")} ${hidden.length > 1 ? "are" : "is"} not released in this app yet`, best: null };
  }
  const subs = opts.subs ?? DEFAULT_SUBS;
  const filters = mineFilters(E, subs);
  if (!members.every((m) => S.hasBuild(m, filters))) {
    return { ...base, status: "skipped", reason: "noBuild", message: "no build at this account's state (a member's rotation needs a higher sequence)", best: null };
  }
  let solved: any;
  try {
    solved = S.solveTeam(teamKey, members, filters, null);
  } catch (e) {
    // optimizeTeam refuses a team a member can't fill their bar / reach their crit floor in
    return { ...base, status: "skipped", reason: "error", message: e instanceof Error ? e.message : String(e), best: null };
  }
  // the table's row, not the bare best picks: the spread mode settles its main stats (syncTeamsHeadless does the same)
  const fromRows = !!solved.rows?.[0];
  const raw: any[] = fromRows ? solved.rows[0] : solved.picks;
  const picks = raw.map(normPick);
  const combos = raw.map((p, j) => S.comboOf(members[j].loadout, p));
  const score = fromRows && solved.scores?.[0] ? solved.scores[0] : R.scoreOf(R.runTeam(teamKey, members, combos));
  const bySlot = new Map<string, number>(score.bySlot);
  const total = Number(score.total);
  const erRolls: number[] = R.erRollsFor(teamKey, members, combos);
  return {
    ...base,
    status: "ok",
    best: {
      rowKey: `${teamKey}-${combos.map((c) => c.key).join("-")}`,
      picks,
      total: r2(total),
      bySlot: Object.fromEntries([...bySlot].map(([k, v]) => [k, r2(v)])),
      seconds: r4(Number(score.seconds)),
      members: members.map((_, i) => memberOf(E, members, combos, picks, erRolls, i, bySlot, total)),
    },
  };
}

/** The live traced run (`runTeam(key, members, combos, true)`) on these picks — `picks` null solves first.
 *  For a caller that needs his objects (an import); everything else wants `tracedRun`. */
export function traceLive(E: RileyEngine, teamKey: string, picks: RileyPick[] | null, opts: RunOptions = {}): { run: any; picks: RileyPick[] } {
  registerAccount(E, opts.account ?? null);
  const members = teamOf(E, teamKey);
  if (!members) throw runError("unknownTeam", `wuwa_calc ${E.commit} has no team ${teamKey}`);
  const hidden = hiddenOf(members.map((m) => appKeyOf(m.name)), opts.blocked);
  if (hidden.length) throw runError("notInApp", `${hidden.join(" and ")} ${hidden.length > 1 ? "are" : "is"} not released in this app yet`, { notInApp: hidden });
  let chosen = picks?.map(normPick) ?? null;
  if (!chosen) {
    const solved = solveOne(E, teamKey, opts);
    if (!solved.best) throw runError(solved.reason ?? "error", solved.message ?? `${teamKey} has no build`);
    chosen = solved.best.picks;
  }
  const combos = combosOf(E, teamKey, members, chosen);
  return { run: E.teamrun.runTeam(teamKey, members, combos, true), picks: chosen };
}

/** An untraced `runTeam` on fixed picks as its damage curve — under whatever enemy profile the caller set around
 *  it (src/sim/endgame/effects.ts `withFloorProfile`). Picks are required: a solve never runs profiled (the
 *  solver's caches don't key on the profile), so the best row comes from an unprofiled `solveMine` first. */
export function fightCurve(E: RileyEngine, teamKey: string, picks: RileyPick[], opts: RunOptions = {}): FightCurve {
  registerAccount(E, opts.account ?? null);
  const members = teamOf(E, teamKey);
  if (!members) throw runError("unknownTeam", `wuwa_calc ${E.commit} has no team ${teamKey}`);
  const hidden = hiddenOf(members.map((m) => appKeyOf(m.name)), opts.blocked);
  if (hidden.length) throw runError("notInApp", `${hidden.join(" and ")} ${hidden.length > 1 ? "are" : "is"} not released in this app yet`, { notInApp: hidden });
  const combos = combosOf(E, teamKey, members, picks.map(normPick));
  return toFightCurve(E, E.teamrun.runTeam(teamKey, members, combos, false));
}

/** `runTeam(…, true)` on these picks (null: the best `mine` row) as a RunLite. Throws a `RunError` for a team
 *  with an unreleased member (released content only), a stale key or stale picks. */
export function tracedRun(E: RileyEngine, teamKey: string, picks: RileyPick[] | null, opts: RunOptions = {}): RunLite {
  const { run, picks: used } = traceLive(E, teamKey, picks, opts);
  return toRunLite(E, run, { picks: used, account: opts.account ?? null, subs: opts.subs ?? DEFAULT_SUBS });
}
