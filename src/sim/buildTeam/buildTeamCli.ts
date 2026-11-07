// Wuthering Tools+ — `npm run cli -- build-team <team>`: "Build it for me" headless on an export (read-only — it
// prints the plan and the result, it never writes a file). <team> is a saved team (name, id, 1-based index) or three
// names ("Shorekeeper,Lynae,Iuno"). Node-only (the CLI imports it lazily): Riley's engine through rileyHeadless, the
// optimizer through the inline backend.
import type { ExportFile } from "../cli/exportFile";
import { findTeam, resolveCharacterKey } from "../cli/engine";
import { int, pct, table } from "../cli/format";
import { rileyHeadless } from "../engine/rileyNode";
import { characterDisplayName } from "../display/names";
import { showNeed } from "../energy/energyNeed";
import { buildMyTeam, currentEchoesOf, memberAfter, teamFigureOf, type BuildTeamResult, type TeamFigure, type TeamSpec } from "./buildTeam";
import { defaultSaveSlots } from "./buildTeamView";
import { DEFAULT_OPTIONS, type BuildOptions } from "./constraints";
import { inlineBackend } from "./headlessOptimizer";
import { plansForTeam, type RileySource, type TeamPlans } from "./plans";
import { priorityOrder } from "./rileyPlan";

export interface BuildTeamCliOptions extends Partial<BuildOptions> {
  /** "Aemeath=0,Mornye=260" style ER floor overrides (%), "none" for no floor */
  er?: string;
  /** priority: comma-separated names, first served first */
  order?: string;
  /** re-gear only this member: the others get no plan and keep their echoes (/account's echo check, /build-team `?only=`) */
  only?: string;
  autoBuffs?: boolean;
}

/** What the page's Save writes as it opens: its ticks, and the team with those builds worn (null without a team total). */
export interface DefaultSave {
  ticks: boolean[];
  figure: TeamFigure | null;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function teamFromArg(exp: ExportFile, arg: string): TeamSpec {
  if (/[,+]/.test(arg)) {
    const ids = arg.split(/[,+]/).map((s) => s.trim()).filter(Boolean).map((name) => resolveCharacterKey(name, exp.characters));
    return { id: null, name: ids.map((id) => characterDisplayName(id)).join(" + "), characterIds: ids };
  }
  const t = findTeam(arg, exp.teams);
  return { id: t.id ?? null, name: t.name, characterIds: t.characterIds ?? [], buildIds: t.buildIds, actions: t.actions ?? [], duration: t.duration ?? null, enemyConfig: t.enemyConfig ?? null, handoffs: t.handoffs ?? null };
}

export async function runBuildTeam(exp: ExportFile, arg: string, opts: BuildTeamCliOptions = {}): Promise<{ team: TeamSpec; plans: TeamPlans; result: BuildTeamResult; defaultSave: DefaultSave }> {
  const team = teamFromArg(exp, arg);
  const riley = await rileyHeadless(exp);
  const source: RileySource = {
    teamKeysFor: async (ids) => riley.teamKeysFor(ids),
    solveMine: async (keys, subs) => riley.solveMine(keys, { subs: subs ?? "mine" }),
    tracedRun: async (key, picks) => riley.tracedRun(key, picks),
  };
  const plans = await plansForTeam(team.characterIds, source, { currentEchoes: (id) => currentEchoesOf(id, exp.characters, exp.inventory.echoes) });
  const onlySlot = opts.only ? team.characterIds.findIndex((id) => id && (norm(id) === norm(opts.only!) || norm(characterDisplayName(id)) === norm(opts.only!))) : -1;
  if (opts.only && onlySlot < 0) throw new Error(`--only ${opts.only}: not a member of ${team.name}`);
  const options: BuildOptions = { ...DEFAULT_OPTIONS, ...Object.fromEntries(Object.entries(opts).filter(([k, v]) => k in DEFAULT_OPTIONS && v !== undefined)) } as BuildOptions;
  // the page's floors: each member's need rounded up to one decimal, as the game prints ER (useBuildTeam); the same
  // rule here, so `build-team` and /build-team build against, and print, the same "need 115.2 %"
  const erFloors: Array<number | null | undefined> = team.characterIds.map((_, i) => {
    const need = plans.plans[i]?.erNeed;
    return need == null ? undefined : showNeed(need);
  });
  for (const part of (opts.er ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [name, value] = part.split("=");
    const slot = team.characterIds.findIndex((id) => id && (norm(id) === norm(name ?? "") || norm(characterDisplayName(id)) === norm(name ?? "")));
    if (slot >= 0) erFloors[slot] = value === "none" ? null : Number(value);
  }
  let order = priorityOrder(plans.plans.map((p) => p ?? { share: null, mainDps: false }));
  if (opts.order) {
    const wanted = opts.order.split(",").map((s) => s.trim());
    order = wanted.map((name) => team.characterIds.findIndex((id) => id && (norm(id) === norm(name) || norm(characterDisplayName(id)) === norm(name)))).filter((i) => i >= 0);
  }
  // --only: one member planned, the rest skipped (they keep what they wear, and it stays out of the search)
  const runPlans = onlySlot >= 0 ? plans.plans.map((p, i) => (i === onlySlot ? p : undefined)) : plans.plans;
  if (onlySlot >= 0) order = [onlySlot];
  const result = await buildMyTeam(
    { characters: exp.characters, inventory: { echoes: exp.inventory.echoes, equipped: exp.inventory.equipped }, team, plans: runPlans as typeof plans.plans, order, options, erFloors, autoTeamBuffs: opts.autoBuffs ?? true },
    inlineBackend(),
  );
  const ticks = defaultSaveSlots(result.members);
  return { team, plans, result, defaultSave: { ticks, figure: await teamFigureOf(result, team, exp.characters, exp.inventory.echoes, ticks) } };
}

export function printBuildTeam(out: { team: TeamSpec; plans: TeamPlans; result: BuildTeamResult; defaultSave: DefaultSave }): string {
  const { team, plans, result, defaultSave } = out;
  const lines: string[] = [];
  lines.push(`${team.name}${team.id ? "" : " (not a saved team)"}`);
  lines.push(plans.riley ? `wuwa_calc ${plans.riley.teamKey} at your account: ${int(plans.dpsMine ?? 0)} DPS${plans.dpsHigh ? ` · High Invest ${int(plans.dpsHigh)} DPS` : ""}` : plans.rileyNote ?? "");
  lines.push(`Objective: ${result.objectiveKind === "team" ? "the team's own rotation" : "each member's best rotation"} · priority ${result.order.map((s) => characterDisplayName(team.characterIds[s] ?? "")).join(" > ")} · ${result.ordersTried} order(s) tried · ${result.swaps.length} swap(s) · ${(result.ms / 1000).toFixed(1)} s`);
  lines.push("");
  const rows: string[][] = [["Member", "Plan", "Before", "After", "Δ", "ER now", "ER after", "Need", "Echoes (source)"]];
  for (const m of result.members) {
    const plan = plans.plans[m.slot];
    const before = m.before?.value ?? 0;
    const after = memberAfter(m) ?? 0;
    rows.push([
      characterDisplayName(m.characterId),
      plan ? `${plan.source}: ${plan.setsLabel || "any set"} · ${plan.mainStats?.label ?? "any layout"}` : "",
      m.before ? int(before) : "—",
      m.after ? `${int(after)}${m.keptCurrent ? " (kept)" : m.relaxed && m.relaxed !== "plan" ? ` (any ${m.relaxed === "layout" ? "layout" : "main stat"})` : ""}` : m.message ?? m.status,
      m.after && before > 0 ? pct((after / before - 1) * 100) : "",
      m.before?.menuEr != null ? `${m.before.menuEr.toFixed(1)}%` : "—",
      m.after?.menuEr != null ? `${m.after.menuEr.toFixed(1)}%${m.erMet === false ? " SHORT" : ""}` : "—",
      m.erFloor != null ? `${m.erFloor.toFixed(1)}%` : "—",
      m.after ? m.after.picks.map((p) => `${p.echo.echo}[${p.source}]`).join(" ") : (m.shortfall ?? []).map((s) => `${s.cost}-cost ${s.stats.join("/") || "any"}: ${s.have}/${s.need}`).join(", "),
    ]);
  }
  lines.push(table(rows));
  for (const m of result.members) if (m.message && m.after) lines.push(`${characterDisplayName(m.characterId)}: ${m.message}`);
  if (result.team) {
    const line = (after: number): string => `${int(result.team!.before)} → ${int(after)} (${pct((after / Math.max(1, result.team!.before) - 1) * 100)}) avg damage per rotation`;
    const built = result.members.filter((m) => m.draft);
    const saved = built.filter((m) => defaultSave.ticks[m.slot]).length;
    lines.push(`\nTeam rotation: ${line(result.team.after)}`);
    if (defaultSave.figure && saved !== built.length) lines.push(`As the page's Save opens (${saved} of ${built.length} builds): ${line(defaultSave.figure.after)}`);
  }
  return lines.join("\n");
}
