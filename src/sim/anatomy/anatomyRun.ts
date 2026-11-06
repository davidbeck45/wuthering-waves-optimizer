// Wuthering Tools+ — "Why this number", the engine side. One rotation through `calcCharacterRotationDamage` (the very call
// /my-rankings and /account score with), then "What moves this number most": each factor of a hit one step up, on a clone
// of the build, through the same call. Nothing here computes damage: a step changes what the engine reads (a substat
// roll on an equipped echo, a custom buff, a skill level, a stack) and the engine answers. Pure/async: no Vue, no stores.
import { getCharByName } from "../../characters/characters";
import { calcCharacterRotationDamage, type CharacterRotationDamageResult, type CharacterRotationInput } from "../../calculator/characterRotation";
import { resolveRotationActionToAttackData } from "../../calculator/resolveRotationAction";
import type { TeamEnemyConfig } from "../../calculator/buildCharacterContext";
import type { CustomBuffKey } from "../../calculator/customBuffs";
import { rotationCandidates, scoreRotation, type RotationCandidate } from "../myRankings/rankRoster";
import { medianRoll, SUBSTAT_LABELS, withSubstat, type SubstatKey } from "../substats/substatWeights";
import { hitAnatomy, rotationAnatomy, statLabelOf, type FactorId, type HitAnatomy, type HitChoice, type RotationAnatomy } from "./anatomy";

/** The size of a step on a factor no substat reaches: a buff of this many percent. */
export const BUFF_STEP = 10;

export interface AnatomyInput {
  characterId: string;
  characters: Record<string, any>;
  echoes: any[];
  enemy: TeamEnemyConfig;
  rotation: CharacterRotationInput;
}

export interface AnatomyRun {
  input: AnatomyInput;
  result: CharacterRotationDamageResult;
  model: RotationAnatomy;
  /** the attack data behind each line, by action id: the kit knows what the engine's rows don't say (attribute, talents) */
  defs: Map<string, any>;
  /** the character's own element, for an attack without one */
  element: string | null;
  /** one engine run per step, shared by every hit of the rotation */
  runs: Map<string, Promise<CharacterRotationDamageResult>>;
}

type TalentTree = "basic" | "skill" | "forte" | "liberation" | "intro";

export type StepEdit =
  | { kind: "substat"; key: SubstatKey; value: number }
  | { kind: "custom"; key: CustomBuffKey; value: number }
  | { kind: "talent"; tree: TalentTree }
  | { kind: "stacks"; lineIds: string[] };

export interface StepDef {
  /** the engine run's key: two hits sharing a step share its run */
  id: string;
  factor: FactorId | "critRate" | "critDmg";
  /** the factor, in the anatomy's words */
  label: string;
  /** the step, in plain words: what was added */
  step: string;
  edit: StepEdit;
  /** a step past the top of a table: the engine's answer is no gain, so the row is dropped rather than shown */
  dropWithoutGain?: boolean;
}

export interface MoveRow {
  id: string;
  factor: StepDef["factor"];
  label: string;
  step: string;
  /** one press of the hit, on average, after the step */
  hitAfter: number;
  /** relative: 0.05 = +5 % */
  hitGain: number;
  rotationAfter: number;
  rotationGain: number;
}

export interface Moves {
  /** the steps that move this hit, most first */
  rows: MoveRow[];
  /** steps the engine says do nothing for this hit (Crit Rate past 100 %, a buff this attack ignores) */
  flat: MoveRow[];
}

/** The stat a line's figure really holds. An action's own ATK, HP or DEF buff has the engine recompute that stat for the
 *  hit in place of the kit's (attacks.ts, `finalAtkDefHpVal`: DEF over HP over ATK), so the receipt and the step follow it. */
function scalingAttribute(def: any): string | null | undefined {
  const buffs = def?.buffs;
  if (buffs?.DEF || buffs?.DEF_FLAT) return "defense";
  if (buffs?.HP || buffs?.HP_FLAT) return "hp";
  if (buffs?.ATK || buffs?.ATK_FLAT) return "attack";
  return def?.attribute;
}

/** The tree an attack's multiplier is read from at its skill level, or null when it has none. */
function treeOf(def: any): TalentTree | null {
  if (!def?.talents) return null;
  switch (def.actionType) {
    case "basic":
      return "basic";
    case "skill":
      return "skill";
    case "forteCircuit":
    case "forte":
      return "forte";
    case "liberation":
      return "liberation";
    case "intro":
      return "intro";
    default:
      return null;
  }
}

const TREE_LABELS: Record<TalentTree, string> = { basic: "Basic Attack", skill: "Resonance Skill", forte: "Forte Circuit", liberation: "Resonance Liberation", intro: "Intro Skill" };

const TYPE_SUBSTAT: Record<string, SubstatKey> = {
  Basic: "BasicAttackDMGBonus",
  Heavy: "HeavyAttackDMGBonus",
  Skill: "ResonanceSkillDMGBonus",
  Liberation: "ResonanceLiberationDMGBonus",
};

const STAT_SUBSTAT: Record<string, SubstatKey> = { attack: "ATK", hp: "HP", defense: "DEF", EnergyRegen: "EnergyRegen" };

const STATUS_AMPLIFY: Record<string, CustomBuffKey> = {
  spectroFrazzle: "DamageAmplifySpectroFrazzle",
  aeroErosion: "DamageAmplifyAeroErosion",
  fusionBurst: "DamageAmplifyFusionBurst",
  glacioChafe: "DamageAmplifyGlacioChafe",
  electroFlare: "DamageAmplifyElectroFlare",
  glacioBiteForte: "DamageAmplifyGlacioChafe",
};

const roll = (key: SubstatKey, factor: StepDef["factor"], label: string): StepDef => {
  const value = medianRoll(key);
  return { id: `substat:${key}`, factor, label, step: `One mid substat roll: +${value} % ${SUBSTAT_LABELS[key].replace(" %", "")}`, edit: { kind: "substat", key, value } };
};
const buff = (key: CustomBuffKey, factor: StepDef["factor"], label: string, step: string): StepDef => ({ id: `custom:${key}`, factor, label, step, edit: { kind: "custom", key, value: BUFF_STEP } });

/** One step of each factor of this hit that the player can move. A factor nothing can reach (the level base, the enemy
 *  type, Tune Break Boost, which no custom buff feeds) gets none: a step is never estimated. */
export function stepsFor(run: AnatomyRun, hit: HitChoice, anatomy: HitAnatomy = hitAnatomy(hit.line)): StepDef[] {
  const def = run.defs.get(hit.id);
  const data = run.input.characters[run.input.characterId] ?? {};
  const ctx = hit.line.row?.damage?.totalDamageContext;
  const element: string | null = def?.element ?? run.element;
  const steps: StepDef[] = [];

  const talentStep = (label: string, tree: TalentTree | null = treeOf(def)): void => {
    if (!tree || !def?.talents) return;
    const level = Number(data.talents?.[tree] ?? 10);
    if (def.talents?.[level + 1] === undefined) return;
    steps.push({ id: `talent:${tree}`, factor: "multiplier", label, step: `${TREE_LABELS[tree]} skill level ${level} → ${level + 1}`, edit: { kind: "talent", tree } });
  };
  const defStep = (key: "DefIgnore" | "DefReduction", word: string): void => {
    steps.push(buff(key, "def", "Enemy DEF", `${BUFF_STEP} % more of the enemy's DEF ${word}`));
  };
  const resStep = (): void => {
    steps.push(buff("ResistShred", "res", "Enemy RES", `Enemy RES lowered by ${BUFF_STEP} % more`));
  };
  const specialStep = (): void => {
    steps.push(buff("SpecialMultiplier", "special", "Vulnerability", `+${BUFF_STEP} % special multiplier`));
  };
  const totalStep = (): void => {
    steps.push(buff("TotalDamage", "totalDamage", "Total DMG", `+${BUFF_STEP} % Total DMG`));
  };

  switch (anatomy.kind) {
    case "attack": {
      const attribute = hit.line.attribute;
      const stat = STAT_SUBSTAT[attribute] ?? "ATK";
      steps.push(roll(stat, "stat", statLabelOf(attribute)));
      talentStep("Skill multiplier");
      const typeRoll = TYPE_SUBSTAT[hit.line.type];
      if (typeRoll) steps.push(roll(typeRoll, "dmgBonus", "DMG Bonus"));
      else if (hit.line.type === "Echo") steps.push(buff("EchoDMGBonus", "dmgBonus", "DMG Bonus", `+${BUFF_STEP} % Echo DMG Bonus`));
      else if (element) steps.push(buff(element as CustomBuffKey, "dmgBonus", "DMG Bonus", `+${BUFF_STEP} % ${element} DMG Bonus`));
      steps.push(roll("CritRate", "critRate", "Crit Rate"));
      steps.push(roll("CritDMG", "critDmg", "Crit DMG"));
      steps.push(buff("DamageAmplify", "amplify", "Amplify", `+${BUFF_STEP} % DMG Amplify`));
      specialStep();
      totalStep();
      defStep("DefIgnore", "ignored");
      resStep();
      break;
    }
    case "negativeStatus": {
      const stacks = Number(ctx?.stacks ?? 0);
      steps.push({ id: `stacks:${hit.lineIds.join("+")}`, factor: "motion", label: "Stacks on the enemy", step: `One more stack on these ticks: ${stacks} → ${stacks + 1}`, edit: { kind: "stacks", lineIds: hit.lineIds }, dropWithoutGain: true });
      const amplify = STATUS_AMPLIFY[String(ctx?.type)];
      if (amplify) steps.push(buff(amplify, "amplify", "Amplify", `+${BUFF_STEP} % DMG Amplify for this status`));
      defStep("DefReduction", "reduced");
      resStep();
      break;
    }
    case "glacioBite": {
      talentStep("Forte multiplier");
      steps.push(buff("DamageAmplifyGlacioChafe", "amplify", "Amplify", `+${BUFF_STEP} % DMG Amplify for Glacio Chafe`));
      specialStep();
      totalStep();
      defStep("DefReduction", "reduced");
      resStep();
      break;
    }
    case "tuneBreak": {
      // a Tune Break attack with its own table reads it at the Forte level, whatever its action type says (attacks.ts)
      talentStep("Tune Break multiplier", "forte");
      specialStep();
      steps.push(buff("TuneBreakDMGBonus", "tuneBonus", "Tune Break DMG Bonus", `+${BUFF_STEP} % Tune Break DMG Bonus`));
      defStep("DefIgnore", "ignored");
      resStep();
      break;
    }
    default:
      break;
  }
  return steps;
}

interface Edited {
  characters: Record<string, any>;
  echoes: any[];
  rotation: CharacterRotationInput;
}

/** The inputs with one step applied. The build and the rotation are cloned where they change, never written to. */
export function applyStep(input: AnatomyInput, edit: StepEdit): Edited {
  const { characterId: id, characters, echoes, rotation } = input;
  const data = characters[id] ?? {};
  switch (edit.kind) {
    case "substat": {
      const clone = withSubstat(id, characters, echoes, edit.key, edit.value);
      return { characters: clone.characters, echoes: clone.inventoryEchoes, rotation };
    }
    case "custom": {
      const custom = { ...(data.customBuffs ?? {}), [edit.key]: Number(data.customBuffs?.[edit.key] ?? 0) + edit.value };
      return { characters: { ...characters, [id]: { ...data, customBuffs: custom } }, echoes, rotation };
    }
    case "talent": {
      const talents = { ...(data.talents ?? {}), [edit.tree]: Number(data.talents?.[edit.tree] ?? 10) + 1 };
      return { characters: { ...characters, [id]: { ...data, talents } }, echoes, rotation };
    }
    case "stacks": {
      const ids = new Set(edit.lineIds);
      const actions = rotation.actions.map((a) => (ids.has(String(a.id)) ? { ...a, negativeStatusStacks: Number(a.negativeStatusStacks ?? 1) + 1 } : a));
      return { characters, echoes, rotation: { ...rotation, actions } };
    }
  }
}

const score = (input: AnatomyInput, edited: Edited = input): Promise<CharacterRotationDamageResult> =>
  calcCharacterRotationDamage(edited.rotation, null, input.characterId, edited.characters, input.enemy, edited.echoes);

export interface RotationChoice extends RotationCandidate {
  /** the rotation's average damage on this build */
  average: number;
}

/** Every rotation the character can be scored on, best first: the list /my-rankings ranks them from, the same scorer.
 *  A rotation that does not resolve on this build is left out, as it is there. */
export async function rotationChoices(id: string, characters: Record<string, any>, echoes: any[], enemy: TeamEnemyConfig, options: MoveOptions = {}): Promise<RotationChoice[]> {
  const out: RotationChoice[] = [];
  for (const candidate of await rotationCandidates(id, characters[id] ?? {})) {
    try {
      const scored = await scoreRotation(candidate.rotation, id, characters, enemy, echoes);
      out.push({ ...candidate, average: scored.avgDamage });
    } catch {
      /* not this build's */
    }
    await options.pace?.();
  }
  // a stable sort: the first of two equal rotations stays first, as rankRoster's strict `>` keeps it
  return out.sort((a, b) => b.average - a.average);
}

/** The rotation through the engine, read into the anatomy model. */
export async function openRotation(input: AnatomyInput): Promise<AnatomyRun> {
  const result = await score(input);
  const chosen = (await getCharByName(input.characterId)) as any;
  const level = input.characters[input.characterId]?.characterLevel ?? "90";
  const defs = new Map<string, any>();
  for (const action of input.rotation.actions) {
    if (action.isDisabled) continue;
    const def = resolveRotationActionToAttackData(action, chosen, level);
    if (def) defs.set(String(action.id), def);
  }
  const model = rotationAnatomy(result, { attributeOf: (id) => scalingAttribute(defs.get(id)) });
  return { input, result, model, defs, element: chosen?.basic?.element ?? null, runs: new Map() };
}

/** One press of a line, on average, in an engine result (null when the line is gone or does no damage). */
function pressAverage(result: CharacterRotationDamageResult, lineId: string): number | null {
  const row = result.attacks.find((a) => String(a?.id) === lineId);
  const avg = Number(row?.damage?.avgDamage);
  if (!row || !Number.isFinite(avg)) return null;
  const presses = Number(row.count ?? 1);
  return presses > 0 ? avg / presses : avg;
}

export interface MoveOptions {
  /** awaited between engine runs, so a page can stay responsive and a closed sheet can stop */
  pace?: () => Promise<void>;
}

/** Every step of this hit through the engine: what it does for this hit and for the whole rotation. */
export async function movesOf(run: AnatomyRun, hit: HitChoice, options: MoveOptions = {}): Promise<Moves> {
  const base = hit.perPress;
  const rotationBase = run.model.average;
  const rows: MoveRow[] = [];
  const flat: MoveRow[] = [];
  for (const step of stepsFor(run, hit)) {
    let pending = run.runs.get(step.id);
    if (!pending) {
      pending = Promise.resolve().then(() => score(run.input, applyStep(run.input, step.edit)));
      pending.catch(() => undefined); // a closed sheet may never come back for it
      run.runs.set(step.id, pending);
    }
    let result: CharacterRotationDamageResult;
    try {
      result = await pending;
    } catch {
      continue; // a step this build can't take (no echo to carry the roll) says nothing about the hit
    }
    const hitAfter = pressAverage(result, hit.id);
    if (hitAfter === null) continue;
    const rotationAfter = result.damageAggregation.avgDamage ?? 0;
    const row: MoveRow = {
      id: step.id,
      factor: step.factor,
      label: step.label,
      step: step.step,
      hitAfter,
      hitGain: base > 0 ? hitAfter / base - 1 : 0,
      rotationAfter,
      rotationGain: rotationBase > 0 ? rotationAfter / rotationBase - 1 : 0,
    };
    if (Math.abs(row.hitGain) > 1e-9) {
      if (!(step.dropWithoutGain && row.hitGain <= 0)) rows.push(row);
    } else if (!step.dropWithoutGain) flat.push(row);
    await options.pace?.();
  }
  rows.sort((a, b) => b.hitGain - a.hitGain || b.rotationGain - a.rotationGain);
  return { rows, flat };
}
