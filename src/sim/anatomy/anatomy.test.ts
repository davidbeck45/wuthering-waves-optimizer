import { describe, expect, it } from "vitest";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { characterPickerRoster, getCharByName } from "../../characters/characters";
import { calcCharacterRotationDamage, type CharacterRotationInput } from "../../calculator/characterRotation";
import { buildCharacterCalculationContext } from "../../calculator/buildCharacterContext";
import { getEchoData } from "../../echoes";
import { RANKING_ENEMY, rankRoster, weaponOptionsFor, withSequence } from "../myRankings/rankRoster";
import { medianRoll } from "../substats/substatWeights";
import { hitAnatomy, RECONCILE_TOLERANCE, rotationAnatomy, type DamageLine, type FactorId, type HitAnatomy } from "./anatomy";
import { applyStep, BUFF_STEP, movesOf, openRotation, rotationChoices, stepsFor, type AnatomyInput, type AnatomyRun } from "./anatomyRun";
import { critWords, enemyLine, gainText, hitMeta, hitOption, leftOutLine, rotationTitle, shareText, sortMoves } from "./anatomyView";
import { anatomyRequest, requestAnatomy } from "./anatomyRequest";

const near = (a: number, b: number): boolean => Math.abs(a - b) <= RECONCILE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b), 1);
const product = (a: HitAnatomy): number => [...a.factors, ...a.neutral].reduce((p, f) => p * f.times, 1);
const factor = (a: HitAnatomy, id: FactorId) => [...a.factors, ...a.neutral].find((f) => f.id === id);

/** The factors of one line, multiplied, against the engine's own non-crit, crit and average for that line. */
function expectReconciled(line: DamageLine): HitAnatomy {
  const a = hitAnatomy(line);
  const label = `${line.key} (${a.kind})`;
  expect(a.baseReconciled, `${label}: the factors multiply back`).toBe(true);
  expect(a.critReconciled, `${label}: the crit step leads to the average`).toBe(true);
  expect(a.note, label).toBeNull();
  const presses = line.presses > 0 ? line.presses : 1;
  expect(near(product(a) * presses, line.nonCrit), `${label}: ${product(a) * presses} vs ${line.nonCrit}`).toBe(true);
  const crit = a.critFactor?.times ?? 1;
  expect(near(product(a) * crit * presses, line.average), `${label}: average`).toBe(true);
  return a;
}

/** A small synthetic build: public kit data, no player's account. Skill levels 10 unless asked; no echoes. */
async function build(id: string, extra: Record<string, any> = {}): Promise<Record<string, any>> {
  const weapon = (await weaponOptionsFor(id))[0]!.key;
  return { [id]: { characterLevel: "90", weapon, weapons: { [weapon]: { refinement: "1" } }, talents: { basic: 10, skill: 10, forte: 10, liberation: 10, intro: 10 }, ...extra } };
}

const rotationOf = (actions: any[]): CharacterRotationInput => ({ id: "r", name: "Test rotation", duration: null, actions: actions.map((a, i) => ({ id: `a${i}`, count: 1, buffs: [], ...a })) });

async function open(id: string, actions: any[], extra: Record<string, any> = {}): Promise<AnatomyRun> {
  const characters = await build(id, extra);
  return openRotation({ characterId: id, characters, echoes: [], enemy: RANKING_ENEMY, rotation: rotationOf(actions) });
}

/** The first attack of a kit's group that scales on `attribute`. */
// eslint-disable-next-line no-unused-vars -- the parameter of a function type
async function firstAttack(id: string, group: string, match: (a: any) => boolean = () => true): Promise<any> {
  const chosen = (await getCharByName(id)) as any;
  const found = (chosen?.[`${group}Attacks`]?.attacks ?? []).find((a: any) => a.type !== "Healing" && a.type !== "Shield" && match(a));
  if (!found) throw new Error(`no ${group} attack on ${id}`);
  return { key: found.key, type: group };
}

describe("the factors of a hit multiply back to the engine's own figure", () => {
  it("an ATK-scaling attack: the stat is the build's ATK, and every factor is named", async () => {
    const run = await open("Aemeath", [await firstAttack("Aemeath", "liberation")]);
    const a = expectReconciled(run.model.lines[0]!);
    expect(a.kind).toBe("attack");
    const built = await buildCharacterCalculationContext("Aemeath", run.input.characters, RANKING_ENEMY, []);
    expect(factor(a, "stat")!.label).toBe("ATK");
    expect(factor(a, "stat")!.times).toBeCloseTo(built.finalStats.totalAtk, 6);
    for (const id of ["multiplier", "dmgBonus", "amplify", "special", "totalDamage", "endgame", "def", "res"] as FactorId[]) expect(factor(a, id), id).toBeDefined();
    // nothing is at × 1 by accident: the neutral list holds exactly the factors whose value is 1
    expect(a.factors.every((f) => f.times !== 1)).toBe(true);
    expect(a.neutral.every((f) => f.times === 1)).toBe(true);
  }, 60_000);

  it("an HP-scaling attack reads Max HP", async () => {
    const attack = await firstAttack("Cartethyia", "skill", (x) => x.attribute === "hp");
    const run = await open("Cartethyia", [attack]);
    const a = expectReconciled(run.model.lines[0]!);
    const built = await buildCharacterCalculationContext("Cartethyia", run.input.characters, RANKING_ENEMY, []);
    expect(factor(a, "stat")!.label).toBe("Max HP");
    expect(factor(a, "stat")!.times).toBeCloseTo(built.finalStats.totalHp, 6);
  }, 60_000);

  it("a DEF-scaling attack reads DEF", async () => {
    const attack = await firstAttack("Mornye", "liberation", (x) => x.attribute === "defense");
    const run = await open("Mornye", [attack]);
    const a = expectReconciled(run.model.lines[0]!);
    const built = await buildCharacterCalculationContext("Mornye", run.input.characters, RANKING_ENEMY, []);
    expect(factor(a, "stat")!.label).toBe("DEF");
    expect(factor(a, "stat")!.times).toBeCloseTo(built.finalStats.totalDef, 6);
  }, 60_000);

  it("a Negative Status tick of every kind: level base × stacks × amplify × DEF × RES, no ATK anywhere", async () => {
    for (const key of ["ElementalEffectSpectroFrazzle", "ElementalEffectAeroErosion", "ElementalEffectFusionBurst", "ElementalEffectGlacioChafe", "ElementalEffectElectroFlare"]) {
      const run = await open("Aemeath", [{ key, type: "negativeStatus", negativeStatusStacks: 6, count: 3 }], { customBuffs: { DamageAmplifySpectroFrazzle: 25, DamageAmplifyAeroErosion: 25, DamageAmplifyFusionBurst: 25, DamageAmplifyGlacioChafe: 25, DamageAmplifyElectroFlare: 25 } });
      const line = run.model.lines[0]!;
      expect(line.presses).toBe(3);
      const a = expectReconciled(line);
      expect(a.kind, key).toBe("negativeStatus");
      expect(factor(a, "levelBase")!.times, key).toBeGreaterThan(0);
      expect(factor(a, "motion")!.detail, key).toContain("6 stacks");
      expect(factor(a, "amplify")!.times, key).toBeCloseTo(1.25, 12);
      expect(factor(a, "stat"), key).toBeUndefined();
    }
  }, 60_000);

  it("Electro Rage adds to Electro Flare's multiplier, and a kit's status proc reconciles like a tick", async () => {
    const rage = await open("Aemeath", [{ key: "ElementalEffectElectroFlare", type: "negativeStatus", negativeStatusStacks: 4, electroRageStacks: 3 }]);
    expect(factor(expectReconciled(rage.model.lines[0]!), "motion")!.detail).toContain("Electro Rage");
    // locked behind a stance and a chain on this synthetic build: the engine still works its figures out on the row
    const proc = await open("Hsin", [{ key: "SequenceNode3PillarsAcrossHeavenElectroFlareDMG", type: "forteCircuit", negativeStatusStacks: 6 }]);
    const unlocked = proc.result.attacks.map((a) => ({ ...a, originalIsEnabled: true }));
    const model = rotationAnatomy({ attacks: unlocked, damageAggregation: proc.result.damageAggregation });
    expect(model.lines[0]!.nonCrit).toBeGreaterThan(0);
    expect(expectReconciled(model.lines[0]!).kind).toBe("negativeStatus");
  }, 60_000);

  it("a Tune Break hit: the level base, the enemy type and Tune Break Boost", async () => {
    const run = await open("Aemeath", [await firstAttack("Aemeath", "tuneBreak", (x) => x.key === "TuneBreakDMG")], { customBuffs: { TuneBreakDMGBonus: 20 } });
    const a = expectReconciled(run.model.lines[0]!);
    expect(a.kind).toBe("tuneBreak");
    expect(factor(a, "enemyType")!.times).toBe(14);
    expect(factor(a, "tuneBonus")!.times).toBeCloseTo(1.2, 12);
    expect(factor(a, "levelBase")!.times).toBeGreaterThan(0);
    expect(factor(a, "stat")).toBeUndefined();
  }, 60_000);

  it("a Tune Rupture Response: a Tune Break hit RES reduction does reach", async () => {
    const run = await open("Mornye", [{ key: "TuneRuptureResponseParticleJetDMG", type: "forteCircuit", count: 2 }], { customBuffs: { ResistShred: 10 } });
    const a = expectReconciled(run.model.lines[0]!);
    expect(a.kind).toBe("tuneBreak");
    expect(factor(a, "res")!.detail).toContain("lowered by 10.0 %");
  }, 60_000);

  it("a Glacio Bite reconciles, and with an Endgame Total DMG the engine doesn't report it shows no factors and says so", async () => {
    const actions = [{ key: "GlacioBiteDMG", type: "forteCircuit" }];
    const fineSnow = { buffs: { InherentSkillFineSnow: { isEnabled: true, stacks: 3 } } };
    const plain = await open("Hiyuki", actions, fineSnow);
    expect(expectReconciled(plain.model.lines[0]!).kind).toBe("glacioBite");

    // getGlacioBiteForteDamage multiplies (1 + totalDamageEndgame) but leaves it out of its context
    const off = await open("Hiyuki", actions, { ...fineSnow, customBuffs: { TotalDamageEndgame: 30 } });
    const line = off.model.lines[0]!;
    const a = hitAnatomy(line);
    expect(a.baseReconciled).toBe(false);
    expect(a.factors).toEqual([]);
    expect(a.neutral).toEqual([]);
    expect(a.note).toContain("aren't shown");
    // the engine's own figures stay
    expect(a.average).toBe(line.average);
    expect(line.average).toBeCloseTo(plain.model.lines[0]!.average * 1.3, 6);
  }, 60_000);

  it("a fixed hit is one factor, and buffs don't reach it", async () => {
    const run = await open("Galbrena", [{ key: "HellstrideDMG", type: "forteCircuit", count: 2 }]);
    const a = expectReconciled(run.model.lines[0]!);
    expect(a.kind).toBe("fixed");
    expect(a.factors.map((f) => f.id)).toEqual(["fixed"]);
    expect(a.critFactor).toBeNull();
    expect(stepsFor(run, run.model.hits[0]!)).toEqual([]);
  }, 60_000);

  it("the multiplier's parts are the hits the engine ran, where a chain replaces the kit's table", async () => {
    const data = await withSequence("Carlotta", (await build("Carlotta")).Carlotta, 6);
    const run = await openRotation({ characterId: "Carlotta", characters: { Carlotta: data }, echoes: [], enemy: RANKING_ENEMY, rotation: rotationOf([{ key: "DeathKnellDMG", type: "liberation" }]) });
    const line = run.model.lines[0]!;
    const a = expectReconciled(line);
    const raw = line.row.damage.totalDamageContext.rawTotalTalent;
    const detail = factor(a, "multiplier")!.detail!;
    const parts = /\(([^)]+)\)/.exec(detail)![1]!;
    const added = parts.split("+").reduce((sum, part) => {
      const [percent, times] = part.split("*");
      return sum + (parseFloat(percent!) / 100) * Number(times ?? 1);
    }, 0);
    expect(added).toBeCloseTo(raw, 3);
    expect(detail).not.toContain(line.row.talent); // the kit's table, which this chain replaces
  }, 60_000);

  it("buffs that sit at × 1 by default show up as factors once they're on", async () => {
    const attack = await firstAttack("Aemeath", "liberation");
    const run = await open("Aemeath", [attack], { customBuffs: { DamageAmplify: 20, SpecialMultiplier: 15, TotalDamage: 10, TotalDamageEndgame: 5, DefIgnore: 10, DefReduction: 10, ResistShred: 10, ResistIgnore: 5 } });
    const a = expectReconciled(run.model.lines[0]!);
    expect(factor(a, "special")!.times).toBeCloseTo(1.15, 9);
    expect(factor(a, "totalDamage")!.times).toBeCloseTo(1.1, 9);
    expect(factor(a, "endgame")!.times).toBeCloseTo(1.05, 9);
    expect(factor(a, "res")!.detail).toContain("5.0 % ignored");
    expect(factor(a, "def")!.detail).toContain("10.0 % of it ignored");
  }, 60_000);

  it("every attack of every kit in the roster, in one sweep", async () => {
    const groups = ["basic", "skill", "forteCircuit", "liberation", "intro", "outro", "tuneBreak"];
    const kinds = new Map<string, number>();
    let hits = 0;
    for (const { key: id } of [...characterPickerRoster.five, ...characterPickerRoster.four]) {
      const chosen = (await getCharByName(id)) as any;
      if (!chosen) continue;
      const actions = groups.flatMap((g) => (chosen[`${g}Attacks`]?.attacks ?? []).map((a: any) => ({ key: a.key, type: g, negativeStatusStacks: 3 })));
      const run = await open(id, actions, { customBuffs: { DamageAmplify: 5, SpecialMultiplier: 5, TotalDamage: 5, DefIgnore: 5 } });
      expect(run.model.reconciled, id).toBe(true);
      for (const line of run.model.lines) {
        const a = hitAnatomy(line);
        kinds.set(a.kind, (kinds.get(a.kind) ?? 0) + 1);
        if (a.kind === "opaque") continue;
        expectReconciled(line);
        hits += 1;
      }
    }
    expect(hits).toBeGreaterThan(1000);
    for (const kind of ["attack", "tuneBreak", "fixed", "negativeStatus"]) expect(kinds.get(kind) ?? 0, kind).toBeGreaterThan(0);
  }, 180_000);

  it("the Cartethyia account: every rotation's hits reconcile, and the sheet's total is the ranking's figure", async () => {
    const ranking = await rankRoster(account.characters, account.echoes, [], { yieldToUi: false });
    const rank = ranking.characters[0]!;
    const characters = account.characters as Record<string, any>;
    const choices = await rotationChoices(rank.id, characters, account.echoes, RANKING_ENEMY);
    expect(choices.length).toBe(rank.rotationsEvaluated);
    expect(choices[0]!.name).toBe(rank.best!.name);
    expect(choices[0]!.average).toBe(rank.best!.avgDamage);
    for (const choice of choices) {
      const run = await openRotation({ characterId: rank.id, characters, echoes: account.echoes, enemy: RANKING_ENEMY, rotation: choice.rotation });
      expect(run.model.average).toBe(choice.average);
      expect(run.model.reconciled, choice.name).toBe(true);
      for (const line of run.model.lines) expectReconciled(line);
      const shares = run.model.byType.reduce((s, r) => s + r.share, 0);
      expect(shares).toBeCloseTo(1, 9);
      expect(run.model.byAttack.reduce((s, r) => s + r.share, 0)).toBeCloseTo(1, 9);
    }
  }, 60_000);
});

describe("a rotation by attack and by skill type", () => {
  const row = (id: string, key: string, type: string, avg: number, count = 1, extra: Record<string, any> = {}): any => ({ id, key, label: key, type, count, damage: { avgDamage: avg, totalDamage: avg / 2, critDamage: avg * 2 }, ...extra });
  const aggregate = (avgDamage: number): any => ({ avgDamage, normalDamage: avgDamage / 2, critDamage: avgDamage * 2 });

  it("lines of one attack at one figure read as one hit; a line of it at another figure is another hit", () => {
    const model = rotationAnatomy({ attacks: [row("1", "A", "Basic", 100), row("2", "A", "Basic", 100), row("3", "A", "Basic", 400, 2), row("4", "B", "Skill", 400)], damageAggregation: aggregate(1000) });
    expect(model.hits.map((h) => [h.key, h.perPress, h.times, h.total])).toEqual([["B", 400, 1, 400], ["A", 200, 2, 400], ["A", 100, 2, 200]]);
    expect(model.hits[2]!.lineIds).toEqual(["1", "2"]);
    expect(model.byAttack.map((r) => [r.key, r.average, r.times])).toEqual([["A", 600, 4], ["B", 400, 1]]);
    // a tap on the attack opens its biggest single press
    expect(model.byAttack[0]!.hitId).toBe("3");
    expect(model.byType.map((r) => [r.label, r.share])).toEqual([["Basic Attack", 0.6], ["Resonance Skill", 0.4]]);
    expect(model.reconciled).toBe(true);
  });

  it("the biggest hit is the biggest press, not the line pressed most", () => {
    const model = rotationAnatomy({ attacks: [row("1", "Small", "Basic", 900, 30), row("2", "Big", "Liberation", 100)], damageAggregation: aggregate(1000) });
    expect(model.hits[0]!.key).toBe("Big");
    expect(model.byAttack[0]!.key).toBe("Small");
  });

  it("heals, shields and locked lines are left out and counted, as the engine's sum leaves them out", () => {
    const model = rotationAnatomy({
      attacks: [row("1", "A", "Basic", 100), { id: "2", key: "H", type: "Healing", damage: { healAmount: 900 } }, { id: "3", key: "S", type: "Shield", damage: { shieldAmount: 900 } }, row("4", "L", "Skill", 500, 1, { originalIsEnabled: false }), row("5", "Z", "Skill", 0)],
      damageAggregation: aggregate(100),
    });
    expect(model.lines.map((l) => l.key)).toEqual(["A"]);
    expect(model.leftOut).toEqual({ healing: 1, shield: 1, locked: 1, zero: 1 });
    expect(model.reconciled).toBe(true);
    expect(leftOutLine(model.leftOut)).toBe("Left out: 2 lines of healing or shields (not damage), 1 line this build hasn't unlocked, 1 line that deals nothing here.");
    expect(leftOutLine({ healing: 0, shield: 0, locked: 0, zero: 0 })).toBeNull();
  });

  it("lines that don't add up to the engine's total are flagged, not stretched", () => {
    const model = rotationAnatomy({ attacks: [row("1", "A", "Basic", 100)], damageAggregation: aggregate(150) });
    expect(model.reconciled).toBe(false);
    expect(model.byType[0]!.share).toBeCloseTo(2 / 3, 12);
  });

  it("a hit with no parts shows the engine's figure and says so; a legacy status figure too", () => {
    const opaque = rotationAnatomy({ attacks: [{ id: "1", key: "Box", label: "Magic Box DMG", type: "Utility", damage: { totalDamage: 100, critDamage: 100, avgDamage: 100 } }], damageAggregation: aggregate(100) });
    const a = hitAnatomy(opaque.lines[0]!);
    expect(a.kind).toBe("opaque");
    expect(a.factors).toEqual([]);
    expect(a.average).toBe(100);
    expect(a.note).toContain("one figure");

    const legacy = rotationAnatomy({ attacks: [{ id: "1", key: "Old", label: "Old", type: "ElementalEffect", damage: { damage: 640 } }], damageAggregation: { avgDamage: 640, normalDamage: 640, critDamage: 640 } });
    expect(legacy.lines[0]!.average).toBe(640);
    expect(hitAnatomy(legacy.lines[0]!).kind).toBe("opaque");
  });

  it("a context the sheet doesn't know is never guessed at", () => {
    const model = rotationAnatomy({ attacks: [{ id: "1", key: "New", label: "New", type: "Skill", damage: { totalDamage: 50, critDamage: 100, avgDamage: 75, totalDamageContext: { type: "somethingNew", critRate: 0.5, critDamage: 2 } } }], damageAggregation: aggregate(75) });
    const a = hitAnatomy(model.lines[0]!);
    expect(a.kind).toBe("opaque");
    expect(a.factors).toEqual([]);
    expect(a.critFactor?.times).toBeCloseTo(1.5, 12);
  });

  it("a crit step that doesn't lead to the average is left out and named", () => {
    const ctx = { type: "tuneBreak", talent: "100%", totalTalent: 1, charLevel: "90", levelModifier: 10, defenseModifier: 1, resistModifier: 1, bonusDmg: 0, enemyTypeMultiplier: 1, tuneBreakBoost: 0, talentModifierMultiply: 0, specialMultiplier: 0, critRate: 0.5, critDamage: 2 };
    const model = rotationAnatomy({ attacks: [{ id: "1", key: "T", label: "T", type: "TuneBreak", damage: { totalDamage: 10, critDamage: 20, avgDamage: 99, totalDamageContext: ctx } }], damageAggregation: aggregate(99) });
    const a = hitAnatomy(model.lines[0]!);
    expect(a.baseReconciled).toBe(true);
    expect(a.critReconciled).toBe(false);
    expect(a.critFactor).toBeNull();
    expect(a.factors.length).toBeGreaterThan(0);
    expect(a.note).toContain("crit step");
  });
});

describe("what moves this number: each step through the engine", () => {
  const enginePress = async (input: AnatomyInput, edited: ReturnType<typeof applyStep>, id: string) => {
    const result = await calcCharacterRotationDamage(edited.rotation, null, input.characterId, edited.characters, input.enemy, edited.echoes);
    const row = result.attacks.find((a) => a.id === id);
    return { result, row };
  };

  it("each step moves its own factor by exactly the step the row names, and the row is the engine's own answer", async () => {
    const attack = await firstAttack("Aemeath", "liberation");
    const run = await open("Aemeath", [attack, await firstAttack("Aemeath", "basic")], { talents: { basic: 10, skill: 10, forte: 10, liberation: 9, intro: 10 } });
    const hit = run.model.hits[0]!;
    const before = hit.line.row.damage.totalDamageContext;
    const { rows, flat } = await movesOf(run, hit);
    expect(rows.length + flat.length).toBe(stepsFor(run, hit).length);

    for (const step of stepsFor(run, hit)) {
      const edited = applyStep(run.input, step.edit);
      const { result, row: after } = await enginePress(run.input, edited, hit.id);
      const ctx = after.damage.totalDamageContext;
      const shown = rows.find((r) => r.id === step.id) ?? flat.find((r) => r.id === step.id)!;
      // the row's figures are the engine's for this edit
      expect(shown.hitAfter).toBe(after.damage.avgDamage);
      expect(shown.rotationAfter).toBe(result.damageAggregation.avgDamage);
      expect(near(shown.hitGain, after.damage.avgDamage / hit.perPress - 1)).toBe(true);
      expect(near(shown.rotationGain, result.damageAggregation.avgDamage! / run.model.average - 1)).toBe(true);
      const step10 = BUFF_STEP / 100;
      switch (step.id) {
        case "custom:DamageAmplify":
          expect(ctx.totalDeepenEffect).toBeCloseTo(before.totalDeepenEffect + step10, 9);
          break;
        case "custom:SpecialMultiplier":
          expect(ctx.specialMultiplier).toBeCloseTo(before.specialMultiplier + step10, 9);
          break;
        case "custom:TotalDamage":
          expect(ctx.totalDamage).toBeCloseTo(before.totalDamage + step10, 9);
          break;
        case "custom:DefIgnore":
          expect(ctx.defIgnore).toBeCloseTo(before.defIgnore + step10, 9);
          break;
        case "custom:ResistShred":
          expect(ctx.resistanceReduction).toBeCloseTo(before.resistanceReduction + step10, 9);
          break;
        case "substat:CritRate":
          expect(ctx.critRate).toBeCloseTo(before.critRate + medianRoll("CritRate") / 100, 9);
          break;
        case "substat:CritDMG":
          expect(ctx.critDamage).toBeCloseTo(before.critDamage + medianRoll("CritDMG") / 100, 9);
          break;
        case "substat:ATK":
          expect(ctx.attack).toBeGreaterThan(before.attack);
          break;
        case "substat:ResonanceLiberationDMGBonus":
          expect(ctx.bonusTotalSkillDmg).toBeCloseTo(before.bonusTotalSkillDmg + medianRoll("ResonanceLiberationDMGBonus") / 100, 9);
          break;
        case "talent:liberation":
          expect(ctx.rawTotalTalent).toBeGreaterThan(before.rawTotalTalent);
          expect(step.step).toBe("Resonance Liberation skill level 9 → 10");
          break;
        default:
          throw new Error(`a step this test doesn't check: ${step.id}`);
      }
    }
    expect(stepsFor(run, hit).map((s) => s.id).sort()).toEqual(["custom:DamageAmplify", "custom:DefIgnore", "custom:ResistShred", "custom:SpecialMultiplier", "custom:TotalDamage", "substat:ATK", "substat:CritDMG", "substat:CritRate", "substat:ResonanceLiberationDMGBonus", "talent:liberation"].sort());
    // most first
    const gains = rows.map((r) => r.hitGain);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
  }, 60_000);

  it("never writes to the build, the inventory or the rotation", async () => {
    const characters = JSON.parse(JSON.stringify(account.characters));
    const echoes = JSON.parse(JSON.stringify(account.echoes));
    const choices = await rotationChoices("Cartethyia", characters, echoes, RANKING_ENEMY);
    const rotation = JSON.parse(JSON.stringify(choices[0]!.rotation));
    const before = JSON.stringify({ characters, echoes, rotation });
    const run = await openRotation({ characterId: "Cartethyia", characters, echoes, enemy: RANKING_ENEMY, rotation });
    await movesOf(run, run.model.hits[0]!);
    expect(JSON.stringify({ characters, echoes, rotation })).toBe(before);
  }, 60_000);

  it("the scaling stat steps the right substat for ATK, HP and DEF attacks", async () => {
    const hpRun = await open("Cartethyia", [await firstAttack("Cartethyia", "skill", (x) => x.attribute === "hp")]);
    const defRun = await open("Mornye", [await firstAttack("Mornye", "liberation", (x) => x.attribute === "defense")]);
    const stat = (run: AnatomyRun) => stepsFor(run, run.model.hits[0]!).find((s) => s.factor === "stat")!;
    expect(stat(hpRun)).toMatchObject({ id: "substat:HP", label: "Max HP" });
    expect(stat(defRun)).toMatchObject({ id: "substat:DEF", label: "DEF" });
    const gain = (await movesOf(defRun, defRun.model.hits[0]!)).rows.find((r) => r.id === "substat:DEF")!;
    expect(gain.hitGain).toBeGreaterThan(0);
    expect(gain.step).toBe(`One mid substat roll: +${medianRoll("DEF")} % DEF`);
  }, 60_000);

  it("a skill at level 10 has no step, and an Intro hit's DMG Bonus steps the element (no substat for Intro)", async () => {
    const run = await open("Aemeath", [await firstAttack("Aemeath", "intro")]);
    const steps = stepsFor(run, run.model.hits[0]!);
    expect(steps.some((s) => s.factor === "multiplier")).toBe(false);
    const element = ((await getCharByName("Aemeath")) as any).basic.element;
    expect(steps.find((s) => s.factor === "dmgBonus")).toMatchObject({ id: `custom:${element}` });
    const moves = await movesOf(run, run.model.hits[0]!);
    expect(moves.rows.find((r) => r.factor === "dmgBonus")!.hitGain).toBeGreaterThan(0);
  }, 60_000);

  it("an Echo hit's DMG Bonus steps Echo DMG Bonus through the engine", async () => {
    const echo = "Hecate"; // any main echo with an action
    const actionKey = (getEchoData(echo) as any)?.actions?.[0]?.key;
    const run = await open("Aemeath", [{ key: actionKey, type: "echoAttacks", mainEcho: echo, mainEchoRank: 5 }]);
    const hit = run.model.hits[0]!;
    expect(hit.line.type).toBe("Echo");
    const moves = await movesOf(run, hit);
    expect(moves.rows.find((r) => r.id === "custom:EchoDMGBonus")!.hitGain).toBeGreaterThan(0);
  }, 60_000);

  it("Crit Rate past 100 % does nothing, and the row says so instead of a gain", async () => {
    const run = await open("Aemeath", [await firstAttack("Aemeath", "liberation")], { customBuffs: { CritRate: 120 } });
    const moves = await movesOf(run, run.model.hits[0]!);
    expect(moves.flat.map((m) => m.label)).toContain("Crit Rate");
    expect(moves.rows.map((m) => m.label)).not.toContain("Crit Rate");
    const crit = hitAnatomy(run.model.hits[0]!.line).critFactor!;
    expect(crit.overCap).toBe(true);
    expect(critWords(crit, 1000)).toContain("past 100 %");
  }, 60_000);

  it("a Negative Status tick steps a stack, its own amplify, DEF reduction (DEF ignore can't reach it) and RES", async () => {
    const run = await open("Aemeath", [{ key: "ElementalEffectSpectroFrazzle", type: "negativeStatus", negativeStatusStacks: 5 }, await firstAttack("Aemeath", "liberation")]);
    const hit = run.model.hits.find((h) => h.key === "ElementalEffectSpectroFrazzle")!;
    expect(stepsFor(run, hit).map((s) => s.factor)).toEqual(["motion", "amplify", "def", "res"]);
    const moves = await movesOf(run, hit);
    const stack = moves.rows.find((r) => r.factor === "motion")!;
    expect(stack.step).toBe("One more stack on these ticks: 5 → 6");
    expect(stack.hitGain).toBeGreaterThan(0);
    expect(moves.rows.find((r) => r.id === "custom:DamageAmplifySpectroFrazzle")!.hitGain).toBeCloseTo(0.1, 9);
    expect(moves.rows.find((r) => r.id === "custom:DefReduction")!.hitGain).toBeGreaterThan(0);
    expect(moves.rows.find((r) => r.id === "custom:ResistShred")!.hitGain).toBeGreaterThan(0);
    // a stack on the tick leaves the Liberation line alone: the rotation moves by the tick's own change
    const other = run.model.hits.find((h) => h.key !== hit.key)!;
    const expected = (stack.hitAfter - hit.perPress + hit.perPress + other.total) / run.model.average - 1;
    expect(near(stack.rotationGain, expected)).toBe(true);
  }, 60_000);

  it("a stack past the top of the table is dropped, never shown as a loss", async () => {
    const run = await open("Aemeath", [{ key: "ElementalEffectElectroFlare", type: "negativeStatus", negativeStatusStacks: 16 }]);
    const moves = await movesOf(run, run.model.hits[0]!);
    expect(moves.rows.some((r) => r.factor === "motion")).toBe(false);
    expect(moves.flat.some((r) => r.factor === "motion")).toBe(false);
  }, 60_000);

  it("Tune Break: DMG Bonus and DEF move it; RES reduction can't reach a plain Tune Break and reads as no effect", async () => {
    const run = await open("Aemeath", [await firstAttack("Aemeath", "tuneBreak", (x) => x.key === "TuneBreakDMG")]);
    const moves = await movesOf(run, run.model.hits[0]!);
    expect(moves.rows.find((r) => r.id === "custom:TuneBreakDMGBonus")!.hitGain).toBeCloseTo(0.1, 9);
    expect(moves.rows.find((r) => r.id === "custom:DefIgnore")!.hitGain).toBeGreaterThan(0);
    expect(moves.flat.map((r) => r.id)).toContain("custom:ResistShred");
    // Tune Break Boost: no custom buff feeds it, so no step, never an estimate
    expect(stepsFor(run, run.model.hits[0]!).some((s) => s.factor === "tuneBoost")).toBe(false);
  }, 60_000);

  it("a Tune Break attack with its own table steps the Forte level, whatever its action type says", async () => {
    const levels = { basic: 10, skill: 10, forte: 8, liberation: 9, intro: 10 };
    for (const [id, key, type] of [["Aemeath", "SeraphicDuetBonusDMGPerInstance", "forteCircuit"], ["Lucy", "SpoofingProgramCrippleMovementDMG", "liberation"]] as const) {
      const run = await open(id, [{ key, type }], { talents: levels });
      const hit = run.model.hits[0]!;
      expect(hitAnatomy(hit.line).kind, key).toBe("tuneBreak");
      const before = hit.line.row.damage.totalDamageContext.totalTalent;
      const step = stepsFor(run, hit).find((s) => s.factor === "multiplier")!;
      expect(step, key).toMatchObject({ id: "talent:forte", step: "Forte Circuit skill level 8 → 9" });
      const row = (await movesOf(run, hit)).rows.find((r) => r.id === step.id)!;
      expect(row.hitGain, key).toBeGreaterThan(0);
      const edited = applyStep(run.input, step.edit);
      const { row: after } = await enginePress(run.input, edited, hit.id);
      expect(after.damage.totalDamageContext.totalTalent, key).toBeGreaterThan(before);
    }
    // the Tune Break every character has, one flat percentage: no skill level to step
    const plain = await open("Aemeath", [await firstAttack("Aemeath", "tuneBreak", (x) => x.key === "TuneBreakDMG")], { talents: levels });
    expect(stepsFor(plain, plain.model.hits[0]!).some((s) => s.factor === "multiplier")).toBe(false);
  }, 60_000);

  it("an action's own HP or DEF buff makes the engine use that stat, and the receipt and the step say so", async () => {
    const attack = await firstAttack("Aemeath", "liberation");
    const buffed = async (modifier: string) => {
      const run = await open("Aemeath", [{ ...attack, buffs: [{ id: "b", modifier, modifierValue: 10 }] }]);
      const hit = run.model.hits[0]!;
      const built = await buildCharacterCalculationContext("Aemeath", run.input.characters, RANKING_ENEMY, []);
      return { run, hit, built, stat: factor(hitAnatomy(hit.line), "stat")!, step: stepsFor(run, hit).find((s) => s.factor === "stat")! };
    };
    const hp = await buffed("HP");
    expect(hp.stat.label).toBe("Max HP");
    expect(hp.stat.times).toBeGreaterThan(hp.built.finalStats.totalHp);
    expect(hp.step).toMatchObject({ id: "substat:HP", label: "Max HP" });
    expect((await movesOf(hp.run, hp.hit)).rows.find((r) => r.id === "substat:HP")!.hitGain).toBeGreaterThan(0);
    const def = await buffed("DEF");
    expect(def.stat.label).toBe("DEF");
    expect(def.step).toMatchObject({ id: "substat:DEF", label: "DEF" });
    const atk = await buffed("ATK");
    expect(atk.stat.label).toBe("ATK");
  }, 60_000);

  it("an unreconciled Glacio Bite still gets the engine's steps: they don't rest on the factors", async () => {
    const run = await open("Hiyuki", [{ key: "GlacioBiteDMG", type: "forteCircuit" }], { buffs: { InherentSkillFineSnow: { isEnabled: true, stacks: 3 } }, customBuffs: { TotalDamageEndgame: 30 }, talents: { basic: 10, skill: 10, forte: 9, liberation: 10, intro: 10 } });
    const moves = await movesOf(run, run.model.hits[0]!);
    // (the kit writes 102 % at every Forte level, and the engine says so)
    expect(moves.flat.map((r) => r.id)).toContain("talent:forte");
    expect(moves.rows.find((r) => r.id === "custom:DefReduction")!.hitGain).toBeGreaterThan(0);
    const amplify = moves.rows.find((r) => r.id === "custom:DamageAmplifyGlacioChafe")!;
    expect(amplify.hitGain).toBeGreaterThan(0);
    expect(amplify.hitGain).toBeLessThanOrEqual(0.1);
  }, 60_000);

  it("a pace that throws stops the rotation list at once: a closed sheet scores nothing more", async () => {
    const stop = Symbol("closed");
    let runs = 0;
    const characters = account.characters as Record<string, any>;
    await expect(
      rotationChoices("Cartethyia", characters, account.echoes, RANKING_ENEMY, {
        pace: async () => {
          runs += 1;
          throw stop;
        },
      }),
    ).rejects.toBe(stop);
    expect(runs).toBe(1);
  }, 60_000);

  it("two hits share each step's engine run", async () => {
    const run = await open("Aemeath", [await firstAttack("Aemeath", "liberation"), await firstAttack("Aemeath", "basic")]);
    await movesOf(run, run.model.hits[0]!);
    const runs = run.runs.size;
    await movesOf(run, run.model.hits[1]!);
    // the second hit only adds its own DMG Bonus roll
    expect(run.runs.size).toBe(runs + 1);
  }, 60_000);
});

describe("the sheet's words", () => {
  it("reads rotations, hits and gains in plain words", () => {
    expect(enemyLine(RANKING_ENEMY)).toBe("enemy level 100, 20 % RES");
    expect(shareText(0.4221)).toBe("42.2 %");
    expect(gainText(0.0848)).toBe("+8.48 %");
    expect(gainText(0.125)).toBe("+12.5 %");
    expect(gainText(-0.01)).toBe("−1.00 %");
    expect(gainText(0.00002)).toBe("+under 0.01 %");
    expect(rotationTitle("Basic Rotation (Tune Break)")).toBe("Basic Rotation (Tune Break)");
    expect(rotationTitle("Aemeath S6 Everbright Polestar R5 · Mornye + Lynae · S6R5 (wuwa_calc)")).toContain("Mornye + Lynae");
    const hit = { label: "Finale", typeLabel: "Resonance Liberation", perPress: 3_416_042, times: 1, share: 0.422 } as any;
    expect(hitOption(hit, true)).toBe("3.42M · Finale (biggest)");
    expect(hitOption({ ...hit, times: 3 }, false)).toBe("3.42M × 3 · Finale");
    expect(hitMeta(hit)).toBe("Resonance Liberation · lands once · 42.2 % of the rotation");
    expect(hitMeta({ ...hit, times: 10 })).toBe("Resonance Liberation · lands 10 times · 42.2 % of the rotation");
  });

  it("sorts the steps by the hit or by the rotation", () => {
    const rows = [{ id: "a", hitGain: 0.1, rotationGain: 0.01 }, { id: "b", hitGain: 0.05, rotationGain: 0.04 }] as any[];
    expect(sortMoves(rows, "hit").map((r) => r.id)).toEqual(["a", "b"]);
    expect(sortMoves(rows, "rotation").map((r) => r.id)).toEqual(["b", "a"]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("a request re-opens the sheet, even for the same character", () => {
    requestAnatomy("Aemeath", "Basic");
    const first = anatomyRequest.value;
    requestAnatomy("Aemeath", "Basic");
    expect(anatomyRequest.value).not.toBe(first);
    expect(anatomyRequest.value).toMatchObject({ characterId: "Aemeath", rotationName: "Basic" });
    requestAnatomy("Mornye");
    expect(anatomyRequest.value?.rotationName).toBeNull();
  });
});
