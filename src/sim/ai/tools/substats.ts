// Wuthering Tools+ AI tools — substat weights: what one more roll of each substat is worth on a build, and
// what each equipped echo's substats add (the re-roll order).
import { calcSubstatWeights } from "../../cli/engine";
import { SUBSTAT_ABBR } from "../../substats/substatWeights";
import { enemyLabel } from "./character";
import { characterName, compactJson, defineTool, echoName, int, investmentLabel, pct, resolveOwnCharacter, round, setName, statLabel } from "./shared";

const rollText = (value: number, flat: boolean): string => (flat ? String(Math.round(value)) : `${round(value, 1)}%`);

export const substatWeightsTool = defineTool<{ character: string; rotation?: string; team?: string }>({
  name: "substat_weights",
  description:
    "Substat weights for one set-up character: one more line of each of the 13 substats added to an equipped echo, scored with " +
    "the app's engine. Per substat: the expected roll (tiers weighted by how often they land) and its % gain, the median-tier and " +
    "best-tier gains, +1 tier (what an existing line gains going up one tier), and a weight (100 = the best substat to look for, " +
    "0 = moves nothing). Scored on the character's best rotation at Lv 100 / 20 % RES, or a named rotation, or a saved team " +
    "(their own damage drives the weights, the team total rides along). Also each equipped echo's substat worth — what its five " +
    "lines add over the same echo without them; the lowest is the one to re-roll or replace first. Diminishing returns are real " +
    "(crit near 100 % stops paying). Energy Regen reads 0 unless a buff scales with it — keep whatever ER the rotation needs.",
  input_schema: {
    type: "object",
    properties: {
      character: { type: "string", description: "Character name, loose." },
      rotation: { type: "string", description: "Score on this rotation (name, loose; see list_rotations) instead of the best-scoring one." },
      team: { type: "string", description: "Score on this saved team's rotation (name, id or 1-based index) instead." },
    },
    required: ["character"],
    additionalProperties: false,
  },
  provenance: "App engine · substat weights on your build",
  async run(input, ctx) {
    const id = resolveOwnCharacter(input.character, ctx.exp);
    const w = await calcSubstatWeights(id, ctx.exp, { rotation: input.rotation, team: input.team, echoes: true, autoBuffs: ctx.autoBuffs ?? true });
    const team = w.baselineTeam != null;
    const er = w.weights.find((s) => s.key === "EnergyRegen");
    return compactJson({
      character: characterName(id),
      investment: investmentLabel(w.sequence, w.weapon, w.refinement ?? 1),
      scoredOn:
        w.target.kind === "team"
          ? { team: w.target.name, members: w.target.members.map((m) => characterName(m)) }
          : { rotation: w.target.name, source: w.target.source === "yours" ? "your saved rotation" : w.target.source === "curated" ? "curated preset" : "wuwa_calc loop" },
      enemy: enemyLabel(w.enemy),
      baselineAvg: int(w.baseline),
      ...(team ? { baselineTeamAvg: int(w.baselineTeam) } : {}),
      weights: w.weights.map((s) => ({
        substat: s.label,
        weight: Math.round(s.weight * 100),
        expectedRoll: rollText(s.roll, s.flat),
        gainPct: pct(s.gain),
        medianGainPct: pct(s.medianGain),
        bestGainPct: pct(s.maxGain),
        plusOneTierGainPct: pct(s.stepGain, 3),
        ...(team ? { teamGainPct: pct(s.extraGain.team ?? 0) } : {}),
      })),
      lookFor: w.weights.filter((s) => s.weight >= 0.5).map((s) => s.label),
      equippedEchoes: (w.echoes ?? [])
        .slice()
        .sort((a, b) => a.worth - b.worth)
        .map((e) => ({
          slot: e.slot + 1,
          echo: echoName(e.echo),
          set: setName(e.set),
          cost: e.cost,
          main: statLabel(e.main),
          substats: e.substats.map((x) => `${SUBSTAT_ABBR[x.key] ?? x.key} ${x.value}`).join(" · ") || "(none)",
          worthPct: pct(e.worth),
        })),
      notes: [
        "gainPct = relative gain in average damage from one more line of that substat at the expected roll.",
        "equippedEchoes is sorted lowest worth first: the first is the weakest set of lines.",
        er && Math.abs(er.gain) < 0.0005 ? "Energy Regen reads 0 here: the engine has no energy model, so keep the ER the rotation needs." : null,
      ].filter(Boolean),
    });
  },
});
