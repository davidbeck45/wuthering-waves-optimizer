// Wuthering Tools+ CLI — `levels <character>`: "What each level is worth" headless, on an export. The same plan the
// /account drawer shows (levelPlan.ts on the roster ranking's best rotation and the strongest fieldable team), as JSON
// or as two tables.
import { findTeam, resolveCharacterKey } from "../cli/engine";
import type { ExportFile } from "../cli/exportShape";
import { table } from "../cli/format";
import { count } from "../materials/costToMax";
import { loadMaterials } from "../materials/materialsData";
import { rankRoster } from "../myRankings/rankRoster";
import { levelPlan } from "./levelPlan";
import { parseLevels } from "./levelSteps";
import { assumedWords, BASIS_WORDS, inertText, type LevelPlan, type LevelRow } from "./levelWorth";
import { basisLine, costText, everythingText, flatNote, gateLine, gateText, headlineText, inertLine, materialsText, NOT_MODELLED, orderBlindText, pathHow, smallTeamLine } from "./levelsView";

export interface LevelsCliOptions {
  /** "saved" (default) or "1" / "scratch": level 1 across the board */
  from?: string;
  /** starting levels by hand: "level=80,weapon=80,basic=6,skill=6,forte=8,liberation=6,intro=1" */
  at?: string;
  /** a saved team (name, id or 1-based index) to measure on, instead of the strongest one the character can field */
  team?: string;
  /** how the path picks a step: "value" (default, the most gain per Shell Credit) or "gain" */
  by?: string;
  autoBuffs?: boolean;
}

export async function levelsReport(exp: ExportFile, character: string, options: LevelsCliOptions = {}): Promise<LevelPlan> {
  const id = resolveCharacterKey(character, exp.characters);
  if (options.from && !["saved", "1", "scratch"].includes(options.from)) throw new Error('--from must be "saved" or "1"');
  if (options.by && !["value", "gain"].includes(options.by)) throw new Error('--by must be "value" or "gain"');
  const from = options.at ? parseLevels(options.at, "--at") : options.from === "1" || options.from === "scratch" ? "scratch" : "saved";
  const auto = options.autoBuffs ?? true;
  const teamId = options.team ? String(findTeam(options.team, exp.teams).id) : undefined;
  const materials = await loadMaterials();
  const ranking = await rankRoster(exp.characters, exp.inventory.echoes, exp.teams, { autoTeamBuffs: auto, yieldToUi: false });
  return levelPlan(
    { characterId: id, characters: exp.characters, inventoryEchoes: exp.inventory.echoes, teams: exp.teams, rank: ranking.characters.find((c) => c.id === id) ?? null, rankingTeams: ranking.teams, materials },
    { from, teamId, autoTeamBuffs: auto, pathOrder: options.by === "gain" ? "gain" : "value", yieldToUi: false },
  );
}

const signed = (g: number | null | undefined): string => (g == null ? "-" : `${g >= 0 ? "+" : ""}${(g * 100).toFixed(2)}%`);

function gainCells(row: Pick<LevelRow, "own" | "team" | "healing" | "shield" | "inert">, plan: LevelPlan): string[] {
  const support = plan.base && (plan.base.healing > 0 || plan.base.shield > 0);
  return [signed(row.team?.gain), signed(row.own?.gain), ...(support ? [signed(row.healing?.gain ?? row.shield?.gain)] : [])];
}

export function printLevels(plan: LevelPlan): string {
  const out: string[] = [];
  const start = plan.from === "scratch" ? "from level 1" : plan.from === "custom" ? "from the levels given" : "from the saved levels";
  out.push(`${plan.name}: what each level is worth, ${start}`);
  if (!plan.today) return `${out[0]}\nThe cost table (version ${plan.table.gameVersion}) has no entry for ${plan.name} yet.`;
  out.push(`Start: ${plan.startText}`);
  const assumed = plan.from === "saved" ? assumedWords(plan.today) : "";
  if (assumed) out.push(`Not saved in the calculator, so counted at the top: ${assumed}. --from 1 counts a new copy; --at level=80,liberation=6 starts where you say.`);
  if (plan.done) return [...out, "Nothing left to level."].join("\n");
  if (plan.noGain) out.push(`No damage figures: ${plan.noGain}. Costs only.`);
  else out.push(basisLine(plan, { name: plan.name, rotation: plan.rotation?.name ?? null, team: plan.team?.name ?? null }));
  if (plan.buildNote) out.push(`Team figures: ${plan.buildNote}`);
  const small = smallTeamLine(plan, plan.name);
  if (small) out.push(small);

  const support = plan.base && (plan.base.healing > 0 || plan.base.shield > 0);
  const gainHead = plan.noGain ? [] : ["Team", "Own", ...(support ? [plan.base!.healing > 0 ? "Healing" : "Shield"] : [])];
  out.push("", `Each on its own, to its top${plan.noGain ? "" : ` (biggest gain in ${BASIS_WORDS[plan.basis]} first)`}`);
  out.push(
    table([
      ["  Step", ...gainHead, "Cost", "Materials", "Note"],
      ...plan.rows.map((r) => [
        `  ${r.label}`,
        ...(plan.noGain ? [] : gainCells(r, plan)),
        costText(r.cost),
        materialsText(r.cost) || "-",
        r.inert ? inertText(r, null) : plan.team && !r.team && r.teamNote ? `no team figure: ${r.teamNote}` : "",
      ]),
    ]),
  );
  const all = everythingText(plan);
  if (all) out.push(`  All of it together: ${all}`);

  if (plan.path.length) {
    out.push("", `Level in this order. ${pathHow(plan)}`);
    out.push(
      table([
        ["  #", "Step", "Team", "Own", "Shell Credits", ...(gateLine(plan) ? ["Also takes"] : []), "So far: team", "own", "Shell Credits"],
        ...plan.path.map((s) => [
          `  ${s.index}`,
          s.label,
          signed(s.team?.gain),
          signed(s.own?.gain),
          count(s.cost.credits),
          ...(gateLine(plan) ? [gateText(s, plan.gate) ?? ""] : []),
          signed(s.running.teamGain),
          signed(s.running.gain),
          count(s.running.cost.credits),
        ]),
      ]),
    );
    for (const s of plan.path) {
      const note = flatNote(s);
      if (note) out.push(`  ${s.label}: ${note}`);
    }
    const head = headlineText(plan);
    if (head) out.push(`  ${head}`);
    const gate = gateLine(plan);
    if (gate) out.push(`  ${gate}`);
    out.push(`  ${orderBlindText(plan.basis)}`);
    if (plan.pathState !== "complete") out.push(`  (the order is ${plan.pathState})`);
  }
  const left = inertLine(plan, plan.rotation?.name ?? null);
  if (left) out.push(`  Left out of the order: ${left}.`);
  if (plan.today.weaponMissing) out.push(`The cost table (version ${plan.table.gameVersion}) has no entry for the equipped weapon yet, so its level is left out.`);
  else if (!plan.today.weaponKey) out.push("No weapon equipped, so there is no weapon level here.");
  out.push("", `${NOT_MODELLED} Costs from the game's own upgrade tables, version ${plan.table.gameVersion} (read ${plan.table.fetched}).`);
  if (plan.errors.length) out.push(`Errors: ${plan.errors.join("; ")}`);
  return out.join("\n");
}

/** The plan as JSON a script can read: figures and costs, without the engine's working states. */
export function levelsJson(plan: LevelPlan): Record<string, unknown> {
  const cost = (c: LevelRow["cost"]) => ({ shellCredits: c.credits, expItems: c.expItems.map((m) => ({ name: m.name, count: m.count })), ascensions: c.ascensions, materials: c.materials.map((m) => ({ name: m.name, count: m.count })) });
  const worth = (r: Pick<LevelRow, "own" | "team" | "healing" | "shield">) => ({
    ownGain: r.own?.gain ?? null,
    teamGain: r.team?.gain ?? null,
    ...(r.healing ? { healingGain: r.healing.gain } : {}),
    ...(r.shield ? { shieldGain: r.shield.gain } : {}),
  });
  return {
    character: plan.name,
    characterId: plan.characterId,
    from: plan.from,
    start: plan.startText,
    assumed: plan.today ? plan.today.assumed : [],
    done: plan.done,
    rotation: plan.rotation,
    team: plan.team,
    noGain: plan.noGain,
    teamNote: plan.teamNote,
    buildNote: plan.buildNote,
    basis: plan.basis,
    base: plan.base,
    rows: plan.rows.map((r) => ({ step: r.label, track: r.track, ...worth(r), inert: r.inert, ...(plan.team && !r.team && r.teamNote ? { teamNote: r.teamNote } : {}), cost: cost(r.cost) })),
    everything: plan.everything ? { ...worth(plan.everything), cost: cost(plan.everything.cost) } : null,
    pathOrder: plan.pathOrder,
    pathState: plan.pathState,
    ...(gateLine(plan) ? { pathNote: gateLine(plan) } : {}),
    path: plan.path.map((s) => ({ index: s.index, step: s.label, track: s.track, ...worth(s), ...(flatNote(s) ? { note: flatNote(s) } : {}), shellCredits: s.cost.credits, ...(gateText(s, plan.gate) ? { alsoTakes: gateText(s, plan.gate) } : {}), soFar: { ownGain: s.running.gain, teamGain: s.running.teamGain, ...(s.running.healingGain != null ? { healingGain: s.running.healingGain } : {}), shellCredits: s.running.cost.credits } })),
    leftOut: plan.inert.map((r) => r.label),
    notModelled: NOT_MODELLED,
    table: plan.table,
    errors: plan.errors,
  };
}
