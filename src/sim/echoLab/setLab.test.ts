// Wuthering Tools+ Echo Lab — the Set lab (setLab.ts) on the Echo Lab's public test account (echoLabAccount.json:
// Cartethyia, Galbrena and Zani) and small edits of it: the rules from the set data, your layout at zero through the
// real recompute, a Crit-only set against a run with the crit on an echo instead, the layouts it must refuse, a 4-star
// character, 4-star echoes, Rover, pinned bonuses, conditional bonuses, the main echo, team figures, the worker job.
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/echoLabAccount.json";
import { buildCharacterCalculationContext } from "../../calculator/buildCharacterContext";
import { calcCharacterRotationDamage } from "../../calculator/characterRotation";
import { getSetBonusEffects, setBonusEffectsTwo } from "../../echoes/sets";
import { echoSetLabelMap } from "../../echoes/stats";
import { menuEnergyRegen } from "../energy/energyHave";
import { scoreTeamCandidate } from "../myRankings/rankRoster";
import { createLabSession, prepareCharacter, scoreBuild, setDeltaOf, withSetLabels, type LabAccount, type LabCharacter, type LabSession } from "./core";
import { teamSideOf } from "./farmNext";
import { SET_LAB_ASSUMPTIONS, allLayouts, bonusSizes, layoutBonuses, layoutKey, layoutOfSelection, parseLayoutKey, placeLayout, setLab, setLabTeam, validateLayout, type SetLabResult, type SetLabRow, type SlotShape } from "./setLab";
import { assumptionState, changesText, erRange, erShort, filterSetRows, floorOf, layoutName, layoutSets, layoutShape, mineRankOf, plainText, pointsText, rankSentence, sortSetRows, withSetTeam, type MineRank } from "./setLabView";
import { createEchoLabHost, type EchoLabResponse } from "./workerHost";

const account = fixture as unknown as LabAccount;
const clone = (): LabAccount => JSON.parse(JSON.stringify(account));
const quiet = { yieldMs: 0 };
const noTeams = { teamRows: 0 };
const T = 60_000;

const rowOf = (r: SetLabResult, key: string): SetLabRow => {
  const row = r.rows.find((x) => x.key === key || x.same.includes(key));
  if (!row) throw new Error(`no row for ${key}`);
  return row;
};
const yours = (r: SetLabResult): SetLabRow => r.rows.find((x) => x.current) as SetLabRow;

/** The inventory record behind one of a character's slots: a slot pointing at the inventory carries only a blank
 *  placeholder, and the engine reads the record, so an edit has to land here to change anything. */
function inventoryEcho(data: LabAccount, id: string, slot: number): Record<string, any> {
  const echoId = data.characters[id].echoes[slot].echoId;
  const echo = data.echoes.find((e) => e.echoId === echoId);
  if (!echo) throw new Error(`${id} slot ${slot} is not an inventory echo`);
  return echo;
}

/** A built character copied onto another id: the same echoes, a weapon of their type (`weapon`), no saved rotation. */
function withCharacter(base: LabAccount, from: string, id: string, weapon: string): LabAccount {
  const next = JSON.parse(JSON.stringify(base)) as LabAccount;
  next.characters[id] = { ...JSON.parse(JSON.stringify(next.characters[from])), weapon, rotations: undefined, teamBuffs: undefined, buffs: {}, resonanceChains: {}, weaponPassives: {} };
  return next;
}

async function labOf(session: LabSession, id: string): Promise<LabCharacter> {
  const lab = await prepareCharacter(session, id);
  if (!lab) throw new Error(`${id}: ${session.skipped.get(id)}`);
  return lab;
}

describe("Set lab: the rules come from the set data", () => {
  it("knows every Sonata's piece counts", () => {
    for (const key of Object.keys(echoSetLabelMap)) expect(bonusSizes(key).length, key).toBeGreaterThan(0);
    expect(bonusSizes("MoltenRift")).toEqual([2, 5]);
    expect(bonusSizes("DreamoftheLost")).toEqual([3]);
    expect(bonusSizes("FlamewingsShadow")).toEqual([3]);
    expect(bonusSizes("ShadowofShatteredDreams")).toEqual([1]);
    expect(bonusSizes("NotASet")).toEqual([]);
  });

  it("lists each layout once, each one legal, each giving exactly its bonuses through the app's own rule", () => {
    const layouts = allLayouts();
    const keys = layouts.map(layoutKey);
    expect(new Set(keys).size).toBe(keys.length);
    const sized = (n: number): number => Object.keys(echoSetLabelMap).filter((k) => bonusSizes(k).includes(n)).length;
    const [one, two, three, five] = [sized(1), sized(2), sized(3), sized(5)];
    const pairs = (two * (two - 1)) / 2;
    // none; each alone; 3 + 2; 2 + 2; and the 1-piece riding on what leaves it a slot
    expect(layouts).toHaveLength(1 + one + two + three + five + three * two + pairs + one * two + one * three + one * pairs);
    for (const parts of layouts) {
      expect(validateLayout(parts), layoutKey(parts)).toBeNull();
      const labels = parts.flatMap((p) => Array<string>(p.pieces).fill(p.set));
      const bonus = getSetBonusEffects(labels);
      const given = [bonus.setBonusOnePiece, bonus.setBonusOne, bonus.setBonusTwo].filter(Boolean);
      expect([...given].sort(), layoutKey(parts)).toEqual([...layoutBonuses(parts)].sort());
    }
  });

  it("reads a stored bonus selection back as a layout and round-trips keys", () => {
    expect(layoutOfSelection({ setBonusOne: "Molten Rift 2 Set", setBonusTwo: "Molten Rift 5 Set" })).toEqual([{ set: "MoltenRift", pieces: 5 }]);
    expect(layoutOfSelection({ setBonusOne: "Flaming Clawprint 2 Set", setBonusTwo: "Flamewing's Shadow 3 Set", setBonusOnePiece: null })).toEqual([
      { set: "FlamewingsShadow", pieces: 3 },
      { set: "FlamingClawprint", pieces: 2 },
    ]);
    expect(layoutOfSelection({})).toEqual([]);
    expect(layoutOfSelection(null)).toEqual([]);
    for (const parts of allLayouts().slice(0, 40)) expect(parseLayoutKey(layoutKey(parts))).toEqual(parts);
    expect(layoutKey([])).toBe("none");
    expect(parseLayoutKey("none")).toEqual([]);
  });
});

describe("Set lab: illegal layouts are refused", () => {
  const slots: SlotShape[] = [
    { cost: 4, species: "Capitaneus", set: "EternalRadiance" },
    { cost: 3, species: null, set: null },
    { cost: 3, species: null, set: null },
    { cost: 1, species: null, set: null },
    { cost: 1, species: null, set: null },
  ];

  it("refuses what the game has no bonus for", () => {
    expect(validateLayout([{ set: "MoltenRift", pieces: 3 }])).toMatch(/no 3-piece bonus/);
    expect(validateLayout([{ set: "MoltenRift", pieces: 4 }])).toMatch(/no 4-piece bonus/);
    expect(validateLayout([{ set: "DreamoftheLost", pieces: 5 }])).toMatch(/no 5-piece bonus/);
    expect(validateLayout([{ set: "DreamoftheLost", pieces: 2 }])).toMatch(/no 2-piece bonus/);
    expect(validateLayout([{ set: "MoltenRift", pieces: 1 }])).toMatch(/no 1-piece bonus/);
    expect(validateLayout([{ set: "ShadowofShatteredDreams", pieces: 5 }])).toMatch(/no 5-piece bonus/);
    expect(validateLayout([{ set: "NotASet", pieces: 2 }])).toMatch(/not a Sonata/);
  });

  it("refuses more than five echoes and the same Sonata twice", () => {
    expect(validateLayout([{ set: "MoltenRift", pieces: 5 }, { set: "VoidThunder", pieces: 2 }])).toMatch(/7 echoes/);
    expect(validateLayout([{ set: "DreamoftheLost", pieces: 3 }, { set: "CrownofValor", pieces: 3 }])).toMatch(/6 echoes/);
    expect(validateLayout([{ set: "MoltenRift", pieces: 2 }, { set: "MoltenRift", pieces: 2 }])).toMatch(/named twice/);
  });

  it("refuses a layout the build's costs can't make: a Sonata counts one echo per name", () => {
    // the 1-piece has one echo, at cost 4: a build whose only cost 4 slot... has none
    const noFour = slots.map((s) => ({ ...s, cost: s.cost === 4 ? 3 : s.cost }));
    expect(placeLayout([{ set: "ShadowofShatteredDreams", pieces: 1 }], noFour)).toEqual({ refused: expect.stringMatching(/too few different echoes/) });
    // Lingering Tunes has one cost 4 echo: a 5-piece needs two on a 4-4-1-1-1 build
    const twoFours: SlotShape[] = [4, 4, 1, 1, 1].map((cost) => ({ cost, species: null, set: null }));
    expect(placeLayout([{ set: "LingeringTunes", pieces: 5 }], twoFours)).toEqual({ refused: expect.stringMatching(/too few different echoes/) });
    expect(placeLayout([{ set: "LingeringTunes", pieces: 5 }], slots)).toMatchObject({ key: "LingeringTunes:5" });
    expect(placeLayout([{ set: "MoltenRift", pieces: 3 }], slots)).toEqual({ refused: expect.stringMatching(/no 3-piece/) });
  });

  it(
    "refuses them in the worker's team job too, and scores none of them",
    async () => {
      const session = createLabSession(clone());
      await expect(setLabTeam(session, "Zani", ["MoltenRift:3"], {}, quiet)).rejects.toThrow(/no 3-piece/);
      await expect(setLabTeam(session, "Zani", ["MoltenRift:5+VoidThunder:2"], {}, quiet)).rejects.toThrow(/7 echoes/);
      const lab = await labOf(session, "Galbrena");
      const before = lab.slots.map((s) => s?.set);
      const r = await setLab(session, "Galbrena", noTeams, quiet);
      expect(r.scored + r.refusedCount).toBe(r.layouts);
      expect(lab.slots.map((s) => s?.set)).toEqual(before);
    },
    T,
  );

  it("needs a character with five echoes", async () => {
    await expect(setLab(createLabSession(clone()), "Augusta", noTeams, quiet)).rejects.toThrow();
  }, T);
});

describe("Set lab: your layout", () => {
  it.each(["Cartethyia", "Galbrena", "Zani"])(
    "%s: scores zero, and the label pipeline gives the same number to the last digit",
    async (id) => {
      const session = createLabSession(clone());
      const r = await setLab(session, id, noTeams, quiet);
      const lab = await labOf(session, id);
      const row = yours(r);
      expect(r.rows.filter((x) => x.current)).toHaveLength(1);
      expect(row.gain).toBe(0);
      expect(row.damage).toBe(0);
      expect(row.erChange).toBe(0);
      expect(row.healChange).toBe(0);
      expect(row.changes).toBe(0);
      expect(row.avg).toBe(lab.base);
      expect(r.base).toBe(lab.base);
      // the same echoes through the machinery every other row goes through: nothing moved, not a rounding
      expect(await scoreBuild(session, lab, withSetLabels(session, lab, row.labels), session.account.echoes)).toBe(lab.base);
      expect(await scoreBuild(session, lab, withSetLabels(session, lab, lab.slots.map((s) => s?.set ?? null)), session.account.echoes)).toBe(lab.base);
    },
    T,
  );

  it(
    "never changes the account: every row is a clone",
    async () => {
      const before = JSON.stringify(account);
      const data = clone();
      await setLab(createLabSession(data), "Zani", noTeams, quiet);
      expect(JSON.stringify(data)).toBe(before);
    },
    T,
  );

  it(
    "is your stored selection even when you pinned it: only that row reads zero, and the others are real",
    async () => {
      const data = clone();
      const zani = data.characters.Zani;
      zani.setOverride = true;
      zani.echoSetBonus = { setBonusOnePiece: null, setBonusOne: "Molten Rift 2 Set", setBonusTwo: "Molten Rift 5 Set" };
      const session = createLabSession(data);
      const r = await setLab(session, "Zani", noTeams, quiet);
      expect(r.pinned).toBe(true);
      const row = yours(r);
      expect(row.key).toBe("MoltenRift:5");
      expect(row.gain).toBe(0);
      expect(row.bonuses).toEqual(["Molten Rift 2 Set", "Molten Rift 5 Set"]);
      // the pin is lifted for the comparison: a Spectro set moves her Spectro damage
      expect(rowOf(r, "EternalRadiance:5").gain).toBeGreaterThan(0.05);
    },
    T,
  );
});

describe("Set lab: a row is the engine's number", () => {
  it.each(["Galbrena", "Cartethyia"])(
    "%s: a Crit-only set equals a manual run with the same Crit Rate on an echo instead of a set",
    async (id) => {
      // Wishes of Quiet Snowfall 5-piece on a non-Glacio character: its 2-piece and half its 5-piece are Glacio, so all it
      // gives is +25 Crit Rate. The 100 % cap would hide the amount (Zani at 120 % gains nothing, and these two reach it with
      // 24 as well as 25), so their Crit Rate lines go on both sides, and the main echo gives up its fifth line so the manual
      // side has one to put the 25 in.
      expect(setBonusEffectsTwo["Wishes of Quiet Snowfall 5 Set"].passives.flatMap((p) => p.modifiers.map((m) => `${m.modifier} ${m.modifierValue}`)).sort()).toEqual(["CritRate 25", "Glacio 10"]);
      const data = clone();
      for (const slot of [0, 1, 2, 3, 4]) {
        const echo = inventoryEcho(data, id, slot);
        for (const n of [1, 2, 3, 4, 5]) {
          if (echo[`echoSubStatsType${n}`] !== "CritRate") continue;
          echo[`echoSubStatsType${n}`] = null;
          echo[`echoSubStatsValue${n}`] = null;
        }
      }
      const main = inventoryEcho(data, id, 0);
      main.echoSubStatsType5 = null;
      main.echoSubStatsValue5 = null;
      const session = createLabSession(data);
      const lab = await labOf(session, id);
      const built = await buildCharacterCalculationContext(id, data.characters, session.enemy, data.echoes);
      expect(Number(built.finalStats.critRate)).toBeLessThan(70);
      const r = await setLab(session, id, noTeams, quiet);
      const row = rowOf(r, "WishesofQuietSnowfall:5");
      expect(row.parts).toEqual([{ set: "WishesofQuietSnowfall", pieces: 5 }]);

      // by hand, no Set lab code: no set bonus at all, the same echoes, 25 Crit Rate as a substat, straight into the engine
      const echoes = JSON.parse(JSON.stringify(data.echoes));
      const carrier = echoes.find((e: any) => e.echoId === main.echoId);
      carrier.echoSubStatsType5 = "CritRate";
      carrier.echoSubStatsValue5 = 25;
      const characters = { ...data.characters, [id]: { ...data.characters[id], echoSetBonus: { setBonusOnePiece: null, setBonusOne: null, setBonusTwo: null } } };
      const manual = await calcCharacterRotationDamage(lab.rotation, null, id, characters, session.enemy, echoes);
      expect(row.avg).toBeCloseTo(manual.damageAggregation.avgDamage ?? 0, 6);
      // and the crit really moved the number: the same echoes with no bonus at all read well below it
      expect(row.avg / rowOf(r, "none").avg).toBeGreaterThan(1.05);
    },
    T,
  );

  it(
    "agrees with the Echo Lab's own set delta for a one-slot change",
    async () => {
      // Galbrena wears 3 Flamewing's Shadow + 2 of a 2-piece: relabel one 2-piece slot and the 2-piece is gone
      const session = createLabSession(clone());
      const lab = await labOf(session, "Galbrena");
      const sets = lab.slots.map((s) => s?.set ?? null);
      const two = sets.find((s) => sets.filter((x) => x === s).length === 2) as string;
      const slot = sets.indexOf(two);
      const r = await setLab(session, "Galbrena", noTeams, quiet);
      const delta = await setDeltaOf(session, lab, slot, "ShadowofShatteredDreams");
      const key = layoutKey([{ set: "FlamewingsShadow", pieces: 3 }, { set: "ShadowofShatteredDreams", pieces: 1 }]);
      expect(rowOf(r, key).gain).toBeCloseTo(delta, 10);
    },
    T,
  );

  it(
    "every layout sharing a row, and every layout sharing a run, is the number a direct run gives",
    async () => {
      const session = createLabSession(clone());
      const lab = await labOf(session, "Galbrena");
      const r = await setLab(session, "Galbrena", noTeams, quiet);
      expect(r.rows.length).toBeLessThan(r.scored);
      const shape = lab.slots.map((s) => ({ cost: s!.cost, species: s!.species, set: s!.set }));
      const sample = r.rows.filter((x) => x.same.length > 0 && !x.yoursFull).slice(0, 12);
      expect(sample.length).toBeGreaterThan(3);
      for (const row of sample) {
        for (const key of [row.key, ...row.same.slice(0, 3)]) {
          const placed = placeLayout(parseLayoutKey(key), shape);
          if ("refused" in placed) throw new Error(placed.refused);
          const avg = await scoreBuild(session, lab, withSetLabels(session, lab, placed.labels), session.account.echoes);
          expect(avg / row.avg, `${row.key} ~ ${key}`).toBeCloseTo(1, 9);
        }
      }
    },
    T,
  );

  it(
    "ranks best first, with the plain figures a reader needs",
    async () => {
      const session = createLabSession(clone());
      const r = await setLab(session, "Zani", noTeams, quiet);
      for (let i = 1; i < r.rows.length; i++) expect(r.rows[i - 1].gain).toBeGreaterThanOrEqual(r.rows[i].gain);
      expect(r.assumptions).toBe(SET_LAB_ASSUMPTIONS);
      expect(r.scorings).toBeGreaterThan(50);
      expect(r.scorings).toBeLessThan(r.layouts * 2);
      for (const row of r.rows) expect(row.damage).toBeCloseTo(row.gain * r.base, 3);
      expect(Object.keys(r.bonuses).length).toBeGreaterThan(20);
      expect(r.bonuses["Moonlit Clouds 5 Set"]).toMatchObject({ teamOnly: true, hitNotPlayed: false });
      expect(r.bonuses["Midnight Veil 5 Set"].hitNotPlayed).toBe(true);
      expect(r.bonuses["Molten Rift 2 Set"].text).toMatch(/Fusion DMG increased by 10%/);
      expect(r.bonuses["Molten Rift 2 Set"].text).not.toMatch(/</);
    },
    T,
  );
});

describe("Set lab: Energy Regen", () => {
  it(
    "is the Energy check's reading of the same clone, and the change is the 2-piece's points",
    async () => {
      const session = createLabSession(clone());
      const lab = await labOf(session, "Zani");
      const base = (await menuEnergyRegen("Zani", session.account.characters, session.account.echoes))!;
      const r = await setLab(session, "Zani", { ...noTeams, erNeed: base + 5 }, quiet);
      expect(r.erBase).toBe(base);
      expect(r.erNeed).toBe(base + 5);
      const row = rowOf(r, "MoonlitClouds:5");
      expect(row.erChange).toBeCloseTo(10, 6);
      expect(row.erHave).toBeCloseTo(base + 10, 6);
      expect(await menuEnergyRegen("Zani", withSetLabels(session, lab, row.labels), session.account.echoes)).toBeCloseTo(row.erHave!, 6);
      expect(erShort(row, r.erNeed)).toBe(false);
      expect(erShort(yours(r), r.erNeed)).toBe(true);
      expect(rowOf(r, "MoltenRift:5").erChange).toBeCloseTo(0, 6);
      expect(rowOf(r, "EternalRadiance:5").healChange).toBe(0);
      expect(rowOf(r, "RejuvenatingGlow:5").healChange).toBe(10);
    },
    T,
  );
});

describe("Set lab: conditional bonuses", () => {
  it(
    "reads your switches for your layout, and assumes on at most stacks for any other, and says which",
    async () => {
      const data = clone();
      data.characters.Zani.echoSetPassives = { ...data.characters.Zani.echoSetPassives, EternalRadiance5SetCritRate: { isEnabled: false }, EternalRadiance5SetSpectro: { isEnabled: false } };
      const session = createLabSession(data);
      const r = await setLab(session, "Zani", noTeams, quiet);
      const row = yours(r);
      expect(row.assumptions.map((a) => [a.passive, a.source, a.on])).toEqual([
        ["EternalRadiance5SetCritRate", "yours", false],
        ["EternalRadiance5SetSpectro", "yours", false],
      ]);
      expect(assumptionState(row.assumptions[0])).toBe("Your calculator's switch: off");
      // the others are credited with theirs, so the row to read them against is here too
      const full = r.rows.find((x) => x.yoursFull)!;
      expect(full.key).toBe(`${row.key}#conditions-on`);
      expect(full.gain).toBeGreaterThan(0.01);
      expect(full.assumptions.every((a) => a.on && a.source === "assumed")).toBe(true);
      const havoc = rowOf(r, "HavocEclipse:5");
      expect(havoc.assumptions).toEqual([{ bonus: "Havoc Eclipse 5 Set", passive: "HavocEclipse5SetHavoc", source: "assumed", on: true, stacks: 4, maxStacks: 4, erGate: null }]);
      expect(assumptionState(havoc.assumptions[0])).toBe("Assumed: on for the whole rotation, 4 of 4 stacks");
    },
    T,
  );

  it(
    "settles Tidebreaking Courage's 250 % Energy Regen from the layout's own Energy Regen, on both sides of it",
    async () => {
      const key = "TidebreakingCourage:5";
      const passive = "TidebreakingCourage5SetAllElementAttributeBonus";
      const low = await setLab(createLabSession(clone()), "Zani", noTeams, quiet);
      const lowRow = rowOf(low, key);
      const gated = lowRow.assumptions.find((a) => a.passive === passive)!;
      expect(gated.on).toBe(false);
      expect(gated.erGate).toEqual({ need: 250, have: lowRow.erHave });
      expect(assumptionState(gated)).toBe(`Counted off: it needs 250 % Energy Regen and this layout has ${Math.round(lowRow.erHave! * 10) / 10} %`);
      expect(lowRow.assumptions.find((a) => a.passive === "TidebreakingCourage5SetATK")).toMatchObject({ on: true, erGate: null });

      // the same layout on a build that reaches 250 %: an Energy Regen line that big, and now the +30 % counts
      const data = clone();
      const main = inventoryEcho(data, "Zani", 0);
      main.echoSubStatsType5 = "EnergyRegen";
      main.echoSubStatsValue5 = 200;
      const session = createLabSession(data);
      const lab = await labOf(session, "Zani");
      const high = await setLab(session, "Zani", noTeams, quiet);
      const highRow = rowOf(high, key);
      expect(highRow.erHave!).toBeGreaterThan(250);
      expect(highRow.assumptions.find((a) => a.passive === passive)).toMatchObject({ on: true, erGate: null });
      expect(highRow.avg).toBeCloseTo(await scoreBuild(session, lab, withSetLabels(session, lab, highRow.labels), session.account.echoes), 6);
      expect(highRow.gain - lowRow.gain).toBeGreaterThan(0.05);
    },
    T,
  );

  it(
    "gives the floor: the same layout with every condition off, which is the always-on part alone",
    async () => {
      const r = await setLab(createLabSession(clone()), "Zani", noTeams, quiet);
      const row = rowOf(r, "CelestialLight:5");
      expect(row.floorGain).not.toBeNull();
      expect(row.floorGain!).toBeLessThan(row.gain);
      // the 5-piece's condition off leaves its 2-piece: exactly the row of the 2-piece alone
      expect(row.floorGain!).toBeCloseTo(rowOf(r, "CelestialLight:2").gain, 10);
      expect(rowOf(r, "MoltenRift:2").floorGain).toBeNull();
      expect(floorOf({ gain: 0.1, floorGain: null })).toBe(0.1);
      expect(floorOf({ gain: 0.1, floorGain: -0.2 })).toBe(-0.2);
    },
    T,
  );

  it(
    "holds no row for your layout on full conditions when it is on them already",
    async () => {
      const r = await setLab(createLabSession(clone()), "Galbrena", noTeams, quiet);
      expect(r.rows.some((x) => x.yoursFull)).toBe(false);
    },
    T,
  );
});

describe("Set lab: the main echo", () => {
  it(
    "keeps it where the layout allows, says so where it can't, and scores that set's best main echo beside it",
    async () => {
      const session = createLabSession(clone());
      const lab = await labOf(session, "Galbrena");
      const r = await setLab(session, "Galbrena", noTeams, quiet);
      // Corrosaurus (Galbrena's slot 0) is no Sound of True Name echo, and a 5-piece leaves no free slot
      const row = rowOf(r, "SoundofTrueName:5");
      expect(row.mainFits).toBe(false);
      expect(row.mainOptions.length).toBeGreaterThan(0);
      expect(row.bestMain).not.toBeNull();
      expect(row.mainOptions).toContain(row.bestMain!.species);
      let best = -Infinity;
      for (const species of row.mainOptions) best = Math.max(best, (await scoreBuild(session, lab, withSetLabels(session, lab, row.labels, species), session.account.echoes)) / lab.base - 1);
      expect(row.bestMain!.gain).toBeCloseTo(best, 10);
      // a 2 + 2 leaves a free slot, and the main echo takes it
      const twos = rowOf(r, layoutKey([{ set: "MoltenRift", pieces: 2 }, { set: "VoidThunder", pieces: 2 }]));
      expect(twos.mainFits).toBe(true);
      expect(twos.mainOptions).toEqual([]);
      expect(twos.bestMain).toBeNull();
      // the label change itself leaves the main echo's buff alone
      const clone1 = withSetLabels(session, lab, row.labels);
      expect(clone1.Galbrena.mainEcho).toEqual(session.account.characters.Galbrena.mainEcho);
      expect(withSetLabels(session, lab, row.labels, row.bestMain!.species).Galbrena.mainEcho.echo).toBe(row.bestMain!.species);
    },
    T,
  );
});

describe("Set lab: a set's own hit", () => {
  it(
    "drops the hit a rotation plays when the layout gives up the bonus behind it, and leaves your layout at zero",
    async () => {
      const data = clone();
      const zani = data.characters.Zani;
      zani.echoSetBonus = { setBonusOnePiece: null, setBonusOne: "Midnight Veil 2 Set", setBonusTwo: "Midnight Veil 5 Set" };
      const session = createLabSession(data);
      const lab = await labOf(session, "Zani");
      lab.rotation = { ...lab.rotation, actions: [...(lab.rotation.actions ?? []), { id: "hit", key: "MidnightVeilDMG", type: "echoSetAttacks", count: 1 } as any] };
      const withHit = await scoreBuild(session, lab, session.account.characters, session.account.echoes);
      lab.base = withHit;
      const r = await setLab(session, "Zani", noTeams, quiet);
      expect(yours(r).gain).toBe(0);
      expect(r.bonuses["Midnight Veil 5 Set"].hitNotPlayed).toBe(false);
      // Havoc Eclipse 2-piece and Midnight Veil 2-piece give the same stat: all that differs from a Midnight Veil 2-piece-only layout is the hit
      const two = rowOf(r, "MidnightVeil:2");
      const noHit = await scoreBuild(session, { ...lab, rotation: { ...lab.rotation, actions: (lab.rotation.actions ?? []).filter((a) => a.id !== "hit") } }, withSetLabels(session, lab, two.labels), session.account.echoes);
      expect(two.avg).toBeCloseTo(noHit, 6);
      expect(two.gain).toBeLessThan(0);
    },
    T,
  );
});

describe("Set lab: a 4-star character, 4-star echoes and Rover", () => {
  it(
    "scores a 4-star character on the same rules: Sanhua, Glacio",
    async () => {
      const data = withCharacter(clone(), "Zani", "Sanhua", "EmeraldofGenesis");
      data.characters.Sanhua.weapon = "EmeraldofGenesis";
      const session = createLabSession(data);
      const lab = await labOf(session, "Sanhua");
      const r = await setLab(session, "Sanhua", noTeams, quiet);
      expect(lab.complete).toBe(true);
      expect(yours(r).gain).toBe(0);
      expect(await scoreBuild(session, lab, withSetLabels(session, lab, yours(r).labels), session.account.echoes)).toBe(lab.base);
      // her Glacio 2-piece moves her damage, a Fusion 2-piece does not
      const off = rowOf(r, "none").gain;
      expect(rowOf(r, "FreezingFrost:2").gain).toBeGreaterThan(off);
      expect(rowOf(r, "MoltenRift:2").gain).toBeCloseTo(off, 10);
    },
    T,
  );

  it(
    "keeps a 4-star echo a 4-star echo: only the label moves",
    async () => {
      const data = clone();
      inventoryEcho(data, "Zani", 3).rank = 4;
      const session = createLabSession(data);
      const lab = await labOf(session, "Zani");
      expect(lab.slots[3]!.record.rank).toBe(4);
      const r = await setLab(session, "Zani", noTeams, quiet);
      const row = yours(r);
      expect(row.gain).toBe(0);
      expect(await scoreBuild(session, lab, withSetLabels(session, lab, row.labels), session.account.echoes)).toBe(lab.base);
      const other = rowOf(r, "MoltenRift:5");
      const relabelled = withSetLabels(session, lab, other.labels).Zani.echoes;
      expect(relabelled[3].rank).toBe(4);
      expect(relabelled[3].echoSet).toBe("MoltenRift");
      for (const n of [1, 2, 3, 4, 5]) expect(relabelled[3][`echoSubStatsValue${n}`]).toBe(lab.slots[3]!.record[`echoSubStatsValue${n}`]);
      expect(relabelled[3].stat).toBe(lab.slots[3]!.record.stat);
    },
    T,
  );

  it.each([
    ["RoverAeroMale", "SierraGale:2", "MoltenRift:2"],
    ["RoverSpectroFemale", "CelestialLight:2", "VoidThunder:2"],
    ["RoverHavocFemale", "HavocEclipse:2", "FreezingFrost:2"],
  ])(
    "%s reads the sets of the element it is",
    async (id, own, other) => {
      const data = withCharacter(clone(), "Zani", id, "EmeraldofGenesis");
      const session = createLabSession(data);
      const r = await setLab(session, id, noTeams, quiet);
      expect(yours(r).gain).toBe(0);
      const off = rowOf(r, "none").gain;
      expect(rowOf(r, own).gain).toBeGreaterThan(off);
      expect(rowOf(r, other).gain).toBeCloseTo(off, 10);
    },
    T,
  );
});

describe("Set lab: team figures", () => {
  /** Cartethyia with her wuwa_calc team's two others armed (no echoes), so that team is fieldable. */
  const fieldable = (): LabAccount => {
    const next = clone();
    next.characters = { ...next.characters, Ciaccona: { weapon: "WoodlandAria" }, Chisa: { weapon: "Kumokiri" } };
    return next;
  };

  it(
    "says why there is none, for a character with no team to field",
    async () => {
      const r = await setLab(createLabSession(clone()), "Zani", {}, quiet);
      expect(r.teamNote).toBe("not in a team you can field");
      expect(yours(r).team).toBeNull();
      expect(yours(r).teamNote).toBe("not in a team you can field");
      expect(r.rows.every((x) => !x.teamPending && !x.team)).toBe(true);
    },
    T,
  );

  it(
    "re-scores the strongest fieldable team exactly, zero for your layout, and a pending row on request",
    async () => {
      const session = createLabSession(fieldable());
      const r = await setLab(session, "Cartethyia", { teamRows: 2, autoTeamBuffs: true }, quiet);
      expect(r.teamNote).toBeNull();
      expect(r.teamName).toBeTruthy();
      const row = yours(r);
      expect(row.team).not.toBeNull();
      expect(row.team!.gain).toBe(0);
      const withFigure = r.rows.filter((x) => x.team);
      expect(withFigure.length).toBeGreaterThanOrEqual(3);
      // every 5-piece that reaches teammates has a figure up front
      expect(r.rows.filter((x) => x.teamReach).every((x) => x.team)).toBe(true);
      expect(rowOf(r, "MoonlitClouds:5").teamReach).toBe(true);

      const lab = await labOf(session, "Cartethyia");
      const side = await teamSideOf(session, true, async () => {}, { n: 0 });
      const ctx = (await side.scorer.teamFor("Cartethyia"))!;
      const target = withFigure.find((x) => !x.current)!;
      const scored = await scoreTeamCandidate(ctx.candidate, withSetLabels(session, lab, target.labels), session.account.echoes, { autoTeamBuffs: true, enemy: session.enemy });
      expect(target.team!.gain).toBeCloseTo(scored.avgDamage / ctx.base - 1, 10);

      const pending = r.rows.find((x) => x.teamPending)!;
      expect(pending).toBeTruthy();
      const asked = await setLabTeam(session, "Cartethyia", [pending.key], { autoTeamBuffs: true }, quiet);
      const direct = await scoreTeamCandidate(ctx.candidate, withSetLabels(session, lab, pending.labels), session.account.echoes, { autoTeamBuffs: true, enemy: session.enemy });
      expect(asked.figures).toHaveLength(1);
      expect(asked.figures[0].key).toBe(pending.key);
      expect(asked.figures[0].team!.gain).toBeCloseTo(direct.avgDamage / ctx.base - 1, 10);
      // your own layout asked for again stays zero
      const again = await setLabTeam(session, "Cartethyia", [row.key], { autoTeamBuffs: true }, quiet);
      expect(again.figures[0].team!.gain).toBe(0);
    },
    T,
  );

  it(
    "says why, when the team runs another saved build of the character",
    async () => {
      const data = fieldable();
      const cart = data.characters.Cartethyia;
      const { builds: _drop, ...fields } = cart;
      data.characters.Cartethyia = { ...cart, activeBuildId: "main", builds: [{ ...fields, id: "main", name: "Main" }, { ...fields, id: "duo", name: "Ciaccona + Chisa" }] };
      const r = await setLab(createLabSession(data), "Cartethyia", { teamRows: 2 }, quiet);
      expect(r.teamNote).toContain('"Ciaccona + Chisa" build');
      expect(r.rows.every((x) => !x.team && !x.teamPending && x.teamNote === r.teamNote)).toBe(true);
      expect(yours(r).gain).toBe(0);
    },
    T,
  );
});

describe("Set lab: a teammate's Team Buffs panel", () => {
  const GUSTS = "GustsofWelkin";
  /** Ciaccona in a full Gusts of Welkin 5-piece on Cartethyia's team, and Cartethyia's panel naming that team with the buff ticked. */
  const panelled = (): LabAccount => {
    const next = withCharacter(clone(), "Cartethyia", "Ciaccona", "WoodlandAria");
    next.characters.Chisa = { weapon: "Kumokiri" };
    const ciaccona = next.characters.Ciaccona;
    const echoes: Record<number, any> = {};
    for (const slot of [0, 1, 2, 3, 4]) echoes[slot] = { ...inventoryEcho(next, "Cartethyia", slot), echoId: null, echoSet: GUSTS };
    ciaccona.echoes = echoes;
    ciaccona.echoSetBonus = { setBonusOnePiece: null, setBonusOne: "Gusts of Welkin 2 Set", setBonusTwo: "Gusts of Welkin 5 Set" };
    const cart = next.characters.Cartethyia;
    cart.teamBuffs = { selectedCharacter1: "Ciaccona", selectedCharacter2: "Chisa", buffs: { ...cart.teamBuffs.buffs, [GUSTS]: { isEnabled: true } } };
    return next;
  };
  const untick = (characters: Record<string, any>): Record<string, any> => {
    const cart = characters.Cartethyia;
    return { ...characters, Cartethyia: { ...cart, teamBuffs: { ...cart.teamBuffs, buffs: { ...cart.teamBuffs.buffs, [GUSTS]: { isEnabled: false } } } } };
  };
  const scoreOf = async (session: LabSession, characters: Record<string, any>): Promise<{ avg: number; base: number }> => {
    const side = await teamSideOf(session, true, async () => {}, { n: 0 });
    const ctx = (await side.scorer.teamFor("Ciaccona"))!;
    const scored = await scoreTeamCandidate(ctx.candidate, characters, session.account.echoes, { autoTeamBuffs: true, enemy: session.enemy });
    return { avg: scored.avgDamage, base: ctx.base };
  };
  const dropsGusts = (r: SetLabResult): SetLabRow => r.rows.find((x) => x.team && !x.current && !x.yoursFull && !x.parts.some((p) => p.pieces === 5)) as SetLabRow;

  it(
    "takes a 5-piece buff the layout gives up off the panel, so a support can't read a gain that costs the team that buff",
    async () => {
      const session = createLabSession(panelled());
      const r = await setLab(session, "Ciaccona", { teamRows: 12, autoTeamBuffs: true }, quiet);
      expect(r.teamNote).toBeNull();
      expect(yours(r).team!.gain).toBe(0);
      const lab = await labOf(session, "Ciaccona");
      const row = dropsGusts(r);
      const relabelled = withSetLabels(session, lab, row.labels);
      const stale = await scoreOf(session, relabelled);
      const fixed = await scoreOf(session, untick(relabelled));
      expect(fixed.avg).toBeLessThan(stale.avg);
      expect(row.team!.gain).toBeCloseTo(fixed.avg / fixed.base - 1, 10);
      // the same figure when the page asks for it later
      const asked = await setLabTeam(session, "Ciaccona", [row.key], { autoTeamBuffs: true }, quiet);
      expect(asked.figures[0].team!.gain).toBeCloseTo(row.team!.gain, 10);
    },
    T,
  );

  it(
    "reaches a panel on the saved build the team runs",
    async () => {
      const data = panelled();
      const cart = data.characters.Cartethyia;
      const { builds: _drop, ...fields } = cart;
      data.characters.Cartethyia = { ...cart, activeBuildId: "main", teamBuffs: {}, builds: [{ ...fields, id: "main", name: "Main", teamBuffs: {} }, { ...fields, id: "duo", name: "Ciaccona + Chisa" }] };
      const session = createLabSession(data);
      const r = await setLab(session, "Ciaccona", { teamRows: 12, autoTeamBuffs: true }, quiet);
      const lab = await labOf(session, "Ciaccona");
      const row = dropsGusts(r);
      const relabelled = withSetLabels(session, lab, row.labels);
      const stale = await scoreOf(session, relabelled);
      const builds = relabelled.Cartethyia.builds.map((b: any) => (b.id === "duo" ? { ...b, teamBuffs: { ...b.teamBuffs, buffs: { ...b.teamBuffs.buffs, [GUSTS]: { isEnabled: false } } } } : b));
      const fixed = await scoreOf(session, { ...relabelled, Cartethyia: { ...relabelled.Cartethyia, builds } });
      expect(fixed.avg).toBeLessThan(stale.avg);
      expect(row.team!.gain).toBeCloseTo(fixed.avg / fixed.base - 1, 10);
    },
    T,
  );

  it(
    "leaves the buff ticked while the team's other member wears that 5-piece too",
    async () => {
      const data = panelled();
      data.characters.Chisa = { weapon: "Kumokiri", echoes: data.characters.Ciaccona.echoes, echoSetBonus: data.characters.Ciaccona.echoSetBonus };
      const session = createLabSession(data);
      const r = await setLab(session, "Ciaccona", { teamRows: 12, autoTeamBuffs: true }, quiet);
      const lab = await labOf(session, "Ciaccona");
      const row = dropsGusts(r);
      const kept = await scoreOf(session, withSetLabels(session, lab, row.labels));
      expect(row.team!.gain).toBeCloseTo(kept.avg / kept.base - 1, 10);
    },
    T,
  );

  it(
    "gives no figure, with why, for a 5-piece team buff the panel doesn't tick, and a figure once it does",
    async () => {
      const r = await setLab(createLabSession(panelled()), "Ciaccona", { teamRows: 12, autoTeamBuffs: true }, quiet);
      const row = rowOf(r, "MoonlitClouds:5");
      expect(row.team).toBeNull();
      expect(row.teamPending).toBe(false);
      expect(row.teamNote).toBe("Cartethyia's Team Buffs panel doesn't tick Moonlit Clouds");
      const data = panelled();
      data.characters.Cartethyia.teamBuffs.buffs.MoonlitClouds = { isEnabled: true };
      const ticked = await setLab(createLabSession(data), "Ciaccona", { teamRows: 12, autoTeamBuffs: true }, quiet);
      expect(rowOf(ticked, "MoonlitClouds:5").team).not.toBeNull();
    },
    T,
  );
});

describe("Set lab: a switch on for a condition the build doesn't reach", () => {
  it(
    "keeps your layout at zero and says so, with no row calling a lower figure your best",
    async () => {
      const data = clone();
      const galbrena = data.characters.Galbrena;
      for (const slot of [0, 1, 2, 3, 4]) inventoryEcho(data, "Galbrena", slot).echoSet = "TidebreakingCourage";
      galbrena.echoSetBonus = { setBonusOnePiece: null, setBonusOne: "Tidebreaking Courage 2 Set", setBonusTwo: "Tidebreaking Courage 5 Set" };
      galbrena.echoSetPassives = { TidebreakingCourage5SetATK: { isEnabled: true }, TidebreakingCourage5SetAllElementAttributeBonus: { isEnabled: true } };
      const r = await setLab(createLabSession(data), "Galbrena", noTeams, quiet);
      const row = yours(r);
      expect(row.gain).toBe(0);
      expect(r.erBase).toBeLessThan(250);
      expect(r.rows.some((x) => x.yoursFull)).toBe(false);
      const gated = row.assumptions.find((a) => a.passive === "TidebreakingCourage5SetAllElementAttributeBonus")!;
      expect(gated.on).toBe(true);
      expect(assumptionState(gated)).toMatch(/^Your calculator's switch: on, though it needs 250 % Energy Regen and this layout has \d/);
    },
    T,
  );
});

describe("Set lab: the worker job", () => {
  it(
    "runs through the host, caches the list, and leaves the team job out of the result cache",
    async () => {
      const messages: EchoLabResponse[] = [];
      const host = createEchoLabHost((m) => messages.push(m), { yieldMs: 0 });
      const job = { kind: "setLab" as const, characterId: "Zani", options: noTeams };
      await host.onMessage({ type: "run", id: 1, job, account: clone() });
      const first = messages.find((m) => m.type === "result" && m.id === 1) as Extract<EchoLabResponse, { type: "result" }>;
      expect(first?.cached).toBe(false);
      expect(messages.some((m) => m.type === "progress" && m.progress.phase === "sets")).toBe(true);
      await host.onMessage({ type: "run", id: 2, job, account: clone() });
      expect((messages.find((m) => m.type === "result" && m.id === 2) as Extract<EchoLabResponse, { type: "result" }>).cached).toBe(true);
      expect(JSON.parse(JSON.stringify(first.result))).toEqual(first.result);
      const team = { kind: "setLabTeam" as const, characterId: "Zani", keys: ["MoltenRift:5"], options: {} };
      await host.onMessage({ type: "run", id: 3, job: team, account: clone() });
      await host.onMessage({ type: "run", id: 4, job: team, account: clone() });
      expect((messages.find((m) => m.type === "result" && m.id === 4) as Extract<EchoLabResponse, { type: "result" }>).cached).toBe(false);
    },
    T,
  );

  it(
    "stops on cancel",
    async () => {
      const session = createLabSession(clone());
      await expect(setLab(session, "Zani", noTeams, { shouldCancel: () => true })).rejects.toThrow(/cancelled/);
    },
    T,
  );
});

describe("Set lab: the view model", () => {
  const row = (key: string, gain: number, extra: Partial<SetLabRow> = {}): SetLabRow => ({ key, gain, floorGain: null, current: false, team: null, shapes: ["other"], mainFits: true, ...extra }) as SetLabRow;

  it("names layouts in the game's words", () => {
    expect(layoutName([])).toBe("No set bonus");
    expect(layoutName([{ set: "MoltenRift", pieces: 5 }])).toBe("Molten Rift 5-piece");
    expect(layoutName([{ set: "DreamoftheLost", pieces: 3 }, { set: "HavocEclipse", pieces: 2 }])).toBe("Dream of the Lost 3-piece + Sun-sinking Eclipse 2-piece");
    expect(layoutSets([{ set: "DreamoftheLost", pieces: 3 }, { set: "HavocEclipse", pieces: 2 }])).toEqual(["DreamoftheLost", "HavocEclipse"]);
  });

  it("knows a layout's shape", () => {
    expect(layoutShape([{ set: "MoltenRift", pieces: 5 }])).toBe("5");
    expect(layoutShape([{ set: "DreamoftheLost", pieces: 3 }, { set: "HavocEclipse", pieces: 2 }])).toBe("3+2");
    expect(layoutShape([{ set: "MoltenRift", pieces: 2 }, { set: "VoidThunder", pieces: 2 }])).toBe("2+2");
    expect(layoutShape([{ set: "MoltenRift", pieces: 2 }, { set: "VoidThunder", pieces: 2 }, { set: "ShadowofShatteredDreams", pieces: 1 }])).toBe("2+2");
    expect(layoutShape([{ set: "MoltenRift", pieces: 2 }])).toBe("other");
    expect(layoutShape([])).toBe("other");
  });

  it("filters by shape and main echo, always keeping your layout", () => {
    const rows = [row("a", 0.1, { shapes: ["5"] }), row("b", 0.05, { shapes: ["2+2", "other"], mainFits: false }), row("c", 0, { current: true, shapes: ["3+2"] })];
    expect(filterSetRows(rows, "5", false).map((r) => r.key)).toEqual(["a", "c"]);
    expect(filterSetRows(rows, "2+2", false).map((r) => r.key)).toEqual(["b", "c"]);
    expect(filterSetRows(rows, "all", true).map((r) => r.key)).toEqual(["a", "c"]);
    expect(filterSetRows(rows, "all", false)).toHaveLength(3);
  });

  it("ranks by team gain where there is one, by own gain, and by own gain with no condition holding", () => {
    const team = (gain: number): SetLabRow["team"] => ({ gain }) as SetLabRow["team"];
    const rows = [row("a", 0.05), row("b", 0.01, { team: team(0.004) }), row("c", 0.02, { team: team(0.009) }), row("d", 0.05, { floorGain: -0.1 }), row("e", 0, { current: true }), row("f", 0)];
    expect(sortSetRows(rows, "team").map((r) => r.key)).toEqual(["c", "b", "a", "d", "e", "f"]);
    expect(sortSetRows(rows, "own").map((r) => r.key)).toEqual(["a", "d", "c", "b", "e", "f"]);
    expect(sortSetRows(rows, "floor").map((r) => r.key)).toEqual(["a", "c", "b", "e", "f", "d"]);
    // the same floor: the layout with no condition leads, then the plainer one, not the one whose condition reads best
    const ties = [row("cond", 0.3, { floorGain: 0.1 }), row("plain", 0.1, { parts: [{ set: "A", pieces: 2 }] }), row("wide", 0.1, { parts: [{ set: "A", pieces: 2 }, { set: "B", pieces: 2 }] })];
    expect(sortSetRows(ties, "floor").map((r) => r.key)).toEqual(["plain", "wide", "cond"]);
  });

  it("a rank by team gain counts only the rows with a team figure, and says so until every figure is in", () => {
    const sentenceOf = (r: MineRank | null): string | null => (r ? rankSentence(r) : null);
    const team = (gain: number): SetLabRow["team"] => ({ gain }) as SetLabRow["team"];
    const rows = [row("a", 0.3, { team: team(0.02) }), row("mine", 0, { current: true, team: team(0) }), row("p1", 0.2, { teamPending: true }), row("p2", 0.1, { teamPending: true }), row("none", 0.05)];
    const byTeam = sortSetRows(rows, "team");
    // the two pending rows may well beat yours: they do not count as worse than it
    expect(sentenceOf(mineRankOf(byTeam, "team"))).toBe("ranks 2 of the 2 with a team figure so far, 2 still to work out");
    expect(mineRankOf(byTeam, "team")).toMatchObject({ rank: 2, of: 2, pending: 2, partial: true });
    // every figure in: the row that can have none stays out of the count, and nothing is left to work out
    const done = rows.map((r) => (r.teamPending ? { ...r, teamPending: false, team: team(0.01) } : r));
    expect(sentenceOf(mineRankOf(sortSetRows(done, "team"), "team"))).toBe("ranks 4 of the 4 with a team figure");
    const whole = done.filter((r) => r.key !== "none");
    expect(sentenceOf(mineRankOf(sortSetRows(whole, "team"), "team"))).toBe("ranks 4 of 4");
    // own gain has a figure on every row
    expect(sentenceOf(mineRankOf(sortSetRows(rows, "own"), "own"))).toBe("ranks 5 of 5");
    expect(mineRankOf(sortSetRows(rows, "own"), "own")).toMatchObject({ partial: false, pending: 0 });
    // no figure on your own layout: nothing to rank it by
    expect(mineRankOf(sortSetRows(rows.map((r) => (r.current ? { ...r, team: null } : r)), "team"), "team")).toBeNull();
    expect(mineRankOf(sortSetRows(rows.filter((r) => !r.current), "team"), "team")).toBeNull();
  });

  it("merges a figure asked for later, and words the rest", () => {
    const base = { team: null, teamNote: null, teamPending: true };
    expect(withSetTeam(base, null)).toBe(base);
    expect(withSetTeam(base, { team: null, teamNote: "why" })).toEqual({ team: null, teamNote: "why", teamPending: false });
    expect(pointsText(0)).toBe("no change");
    expect(pointsText(-10)).toBe("−10.0 points");
    expect(pointsText(12.34)).toBe("+12.3 points");
    expect(erRange({ erHave: null, erChange: 0 })).toBeNull();
    expect(erRange({ erHave: 118.4, erChange: -10 })).toBe("128.4 % to 118.4 %");
    expect(erShort({ erHave: 118 }, 125)).toBe(true);
    expect(erShort({ erHave: 130 }, 125)).toBe(false);
    expect(erShort({ erHave: 130 }, null)).toBe(false);
    expect(changesText(0)).toBe("No echo changes Sonata");
    expect(changesText(3)).toBe("3 of 5 echoes change Sonata");
    expect(plainText(`<span class="Fire">Fusion</span> DMG&nbsp;increased by <span>10%</span>`)).toBe("Fusion DMG increased by 10%");
    expect(plainText("Fusion DMG + 10%%")).toBe("Fusion DMG + 10%");
    expect(assumptionState({ source: "assumed", on: true, stacks: null, maxStacks: null })).toBe("Assumed: on for the whole rotation");
  });
});
