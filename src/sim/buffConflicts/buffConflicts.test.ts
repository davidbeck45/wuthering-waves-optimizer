// Wuthering Tools+: a saved build can hold two buffs Ryan's data marks exclusive (his rule acts when a switch is
// flipped, never on a build saved earlier). The check finds them from his `mutuallyExclusiveWith` field alone, on the
// build in use and on every other saved build, and never changes the account it reads.
import { describe, expect, it } from "vitest";
import { characterPickerRoster, getCharByName } from "../../characters/characters";
import { buildBuffToggleUpdate } from "../../characters/mutuallyExclusiveBuffs";
import { rankRoster } from "../myRankings/rankRoster";
import {
  appDefs,
  buildRecordsOf,
  conflictId,
  conflictScreen,
  conflictsIn,
  conflictsOfCharacter,
  findBuffConflicts,
  isOn,
  keepOnlyUpdate,
  recordOf,
  sideLabels,
  withOnly,
  type BuffConflict,
  type ConflictDefs,
  type DefsLoader,
} from "./buffConflicts";
import { conflictFigures } from "./conflictFigures";
import { calcCharacter } from "../cli/engine";
import type { ExportFile } from "../cli/exportShape";

// a made-up kit: the check knows no buff by name
const KIT: ConflictDefs = {
  buffs: [
    { key: "Calm", name: "Calm", details: "<div>While <span>calm</span>, hits harder.</div>", mutuallyExclusiveWith: ["Storm"] },
    { key: "Storm", name: "Storm", details: "Each 10 points spent adds damage.", hasStacks: true, appliesOnEveryStep: 10, mutuallyExclusiveWith: ["Calm"] },
    { key: "Plain", name: "Plain" },
    // only this side declares the pair; it points at a chain entry
    { key: "OldPath", name: "Old path", mutuallyExclusiveWith: [{ key: "SequenceNode3NewPath", category: "resonanceChains" }, "Missing", "OldPath"] },
  ],
  resonanceChains: [{ key: "SequenceNode3NewPath", name: "Sequence Node 3: New path" }],
  weaponPassives: [
    { key: "BladeOn", name: "Made-up Blade", details: "On the field: more damage.", hasStacks: true, mutuallyExclusiveWith: ["BladeOff"] },
    { key: "BladeOff", name: "Made-up Blade", details: "Off the field: more damage.", alwaysEnabled: true, mutuallyExclusiveWith: ["BladeOn"] },
  ],
};
const kitLoader: DefsLoader = async (id, record) => (id === "Nobody" ? { ...KIT, weaponPassives: record.weapon === "MadeUpBlade" ? KIT.weaponPassives : [] } : null);
const on = { isEnabled: true };
const keys = (pairs: Array<[{ key: string }, { key: string }]>): string[] => pairs.map(([a, b]) => `${a.key}+${b.key}`);

describe("which pairs count as both on", () => {
  it("finds a pair that is both on, once, in his definitions' order", () => {
    const pairs = conflictsIn(KIT, { buffs: { Storm: { isEnabled: true, stacks: 60 }, Calm: on, Plain: on } });
    expect(keys(pairs)).toEqual(["Calm+Storm"]);
    expect(pairs[0][0]).toEqual({ category: "buffs", key: "Calm", name: "Calm", detail: "While calm, hits harder.", stacks: null });
    expect(pairs[0][1]).toMatchObject({ key: "Storm", stacks: 60 });
  });

  it("finds nothing when one of the two is off, or on with no stacks that count", () => {
    expect(conflictsIn(KIT, { buffs: { Calm: on, Storm: { isEnabled: false, stacks: 60 } } })).toEqual([]);
    expect(conflictsIn(KIT, { buffs: { Calm: on, Storm: { isEnabled: true, stacks: 0 } } })).toEqual([]);
    // Storm adds per 10 points: 9 points add nothing, so the engine counts only Calm
    expect(conflictsIn(KIT, { buffs: { Calm: on, Storm: { isEnabled: true, stacks: 9 } } })).toEqual([]);
    expect(keys(conflictsIn(KIT, { buffs: { Calm: on, Storm: { isEnabled: true, stacks: 10 } } }))).toEqual(["Calm+Storm"]);
    expect(conflictsIn(KIT, {})).toEqual([]);
    expect(conflictsIn(KIT, null)).toEqual([]);
  });

  it("counts a pair only one side declares, across categories, and skips a key the kit lacks", () => {
    const pairs = conflictsIn(KIT, { buffs: { OldPath: on }, resonanceChains: { SequenceNode3NewPath: on } });
    expect(keys(pairs)).toEqual(["OldPath+SequenceNode3NewPath"]);
    expect(pairs[0][1].category).toBe("resonanceChains");
  });

  it("reads a weapon passive that is always on as on, with no switch saved", () => {
    expect(isOn("weaponPassives", KIT.weaponPassives[1], {})).toBe(true);
    expect(isOn("buffs", { key: "X", alwaysEnabled: true }, {})).toBe(false); // a character buff runs on its switch alone
    expect(keys(conflictsIn(KIT, { weaponPassives: { BladeOn: { isEnabled: true, stacks: 3 } } }))).toEqual(["BladeOn+BladeOff"]);
    expect(conflictsIn(KIT, { weaponPassives: { BladeOn: { isEnabled: true, stacks: 0 } } })).toEqual([]);
  });
});

describe("every build of a character", () => {
  const data = {
    weapon: "Plainsword",
    buffs: { Calm: on, Storm: { isEnabled: false, stacks: 60 } },
    activeBuildId: "b1",
    characterLevel: "90",
    builds: [
      // the active build's own entry is stale by design (the store refreshes it on a switch): it must not be read
      { id: "b1", name: "Default build", weapon: "Plainsword", buffs: { Calm: on, Storm: { isEnabled: true, stacks: 60 } } },
      { id: "b2", name: "Off-field", weapon: "MadeUpBlade", buffs: { Calm: on, Storm: { isEnabled: true, stacks: 30 } }, weaponPassives: { BladeOn: { isEnabled: true, stacks: 2 } } },
    ],
  };

  it("runs the live record as the build in use and lays each other saved build over it", () => {
    const records = buildRecordsOf(data);
    expect(records.map((r) => [r.buildId, r.buildName, r.active])).toEqual([["b1", "Default build", true], ["b2", "Off-field", false]]);
    expect(records[0].record).toBe(data);
    expect(records[1].record.weapon).toBe("MadeUpBlade");
    expect(records[1].record.characterLevel).toBe("90"); // what belongs to the character stays
    expect(buildRecordsOf(undefined)).toEqual([]);
    // no builds list at all: the record itself is the one build
    expect(buildRecordsOf({ buffs: {} }).map((r) => [r.buildId, r.active])).toEqual([[null, true]]);
  });

  it("finds the pairs on a saved build that is not in use, with its name and its own weapon's passives", async () => {
    const before = JSON.stringify(data);
    const found = await conflictsOfCharacter("Nobody", data, kitLoader);
    expect(found.map((c) => [c.buildName, c.active, `${c.sides[0].key}+${c.sides[1].key}`])).toEqual([
      ["Off-field", false, "Calm+Storm"],
      ["Off-field", false, "BladeOn+BladeOff"],
    ]);
    expect(JSON.stringify(data)).toBe(before);
    expect(await conflictsOfCharacter("Stranger", data, kitLoader)).toEqual([]); // a key the app has no kit for
  });

  it("lists the whole account in character order", async () => {
    const account = { Nobody: { buffs: { Calm: on, Storm: { isEnabled: true, stacks: 60 } } }, Stranger: { buffs: { Calm: on } } };
    const found = await findBuffConflicts(account, kitLoader);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ characterId: "Nobody", buildId: null, active: true });
    expect(conflictId(found[0])).toBe("Nobody||buffs:Calm|buffs:Storm");
    expect(await findBuffConflicts(null, kitLoader)).toEqual([]);
  });
});

describe("a copy with only one of the two, and the update that keeps one", () => {
  const conflict: BuffConflict = {
    characterId: "Nobody",
    buildId: null,
    buildName: "",
    active: true,
    sides: [
      { category: "buffs", key: "Calm", name: "Calm", detail: "", stacks: null },
      { category: "buffs", key: "Storm", name: "Storm", detail: "", stacks: 60 },
    ],
  };

  it("switches the other side off on a copy and leaves the record alone", () => {
    const record = { weapon: "Plainsword", buffs: { Calm: on, Storm: { isEnabled: true, stacks: 60 } } };
    const before = JSON.stringify(record);
    expect(withOnly(record, conflict, 0).buffs).toEqual({ Calm: on, Storm: { isEnabled: false, stacks: 60 } });
    expect(withOnly(record, conflict, 1).buffs).toEqual({ Calm: { isEnabled: false }, Storm: { isEnabled: true, stacks: 60 } });
    expect(JSON.stringify(record)).toBe(before);
    expect(conflictsIn(KIT, withOnly(record, conflict, 0))).toEqual([]);
    expect(conflictsIn(KIT, withOnly(record, conflict, 1))).toEqual([]);
  });

  it("keeps one side through his own toggle update, and switches the other off for a pair only the other declares", () => {
    expect(keepOnlyUpdate(conflict, 1, KIT)).toEqual(buildBuffToggleUpdate("buffs", "Storm", true, ["Calm"]));
    const oneWay: BuffConflict = { ...conflict, sides: [{ category: "buffs", key: "OldPath", name: "Old path", detail: "", stacks: null }, { category: "resonanceChains", key: "SequenceNode3NewPath", name: "New path", detail: "", stacks: null }] };
    // the chain entry declares nothing, so his update alone would leave Old path on
    expect(keepOnlyUpdate(oneWay, 1, KIT)).toEqual({ resonanceChains: { SequenceNode3NewPath: { isEnabled: true } }, buffs: { OldPath: { isEnabled: false } } });
  });

  it("tells two entries of one name apart by his description, and names the calculator section", () => {
    expect(sideLabels(conflict)).toEqual(["Calm", "Storm"]);
    const blade: BuffConflict = { ...conflict, sides: [{ category: "weaponPassives", key: "BladeOn", name: "Made-up Blade", detail: "On the field: more damage.", stacks: 2 }, { category: "weaponPassives", key: "BladeOff", name: "Made-up Blade", detail: "Off the field: more damage.", stacks: null }] };
    expect(sideLabels(blade)).toEqual(['Made-up Blade ("On the field: more damage.")', 'Made-up Blade ("Off the field: more damage.")']);
    expect(conflictScreen(blade)).toBe("weapon");
    expect(conflictScreen(conflict)).toBe("character");
  });
});

describe("on Ryan's own data", () => {
  it("finds every pair he marks on a character, when a build has both on", async () => {
    const roster = [...characterPickerRoster.five, ...characterPickerRoster.four].map((c) => c.key);
    const marked: string[] = [];
    for (const id of roster) {
      const kit = (await getCharByName(id)) as Record<string, any>;
      for (const category of ["buffs", "resonanceChains"] as const) {
        for (const def of (kit[category] ?? []) as any[]) {
          for (const ref of def.mutuallyExclusiveWith ?? []) {
            const other = typeof ref === "string" ? { category, key: ref } : ref;
            const otherDef = (kit[other.category] ?? []).find((d: any) => d.key === other.key);
            expect(otherDef, `${id}: ${def.key} names ${other.key}, which the kit lacks`).toBeTruthy();
            const entry = (d: any): Record<string, unknown> => ({ isEnabled: true, ...(d.hasStacks ? { stacks: d.maxStacks } : {}) });
            const record: Record<string, any> = { buffs: {}, resonanceChains: {} };
            record[category][def.key] = entry(def);
            record[other.category][other.key] = entry(otherDef);
            const found = await findBuffConflicts({ [id]: record });
            expect(found.map((c) => c.sides.map((s) => s.key).sort().join("+")), `${id}: ${def.key} with ${other.key}`).toEqual([[def.key, other.key].sort().join("+")]);
            marked.push(`${id}:${def.key}`);
          }
        }
      }
    }
    // the pairs in his data today (Brant, Jiyan, Lupa's two against her Sequence 3, Sigrika): a count, so a kit
    // that stops loading cannot pass as "no pairs"
    expect(marked.length).toBeGreaterThanOrEqual(10);
    expect(marked).toContain("Sigrika:SchemataofRunes");
  }, 60_000);

  it("finds the two passives of a weapon he marks, for the character holding it", async () => {
    // Rime-Draped Sprouts is a rectifier; Yinlin holds rectifiers
    const defs = await appDefs("Yinlin", { weapon: "RimeDrapedSprouts" });
    const pair = defs!.weaponPassives.filter((p) => p.mutuallyExclusiveWith?.length);
    expect(pair).toHaveLength(2);
    const record = { weapon: "RimeDrapedSprouts", weaponPassives: Object.fromEntries(pair.map((p) => [p.key, { isEnabled: true, stacks: 3 }])) };
    const found = await findBuffConflicts({ Yinlin: record });
    expect(found).toHaveLength(1);
    expect(found[0].sides.map((s) => s.name)).toEqual(["Rime-Draped Sprouts", "Rime-Draped Sprouts"]);
    expect(sideLabels(found[0])[0]).not.toBe(sideLabels(found[0])[1]);
    // the same switches on a build holding another weapon mean nothing
    expect(await findBuffConflicts({ Yinlin: { ...record, weapon: "Stringmaster" } })).toEqual([]);
  });

  // a synthetic Sigrika: his kit, a weapon, both buffs on as an old save has them; no echoes, nobody's real data
  const sigrika = (): Record<string, any> => ({
    weapon: "SolswornCiphers",
    weapons: { SolswornCiphers: { refinement: "1" } },
    buffs: { SchemataofRunes: { isEnabled: true }, SoliskinVitality: { isEnabled: true, stacks: 60 }, InnateGift: { isEnabled: true, stacks: 2 } },
  });

  it("names Sigrika's pair from his data and scores her three ways without touching the account", async () => {
    // Sigrika · Qiuyuan + Lucilla is a stock team (Mornye + Lucilla was, until Riley's 2026-11-22 table)
    const characters: Record<string, any> = { Sigrika: sigrika(), Qiuyuan: { weapon: "EmeraldSentence" }, Lucilla: { weapon: "Stringmaster" } };
    const before = JSON.stringify(characters);
    const found = await findBuffConflicts(characters);
    expect(found).toHaveLength(1);
    expect(sideLabels(found[0])).toEqual(["Schemata of Runes", "Soliskin Vitality"]);
    expect(found[0].sides[1].stacks).toBe(60);
    expect(found[0].sides[0].detail).toMatch(/at least 30 points of Soliskin Vitality/);

    const figures = (await conflictFigures(found[0], characters, [], []))!;
    expect(figures.rotation).not.toBeNull();
    const { both, only } = figures.rotation!;
    // counting both reads higher than either one alone: that is the figure being too high
    expect(only[0].avgDamage).toBeGreaterThan(0);
    expect(only[1].avgDamage).toBeGreaterThan(0);
    expect(both.avgDamage).toBeGreaterThan(only[0].avgDamage);
    expect(both.avgDamage).toBeGreaterThan(only[1].avgDamage);
    // "both" is the figure /my-rankings and /account print for her today
    const ranking = await rankRoster(characters, [], [], { yieldToUi: false });
    expect(both.avgDamage).toBe(ranking.characters.find((c) => c.id === "Sigrika")!.best!.avgDamage);
    // her team: a wuwa_calc team preset the three can field, the same three ways
    expect(figures.team, figures.teamNote ?? "").not.toBeNull();
    expect(figures.team!.characterIds).toContain("Sigrika");
    expect(figures.team!.both).toBeGreaterThan(figures.team!.only[0]);
    expect(figures.team!.both).toBeGreaterThan(figures.team!.only[1]);
    expect(figures.team!.both).toBe(ranking.teams.find((t) => t.id === figures.team!.id)!.avgDamage);
    expect(JSON.stringify(characters)).toBe(before);
  }, 120_000);

  it("puts the warning on the CLI's calc and the assistant's note only when asked, and only for a pair the engine counts twice", async () => {
    const exp = {
      path: "made-up.json",
      version: 9,
      source: "test",
      activeCharacter: "Sigrika",
      favoriteCharacters: [],
      characters: { Sigrika: sigrika(), Brant: { weapon: "UnflickeringValor", buffs: { MyMoment: { isEnabled: true }, TheatricalMoment: { isEnabled: true } } } },
      inventory: { echoes: [], equipped: {} },
      teams: [],
    } as unknown as ExportFile;
    const asked = await calcCharacter("Sigrika", exp, { attacks: false, warnings: true });
    expect(asked.warnings).toEqual(["Sigrika has two buffs on that cannot be active together in the game: Schemata of Runes and Soliskin Vitality. Sigrika's figures count both, so they read too high."]);
    // the snapshot and every other caller pay nothing for it
    expect((await calcCharacter("Sigrika", exp, { attacks: false })).warnings).toEqual([]);
    // Brant's two Moments are marked exclusive too, but the engine takes one alone: his figures are not too high
    expect((await findBuffConflicts(exp.characters)).map((c) => c.characterId)).toEqual(["Brant", "Sigrika"]);
    expect((await calcCharacter("Brant", exp, { attacks: false, warnings: true })).warnings).toEqual([]);
  }, 60_000);

  it("scores a saved build that is not in use on its own rotation figure, and says why it has no team figure", async () => {
    const live = { ...sigrika(), buffs: { SchemataofRunes: { isEnabled: true }, SoliskinVitality: { isEnabled: false, stacks: 60 } } };
    const characters: Record<string, any> = {
      Sigrika: { ...live, activeBuildId: "b1", builds: [{ id: "b1", name: "Default build" }, { id: "b2", name: "Old save", ...sigrika() }] },
    };
    const found = await findBuffConflicts(characters);
    expect(found.map((c) => [c.buildName, c.active])).toEqual([["Old save", false]]);
    expect(recordOf(found[0], characters.Sigrika)!.buffs.SoliskinVitality.isEnabled).toBe(true);
    const figures = (await conflictFigures(found[0], characters, [], []))!;
    expect(figures.rotation!.both.avgDamage).toBeGreaterThan(figures.rotation!.only[0].avgDamage);
    expect(figures.team).toBeNull();
    expect(figures.teamNote).toMatch(/another saved build/);
    // the build is gone: no figure, no throw
    expect(await conflictFigures(found[0], { Sigrika: live }, [], [])).toBeNull();
  }, 120_000);
});
