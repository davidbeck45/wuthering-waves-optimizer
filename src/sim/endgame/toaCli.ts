// Wuthering Tools+ — `npm run cli -- toa`: the ToA clear check headless (the /endgame page's numbers) on an export's
// account: every timed floor's best teams with kill time and crests, then the Vigor plan for all 12 stages.
// Node-only (the CLI imports it lazily).
import type { ExportFile } from "../cli/exportFile";
import { table } from "../cli/format";
import { rileyHeadless } from "../engine/rileyNode";
import { fightCurve } from "../engine/rileyRun";
import { appKeyOf } from "../rankings/castMapper";
import { withFloorProfile } from "./effects";
import { clockText } from "./crests";
import { loadSeason, seasonStatus, timedFloors, toaIndex, floorLabel, type ToaSeason } from "./toaData";
import { planInputOf, rankFloor, runToaCheck, type ToaCheck, type ToaRunner } from "./toaRun";
import { planVigor, type Plan } from "./vigorPlan";

export interface ToaCliResult {
  season: number;
  current: boolean;
  check: ToaCheck;
  plan: Plan;
  ms: number;
}

export async function toaCheck(exp: ExportFile, opts: { limit?: number; now?: number } = {}): Promise<{ season: ToaSeason; result: ToaCliResult }> {
  const now = opts.now ?? Date.now();
  const status = seasonStatus(toaIndex, now);
  if (!status.entry) throw new Error("no Tower of Adversity season has started yet in this build's data");
  const season = await loadSeason(status.entry);
  const riley = await rileyHeadless(exp);
  const E = riley.engine;
  const runner: ToaRunner = {
    commit: E.commit,
    teams: async () => riley.teams,
    solveMine: async (keys, o = {}) => riley.solveMine(keys, { onProgress: o.onProgress }),
    curves: async (teamKey, picks, profiles) =>
      profiles.map((spec) => withFloorProfile(E, spec, () => fightCurve(E, teamKey, picks, { account: riley.account, blocked: riley.blocked }))),
  };
  const t0 = performance.now();
  const check = await runToaCheck(runner, season, {
    account: riley.account,
    savedTeams: (exp.teams ?? []).map((t: Record<string, unknown>) => ({ name: String(t.name ?? ""), characterIds: (t.characterIds as Array<string | null>) ?? [] })),
    limit: opts.limit,
  });
  const owned = Object.entries(riley.account?.entries ?? {}).filter(([, e]) => e.owned).map(([name]) => appKeyOf(name));
  const plan = planVigor(planInputOf(season, check, { owned }));
  return { season, result: { season: season.season, current: status.current, check, plan, ms: Math.round(performance.now() - t0) } };
}

export function printToa(season: ToaSeason, r: ToaCliResult): void {
  const { check, plan } = r;
  console.log(`Tower of Adversity · Season ${season.season} (${season.start} → ${season.end})${r.current ? "" : " — ended, newer data not in this build"}`);
  console.log(`${check.scanned} fieldable teams solved, ${check.candidates.length} timed on ${timedFloors(season).length} floors in ${r.ms} ms (sim, perfect execution)\n`);
  for (const f of timedFloors(season)) {
    const rows = rankFloor(check, f.id).slice(0, 5);
    console.log(`${floorLabel(f.id)} · ${f.enemies.map((e) => (e.count > 1 ? `${e.name} ×${e.count}` : e.name)).join(", ")} · ${(f.hp ?? 0).toLocaleString("en-US")} HP · Lv${f.level} · goals ${f.goals.map((g) => `${g}s`).join(" / ")} left`);
    console.log(
      table([
        ["  Team", "DPS", "Kill", "Crests"],
        ...rows.map(({ result, team }) => [`  ${team.names.join(" · ")}${team.saved ? " (saved)" : ""}`, Math.round(team.dps).toLocaleString("en-US"), `${clockText(result.seconds)}${result.extrapolated ? " *" : ""}`, "★".repeat(result.crests) || "-"]),
      ]),
    );
    console.log("");
  }
  console.log(`Plan: ${plan.crests} / ${plan.maxCrests} crests${plan.exhausted ? " (search budget hit: best found)" : ""} · * = past Riley's ~100 s run, extrapolated`);
  const teams = new Map(check.candidates.map((c) => [c.id, c]));
  const resultOf = (stageId: string, teamId: string) => check.results.find((x) => x.floorId === stageId && x.teamId === teamId);
  console.log(
    table([
      ["  Stage", "Vigor", "Team", "Kill", "Crests"],
      ...plan.assignments.map((a) => {
        const team = a.option ? teams.get(a.option.id) : undefined;
        const kill = a.option ? `${clockText(a.option.seconds)}${resultOf(a.stageId, a.option.id)?.extrapolated ? " *" : ""}` : a.timed ? "—" : "spare";
        return [`  ${floorLabel(a.stageId)}`, String(a.cost), (team?.names ?? a.members).join(" · ") || "—", kill, "★".repeat(a.crests) || "-"];
      }),
    ]),
  );
}
