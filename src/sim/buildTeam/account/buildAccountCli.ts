// Wuthering Tools+ — `npm run cli -- build-account [--teams …]`: "Whole account" headless on an export (read-only — it
// prints the plan and the result, it never writes a file). Node-only (the CLI imports it lazily): Riley's engine through
// rileyHeadless for each team's plan, the optimizer through the inline backend (one thread; the page uses the
// optimizer's workers and is faster).
import type { ExportFile } from "../../cli/exportFile";
import { resolveCharacterKey } from "../../cli/engine";
import { int, pct, table } from "../../cli/format";
import { rileyHeadless } from "../../engine/rileyNode";
import { characterDisplayName } from "../../display/names";
import { currentEchoesOf, memberAfter } from "../buildTeam";
import { DEFAULT_OPTIONS, type BuildOptions } from "../constraints";
import { inlineBackend } from "../headlessOptimizer";
import { plansForTeam, type RileySource } from "../plans";
import { priorityOrder } from "../rileyPlan";
import { accountApplyRequest } from "./accountApply";
import { accountTeamChoices, defaultSelection, defaultWeight, type AccountTeamChoice } from "./accountTeams";
import { buildCountText } from "./accountView";
import { buildAccount, type AccountTeamInput, type BuildAccountResult } from "./buildAccount";

export interface BuildAccountCliOptions extends Partial<Pick<BuildOptions, "useSets" | "useMainStats" | "keepMainEcho">> {
  /** comma-separated: a row number of `--list`, a team name, or three names joined by "+" */
  teams?: string;
  /** comma-separated weights in the teams' order ("1,0.8,0.6") */
  weights?: string;
  /** the local search's budget in seconds (default 60) */
  budget?: number;
  autoBuffs?: boolean;
  /** only list the teams the account can field */
  list?: boolean;
  /** progress lines on stderr */
  log?: (line: string) => void;
}

export interface BuildAccountCliOut {
  choices: AccountTeamChoice[];
  selected: AccountTeamChoice[];
  weights: number[];
  plansMs: number;
  result: BuildAccountResult | null;
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** One `--teams` token → a row: its number in the list, a team name (exact, then partial), or "A+B+C". */
export function choiceFromArg(exp: ExportFile, choices: readonly AccountTeamChoice[], token: string): AccountTeamChoice {
  const n = Number(token);
  if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1]!;
  if (token.includes("+")) {
    const ids = token.split("+").map((s) => resolveCharacterKey(s.trim(), exp.characters));
    const hit = choices.find((c) => ids.length === c.characterIds.length && ids.every((id) => c.characterIds.includes(id)));
    if (hit) return hit;
    throw new Error(`No fieldable team of ${ids.map(characterDisplayName).join(" + ")} (it needs a saved or preset team rotation, every member with a weapon)`);
  }
  const exact = choices.filter((c) => norm(c.name) === norm(token) || c.id === token);
  if (exact.length) return exact[0]!;
  const partial = choices.filter((c) => norm(c.name).includes(norm(token)));
  if (partial.length === 1) return partial[0]!;
  if (partial.length > 1) throw new Error(`Ambiguous team "${token}": ${partial.slice(0, 6).map((c) => c.name).join(" | ")}`);
  throw new Error(`No fieldable team "${token}" (\`build-account --list\` lists them)`);
}

export async function runBuildAccount(exp: ExportFile, opts: BuildAccountCliOptions = {}): Promise<BuildAccountCliOut> {
  const log = opts.log ?? (() => undefined);
  const choices = await accountTeamChoices(exp.characters, exp.inventory.echoes, exp.teams ?? [], { autoTeamBuffs: opts.autoBuffs ?? true, yieldToUi: false });
  const selected = opts.teams
    ? opts.teams.split(",").map((s) => s.trim()).filter(Boolean).map((token) => choiceFromArg(exp, choices, token))
    : defaultSelection(choices).map((id) => choices.find((c) => c.id === id)!);
  const weightArgs = (opts.weights ?? "").split(",").map((s) => s.trim()).filter(Boolean).map(Number).filter((x) => Number.isFinite(x) && x >= 0);
  const weights = selected.map((_, i) => weightArgs[i] ?? defaultWeight(i));
  if (opts.list) return { choices, selected, weights, plansMs: 0, result: null };

  const riley = await rileyHeadless(exp);
  const source: RileySource = {
    teamKeysFor: async (ids) => riley.teamKeysFor(ids),
    solveMine: async (keys, subs) => riley.solveMine(keys, { subs: subs ?? "mine" }),
    tracedRun: async (key, picks) => riley.tracedRun(key, picks),
  };
  const t0 = Date.now();
  const teams: AccountTeamInput[] = [];
  for (let i = 0; i < selected.length; i++) {
    const c = selected[i]!;
    log(`plan ${i + 1}/${selected.length}: ${c.name}`);
    const plans = await plansForTeam(c.spec.characterIds, source, { currentEchoes: (id) => currentEchoesOf(id, exp.characters, exp.inventory.echoes) });
    teams.push({ spec: c.spec, weight: weights[i]!, plans: plans.plans, memberOrder: priorityOrder(plans.plans.map((p) => p ?? { share: null, mainDps: false })), choiceId: c.id });
  }
  const plansMs = Date.now() - t0;
  const options: BuildOptions = { ...DEFAULT_OPTIONS, ...Object.fromEntries(Object.entries({ useSets: opts.useSets, useMainStats: opts.useMainStats, keepMainEcho: opts.keepMainEcho }).filter(([, v]) => v !== undefined)) };
  let last = "";
  const result = await buildAccount(
    { characters: exp.characters, inventory: { echoes: exp.inventory.echoes, equipped: exp.inventory.equipped }, teams, options, autoTeamBuffs: opts.autoBuffs ?? true, budgetMs: (opts.budget ?? 60) * 1000 },
    inlineBackend(),
    {
      onStage: (s) => {
        const line = s.stage === "improve" ? `improve: round ${(s.round ?? 0) + 1}, ${s.accepted ?? 0} move(s) kept` : s.stage;
        if (line !== last) log((last = line));
      },
    },
  );
  return { choices, selected, weights, plansMs, result };
}

const STOPPED: Record<BuildAccountResult["search"]["stoppedBy"], string> = {
  converged: "nothing left to improve",
  budget: "the time budget ran out",
  stopped: "stopped by hand",
  rounds: "the round limit",
};

export function printBuildAccount(out: BuildAccountCliOut): string {
  const lines: string[] = [];
  if (!out.result) {
    const picked = new Set(out.selected.map((c) => c.id));
    const rows = [["#", "Team", "Source", "Members", "Team damage", "Default"]];
    out.choices.forEach((c, i) => rows.push([String(i + 1), c.name, c.source, c.characterIds.map(characterDisplayName).join(" + "), int(c.avgDamage), picked.has(c.id) ? `yes (${out.selected.findIndex((s) => s.id === c.id) + 1})` : ""]));
    lines.push(`${out.choices.length} fieldable teams (average damage per rotation, enemy level 100, 20 % RES)`);
    lines.push(table(rows));
    return lines.join("\n");
  }
  const r = out.result;
  const gain = (x: number): string => pct((x / Math.max(1e-9, r.score.today) - 1) * 100);
  lines.push(`Whole account: ${r.teams.length} teams, ${buildCountText(r.members, accountApplyRequest(r, false).members.length)}, ${r.moves.length} echo(es) change hands · ${(r.ms / 1000).toFixed(1)} s (+ ${(out.plansMs / 1000).toFixed(1)} s for wuwa_calc's plans)`);
  lines.push(`Weighted team damage vs today: greedy alone ${gain(r.score.greedy)}, after the local search ${gain(r.score.final)} (the calculator, Σ weight × team damage ÷ today's)`);
  lines.push(`Local search: ${r.search.moves.length} move(s) kept, ${r.search.conflicts} competing pair(s), ${r.search.rounds} round(s), ${(r.search.ms / 1000).toFixed(1)} s, ended: ${STOPPED[r.search.stoppedBy]}; optimizer score ${pct((r.search.value / Math.max(1e-9, r.search.greedy) - 1) * 100, 2)} over the greedy${r.search.kept === "greedy" ? " — the calculator's team totals scored the greedy higher, so the plan is the greedy's" : ""}`);
  lines.push("");
  const teamRows = [["#", "Team", "Weight", "Today", "Plan", "Δ", "Greedy alone"]];
  for (const t of r.teams) teamRows.push([String(t.index + 1), t.spec.name, String(t.weight), int(t.before), int(t.after), pct((t.after / Math.max(1, t.before) - 1) * 100), t.greedyAfter != null ? pct((t.greedyAfter / Math.max(1, t.before) - 1) * 100) : "same"]);
  lines.push(table(teamRows));
  lines.push("");
  const rows = [["Member", "Scored in", "Before", "After", "Δ", "ER after", "Need", "Echoes (source)"]];
  for (const m of r.members) {
    const before = m.before?.value ?? 0;
    const after = memberAfter(m) ?? 0;
    rows.push([
      characterDisplayName(m.characterId) + (m.alsoIn.length ? ` (+ team ${m.alsoIn.map((i) => i + 1).join(", ")})` : ""),
      `team ${m.team + 1}`,
      m.before ? int(before) : "—",
      m.after ? `${int(after)}${m.sameEchoes ? " (kept)" : m.relaxed && m.relaxed !== "plan" ? ` (any ${m.relaxed === "layout" ? "layout" : "main stat"})` : ""}` : m.message ?? m.status,
      m.after && before > 0 ? pct((after / before - 1) * 100) : "",
      m.after?.menuEr != null ? `${m.after.menuEr.toFixed(1)}%${m.erMet === false ? " SHORT" : ""}` : "—",
      m.erFloor != null ? `${m.erFloor.toFixed(1)}%` : "—",
      m.after ? m.after.picks.map((p) => `${p.echo.echo}[${p.source}]`).join(" ") : "",
    ]);
  }
  lines.push(table(rows));
  if (r.moves.length) {
    lines.push("");
    lines.push("Echoes that change hands:");
    for (const mv of r.moves) lines.push(`  ${mv.echo} (${mv.cost}-cost ${mv.stat ?? ""}, ${mv.set ?? "no set"}): ${mv.from.map(characterDisplayName).join(", ")} → ${characterDisplayName(mv.to)}`);
  }
  return lines.join("\n");
}

/** The JSON the CLI prints without --pretty (drafts and echo objects slimmed). */
export function jsonOf(out: BuildAccountCliOut): unknown {
  return {
    choices: out.choices.map((c) => ({ id: c.id, name: c.name, source: c.source, characterIds: c.characterIds, avgDamage: c.avgDamage, dps: c.dps })),
    selected: out.selected.map((c) => c.id),
    weights: out.weights,
    plansMs: out.plansMs,
    result: out.result
      ? {
          ...out.result,
          teams: out.result.teams.map((t) => ({ ...t, spec: { id: t.spec.id, name: t.spec.name, characterIds: t.spec.characterIds } })),
          members: out.result.members.map((m) => ({ ...m, draft: undefined, after: m.after ? { ...m.after, picks: m.after.picks.map((p) => ({ echoId: p.echo.echoId, echo: p.echo.echo, set: p.echo.echoSet, cost: p.echo.type, main: p.echo.stat, source: p.source, wornBy: p.wornBy, sharedWith: p.sharedWith })) } : null })),
        }
      : null,
  };
}
