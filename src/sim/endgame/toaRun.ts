// Wuthering Tools+ — the ToA clear check, end to end over a Riley runner (the browser's rileyClient, or the headless
// seam): find the teams the account can field, solve each at the account's own state (`mine`, unprofiled), then run
// every candidate's best row against each timed floor's enemy profile and read its kill time and crests.
//
// Pure orchestration: no Vue, no stores. The release guard rides on the runner (`solveMine` skips a team with a
// member the app hasn't released — Lily — and `curves` refuses one), and `fieldableKeys` only offers teams whose
// every member the account owns.
import type { FightCurve, MineSolve, RileyAccount, RileyPick, RileyTeamInfo, RunMember } from "../engine/rileyRun";
import { rampAt, type FloorProfileSpec } from "./effects";
import { crestsFor, teamSignature } from "./crests";
import { killTime, type TimeFactor } from "./killTime";
import { hpSegments, segmentProfiles, timedFloors, type ToaFloor, type ToaSeason } from "./toaData";
import { profileSignature } from "./effects";
import { vigorPool, type PlanInput, type PlanOption, type PlanStage } from "./vigorPlan";

/** What the check needs of the engine — `rileyClient()` fits it as is. */
export interface ToaRunner {
  readonly commit: string;
  teams(signal?: AbortSignal): Promise<RileyTeamInfo[]>;
  solveMine(teamKeys: string[], opts?: { account?: RileyAccount | null; signal?: AbortSignal; onProgress?: (done: number, total: number) => void }): Promise<MineSolve[]>;
  curves(teamKey: string, picks: RileyPick[], profiles: Array<FloorProfileSpec | null>, opts?: { account?: RileyAccount | null; signal?: AbortSignal }): Promise<FightCurve[]>;
}

/** One team the check times: the best loadout variant of a composition the account can field. */
export interface CandidateTeam {
  /** the composition, whoever sits where (`teamSignature`) */
  id: string;
  teamKey: string;
  rowKey: string;
  /** Riley's names and this app's keys, his slot order (supports first, main DPS last as he lists them) */
  names: string[];
  appKeys: string[];
  /** the main DPS's app key */
  mainDps: string | null;
  /** team DPS against his standard target (level 100, 20 % RES) */
  dps: number;
  /** the player's own saved team of these three, by name */
  saved: string | null;
  picks: RileyPick[];
  members: Array<Pick<RunMember, "name" | "appKey" | "mainDps" | "sequence" | "weapon" | "refinement">>;
}

export interface FloorResult {
  floorId: string;
  teamId: string;
  /** seconds of the 300 s clock, null = the floor outlasts it */
  seconds: number | null;
  extrapolated: boolean;
  crests: number;
  /** each HP segment's end */
  splits: Array<number | null>;
  /** the floor's HP over the kill time */
  dps: number | null;
  /** where Riley's run ends (the first segment's fight), s — the time bar's extrapolated part starts there */
  fightSeconds?: number;
  /** an engine failure: shown as "—" with this */
  error?: string;
}

export interface ToaCheck {
  /** what the result was computed for — a stored one is reused only while this matches */
  key: string;
  season: number;
  computedAt: number;
  candidates: CandidateTeam[];
  results: FloorResult[];
  /** fieldable teams solved, and why the rest were skipped */
  scanned: number;
  skipped: Record<string, number>;
}

export interface Progress {
  phase: "teams" | "solve" | "floors";
  done: number;
  total: number;
  label: string;
}

/** The key a stored check is valid for: engine commit, account, its builds, season data, candidate breadth. */
export const checkKey = (commit: string, account: RileyAccount | null, season: ToaSeason, saved: string[], limit: number): string =>
  [commit, account?.key ?? "-", account?.buildsKey ?? "-", `s${season.season}`, season.generatedAt, [...saved].sort().join(","), limit].join("|");

/** His team keys whose every member the account owns (a 4-star / Rover form always counts, as his `mine` reads it). */
export function fieldableKeys(teams: RileyTeamInfo[], account: RileyAccount | null): string[] {
  if (!account) return [];
  return teams.filter((t) => t.members.length === 3 && t.members.every((m) => m.free || account.entries[m.name]?.owned)).map((t) => t.key);
}

/** The candidates to time: the best variant of every composition solved, the player's saved teams always, then by
 *  DPS — the best team of every main DPS first (so a floor's element can still pick an odd one), up to `limit`. */
export function pickCandidates(solves: MineSolve[], saved: Map<string, string>, limit = 30): CandidateTeam[] {
  const best = new Map<string, MineSolve>();
  for (const s of solves) {
    if (s.status !== "ok" || !s.best || !s.fieldable) continue;
    const id = teamSignature(s.appKeys);
    const was = best.get(id);
    if (!was || s.best.total > was.best!.total || (s.best.total === was.best!.total && s.teamKey < was.teamKey)) best.set(id, s);
  }
  const ranked = [...best.entries()].sort((a, b) => b[1].best!.total - a[1].best!.total || (a[0] < b[0] ? -1 : 1));
  const chosen = new Set<string>();
  for (const [id] of ranked) if (saved.has(id)) chosen.add(id);
  const mainOf = (s: MineSolve): string => s.best!.members.find((m) => m.mainDps)?.appKey ?? s.appKeys[s.appKeys.length - 1]!;
  const mains = new Set<string>();
  for (const [id, s] of ranked) {
    if (chosen.size >= limit) break;
    if (mains.has(mainOf(s))) continue;
    mains.add(mainOf(s));
    chosen.add(id);
  }
  for (const [id] of ranked) {
    if (chosen.size >= limit) break;
    chosen.add(id);
  }
  return ranked
    .filter(([id]) => chosen.has(id))
    .map(([id, s]) => ({
      id,
      teamKey: s.teamKey,
      rowKey: s.best!.rowKey,
      names: s.names,
      appKeys: s.appKeys,
      mainDps: s.best!.members.find((m) => m.mainDps)?.appKey ?? null,
      dps: s.best!.total,
      saved: saved.get(id) ?? null,
      picks: s.best!.picks,
      members: s.best!.members.map((m) => ({ name: m.name, appKey: m.appKey, mainDps: m.mainDps, sequence: m.sequence, weapon: m.weapon, refinement: m.refinement })),
    }));
}

/** A floor's time-dependent damage factor (its DMG-taken ramps), 1 where it has none. */
export function floorFactor(floor: ToaFloor): TimeFactor {
  const ramps = floor.effects.flatMap((e) => e.model).filter((m): m is Extract<typeof m, { kind: "ramp" }> => m.kind === "ramp");
  if (!ramps.length) return () => 1;
  return (t) => 1 + ramps.reduce((s, r) => s + rampAt(r, t), 0) / 100;
}

/** Every distinct engine profile the season's timed floors need, and where each floor's segments find theirs. */
export function seasonProfiles(season: ToaSeason): { profiles: FloorProfileSpec[]; byFloor: Map<string, number[]> } {
  const profiles: FloorProfileSpec[] = [];
  const index = new Map<string, number>();
  const byFloor = new Map<string, number[]>();
  for (const f of timedFloors(season)) {
    byFloor.set(
      f.id,
      segmentProfiles(f).map((p) => {
        const sig = profileSignature(p);
        let i = index.get(sig);
        if (i === undefined) {
          i = profiles.push(p) - 1;
          index.set(sig, i);
        }
        return i;
      }),
    );
  }
  return { profiles, byFloor };
}

/** One candidate's kill time on each timed floor, off its curves (index-aligned with `seasonProfiles`). */
export function floorResults(season: ToaSeason, team: CandidateTeam, curves: FightCurve[], byFloor: Map<string, number[]>): FloorResult[] {
  return timedFloors(season).map((f) => {
    const segs = hpSegments(f);
    const at = byFloor.get(f.id) ?? [];
    const kill = killTime(segs.map((s, i) => ({ hp: s.hp, curve: curves[at[i]!]! })), floorFactor(f));
    return {
      floorId: f.id,
      teamId: team.id,
      seconds: kill.seconds === null ? null : Math.round(kill.seconds * 10) / 10,
      extrapolated: kill.extrapolated,
      crests: crestsFor(f.goals, kill.seconds),
      splits: kill.splits.map((s) => (s === null ? null : Math.round(s * 10) / 10)),
      dps: kill.seconds ? Math.round((f.hp ?? 0) / kill.seconds) : null,
      fightSeconds: curves[at[0]!]?.seconds,
    };
  });
}

const failed = (season: ToaSeason, team: CandidateTeam, error: string): FloorResult[] =>
  timedFloors(season).map((f) => ({ floorId: f.id, teamId: team.id, seconds: null, extrapolated: false, crests: 0, splits: [], dps: null, error }));

/** The whole check: scan → solve → time every candidate on every timed floor. */
export async function runToaCheck(
  runner: ToaRunner,
  season: ToaSeason,
  opts: {
    account: RileyAccount | null;
    /** the player's saved teams: three app keys and a name each */
    savedTeams?: Array<{ name: string; characterIds: Array<string | null> }>;
    limit?: number;
    signal?: AbortSignal;
    onProgress?: (p: Progress) => void;
    now?: () => number;
  },
): Promise<ToaCheck> {
  const { account, signal } = opts;
  const limit = opts.limit ?? 30;
  const saved = new Map<string, string>();
  for (const t of opts.savedTeams ?? []) {
    const ids = t.characterIds.filter((x): x is string => !!x);
    if (ids.length === 3 && !saved.has(teamSignature(ids))) saved.set(teamSignature(ids), t.name);
  }
  opts.onProgress?.({ phase: "teams", done: 0, total: 1, label: "Reading wuwa_calc's teams" });
  const teams = await runner.teams(signal);
  const keys = fieldableKeys(teams, account);
  const solves = keys.length
    ? await runner.solveMine(keys, { account, signal, onProgress: (done, total) => opts.onProgress?.({ phase: "solve", done, total, label: "Solving the teams you can field at your account" }) })
    : [];
  const skipped: Record<string, number> = {};
  for (const s of solves) if (s.status !== "ok") skipped[s.reason ?? "error"] = (skipped[s.reason ?? "error"] ?? 0) + 1;
  const candidates = pickCandidates(solves, saved, limit);
  const { profiles, byFloor } = seasonProfiles(season);
  const results: FloorResult[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const team = candidates[i]!;
    opts.onProgress?.({ phase: "floors", done: i, total: candidates.length, label: `Fighting each floor with ${team.names.join(" · ")}` });
    try {
      const curves = await runner.curves(team.teamKey, team.picks, profiles, { account, signal });
      results.push(...floorResults(season, team, curves, byFloor));
    } catch (e) {
      if (signal?.aborted) throw e;
      results.push(...failed(season, team, e instanceof Error ? e.message : String(e)));
    }
  }
  opts.onProgress?.({ phase: "floors", done: candidates.length, total: candidates.length, label: "Done" });
  return {
    key: checkKey(runner.commit, account, season, [...saved.keys()], limit),
    season: season.season,
    computedAt: (opts.now ?? Date.now)(),
    candidates,
    results,
    scanned: solves.length,
    skipped,
  };
}

/** A floor's teams, best first: crests, then time, then the stronger team. */
export function rankFloor(check: Pick<ToaCheck, "results" | "candidates">, floorId: string): Array<{ result: FloorResult; team: CandidateTeam }> {
  const teams = new Map(check.candidates.map((c) => [c.id, c]));
  return check.results
    .filter((r) => r.floorId === floorId && teams.has(r.teamId))
    .map((result) => ({ result, team: teams.get(result.teamId)! }))
    .sort(
      (a, b) =>
        b.result.crests - a.result.crests ||
        (a.result.seconds ?? Infinity) - (b.result.seconds ?? Infinity) ||
        b.team.dps - a.team.dps ||
        (a.team.id < b.team.id ? -1 : 1),
    );
}

/* ------------------------------------------------------------------------------------------- the plan */

/** The 12 stages as the planner takes them: the timed floors with every candidate's result as an option (its
 *  seconds scaled by the team's pace where the player asked for it), the low side floors as spare stages. */
export function planInputOf(
  season: ToaSeason,
  check: Pick<ToaCheck, "results" | "candidates">,
  opts: { owned?: string[]; paceOf?: (teamId: string) => number | null; vigor?: number } = {},
): PlanInput {
  const teams = new Map(check.candidates.map((c) => [c.id, c]));
  const stages: PlanStage[] = [];
  for (const tower of season.towers) {
    for (const f of tower.floors) {
      if (f.hp) {
        const options: PlanOption[] = check.results
          .filter((r) => r.floorId === f.id && teams.has(r.teamId))
          .map((r) => {
            const pace = opts.paceOf?.(r.teamId) ?? null;
            const seconds = r.seconds === null ? null : pace ? r.seconds * pace : r.seconds;
            return { id: r.teamId, members: teams.get(r.teamId)!.appKeys, seconds, crests: crestsFor(f.goals, seconds) };
          });
        stages.push({ id: f.id, cost: f.cost, timed: true, options });
      } else stages.push({ id: f.id, cost: f.cost, timed: false, options: [], assumedCrests: f.goals.length });
    }
  }
  // spare picks prefer whoever the timed stages need least: never in a candidate, then the weakest team they're in
  const strength = new Map<string, number>();
  for (const c of check.candidates) for (const k of c.appKeys) strength.set(k, Math.max(strength.get(k) ?? 0, c.dps));
  // one entry per Vigor pool (Rover's forms are one resonator), the account's own form where it set one up
  const seen = new Set<string>();
  const roster = [...(opts.owned ?? []), ...check.candidates.flatMap((c) => c.appKeys)]
    .filter((k) => !seen.has(vigorPool(k)) && !!seen.add(vigorPool(k)))
    .sort((a, b) => (strength.get(a) ?? 0) - (strength.get(b) ?? 0) || (a < b ? -1 : 1));
  return { stages, roster, vigor: opts.vigor };
}
