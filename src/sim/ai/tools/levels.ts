// Wuthering Tools+ AI tools — "What each level is worth" for the assistant (src/sim/levels/): which level-up to do
// first on one character, from the engine. It is a mode of `weapon_value` (show = "levels"), not a tool of its own:
// the registry is at the 20 strict tools a request may carry.
import { count } from "../../materials/costToMax";
import { loadMaterials } from "../../materials/materialsData";
import { levelPlan } from "../../levels/levelPlan";
import { parseLevels } from "../../levels/levelSteps";
import { assumedWords, BASIS_WORDS, inertText, type LevelRow } from "../../levels/levelWorth";
import { headlineText, NOT_MODELLED, ORDER_BLIND, pathHow, smallTeamLine } from "../../levels/levelsView";
import { enemyLabel } from "./character";
import { rankingFor } from "./memo";
import { characterName, compactJson, pct, type ToolContext } from "./shared";

/** how many steps of the order go to the model (the rest are counted) */
const PATH_STEPS = 12;

const costOf = (c: LevelRow["cost"]): Record<string, unknown> => ({
  shellCredits: c.credits,
  ...(c.expItems.length ? { expItems: c.expItems.map((m) => `${count(m.count)} × ${m.name}`).join(", ") } : {}),
  ...(c.ascensions ? { ascensions: c.ascensions } : {}),
  ...(c.materials.length ? { materials: c.materials.map((m) => `${count(m.count)} × ${m.name}`).join(", ") } : {}),
});

const gainsOf = (r: Pick<LevelRow, "own" | "team" | "healing" | "shield">): Record<string, unknown> => ({
  ...(r.team ? { teamGainPct: pct(r.team.gain) } : {}),
  ...(r.own ? { ownGainPct: pct(r.own.gain) } : {}),
  ...(r.healing ? { healingGainPct: pct(r.healing.gain) } : {}),
  ...(r.shield ? { shieldGainPct: pct(r.shield.gain) } : {}),
});

/** `levels`: null = the calculator's saved levels, "1" = a new copy, else "level=80,weapon=80,basic=6,…". */
export async function levelsAnswer(id: string, levels: string | null | undefined, ctx: ToolContext): Promise<string> {
  const auto = ctx.autoBuffs ?? true;
  const text = (levels ?? "").trim();
  const from = !text ? "saved" : /^(1|level 1|scratch|new)$/i.test(text) ? "scratch" : parseLevels(text);
  const [materials, ranking] = await Promise.all([loadMaterials(), rankingFor(ctx.exp, auto)]);
  const plan = await levelPlan(
    { characterId: id, characters: ctx.exp.characters, inventoryEchoes: ctx.exp.inventory.echoes, teams: ctx.exp.teams, rank: ranking.characters.find((c) => c.id === id) ?? null, rankingTeams: ranking.teams, materials },
    { from, autoTeamBuffs: auto, yieldToUi: false },
  );
  const name = characterName(id);
  const link = { path: `/account?focus=${encodeURIComponent(id)}&section=levels`, label: "What each level is worth" };
  if (!plan.today) return compactJson({ character: name, error: `The cost table (version ${plan.table.gameVersion}) has no entry for ${name} yet`, ...link });
  const notSaved = plan.from === "saved" ? assumedWords(plan.today) : "";
  const head = {
    character: name,
    question: "what each level-up left is worth, and what it costs",
    countedFrom: plan.from === "saved" ? "the levels saved in the calculator" : plan.from === "scratch" ? "level 1 (a new copy with a level-1 weapon)" : "the levels given",
    start: plan.startText,
    ...(notSaved ? { notSavedInTheCalculator: `${notSaved}: the calculator counts these at the top. Ask the player where ${name} stands in game and pass \`levels\`, or pass levels "1" for a new copy.` } : {}),
  };
  if (plan.done) return compactJson({ ...head, nothingLeftToLevel: true, ...link });
  const small = smallTeamLine(plan, name);
  const row = (r: LevelRow): Record<string, unknown> => ({
    step: r.label,
    ...(r.inert ? { note: inertText(r, plan.rotation?.name ?? null) } : gainsOf(r)),
    ...(plan.team && !r.team && r.teamNote && !r.inert ? { noTeamFigure: r.teamNote } : {}),
    ...costOf(r.cost),
  });
  const steps = plan.path.slice(0, PATH_STEPS);
  return compactJson({
    ...head,
    enemy: enemyLabel(ranking.enemy),
    ...(plan.noGain ? { noDamageFigures: `${plan.noGain}; costs only` } : { rotation: plan.rotation?.name ?? null, measuredOnTeam: plan.team ? plan.team.name : plan.teamNote, orderedBy: BASIS_WORDS[plan.basis] }),
    eachOnItsOwn: plan.rows.map(row),
    ...(plan.everything ? { allTogether: { ...gainsOf(plan.everything), ...costOf(plan.everything.cost) } } : {}),
    ...(plan.path.length
      ? {
          levelInThisOrder: {
            how: pathHow(plan),
            headline: headlineText(plan),
            steps: steps.map((s) => ({
              n: s.index,
              step: s.label,
              ...gainsOf(s),
              shellCredits: s.cost.credits,
              soFar: { ...(s.running.teamGain != null ? { teamGainPct: pct(s.running.teamGain) } : {}), ...(s.running.gain != null ? { ownGainPct: pct(s.running.gain) } : {}), shellCredits: s.running.cost.credits },
            })),
            stepsOmitted: plan.path.length - steps.length,
          },
        }
      : {}),
    notes: [
      "Gains are % of average damage per rotation: own = the character's best rotation, team = the strongest team they can field. eachOnItsOwn takes one track to its top alone; level-ups multiply, so the order re-scores after every step.",
      plan.buildNote,
      small,
      NOT_MODELLED,
      plan.path.length ? ORDER_BLIND : null,
    ].filter(Boolean),
    ...link,
  });
}
