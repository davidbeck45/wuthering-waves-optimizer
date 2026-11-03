// Wuthering Tools+ AI tools — the /endgame page headless: this Tower of Adversity season's timed floors against the
// teams the account can field, fought by Riley31415's engine at the player's account (src/sim/endgame/toaRun.ts), the
// kill times and crests, and a Vigor-legal plan for all 12 stages. Reuses the page's stored check while it still fits
// the account (`wtplus:endgame:check`); a fresh one solves every fieldable team (~10 s on a large account).
import { appKeyOf } from "../../rankings/castMapper";
import { clockText, teamSignature } from "../../endgame/crests";
import { countdown, floorChips, floorLabel, guessRegion, loadSeason, offsetOf, seasonStatus, SERVER_REGIONS, timedFloors, toaIndex, type ServerRegionId, type ToaFloor, type ToaSeason } from "../../endgame/toaData";
import { checkKey, planInputOf, rankFloor, runToaCheck, type ToaCheck, type ToaRunner } from "../../endgame/toaRun";
import { planVigor } from "../../endgame/vigorPlan";
import { floorOdds } from "../../critLuck/floorOdds";
import { characterName, compactJson, defineTool, int, nullableString, type ToolContext, type ToolStorage } from "./shared";
import { rileyOf } from "./riley";

/** The page's own keys and breadth (useToa.ts), so a check either side computed serves the other. */
export const TOA_CHECK_KEY = "wtplus:endgame:check";
export const TOA_PREFS_KEY = "wtplus:endgame:prefs";
const CANDIDATES = 30;

function storedCheck(storage: ToolStorage | null | undefined): ToaCheck | null {
  try {
    const p = JSON.parse(storage?.getItem(TOA_CHECK_KEY) ?? "null");
    return p?.v === 1 && p.check?.key && Array.isArray(p.check.results) ? (p.check as ToaCheck) : null;
  } catch {
    return null;
  }
}

function regionOf(storage: ToolStorage | null | undefined, now: Date): ServerRegionId {
  try {
    const p = JSON.parse(storage?.getItem(TOA_PREFS_KEY) ?? "null");
    if (p?.v === 1 && SERVER_REGIONS.some((r) => r.id === p.region)) return p.region as ServerRegionId;
  } catch {
    /* the guess */
  }
  return guessRegion(-now.getTimezoneOffset());
}

/** "Hazard 4", "hazard-4", "4" (= Hazard 4), "Resonant 4" → the floor's id; null when it is not a timed floor. */
export function floorIdOf(text: string, season: ToaSeason): string | null {
  const t = text.trim().toLowerCase();
  const m = t.match(/^(?:(resonant|hazard|echoing)\s*(?:zone|tower)?\s*[-\s]?\s*)?(?:floor\s*)?(\d)$/);
  if (!m) return null;
  const id = `${m[1] ?? "hazard"}-${m[2]}`;
  return timedFloors(season).some((f) => f.id === id) ? id : null;
}

function floorView(check: ToaCheck, f: ToaFloor, top: number): Record<string, unknown> {
  // crit luck (src/sim/critLuck/): the share of runs that clear / earn each crest, each hit critting on its own
  const luckOf = (odds: Parameters<typeof floorOdds>[1]): Record<string, unknown> => {
    const o = floorOdds(f.goals, odds);
    return o ? { chanceToClear: o.clearText, chancePerCrest: Object.fromEntries(o.crests.map((c) => [`${c.crest} crest${c.crest > 1 ? "s" : ""}`, c.text])) } : {};
  };
  const ranked = rankFloor(check, f.id);
  const shown = ranked.slice(0, top);
  // the best saved team, only when it isn't already among those shown (then its row carries `saved`)
  const savedFirst = ranked.find((r) => r.team.saved);
  const savedBest = savedFirst && !shown.includes(savedFirst) ? savedFirst : null;
  const row = (r: (typeof ranked)[number]): Record<string, unknown> => ({
    team: r.team.appKeys.map(characterName).join(" · "),
    ...(r.team.saved ? { saved: r.team.saved } : {}),
    killTime: r.result.seconds == null ? "doesn't clear in 5:00" : clockText(r.result.seconds),
    ...(r.result.extrapolated ? { extrapolated: true } : {}),
    crests: r.result.crests,
    ...luckOf(r.result.odds),
    teamDps: int(r.team.dps),
    ...(r.result.error ? { error: r.result.error } : {}),
  });
  return {
    floor: floorLabel(f.id),
    vigorPerResonator: f.cost,
    enemyLevel: f.level,
    enemies: f.enemies.map((e) => (e.count > 1 ? `${e.name} ×${e.count}` : e.name)).join(", "),
    hp: f.hp,
    ...(f.hpType === "adjusted" ? { hpNote: "each group of identical enemies counted once (AoE assumed)" } : {}),
    crestGoalsSecondsLeft: f.goals,
    effects: floorChips(f).map((c) => `${c.label}${c.fidelity === "none" ? " (not modelled)" : c.fidelity === "approx" ? " (approximated)" : ""}`),
    best: shown.map(row),
    ...(savedBest ? { yourBestSavedTeam: row(savedBest) } : {}),
    teamsTimed: ranked.length,
  };
}

/** This season and the check for it: the page's stored one while its key still fits the account, else a new run. */
export async function seasonCheck(ctx: ToolContext, floor: string | null) {
  const now = ctx.now.getTime();
  const region = regionOf(ctx.storage, ctx.now);
  const status = seasonStatus(toaIndex, now, offsetOf(region));
  if (!status.entry) return null;
  const season = await loadSeason(status.entry);
  const wanted = floor ? floorIdOf(floor, season) : null;
  if (floor && !wanted) throw new Error(`"${floor}" is not a timed floor this season: ${timedFloors(season).map((f) => floorLabel(f.id)).join(", ")}`);
  const riley = await rileyOf(ctx);
  const account = riley.account;
  const savedTeams = (ctx.exp.teams ?? []).map((t: any) => ({ name: String(t.name ?? ""), characterIds: ((t.characterIds ?? []) as Array<string | null>).map((x) => (x ? String(x) : null)) }));
  const signatures = savedTeams.map((t) => t.characterIds.filter((x): x is string => !!x)).filter((ids) => ids.length === 3).map(teamSignature);
  const key = checkKey(riley.commit, account, season, [...new Set(signatures)], CANDIDATES);
  const stored = storedCheck(ctx.storage);
  if (stored?.key === key) return { season, status, region, check: stored, reused: true, account, wanted };
  const runner: ToaRunner = {
    commit: riley.commit,
    teams: () => riley.teams(),
    solveMine: (keys) => riley.solveMine(keys),
    curves: (teamKey, picks, profiles, o) => riley.curves(teamKey, picks, profiles, { spread: o?.spread }),
  };
  const check = await runToaCheck(runner, season, { account, savedTeams, limit: CANDIDATES });
  return { season, status, region, check, reused: false, account, wanted };
}

export const toaCheckTool = defineTool<{ floor?: string }>({
  name: "toa_check",
  description:
    "The /endgame page: this Tower of Adversity season's timed floors (Hazard Zone 1–4 and each side tower's 4th) against the " +
    "teams the player can field, fought by Riley31415's wuwa_calc engine at their own account — each floor's enemies, HP, " +
    "enemy level, effects (modelled or not), crest goals as seconds left on the 5:00 clock, and the best teams with kill time " +
    "and crests (0–3), the player's best saved team too — plus a Vigor-legal plan for all 12 stages (10 Vigor per resonator for " +
    "the whole zone). It is a sim with perfect execution: one target, no dodging, phases or invulnerable windows, waves summed " +
    "as one HP pool, kill times past wuwa_calc's ~100 s run extrapolated; real clears are slower (the page's Calibrate tab " +
    "scales by the player's own times). teamDps is wuwa_calc's DPS against his standard target. Reuses the page's last check " +
    "while the account is unchanged, else takes ~10 s. floor = null gives every timed floor (top 3 each) and the plan.",
  input_schema: {
    type: "object",
    properties: {
      floor: nullableString('One timed floor: "Hazard 4" (a bare number means the Hazard Zone), "Resonant 4", "Echoing 4". null = every timed floor and the Vigor plan.'),
    },
    required: ["floor"],
    additionalProperties: false,
  },
  provenance: "wuwa_calc engine at your account · ToA season floors (sim)",
  riley: true,
  reads: [TOA_CHECK_KEY, TOA_PREFS_KEY],
  async run(input, ctx: ToolContext) {
    const found = await seasonCheck(ctx, input.floor ?? null);
    if (!found) return compactJson({ season: null, why: "no Tower of Adversity season has started in this build's data", path: "/endgame", label: "ToA clear check" });
    const { season, status, region, check, reused, account, wanted } = found;
    const now = ctx.now.getTime();
    const result = check;
    const header = {
      season: season.season,
      ...(status.current ? { endsIn: countdown(status.endsAt!, now), serverClock: region } : { ended: `season ${season.season} ended; season ${status.next}'s data is not in this build yet` }),
      teamsSolved: result.scanned,
      teamsTimed: result.candidates.length,
      ...(reused ? { from: "the /endgame page's last check" } : {}),
    };
    const notes = [
      "Sim, perfect execution: real clears take longer; the /endgame Calibrate tab scales the times by your own logged clears.",
      "Crests: 3 when the kill leaves at least the first goal's seconds on the clock, and so on.",
      "chanceToClear / chancePerCrest (crit luck): the share of real runs that make it when each hit crits or not on its own; the kill time and crests are the average run's.",
    ];
    if (wanted) {
      const f = timedFloors(season).find((x) => x.id === wanted)!;
      return compactJson({ ...header, ...floorView(result, f, 5), notes, path: "/endgame", label: "ToA clear check" });
    }
    const owned = Object.entries(account?.entries ?? {}).filter(([, e]) => e.owned).map(([name]) => appKeyOf(name));
    const plan = planVigor(planInputOf(season, result, { owned }));
    const teams = new Map(result.candidates.map((c) => [c.id, c]));
    return compactJson({
      ...header,
      floors: timedFloors(season).map((f) => floorView(result, f, 3)),
      plan: {
        crests: `${plan.crests} of ${plan.maxCrests}`,
        ...(plan.exhausted ? { note: "the search hit its budget: the best plan found" } : {}),
        stages: plan.assignments.map((a) => ({
          stage: floorLabel(a.stageId),
          team: (a.option ? (teams.get(a.option.id)?.appKeys ?? a.members) : a.members).map(characterName).join(" · ") || null,
          ...(a.timed ? { killTime: a.option?.seconds == null ? null : clockText(a.option.seconds) } : { spare: true }),
          crests: a.crests,
        })),
      },
      notes: [...notes, "Vigor rules and the low side floors' crests (assumed 3) are the page's reading: check in game."],
      path: "/endgame",
      label: "ToA clear check",
    });
  },
});
